import importlib.util,pathlib,unittest
spec=importlib.util.spec_from_file_location('recover',pathlib.Path(__file__).with_name('backfill.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Tests(unittest.TestCase):
 def test_lastmod_is_not_publication(self):
  with self.assertRaises(ValueError):m.extract('<title>خبر</title><meta property="article:modified_time" content="2026-10-10T12:00:00Z">')
 def test_missing_timezone_is_not_guessed(self):
  with self.assertRaises(ValueError):m.extract('<title>خبر</title><meta property="article:published_time" content="2026-10-10T12:00:00">')
 def test_structured_article(self):
  a=m.extract('<script type="application/ld+json">{"@type":"NewsArticle","headline":"خبر اصلی","datePublished":"2026-10-10T12:00:00+03:30","description":"خلاصه"}</script>')
  self.assertEqual(a['title'],'خبر اصلی');self.assertIn('08:30:00',a['pubDate'])
 def test_period_and_maps(self):
  self.assertIsNone(m.extract('<title>Old</title><meta property="article:published_time" content="2025-10-10T12:00:00Z">'))
  self.assertFalse(m.relevant_map('https://x/sitemap/1404/07/17/sitemap.xml'));self.assertTrue(m.relevant_map('https://x/sitemap/1405/07/17/sitemap.xml'))
 def test_publisher_boundaries(self):
  self.assertFalse(m.allowed('http://127.0.0.1/secret','https://www.irna.ir'));self.assertFalse(m.allowed('https://www.irna.ir.evil.test','https://www.irna.ir'))
if __name__=='__main__':unittest.main()
