const test=require('node:test');const assert=require('node:assert/strict');const http=require('node:http');const zlib=require('node:zlib');
const {fetchUrl}=require('../worker/news-core.cjs');
test('compressed RSS and relative redirects are decoded; oversized feed is rejected',async t=>{
 const xml='<rss><channel><title>Feed</title></channel></rss>';
 const server=http.createServer((req,res)=>{
  if(req.url==='/redirect'){res.writeHead(302,{location:'/rss'});return res.end();}
  if(req.url==='/large')return res.end('x'.repeat(2097153));
  res.setHeader('Content-Encoding','gzip');res.end(zlib.gzipSync(xml));
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close());
 const base='http://127.0.0.1:'+server.address().port;
 assert.equal(await fetchUrl(base+'/redirect'),xml);
 await assert.rejects(fetchUrl(base+'/large'),/too large/);
});
