#!/usr/bin/env python3
"""Checkpointed recovery from publisher sitemaps. No paywall/access-control bypass."""
import collections,concurrent.futures,datetime as dt,gzip,html,json,os,pathlib,re,sqlite3,subprocess,threading,time,urllib.request,urllib.parse,urllib.robotparser,xml.etree.ElementTree as ET
from html.parser import HTMLParser
ROOT=pathlib.Path(os.environ.get('ZOHUR_ROOT','/opt/zohurnews')); DEST=ROOT/'data'/'recovery'; UA='ZohurNewsResearch/3.1 (+https://zohurnews.com)'
FROM='2026-10-08T22:15:00+00:00'; TO='2026-10-30T08:00:00+00:00'
SOURCES={
 'irna':('https://www.irna.ir',['/sitemap/1405/sitemap.xml'],'fa'),
 'khabaronline':('https://www.khabaronline.ir',['/sitemap/1405/sitemap.xml'],'fa'),
 'mashregh':('https://www.mashreghnews.ir',['/sitemap/all/sitemap.xml'],'fa'),
 'mehrnews':('https://en.mehrnews.com',['/sitemap/all/sitemap.xml'],'en'),
 'yjc':('https://www.yjc.ir',['/fa-sitemap-newsarchive'],'fa'),
 'asriran':('https://www.asriran.com',['/fa-sitemap-newsarchive'],'fa'),
 'aljazeera':('https://www.aljazeera.com',['/sitemaps/article-new.xml','/sitemaps/article-archive.xml'],'en'),
 'france24':('https://www.france24.com',['/sitemaps/en/index.xml'],'en'),
 'dw':('https://www.dw.com',['/sitemap.xml'],'en'),
 'bbc':('https://www.bbc.com',['/sitemaps/https-index-com-archive.xml'],'en'),
 'nytimes':('https://www.nytimes.com',['/sitemaps/new/sitemap.xml.gz'],'en'),
 'independent':('https://www.independent.co.uk',[],'en'),
 'skynews':('https://news.sky.com',[],'en'),
 'rt':('https://www.rt.com',[],'en'),
 'economist':('https://www.economist.com',['/sitemap.xml'],'en'),
 'foreignpolicy':('https://foreignpolicy.com',['/sitemap.xml'],'en'),
 'reuters':('https://www.reuters.com',['/arc/outboundfeeds/sitemap-index/?outputType=xml'],'en'),
 'isna':('https://www.isna.ir',[],'fa'),
 'guardian':('https://www.theguardian.com',[],'en')}
locks=collections.defaultdict(threading.Lock); last=collections.defaultdict(float); robots={}

def canonical(url):
 u=urllib.parse.urlsplit(url);q=[(k,v)for k,v in urllib.parse.parse_qsl(u.query,keep_blank_values=True)if not re.match(r'utm_|^(fbclid|gclid)$',k,re.I)]
 return urllib.parse.urlunsplit((u.scheme,u.netloc,urllib.parse.quote(urllib.parse.unquote(u.path),safe='/:@!$&\'()*+,;=-._~'),urllib.parse.urlencode(q),''))

def allowed(url,base):
 return urllib.parse.urlsplit(url).scheme in ('https','http') and urllib.parse.urlsplit(url).hostname==urllib.parse.urlsplit(base).hostname

class SameHost(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,req,fp,code,msg,headers,newurl):
  if not allowed(newurl,req.full_url):raise ValueError('Cross-host redirect not followed')
  return super().redirect_request(req,fp,code,msg,headers,newurl)

def fetch(url,base,robot=True,limit=12*1024*1024):
 if not allowed(url,base):raise ValueError('URL outside publisher host')
 if robot and base not in robots:raise ValueError('Publisher robots temporarily unavailable; retry later')
 if robot and not robots[base].can_fetch(UA,url):raise ValueError('Disallowed by publisher robots.txt')
 with locks[base]:
  delay=max(1.0,float(robots[base].crawl_delay(UA)or robots[base].crawl_delay('*')or 0))if robot else 1.0
  time.sleep(max(0,delay-(time.monotonic()-last[base])))
  last[base]=time.monotonic()
  req=urllib.request.Request(canonical(url),headers={'User-Agent':UA,'Accept-Encoding':'gzip','Accept':'application/xml,text/html,application/json;q=0.9,*/*;q=0.5'})
  with urllib.request.build_opener(SameHost()).open(req,timeout=15) as response:
   b=response.read(limit+1)
  last[base]=time.monotonic()
 if len(b)>limit:raise ValueError('Publisher response too large')
 if b[:2]==b'\x1f\x8b':
  import io
  with gzip.GzipFile(fileobj=io.BytesIO(b)) as z:b=z.read(limit+1)
  if len(b)>limit:raise ValueError('Decompressed response too large')
 return b.decode('utf8','replace')

