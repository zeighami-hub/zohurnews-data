"""Run against an isolated PHP server, never a production endpoint."""
import urllib.request,urllib.error,json,time,hashlib,hmac,os
url=os.environ.get('TEST_URL','http://127.0.0.1:18085/api/receive-news-v2.php')
secret=os.environ.get('TEST_SECRET','t'*64)
def send(payload,secret_key=secret,timestamp=None):
    body=json.dumps(payload,separators=(',',':'),ensure_ascii=False).encode()
    stamp=str(int(time.time()) if timestamp is None else timestamp)
    sig=hmac.new(secret_key.encode(),stamp.encode()+b'.'+body,hashlib.sha256).hexdigest()
    req=urllib.request.Request(url,data=body,headers={'Content-Type':'application/json','X-Zohur-Timestamp':stamp,'X-Zohur-Signature':sig})
    try:
        with urllib.request.urlopen(req,timeout=10) as r:return r.status,json.load(r)
    except urllib.error.HTTPError as e:return e.code,json.load(e)
now=int(time.time()*1000)
date=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime(now/1000))
article={'id':'bbc_test1','agencyId':'bbc','sourceUrl':'https://example.com/test','title_fa':'خبر آزمایشی','lead':'متن آزمایشی','analyzed_at':date}
p={'schema':2,'sequence':now,'cache':{'generated_at':date,'total':1,'articles':[article]},'archive':[article]}
assert send(p,'wrong'*12)[0]==401
assert send(p,timestamp=int(time.time())-600)[0]==401
status,ack=send(p);assert status==200,(status,ack)
assert send(p)==(status,ack),'Replay must be idempotent'
q=json.loads(json.dumps(p));q['cache']['articles'][0]['lead']='changed';assert send(q)[0]==409
q=json.loads(json.dumps(p));q['sequence']-=2000;q['cache']['generated_at']=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime(q['sequence']/1000));assert send(q)[0]==409
q=json.loads(json.dumps(p));q['sequence']+=1;q['archive'][0]['agencyId']='../../escape';assert send(q)[0]==400
base=url.split('/api/')[0]
with urllib.request.urlopen(base+'/api/news-proxy.php') as r:
    d=json.load(r);assert d['total']==1 and d['stale'] is False
with urllib.request.urlopen(base+'/api/archive-search.php?agencyId=bbc') as r:
    d=json.load(r);assert d['total']==1
with urllib.request.urlopen(base+'/api/article.php?id=bbc_test1') as r:
    page=r.read().decode();assert 'https://zohurnews.com/api/article.php?id=bbc_test1' in page
# A newer snapshot must be accepted after a successful publication.
q=json.loads(json.dumps(p));q['sequence']+=2000;q['cache']['generated_at']=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime(q['sequence']/1000));assert send(q)[0]==200
private=os.environ.get('TEST_PRIVATE_DIR')
if private:
    from pathlib import Path
    f=Path(private)/'news_cache.json';saved=json.loads(f.read_text());saved['generated_at']='2026-01-01T00:00:00Z';f.write_text(json.dumps(saved))
    with urllib.request.urlopen(base+'/api/news-proxy.php') as r:assert json.load(r)['stale'] is True
print('PASS: authentication, timestamp, idempotency, conflict, ordering, path validation, live cache, archive search, article canonical')
