import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {ResearchDB} from './database.cjs';import {normalize} from './analytics.mjs';import {mediaComparison} from './media-comparison.mjs';import {legacyLive}from './legacy-adapter.mjs';
import {createRequire}from 'node:module';const require=createRequire(import.meta.url);const {selectForeign,prepareNative}=require('../worker/selection.cjs');
test('full filtered counts, zero-source distinction, date provenance and publication gate',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'zohur-media-'));const db=new ResearchDB(path.join(dir,'test.sqlite'));const now=Date.now();
 try{
  const at=new Date(now-3600000).toISOString();
  db.import([
   {sourceUrl:'https://a.test/1',agencyId:'a',title:'Iran report one',description:'Original excerpt',lang:'en',pubDate:at},
   {sourceUrl:'https://a.test/2',agencyId:'a',title:'Iran report two',title_fa:'گزارش ایران',lang:'en',pubDate:new Date(now-1800000).toISOString()},
   {sourceUrl:'https://b.test/1',agencyId:'b',title:'گزارش ایران',description:'متن اصلی',lang:'fa',first_seen_at:at},
   {sourceUrl:'https://c.test/1',agencyId:'c',title:'Unrelated topic',lang:'en',pubDate:at}
  ],at,normalize);
  const p={sources:'a,b,zero',q:'گزارش',limit:1};
  const r=mediaComparison(db,p);assert.equal(r.total,2);assert.equal(r.sources.find(s=>s.id==='zero').count,0);assert.equal(r.sources.find(s=>s.id==='b').first_article,null);
  assert.equal(r.sources.reduce((n,s)=>n+s.count,0),r.total);assert.equal(db.query({...p,limit:1}).articles.length,1);assert.equal(db.query({...p,limit:1}).total,2);
  assert.equal(mediaComparison(db,{...p,date_basis:'published'}).total,1);
  const drilled=mediaComparison(db,{sources:'a,b',source:'b'});assert.equal(drilled.sources.find(s=>s.id==='a').first_article,null);
  assert.equal(mediaComparison(db,{sources:"a') OR 1=1--"}).total,0);
  const live=legacyLive(db);assert.equal(live.translation_pending,2);assert.equal(live.articles.length,2);assert.ok(live.articles.every(a=>a.agencyId==='b'||a.title_fa==='گزارش ایران'));
  const unchanged=legacyLive(db);assert.equal(unchanged.total,live.total);assert.equal(db.meta().total,4);
 }finally{db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('foreign allocation includes minority sources; native text does not call a model',()=>{
 const items=Array.from({length:100},(_,i)=>({agencyId:'a',id:i,iranScore:i,pubDate:'2026-10-31T00:00:00Z'}));items.push({agencyId:'b',id:'b',iranScore:0});
 assert.ok(selectForeign(items,3).some(a=>a.id==='b'));
 const a=prepareNative({title:'تیتر واقعی',description:'خلاصهٔ اصلی',lang:'fa'});assert.equal(a.title_fa,'تیتر واقعی');assert.equal(a.lead,'خلاصهٔ اصلی');assert.equal(a.analysis_model,null);
});
