import datetime as dt, gzip, importlib.util, json, pathlib, sqlite3, tempfile, unittest
spec = importlib.util.spec_from_file_location('cloud', pathlib.Path(__file__).with_name('cloud_backup.py'))
cloud = importlib.util.module_from_spec(spec); spec.loader.exec_module(cloud)

class Tests(unittest.TestCase):
    def test_retention_cross_year(self):
        stamps = [(dt.datetime(2026, 12, 31)-dt.timedelta(days=i)).strftime('%Y%m%dT120000Z') for i in range(300)]
        keep = cloud.retained(stamps + ['../../bad', 'not-a-snapshot'])
        self.assertTrue(set(stamps[:7]) <= keep)
        self.assertLessEqual(len(keep), 17)
        self.assertEqual(len({s[:6] for s in keep}), 6)
        self.assertFalse(any('/' in s for s in keep))

    def test_manifest_cannot_escape_folder(self):
        with self.assertRaises(ValueError): cloud.validate_manifest({'schema':1,'snapshot':'20261030T120000Z','files':{'../../secret':{}}},'20261030T120000Z')

    def test_full_sqlite_restore_and_corruption(self):
        with tempfile.TemporaryDirectory() as t:
            p=pathlib.Path(t); stamp='20261030T120000Z'; files={}
            for name in ['news','research']:
                db=p/(name+'.sqlite')
                with sqlite3.connect(db) as c: c.execute('create table records(id integer)'); c.execute('insert into records values(42)')
                z=p/(name+'.sqlite.gz')
                with gzip.open(z,'wb') as f: f.write(db.read_bytes())
                db.unlink(); files[z.name]={'bytes':z.stat().st_size,'sha256':cloud.digest(z)}
            (p/'manifest.json').write_text(json.dumps({'schema':1,'snapshot':stamp,'files':files}))
            cloud.verify_snapshot(p,stamp)
            z=p/'research.sqlite.gz'; z.write_bytes(z.read_bytes()[:-5]+b'xxxxx')
            with self.assertRaises(ValueError): cloud.verify_snapshot(p,stamp)

if __name__=='__main__': unittest.main()
