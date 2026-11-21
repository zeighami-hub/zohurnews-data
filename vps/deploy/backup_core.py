"""Verified rotating SQLite snapshots. Only /backups/snapshots is pruned."""
import contextlib, datetime as dt, gzip, hashlib, json, os, pathlib, re, shutil, sqlite3, tempfile, time

STAMP = re.compile(r'^\d{8}T\d{6}Z$')
NAMES = ('news', 'research', 'academic')

def digest(p):
    h=hashlib.sha256()
    with open(p,'rb') as f:
        for block in iter(lambda:f.read(1024*1024),b''):h.update(block)
    return h.hexdigest()

def required_names(root):
    names=['news','research']
    if (root/'data/academic.sqlite').exists():names.append('academic')
    return names

@contextlib.contextmanager
def backup_lock(root):
    import fcntl
    state=root/'state';state.mkdir(parents=True,exist_ok=True)
    with (state/'backup.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        yield

def verify_snapshot(folder, restore=False):
    if folder.is_symlink() or not STAMP.fullmatch(folder.name):raise ValueError('Invalid snapshot directory')
    manifest=json.loads((folder/'manifest.json').read_text())
    files=manifest.get('files',{})
    if manifest.get('schema')!=1 or manifest.get('snapshot')!=folder.name:raise ValueError('Invalid manifest')
    if set(files) not in ({'news.sqlite.gz','research.sqlite.gz'},{'news.sqlite.gz','research.sqlite.gz','academic.sqlite.gz'}):raise ValueError('Invalid snapshot members')
    for name,info in files.items():
        p=folder/name
        if p.is_symlink() or not p.is_file() or not re.fullmatch('[a-f0-9]{64}',info.get('sha256','')):raise ValueError('Invalid snapshot file')
        if p.stat().st_size!=info['bytes'] or digest(p)!=info['sha256']:raise ValueError('Compressed checksum mismatch')
        # Reading to EOF checks gzip CRC; uncompressed hash proves byte-exact restoration.
        h=hashlib.sha256();size=0
        with gzip.open(p,'rb') as f:
            for block in iter(lambda:f.read(1024*1024),b''):h.update(block);size+=len(block)
        if info.get('raw_sha256') and h.hexdigest()!=info['raw_sha256']:raise ValueError('Restored checksum mismatch')
        if info.get('raw_bytes') is not None and size!=info['raw_bytes']:raise ValueError('Restored size mismatch')
        if restore:
            with tempfile.TemporaryDirectory(prefix='verify-',dir=folder.parent) as t:
                raw=pathlib.Path(t)/'restore.sqlite'
                with gzip.open(p,'rb') as src,raw.open('wb') as dst:shutil.copyfileobj(src,dst)
                with contextlib.closing(sqlite3.connect('file:'+str(raw)+'?mode=ro',uri=True)) as db:
                    if db.execute('PRAGMA integrity_check').fetchone()[0]!='ok':raise ValueError('Restored SQLite integrity failed')
    return manifest

def complete_snapshots(root):
    base=root/'backups/snapshots'
    if not base.exists():return []
    out=[]
    for p in base.iterdir():
        if p.is_dir() and not p.is_symlink() and STAMP.fullmatch(p.name):
            try:
                if (p/'READY').read_text().strip()==p.name and json.loads((p/'manifest.json').read_text())['snapshot']==p.name:out.append(p)
            except (OSError,ValueError,KeyError):pass
    return sorted(out,key=lambda p:p.name)

def prune_local(root, keep=2):
    if keep<2:raise ValueError('At least two restore points required')
    snapshots=complete_snapshots(root)
    if len(snapshots)<=keep:return []
    # No deletion unless every retained snapshot really restores byte-for-byte.
    for p in snapshots[-keep:]:verify_snapshot(p)
    removed=[]
    for p in snapshots[:-keep]:
        if p.parent.resolve()!=(root/'backups/snapshots').resolve() or p.is_symlink():raise ValueError('Unsafe prune target')
        shutil.rmtree(p);removed.append(p.name)
    return removed

def create_snapshot(root,stamp=None):
    """Caller holds backup_lock. Failures remove only this operation's staging files."""
    os.umask(0o077);base=root/'backups/snapshots';base.mkdir(parents=True,exist_ok=True)
    # Only stale staging made by this module; caller holds the shared backup lock.
    for pending in base.iterdir():
        if pending.is_dir() and not pending.is_symlink() and re.fullmatch(r'\.(?:pending-\d{8}T\d{6}Z|legacy)-[A-Za-z0-9_-]+',pending.name) and time.time()-pending.stat().st_mtime>21600:
            shutil.rmtree(pending)
    names=required_names(root)
    largest=max((root/'data'/(n+'.sqlite')).stat().st_size for n in names)
    need=largest*1.4+256*1024**2
    if shutil.disk_usage(root).free<need:raise RuntimeError('Not enough workspace for a verified backup; existing snapshots retained')
    stamp=stamp or dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    if not STAMP.fullmatch(stamp):raise ValueError('Invalid timestamp')
    final=base/stamp
    if final.exists():raise RuntimeError('Snapshot timestamp already exists')
    manifest={'schema':1,'snapshot':stamp,'files':{},'scope':'complete ingestion, archive and academic databases; private data; no application credentials','local_retention':2}
    with tempfile.TemporaryDirectory(prefix='.pending-'+stamp+'-',dir=base) as tmp:
        stage=pathlib.Path(tmp);deadline=time.monotonic()+2400
        for name in names:
            source=root/'data'/(name+'.sqlite');raw=stage/(name+'.sqlite');z=stage/(name+'.sqlite.gz')
            print('SNAPSHOT start',name,flush=True)
            def progress(status,remaining,total):
                if time.monotonic()>deadline:raise RuntimeError('Backup deadline exceeded')
                if shutil.disk_usage(root).free<128*1024**2:raise RuntimeError('Backup stopped before disk exhaustion')
            with contextlib.closing(sqlite3.connect('file:'+str(source)+'?mode=ro',uri=True,timeout=30)) as src,contextlib.closing(sqlite3.connect(raw)) as dst:
                src.backup(dst,pages=2048,sleep=0.02,progress=progress)
                if dst.execute('PRAGMA integrity_check').fetchone()[0]!='ok':raise RuntimeError('SQLite snapshot integrity failed: '+name)
            h=hashlib.sha256();raw_bytes=raw.stat().st_size
            with raw.open('rb') as src,gzip.open(z,'wb',compresslevel=3) as out:
                for block in iter(lambda:src.read(1024*1024),b''):h.update(block);out.write(block)
            info={'bytes':z.stat().st_size,'sha256':digest(z),'raw_bytes':raw_bytes,'raw_sha256':h.hexdigest()}
            # Verify compression before removing the verified raw staging copy.
            check=hashlib.sha256()
            with gzip.open(z,'rb') as inp:
                for block in iter(lambda:inp.read(1024*1024),b''):check.update(block)
            if check.hexdigest()!=info['raw_sha256']:raise RuntimeError('Compression verification failed')
            raw.unlink()
            for suffix in ['-wal','-shm','-journal']:(stage/(name+'.sqlite'+suffix)).unlink(missing_ok=True)
            manifest['files'][z.name]=info
            with z.open('rb') as f:os.fsync(f.fileno())
            print('SNAPSHOT verified',name,info['bytes'],'compressed bytes',flush=True)
        (stage/'manifest.json').write_text(json.dumps(manifest,indent=2))
        (stage/'READY').write_text(stamp+'\n')
        for name in ['manifest.json','READY']:
            with (stage/name).open('rb') as f:os.fsync(f.fileno())
        os.rename(stage,final)
    # TemporaryDirectory tolerates the staging path having been atomically renamed.
    return final

def record_status(root,**data):
    p=root/'state/local-backup-status.json';p.parent.mkdir(parents=True,exist_ok=True)
    old=json.loads(p.read_text()) if p.exists() else {}
    old.update(data,checked_at=dt.datetime.now(dt.timezone.utc).isoformat())
    temp=p.with_suffix('.tmp');temp.write_text(json.dumps(old));temp.replace(p)

def run(root):
    with backup_lock(root):
        snap=create_snapshot(root)
        removed=prune_local(root)
        manifest=json.loads((snap/'manifest.json').read_text())
        record_status(root,ok=True,snapshot=snap.name,verified_restore=True,bytes=sum(x['bytes'] for x in manifest['files'].values()),retained=[p.name for p in complete_snapshots(root)],removed=removed)
        print('BACKUP COMPLETE',snap.name,'local retention: 2 verified generations',flush=True)
        return snap
