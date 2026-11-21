"""One-time migration, after a verified new generation exists. Never touches /data."""
import contextlib,datetime as dt,gzip,hashlib,json,os,pathlib,re,shutil,sqlite3,tempfile
import backup_core as core

def migrate(root):
    base=root/'backups';snapshots=base/'snapshots'
    with core.backup_lock(root):
        existing=core.complete_snapshots(root)
        if not existing:raise RuntimeError('Create a new verified snapshot first')
        newest=existing[-1];core.verify_snapshot(newest,restore=True)
        required=core.required_names(root)
        stamps=sorted({f.name.split('-')[0] for f in base.glob('*-research.sqlite.gz') if core.STAMP.fullmatch(f.name.split('-')[0])},reverse=True)
        prior=None
        for stamp in stamps:
            if stamp>=newest.name or (snapshots/stamp).exists():continue
            files={n:base/(stamp+'-'+n+'.sqlite.gz') for n in required}
            if not all(f.is_file() and not f.is_symlink() for f in files.values()):continue
            try:
                with tempfile.TemporaryDirectory(prefix='.legacy-',dir=snapshots) as tmp:
                    stage=pathlib.Path(tmp);manifest={'schema':1,'snapshot':stamp,'files':{},'origin':'verified legacy migration'}
                    for n,src in files.items():
                        dst=stage/(n+'.sqlite.gz');os.link(src,dst);raw=stage/(n+'.restore.sqlite')
                        with gzip.open(dst,'rb') as inp,raw.open('wb') as out:shutil.copyfileobj(inp,out)
                        with contextlib.closing(sqlite3.connect('file:'+str(raw)+'?mode=ro',uri=True)) as db:
                            if db.execute('PRAGMA integrity_check').fetchone()[0]!='ok':raise ValueError('Legacy integrity failed')
                        manifest['files'][dst.name]={'bytes':dst.stat().st_size,'sha256':core.digest(dst),'raw_bytes':raw.stat().st_size,'raw_sha256':core.digest(raw)}
                        raw.unlink()
                    (stage/'manifest.json').write_text(json.dumps(manifest,indent=2));(stage/'READY').write_text(stamp+'\n');prior=snapshots/stamp;os.rename(stage,prior)
                break
            except (OSError,ValueError,sqlite3.DatabaseError,EOFError) as e:print('LEGACY SKIPPED',stamp,type(e).__name__,flush=True)
        complete=core.complete_snapshots(root)
        if len(complete)<2:raise RuntimeError('Two verified restore points required before legacy cleanup')
        for p in complete[-2:]:core.verify_snapshot(p)
        # Scope is explicit: date-stamped generated backup files and three historical full-DB copies.
        pattern=re.compile(r'^\d{8}T\d{6}Z(?:-(?:news|research|academic))?\.sqlite(?:\.gz|-wal|-shm|-journal)?$')
        candidates=[p for p in base.iterdir() if p.is_file() and not p.is_symlink() and pattern.fullmatch(p.name)]
        for dirname in ['editorial-before-20261105T144354Z','research-review-before-20261105T141652Z','academic-before-20261108T150306Z']:
            folder=base/dirname
            if folder.is_dir() and not folder.is_symlink():
                candidates += [p for p in folder.iterdir() if p.is_file() and not p.is_symlink() and re.fullmatch(r'(?:news|research|academic)\.sqlite(?:\.gz|-wal|-shm|-journal)?',p.name)]
        audit={'at':dt.datetime.now(dt.timezone.utc).isoformat(),'retained':[p.name for p in complete[-2:]],'items':[],'state':'planned'}
        for p in candidates:
            if base.resolve() not in p.resolve().parents:raise ValueError('Unsafe cleanup target')
            audit['items'].append({'path':str(p.relative_to(base)),'bytes':p.stat().st_size})
        report=root/'state/legacy-backup-cleanup.json';report.write_text(json.dumps(audit,indent=2))
        freed=0
        for p in candidates:freed+=p.stat().st_size;p.unlink()
        audit.update(state='complete',unlinked_bytes=freed);report.write_text(json.dumps(audit,indent=2))
        core.prune_local(root)
        core.record_status(root,ok=True,snapshot=newest.name,verified_restore=True,retained=[p.name for p in core.complete_snapshots(root)],legacy_cleanup=True)
        print('LEGACY CLEANUP COMPLETE',len(candidates),'files',freed,'bytes unlinked; kept',audit['retained'],flush=True)

if __name__=='__main__':migrate(pathlib.Path('/opt/zohurnews'))
