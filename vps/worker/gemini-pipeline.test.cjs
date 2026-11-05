'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'zohur-quota-cycle-'));process.env.DATA_DIR=folder;process.env.PUBLISH_MODE='local';process.env.GEMINI_API_KEY='isolated-test-key';process.env.GEMINI_MODEL='test-model';
const {Store}=require('./store.cjs');const {KEY,dayKey}=require('./gemini-budget.cjs');const {cycle}=require('./run.cjs');
const native={id:'native',agencyId:'irna',sourceUrl:'https://example.test/fa',title:'خبر فارسی واقعی',description:'خلاصهٔ فارسی',lang:'fa',pubDate:new Date().toISOString()};
const foreign={id:'foreign',agencyId:'bbc',sourceUrl:'https://example.test/en',title:'Original news',description:'Original excerpt',lang:'en',pubDate:new Date().toISOString()};
function seed(used){const s=new Store(path.join(folder,'news.sqlite'));s.set(KEY,JSON.stringify({day:dayKey(Date.now()),used}));s.close();}
function deps(output){return {readRSS:async()=>({articles:[native,foreign],agencies:[]}),deliver:async store=>{const item=store.pending();if(item){output.push(JSON.parse(item.body));store.acknowledge(item.sequence);}}};}
test('exhausted daily allowance publishes Persian news without any network request',async()=>{
 const original=global.fetch;let calls=0;global.fetch=async()=>{calls++;throw Error('Unexpected network');};seed(400);const output=[];
 try{await cycle(deps(output));assert.equal(calls,0);assert.equal(output.at(-1).archive[0].title_fa,native.title);assert.equal(output.at(-1).cache.translation.paused.reason,'daily-budget');}
 finally{global.fetch=original;}
});
test('provider 429 makes exactly one call, persists pause and keeps originals',async()=>{
 await new Promise(resolve=>setTimeout(resolve,5));
 const original=global.fetch;let calls=0;global.fetch=async()=>{calls++;return{status:429,headers:new Headers(),json:async()=>({error:{code:429,status:'RESOURCE_EXHAUSTED',message:'Free tier requests per day limit exceeded',details:[{retryDelay:'60s'}]}})};};seed(0);const output=[];
 try{await cycle(deps(output));assert.equal(calls,1);const latest=output.at(-1);assert.equal(latest.cache.translation.paused.reason,'provider-quota');assert.equal(latest.cache.translation.used,400);assert.equal(latest.cache.translation.added,0);assert.equal(latest.cache.articles.find(a=>a.id==='native').title,native.title);}
 finally{global.fetch=original;fs.rmSync(folder,{recursive:true,force:true});}
});
