const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Store } = require('../worker/store.cjs');
const { publish, buildPublication } = require('../worker/run.cjs');
function fixture(t) { const dir=fs.mkdtempSync(path.join(os.tmpdir(),'zohur-'));const s=new Store(path.join(dir,'news.sqlite'));t.after(()=>{s.close();fs.rmSync(dir,{recursive:true,force:true});});return s; }
function article(id, time=Date.now()){return {id,agencyId:'bbc',sourceUrl:'https://example.com/'+id,title_fa:'خبر',lead:'متن خبر',analyzed_at:new Date(time).toISOString()};}
test('duplicate URLs are never reinserted; expired stories remain in durable archive',t=>{
 const s=fixture(t), old=article('old',Date.now()-2*86400000);s.add([old],[]);s.add([{...old,id:'different'}],[]);
 assert.equal(s.articles().length,1);assert.equal(s.articles(Date.now()-86400000).length,0);assert.equal(s.has(old),true);
});
test('a failed batch transaction rolls back all records',t=>{
 const s=fixture(t); assert.throws(()=>s.add([article('ok'),{id:'bad'}],[])); assert.equal(s.articles().length,0);
});
test('rejected articles become eligible after the retention window',t=>{
 const s=fixture(t);s.add([],[{sourceUrl:'https://example.com/no'}],1000);
 assert.equal(s.isRejected('https://example.com/no',2000),true);assert.equal(s.isRejected('https://example.com/no',86402000),false);
});
test('snapshot excludes old news from live feed but includes it in initial archive migration',t=>{
 const s=fixture(t);s.add([article('old',1000),article('new')],[]);const p=buildPublication(s,Date.now(),[],1);
 assert.equal(p.cache.total,1);assert.equal(p.archive.length,2);
});
test('failure or false acknowledgement retains outbox; signed replay clears it once',async t=>{
 const s=fixture(t); process.env.PUBLISH_SECRET='x'.repeat(64);process.env.PUBLISH_URL='https://example.com/receiver';
 const payload={schema:2,sequence:123};s.enqueue(123,payload);
 await assert.rejects(publish(s,async()=>({ok:false,status:503})));assert.equal(s.pending().sequence,123);
 await assert.rejects(publish(s,async()=>({ok:true,json:async()=>({sequence:123,sha256:'wrong'})})));assert.equal(s.pending().sequence,123);
 const crypto=require('node:crypto');
 await publish(s,async(url,opt)=>{
  assert.equal(opt.redirect,'error');assert.equal(opt.headers['X-Zohur-Signature'],crypto.createHmac('sha256',process.env.PUBLISH_SECRET).update(opt.headers['X-Zohur-Timestamp']+'.'+opt.body).digest('hex'));
  return {ok:true,json:async()=>({sequence:123,sha256:crypto.createHash('sha256').update(opt.body).digest('hex')})};
 });
 assert.equal(s.pending(),undefined);assert.equal(s.get('published_sequence'),'123');
});
test('archive publication cursor does not omit articles committed between cycles',t=>{
 const s=fixture(t);s.set('published_sequence',1000);s.add([article('past',999),article('future',1001)],[],1001);
 const p=buildPublication(s,2000,[],1);assert.deepEqual(p.archive.map(a=>a.id),['future']);
});