def init_robots(base):
 text=fetch(base+'/robots.txt',base,False,500000)
 if '<html' in text.lower()[:500]:raise ValueError('Publisher challenge at robots.txt; not bypassed')
 rp=urllib.robotparser.RobotFileParser();rp.parse(text.splitlines());robots[base]=rp
 return re.findall(r'(?im)^sitemap:\s*(\S+)',text)

def relevant_map(url):
 monthly=re.search(r'newsarchive-(14\d{2})-(\d{1,2})-',url)
 if monthly:return monthly[1]=='1405'and int(monthly[2])in(7,8)
 daily=re.search(r'/1405/(07|08)/(\d{2})/',url)
 if daily:return (daily[1]=='07'and int(daily[2])>=17)or(daily[1]=='08'and int(daily[2])<=8)
 if re.search(r'/1405/(?:07/(?:1[7-9]|2\d|30)|08/0[1-8])/',url):return True
 if re.search(r'/2026/10/(?:0[9]|[12]\d|30)/',url):return True
 if re.search(r'(?:1405[-/]0?[78](?:[-/]|$)|2026[-/]10|202610)',url):return True
 if re.search(r'(?:/20\d\d/|/20\d\d[-/]|20\d{4}|/14\d\d/)',url):return False
 return not re.search(r'video|image|sport|recipe|cooking|/fr/|/ar/|/es/',url,re.I)

def sitemap(text):
 if text.lstrip().startswith('{'):
  d=json.loads(text)
  if 'sitemaps'in d:return 'index',d['sitemaps']
  return 'urls',d.get('urls',[])
 root=ET.fromstring(text);rows=[]
 for node in root:
  d={};
  for child in node:
   tag=child.tag.split('}')[-1]
   if tag=='news':
    for n in child:d[n.tag.split('}')[-1]]=n.text or ''
   else:d[tag]=child.text or ''
  rows.append(d)
 return ('index' if root.tag.endswith('sitemapindex') else 'urls'),rows

def discover(source):
 base,seeds,lang=SOURCES[source];found={};errors=[];visited=set()
 try:
  advertised=init_robots(base)
  queue=[urllib.parse.urljoin(base,x) for x in seeds]
  if not queue:queue=[u for u in advertised if allowed(u,base) and relevant_map(u)][:5]
  if source=='guardian':
   for day in range(9,31):
    u=base+f'/world/2026/oct/{day:02}/all'
    try:
     text=fetch(u,base)
     for link in re.findall(r'href=["\']([^"\']+)',text):
      link=html.unescape(urllib.parse.urljoin(base,link))
      if allowed(link,base) and re.search(r'/2026/oct/(?:0?[9]|[12]\d|30)/',link) and not link.endswith('/all'):found[canonical(link)]=u
    except Exception as e:errors.append(str(e))
  while queue and len(visited)<100:
   url=queue.pop(0)
   if url in visited or not allowed(url,base):continue
   visited.add(url)
   try:
    kind,rows=sitemap(fetch(url,base))
    if kind=='index':queue.extend(r['loc']for r in rows if r.get('loc') and relevant_map(r['loc']))
    else:
     for r in rows:
      link=r.get('loc','')
      if not allowed(link,base):continue
      # lastmod is only used to prioritize candidates, NEVER as publication time.
      modified=r.get('lastmod')or r.get('lastmode')or''
      if modified and modified[:10]<'2026-10-08':continue
      if source=='france24' and '/en/'not in link:continue
      if source=='dw' and '/en/'not in link:continue
      found[canonical(link)]=url
   except Exception as e:errors.append(str(e))
  return source,found,{'state':'candidates-discovered'if found else 'no-candidates','maps_checked':len(visited),'unvisited_maps':len(queue),'candidates':len(found),'errors':errors[:8]}
 except Exception as e:return source,{}, {'state':'blocked-or-unavailable','errors':[str(e)]}

class Metadata(HTMLParser):
 def __init__(self):super().__init__();self.meta={};self.jsons=[];self.inside=False;self.buf='';self.title='';self.in_title=False
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if tag=='meta':self.meta[(a.get('property')or a.get('name')or a.get('itemprop')or'').lower()]=a.get('content','')
  if tag=='script' and a.get('type')=='application/ld+json':self.inside=True;self.buf=''
  if tag=='title':self.in_title=True
 def handle_endtag(self,tag):
  if tag=='script'and self.inside:self.jsons.append(self.buf);self.inside=False
  if tag=='title':self.in_title=False
 def handle_data(self,data):
  if self.inside:self.buf+=data
  if self.in_title:self.title+=data

