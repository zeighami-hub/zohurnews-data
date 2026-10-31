import importlib.util,json,pathlib,tempfile,unittest
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('backfill',pathlib.Path(__file__).with_name('backfill.py'));b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)

class RecoveryTests(unittest.TestCase):
 def test_publication_is_not_lastmod_or_related_article(self):
  text='<meta property="og:title" content="Real headline"><script type="application/ld+json">'+json.dumps([{'@type':'NewsArticle','url':'https://example.test/other','datePublished':'2026-10-20T10:00:00Z'},{'@type':'NewsArticle','url':'https://example.test/news','datePublished':'2026-10-21T11:00:00+03:30'}])+'</script>'
  item=b.extract(text,'https://example.test/news');self.assertEqual(item['pubDate'],'2026-10-21T07:30:00+00:00')
  with self.assertRaises(ValueError):b.extract('<meta property="og:title" content="Real"><meta property="article:published_time" content="2026-10-21T11:00:00">')
 def test_resume_keeps_maps_after_per_pass_limit(self):
  base='https://example.test'
  index='<sitemapindex>'+''.join(f'<sitemap><loc>{base}/map-{i}.xml</loc></sitemap>'for i in range(40))+'</sitemapindex>'
  def fetch(url,*args,**kwargs):
   if url.endswith('/index.xml'):return index
   number=url.rsplit('map-',1)[-1].split('.')[0]
   return f'<urlset><url><loc>{base}/news-{number}</loc></url></urlset>'
  with tempfile.TemporaryDirectory()as folder,patch.object(b,'DEST',pathlib.Path(folder)),patch.object(b,'SOURCES',{'test':(base,['/index.xml'],'en')}),patch.object(b,'init_robots',return_value=[]),patch.object(b,'fetch',side_effect=fetch):
   _,first,status=b.discover('test');self.assertEqual(len(first),24);self.assertEqual(status['unvisited_maps'],16)
   checkpoint=pathlib.Path(folder)/'sitemaps-test.json'
   self.assertFalse(checkpoint.exists())
   checkpoint.with_suffix('.next').replace(checkpoint)
   _,second,status=b.discover('test');self.assertEqual(len(second),16);self.assertEqual(status['unvisited_maps'],0)
   self.assertFalse(set(first)&set(second));self.assertEqual(len(set(first)|set(second)),40)
 def test_collection_pages_are_not_news(self):
  for url in ['https://www.france24.com/en/tag/topic/','https://www.independent.co.uk/author/person','https://www.dw.com/en/news/s-123','https://www.dw.com/en/topic/t-123','https://www.dw.com/en/author/person-123']:
   self.assertTrue(b.is_collection(url),url)
  self.assertFalse(b.is_collection('https://www.dw.com/en/report/a-123'))

if __name__=='__main__':unittest.main()
