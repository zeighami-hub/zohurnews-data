const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
// Set DATA_DIR before loading the worker; these tests never call a real RSS/AI/host service.
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'zohur-cycle-'));
process.env.DATA_DIR=dir;process.env.GEMINI_API_KEY='test-key';process.env.GEMINI_MODEL='test-model';process.env.PUBLISH_URL='https://example.com/publish';process.env.PUBLISH_SECRET='z'.repeat(64);
const {cycle}=require('../worker/run.cjs');const {Store}=require('../worker/store.cjs');
const a={id:'bbc_cycle',agencyId:'bbc',sourceUrl:'https://example.com/news',pubDate:new Date().toISOString(),title:'Test',iranScore:1};
let analyzed=0;
const readRSS=async()=>({agencies:[],articles:[a]});
const analyze=async()=>{analyzed++;return{kept:[{...a,title_fa:'خبر',lead:'متن خبر'}],rejected:[]};};
const deliver=async store=>{const p=store.pending();if(p)store.acknowledge(p.sequence);};
test('full cycle survives publication outage and retries without reanalyzing or duplicating',async()=>{
 await assert.rejects(cycle({readRSS,analyze,deliver:async s=>{if(s.pending())throw new Error('Host offline');}}));
 let s=new Store(path.join(dir,'news.sqlite'));assert.equal(s.articles().length,1);assert.ok(s.pending());s.close();
 await cycle({readRSS,analyze,deliver});s=new Store(path.join(dir,'news.sqlite'));assert.equal(s.articles().length,1);assert.equal(s.pending(),undefined);assert.ok(s.get('last_success'));s.close();
 assert.equal(analyzed,1);
 fs.rmSync(dir,{recursive:true,force:true});
});
