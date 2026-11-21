import gzip,importlib.util,pathlib,sqlite3,sys,tempfile,unittest
here=pathlib.Path(__file__).parent;sys.path.insert(0,str(here));import backup_core as core
spec=importlib.util.spec_from_file_location('legacy',here/'rotate_legacy_backups.py');legacy=importlib.util.module_from_spec(spec);spec.loader.exec_module(legacy)
class Tests(unittest.TestCase):
 def test_two_verified_generations_precede_legacy_deletion(self):
  with tempfile.TemporaryDirectory() as t:
   root=pathlib.Path(t);(root/'data').mkdir();(root/'backups').mkdir()
   for name in core.NAMES:
    p=root/'data'/(name+'.sqlite')
    with sqlite3.connect(p) as db:db.execute('CREATE TABLE records(id)');db.execute('INSERT INTO records VALUES(1)')
    with p.open('rb') as inp,gzip.open(root/'backups'/('20261113T023000Z-'+name+'.sqlite.gz'),'wb') as out:out.write(inp.read())
   originals={n:core.digest(root/'data'/(n+'.sqlite')) for n in core.NAMES}
   stale=root/'backups/20261114T023004Z-research.sqlite';stale.write_bytes(b'incomplete')
   other=root/'backups/retain-source.txt';other.write_text('keep source/configuration')
   core.create_snapshot(root,'20261121T120000Z');legacy.migrate(root)
   self.assertFalse(stale.exists());self.assertTrue(other.exists());self.assertEqual(len(core.complete_snapshots(root)),2)
   for p in core.complete_snapshots(root):core.verify_snapshot(p,restore=True)
   for n,h in originals.items():self.assertEqual(core.digest(root/'data'/(n+'.sqlite')),h)
 def test_missing_previous_restore_point_does_not_delete_anything(self):
  with tempfile.TemporaryDirectory() as t:
   root=pathlib.Path(t);(root/'backups').mkdir();p=root/'backups/20261114T023004Z-research.sqlite';p.write_bytes(b'keep')
   with self.assertRaises(RuntimeError):legacy.migrate(root)
   self.assertTrue(p.exists())
if __name__=='__main__':unittest.main()
