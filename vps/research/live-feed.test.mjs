import test from'node:test';import assert from'node:assert/strict';import{ResearchDB}from'./database.cjs';import{normalize}from'./analytics.mjs';import{createLiveFeed}from'./live-feed.mjs';
test('Live previews and cursors include new sources, preserve translation gate and retain retired source archive',()=>{
 const db=new ResearchDB(':memory:');const now=Date.now(),at=new Date(now-3600000).toISOString();try{
 const rows=Array.from({length:14},(_,i)=>({agencyId:'irna',sourceUrl:'https://irna.test/'+i,title:'خبر فوتبال '+i,lang:'fa',pubDate:at}));
 for(const [id,lang,title_fa]of [['fars','fa',null],['ap','en','تیتر ترجمه'],['tass','en','تیتر ترجمه'],['mehrnews','en','مهر آرشیوی']])rows.push({agencyId:id,sourceUrl:'https://'+id+'.test/1',title:'News item',title_fa,lang,pubDate:at});rows.push({agencyId:'ap',sourceUrl:'https://ap.test/pending',title:'Pending headline',lang:'en',pubDate:at});db.import(rows,at,normalize);
 const live=createLiveFeed(db.db,{now:()=>now});const first=live({});assert.equal(first.sources.length,21);assert.ok(!first.sources.some(s=>s.id==='mehrnews'));assert.equal(first.articles.filter(a=>a.agencyId==='irna').length,5);assert.equal(first.sources.find(s=>s.id==='irna').total,14);assert.equal(first.translation_pending,1);assert.equal(first.articles.filter(a=>a.agencyId==='ap').length,1);
 const next=live({source:'irna',cursor:first.sources.find(s=>s.id==='irna').next_cursor,as_of:first.as_of});assert.equal(next.returned,9);assert.ok(!next.articles.some(a=>first.articles.some(b=>a.id===b.id)));assert.equal(live({source:'oops'}).http_status,400);assert.equal(live({cursor:'broken'}).http_status,400);assert.equal(db.query({source:'mehrnews'}).total,1);
 }finally{db.close();}
});