def extract(text,url=None):
 parser=Metadata();parser.feed(text);m=parser.meta
 title=m.get('og:title')or m.get('twitter:title')or parser.title
 description=m.get('description')or m.get('og:description')or''
 published=m.get('article:published_time')or m.get('datepublished')or m.get('pubdate')or''
 def nodes(x):
  if isinstance(x,dict):
   yield x
   for v in x.values():yield from nodes(v)
  elif isinstance(x,list):
   for v in x:yield from nodes(v)
 for raw in parser.jsons:
  try:
   for node in nodes(json.loads(raw)):
    types=node.get('@type',[]);types=[types]if isinstance(types,str)else types
    if any(t in ['NewsArticle','Article','ReportageNewsArticle','LiveBlogPosting']for t in types):
     identity=node.get('url')or node.get('mainEntityOfPage')or node.get('@id')
     if isinstance(identity,dict):identity=identity.get('@id')or identity.get('url')
     if url and isinstance(identity,str) and identity.startswith('http') and canonical(identity.split('#')[0])!=canonical(url):continue
     if not title and node.get('headline'):title=node['headline']
     description=description or node.get('description')or''
     candidate=node.get('datePublished')or''
     def aware(value):
      try:return dt.datetime.fromisoformat(value.replace('Z','+00:00')).tzinfo is not None
      except (ValueError,AttributeError):return False
     if not aware(published)and aware(candidate):published=candidate
     else:published=published or candidate
     if published:break
  except (ValueError,TypeError):pass
 if not title or not isinstance(published,str)or not published:raise ValueError('Missing title/publication metadata')
 d=dt.datetime.fromisoformat(published.replace('Z','+00:00'))
 if d.tzinfo is None:raise ValueError('Publication timezone missing; not guessed')
 if not(dt.datetime.fromisoformat(FROM)<=d<dt.datetime.fromisoformat(TO)):return None
 clean=lambda s:html.unescape(re.sub('<[^>]+>',' ',str(s))).strip()
 return {'title':clean(title),'description':clean(description),'pubDate':d.astimezone(dt.timezone.utc).isoformat()}

def is_collection(url):
 return bool(re.match(r'^/(?:en/)?(?:topic|topics|tag|tags|author|authors)(?:/|$)',urllib.parse.urlsplit(url).path))

def recover(row):
 source,url,origin=row;base,_,lang=SOURCES[source]
 try:
  if is_collection(url):return url,'non-article-collection',None
  text=fetch(url,base,limit=3*1024*1024)
  if len(text)<20000 and 'Transferring to the website...'in text:return url,'blocked:publisher-challenge',None
  item=extract(text,url)
  if item is None:return url,'outside-period',None
  item.update(agencyId=source,sourceUrl=url,lang=lang,provenance='publisher-archive-recovery',content_scope='publisher_metadata_excerpt',recovery={'recovered_at':dt.datetime.now(dt.timezone.utc).isoformat(),'discovered_from':origin,'publication_basis':'publisher metadata, not sitemap lastmod'})
  return url,'recovered',item
 except Exception as e:return url,'failed:'+str(e)[:200],None

def import_batch(items,status):
 target=DEST/'import-batch.json';temp=target.with_suffix('.tmp');temp.write_text(json.dumps({'articles':items,'status':status},ensure_ascii=False));os.replace(temp,target)
 r=subprocess.run(['docker','exec','zohurnews-research','node','research/recover-import.mjs','/data/recovery/import-batch.json'],capture_output=True,text=True)
 if r.returncode:raise RuntimeError('Recovery importer failed: '+r.stderr[-500:])
 target.unlink();print(r.stdout.strip(),flush=True)

