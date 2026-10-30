#!/usr/bin/env python3
"""Verified online backups for both research and ingestion databases."""
import sqlite3,pathlib,datetime,gzip,shutil,os
root=pathlib.Path('/opt/zohurnews');dest=root/'backups';dest.mkdir(mode=0o700,exist_ok=True)
stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ');os.umask(0o077)
for name in ['news','research']:
 source=root/'data'/(name+'.sqlite')
 if not source.exists():continue
 target=dest/(stamp+'-'+name+'.sqlite')
 with sqlite3.connect('file:'+str(source)+'?mode=ro',uri=True) as src,sqlite3.connect(target) as dst:
  src.backup(dst)
  assert dst.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
  # Backup content includes the complete research corpus, not the UI preview sample.
 with target.open('rb') as src,gzip.open(str(target)+'.gz','wb',compresslevel=6) as dst:shutil.copyfileobj(src,dst)
 target.unlink();os.chmod(str(target)+'.gz',0o600)
 for old in sorted(dest.glob('*-'+name+'.sqlite.gz'))[:-14]:old.unlink()
 print('Backup verified:',name,stamp,(dest/(target.name+'.gz')).stat().st_size,'bytes')
