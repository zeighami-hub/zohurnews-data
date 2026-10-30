#!/usr/bin/env python3
"""Encrypted, read-back-verified snapshots. Never sync/delete the live databases."""
import argparse, datetime as dt, fcntl, gzip, hashlib, json, os, pathlib, re, shutil, sqlite3, subprocess, tempfile

STAMP = re.compile(r'^\d{8}T\d{6}Z$')

def digest(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''): h.update(block)
    return h.hexdigest()

def retained(stamps):
    """Newest seven days, four ISO weeks and six calendar months (union)."""
    keep = set()
    for kind, count in [('day', 7), ('week', 4), ('month', 6)]:
        buckets = set()
        for s in sorted(filter(STAMP.fullmatch, stamps), reverse=True):
            d = dt.datetime.strptime(s, '%Y%m%dT%H%M%SZ')
            key = {'day': d.date(), 'week': d.isocalendar()[:2], 'month': (d.year, d.month)}[kind]
            if key not in buckets and len(buckets) < count:
                buckets.add(key); keep.add(s)
    return keep

def validate_manifest(m, stamp):
    if m.get('schema') != 1 or m.get('snapshot') != stamp or set(m.get('files', {})) != {'news.sqlite.gz', 'research.sqlite.gz'}:
        raise ValueError('Invalid snapshot manifest')
    for item in m['files'].values():
        if not re.fullmatch('[0-9a-f]{64}', item.get('sha256', '')) or not isinstance(item.get('bytes'), int) or item['bytes'] <= 0:
            raise ValueError('Invalid file checksum/size')

def verify_snapshot(folder, stamp, integrity=True):
    m = json.loads((folder / 'manifest.json').read_text())
    validate_manifest(m, stamp)
    for name, info in m['files'].items():
        p = folder / name
        if p.stat().st_size != info['bytes'] or digest(p) != info['sha256']: raise ValueError('Checksum mismatch: ' + name)
        if integrity:
            raw = folder / (name + '.verify.sqlite')
            try:
                with gzip.open(p, 'rb') as src, raw.open('wb') as dst: shutil.copyfileobj(src, dst)
                with sqlite3.connect('file:' + str(raw) + '?mode=ro', uri=True) as c:
                    if c.execute('PRAGMA integrity_check').fetchone()[0] != 'ok': raise ValueError('SQLite integrity failed')
            finally: raw.unlink(missing_ok=True)
    return m

class Rclone:
    def __init__(self, config, remote): self.config, self.remote = str(config), remote.rstrip('/')
    def run(self, *args):
        p = subprocess.run(['rclone', '--config', self.config, '--retries', '3', '--contimeout', '30s', '--timeout', '5m', *args], capture_output=True, text=True)
        if p.returncode: raise RuntimeError('rclone operation failed: ' + args[0] + ' (see network/account configuration; secrets suppressed)')
        return p.stdout
    def path(self, suffix=''): return self.remote + '/' + suffix

def run(root, config, remote):
    os.umask(0o077)
    state = root / 'state'; state.mkdir(parents=True, exist_ok=True)
    with (state / 'cloud-backup.lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if shutil.disk_usage(root).free < 6 * 1024**3: raise RuntimeError('Need at least 6 GiB temporary free space')
        rc = Rclone(config, remote)
        stamp = dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
        with tempfile.TemporaryDirectory(prefix='cloud-', dir=state) as tmp:
            stage = pathlib.Path(tmp) / 'snapshot'; stage.mkdir()
            m = {'schema': 1, 'snapshot': stamp, 'files': {}, 'scope': 'research and ingestion databases; code in GitHub; no credentials'}
            for name in ['news', 'research']:
                source = root / 'data' / (name + '.sqlite')
                if not source.is_file(): raise RuntimeError('Missing database: ' + name)
                raw = stage / (name + '.sqlite'); target = stage / (name + '.sqlite.gz')
                with sqlite3.connect('file:' + str(source) + '?mode=ro', uri=True) as src, sqlite3.connect(raw) as dst:
                    src.backup(dst, pages=1024, sleep=0.05)
                    if dst.execute('PRAGMA integrity_check').fetchone()[0] != 'ok': raise RuntimeError('Source integrity failed')
                with raw.open('rb') as src, gzip.open(target, 'wb', compresslevel=6) as dst: shutil.copyfileobj(src, dst)
                raw.unlink()
                m['files'][target.name] = {'bytes': target.stat().st_size, 'sha256': digest(target)}
            (stage / 'manifest.json').write_text(json.dumps(m, indent=2))
            # Ready marker is published only AFTER full remote readback and restore validation.
            rc.run('copy', str(stage), rc.path(stamp), '--immutable')
            restored = pathlib.Path(tmp) / 'restore'
            rc.run('copy', rc.path(stamp), str(restored))
            verify_snapshot(restored, stamp)
            (stage / 'READY').write_text(stamp + '\n')
            rc.run('copyto', str(stage / 'READY'), rc.path(stamp + '/READY'), '--immutable')
            listing = json.loads(rc.run('lsjson', rc.path(), '--dirs-only'))
            complete = []
            for entry in listing:
                s = entry['Name']
                if STAMP.fullmatch(s):
                    try:
                        if rc.run('cat', rc.path(s + '/READY')).strip() == s: complete.append(s)
                    except RuntimeError: pass  # interrupted uploads are kept, never treated as restorable snapshots
            keep = retained(complete)
            for s in complete:
                if s not in keep: rc.run('purge', rc.path(s))
            status = {'ok': True, 'last_success': dt.datetime.now(dt.timezone.utc).isoformat(), 'snapshot': stamp, 'bytes': sum(x['bytes'] for x in m['files'].values()), 'verified_restore': True}
            pending = state / 'cloud-backup-status.json.tmp'; pending.write_text(json.dumps(status)); pending.replace(state / 'cloud-backup-status.json')
            print(json.dumps(status))

if __name__ == '__main__':
    p = argparse.ArgumentParser(); p.add_argument('--root', default='/opt/zohurnews'); p.add_argument('--config', default='/opt/zohurnews/private/rclone.conf'); p.add_argument('--remote', default='zohur-crypt:snapshots'); a = p.parse_args()
    try: run(pathlib.Path(a.root), a.config, a.remote)
    except Exception as e:
        print('Cloud backup FAILED:', str(e)); raise SystemExit(1)