def main():
 import fcntl
 DEST.mkdir(parents=True,exist_ok=True);lock=(ROOT/'state'/'recovery.lock').open('w');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
 c=sqlite3.connect(DEST/'progress.sqlite');c.execute('PRAGMA journal_mode=WAL');c.executescript('CREATE TABLE IF NOT EXISTS queue(source TEXT,url TEXT PRIMARY KEY,origin TEXT,status TEXT DEFAULT "pending",attempts INTEGER DEFAULT 0);CREATE TABLE IF NOT EXISTS sources(id TEXT PRIMARY KEY,payload TEXT);')
 c.execute("UPDATE queue SET status='pending' WHERE status='awaiting-import'");c.commit()
 with sqlite3.connect('file:'+str(ROOT/'data/research.sqlite')+'?mode=ro',uri=True)as live:known={canonical(r[0])for r in live.execute('select url from r_articles')}
 selected=set(os.environ.get('ZOHUR_RECOVERY_SOURCES',','.join(SOURCES)).split(','))
 c.execute("UPDATE queue SET status='pending' WHERE attempts<3 AND (status LIKE 'failed:%timed out%' OR status LIKE 'failed:%HTTP Error 5%' OR status='failed:Publisher robots temporarily unavailable; retry later')");c.commit()
 todo=[s for s in SOURCES if s in selected and not c.execute('select 1 from sources where id=?',(s,)).fetchone()][:4]  # bound discovery memory; later batches cover remaining publishers
 with concurrent.futures.ThreadPoolExecutor(max_workers=4)as pool:
  for source,urls,status in pool.map(discover,todo):
   c.executemany('INSERT OR IGNORE INTO queue(source,url,origin,status)VALUES(?,?,?,?)',[(source,u,origin,'already-stored'if u in known else'pending')for u,origin in urls.items()]);c.execute('INSERT OR REPLACE INTO sources VALUES(?,?)',(source,json.dumps(status)));c.commit();print(source,json.dumps(status),flush=True)
 # Reconstruct robots policies after a restart; inaccessible publishers are retained as errors.
 for source,(base,_,_)in SOURCES.items():
  if base not in robots:
   try:init_robots(base)
   except Exception:pass
 # Missing robots is transient: do not burn through a whole source's queue.
 def not_deferred(source):
  row=c.execute('select payload from sources where id=?',(source,)).fetchone()
  until=json.loads(row[0]).get('page_retry_after')if row else None
  return not until or until<dt.datetime.now(dt.timezone.utc).isoformat()
 ready_sources=[s for s in SOURCES if SOURCES[s][0]in robots and not_deferred(s)]
 placeholders=','.join('?'for _ in ready_sources)or"''"
 rows=c.execute("SELECT source,url,origin FROM (SELECT *,row_number()over(partition by source order by CASE WHEN url LIKE '%/tag/%'OR url LIKE '%/topic/%'OR url LIKE '%/author/%'THEN 1 ELSE 0 END,url)rn FROM queue WHERE status='pending'AND source IN("+placeholders+"))WHERE rn<=100 ORDER BY rn,source",ready_sources).fetchall();items=[]
 def status():return {'at':dt.datetime.now(dt.timezone.utc).isoformat(),'period':{'from':FROM,'to':TO},'counts':dict(c.execute('select status,count(*)from queue group by status')),'sources':{s:json.loads(p)for s,p in c.execute('select id,payload from sources')},'discovery_remaining':len(SOURCES)-c.execute('select count(*)from sources').fetchone()[0],'state':'in-progress'if (c.execute("select count(*)from queue where status='pending'").fetchone()[0] or c.execute('select count(*)from sources').fetchone()[0]<len(SOURCES))else'discovered-queue-processed-with-gaps','completeness':'not-guaranteed; discovered publisher archive only'}
 with concurrent.futures.ThreadPoolExecutor(max_workers=4)as pool:
  for url,state,item in pool.map(recover,rows):
   if state=='blocked:publisher-challenge':
    source=next((s for s,(base,_,_)in SOURCES.items()if allowed(url,base)),None)
    if source:
     record=c.execute('select payload from sources where id=?',(source,)).fetchone()
     policy=json.loads(record[0])if record else{}
     policy.update(page_access='publisher-challenge; no bypass attempted',page_retry_after=(dt.datetime.now(dt.timezone.utc)+dt.timedelta(hours=24)).isoformat())
     c.execute('insert or replace into sources values(?,?)',(source,json.dumps(policy)))
   if item:items.append(item)
   # Recoveries are acknowledged only AFTER successful idempotent import.
   if item:c.execute('update queue set status="awaiting-import",attempts=attempts+1 where url=?',(url,))
   else:c.execute('update queue set status=?,attempts=attempts+1 where url=?',(state,url))
   if len(items)>=25:
    import_batch(items,status());c.execute('update queue set status="recovered"where status="awaiting-import"');c.commit();items=[]
  import_batch(items,status());c.execute('update queue set status="recovered"where status="awaiting-import"');c.commit()
 import_batch([],status());print(json.dumps(status()),flush=True)

if __name__=='__main__':main()
