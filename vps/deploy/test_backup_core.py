import unittest,tempfile,pathlib,sqlite3,importlib.util,gzip,json
spec=importlib.util.spec_from_file_location('backup_core',pathlib.Path(__file__).with_name('backup_core.py'))
core=importlib.util.module_from_spec(spec);spec.loader.exec_module(core)
class Tests(unittest.TestCase):
 def make(self,p):
  (p/'data').mkdir()
  for name in core.NAMES:
   with sqlite3.connect(p/'data'/(name+'.sqlite')) as db:db.execute('create table evidence(id integer primary key,text)');db.execute('insert into evidence values(1,?)',('??? ????? ???????',))
 def test_rotates_only_after_new_success_and_preserves_main_data(self):
  with tempfile.TemporaryDirectory() as t:
   p=pathlib.Path(t);self.make(p);hashes={n:core.digest(p/'data'/(n+'.sqlite')) for n in core.NAMES}
   for day in [1,2,3]:core.create_snapshot(p,'202611%02dT020000Z'%day)
   self.assertEqual(len(core.prune_local(p)),1);self.assertEqual(len(core.complete_snapshots(p)),2)
   for n,h in hashes.items():self.assertEqual(core.digest(p/'data'/(n+'.sqlite')),h)
   newest=core.complete_snapshots(p)[-1];core.verify_snapshot(newest,restore=True)
   self.assertEqual({x.name for x in newest.iterdir()},{'news.sqlite.gz','research.sqlite.gz','academic.sqlite.gz','manifest.json','READY'})
 def test_corruption_prevents_pruning(self):
  with tempfile.TemporaryDirectory() as t:
   p=pathlib.Path(t);self.make(p)
   for day in [1,2,3]:core.create_snapshot(p,'202611%02dT020000Z'%day)
   newest=core.complete_snapshots(p)[-1];(newest/'research.sqlite.gz').write_bytes(b'corrupt')
   with self.assertRaises(ValueError):core.prune_local(p)
   self.assertEqual(len(core.complete_snapshots(p)),3)
 def test_failed_snapshot_removes_only_own_staging(self):
  with tempfile.TemporaryDirectory() as t:
   p=pathlib.Path(t);self.make(p);core.create_snapshot(p,'20261101T020000Z')
   (p/'data/research.sqlite').write_bytes(b'not a database')
   with self.assertRaises(sqlite3.DatabaseError):core.create_snapshot(p,'20261102T020000Z')
   self.assertEqual(len(core.complete_snapshots(p)),1);self.assertFalse(list((p/'backups/snapshots').glob('.pending-*')))
if __name__=='__main__':unittest.main()
