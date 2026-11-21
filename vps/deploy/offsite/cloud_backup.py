#!/usr/bin/env python3
"""Encrypted, read-back-verified snapshots. Never sync/delete the live databases."""
import argparse, datetime as dt, fcntl, gzip, hashlib, json, os, pathlib, re, shutil, sqlite3, subprocess, tempfile, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
import backup_core as core

STAMP = re.compile(r'^\d{8}T\d{6}Z$')

def digest(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''): h.update(block)
    return h.hexdigest()

def retained(stamps):
    """Newest seven days, four ISO weeks and three calendar months (union)."""
    keep = set()
    for kind, count in [('day', 7), ('week', 4), ('month', 3)]:
        buckets = set()
        for s in sorted(filter(STAMP.fullmatch, stamps), reverse=True):
            d = dt.datetime.strptime(s, '%Y%m%dT%H%M%SZ')
            key = {'day': d.date(), 'week': d.isocalendar()[:2], 'month': (d.year, d.month)}[kind]
            if key not in buckets and len(buckets) < count:
                buckets.add(key); keep.add(s)
    return keep

def validate_manifest(m, stamp):
    if m.get('schema') != 1 or m.get('snapshot') != stamp or set(m.get('files', {})) not in ({'news.sqlite.gz', 'research.sqlite.gz'}, {'news.sqlite.gz', 'research.sqlite.gz', 'academic.sqlite.gz'}):
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
    state=root/'state';state.mkdir(parents=True,exist_ok=True)
    # Same lock as local rotation: a snapshot cannot disappear during upload.
    with core.backup_lock(root):
        if not pathlib.Path(config).is_file():
            raise RuntimeError('Google Drive server authorization is not configured; no cloud snapshots were deleted')
        rc=Rclone(config,remote)
        existing=core.complete_snapshots(root)
        fresh=existing[-1] if existing else None
        if fresh and (dt.datetime.now(dt.timezone.utc)-dt.datetime.strptime(fresh.name,'%Y%m%dT%H%M%SZ').replace(tzinfo=dt.timezone.utc)).total_seconds()<900:
            core.verify_snapshot(fresh);stage=fresh
        else:
            stage=core.create_snapshot(root)
        stamp=stage.name
        m=json.loads((stage/'manifest.json').read_text())
        # Upload all members except READY. Readback + SQLite restore precedes publication.
        with tempfile.TemporaryDirectory(prefix='cloud-',dir=state) as tmp:
            restored=pathlib.Path(tmp)/'restore'
            rc.run('copy',str(stage),rc.path(stamp),'--immutable','--exclude','READY')
            rc.run('copy',rc.path(stamp),str(restored))
            verify_snapshot(restored,stamp)
            rc.run('copyto',str(stage/'READY'),rc.path(stamp+'/READY'),'--immutable')
            if rc.run('cat',rc.path(stamp+'/READY')).strip()!=stamp:raise RuntimeError('Remote ready marker did not verify')
        listing=json.loads(rc.run('lsjson',rc.path(),'--dirs-only'))
        complete=[]
        for entry in listing:
            s=entry['Name']
            if STAMP.fullmatch(s):
                try:
                    if rc.run('cat',rc.path(s+'/READY')).strip()!=s:continue
                    old=json.loads(rc.run('cat',rc.path(s+'/manifest.json')))
                    validate_manifest(old,s)
                    complete.append(s)
                except (RuntimeError,ValueError):pass
        keep=retained(complete)
        if stamp not in keep:raise RuntimeError('New verified backup missing from retention set; no remote deletion')
        removed=[]
        for s in complete:
            if s not in keep:rc.run('purge',rc.path(s));removed.append(s)
        core.prune_local(root)
        status={'ok':True,'last_success':dt.datetime.now(dt.timezone.utc).isoformat(),'snapshot':stamp,'bytes':sum(x['bytes'] for x in m['files'].values()),'verified_restore':True,'policy':{'daily':7,'weekly':4,'monthly':3},'retained':sorted(keep),'removed':removed}
        pending=state/'cloud-backup-status.json.tmp';pending.write_text(json.dumps(status));pending.replace(state/'cloud-backup-status.json')
        print(json.dumps(status),flush=True)

if __name__ == '__main__':
    p = argparse.ArgumentParser(); p.add_argument('--root', default='/opt/zohurnews'); p.add_argument('--config', default='/opt/zohurnews/private/rclone.conf'); p.add_argument('--remote', default='zohur-crypt:snapshots'); a = p.parse_args()
    try: run(pathlib.Path(a.root), a.config, a.remote)
    except Exception as e:
        status_file = pathlib.Path(a.root) / 'state' / 'cloud-backup-status.json'
        try:
            old = json.loads(status_file.read_text()) if status_file.exists() else {}
            old.update(ok=False, checked=dt.datetime.now(dt.timezone.utc).isoformat(), error=str(e))
            pending = status_file.with_suffix('.tmp'); pending.write_text(json.dumps(old)); pending.replace(status_file)
        except OSError: pass
        print('Cloud backup FAILED:', str(e)); raise SystemExit(1)


