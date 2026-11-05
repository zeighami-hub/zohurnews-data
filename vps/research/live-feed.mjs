import{agencyNames}from './legacy-adapter.mjs';import{normalize}from './analytics.mjs';
const date=new Intl.DateTimeFormat('fa-IR',{timeZone:'Asia/Tehran',dateStyle:'short',timeStyle:'short'});
const fields=a=>({id:a.id,agencyId:a.source_id,title:a.title_original,title_fa:a.title_fa,lead:(a.lead||a.text_original||'').slice(0,800),sourceUrl:a.url,time:a.published_at?date.format(new Date(a.published_at)):'زمان انتشار نامشخص',category:a.category,region:a.region});
export function createLiveFeed(db,{now=Date.now,cacheMs=15000}={}){
 const cache=new Map();
 return function live(p={}){
  const source=p.source||'';if(source&&!Object.hasOwn(agencyNames,source))return{error:'Invalid source',http_status:400};
  const requested=Date.parse(p.as_of||'');const at=Number.isFinite(requested)?Math.min(requested,now()):now();if(at<now()-2*86400000)return{error:'Refresh the live window',http_status:400};
  const q=normalize(String(p.q||'').slice(0,120)),trend=normalize(String(p.trend||'').slice(0,100)),category=String(p.category||'').slice(0,80),region=String(p.region||'').slice(0,80);
  const limit=source?Math.max(1,Math.min(25,Number(p.limit)||20)):5;
  let cursor=null;if(p.cursor){try{cursor=JSON.parse(Buffer.from(String(p.cursor).slice(0,400),'base64url').toString());if(!Number.isFinite(Date.parse(cursor.time))||!/^\w{24}$/.test(cursor.id))throw Error();}catch{return{error:'Invalid cursor',http_status:400};}}
  const key=JSON.stringify([source,p.as_of||'',q,trend,category,region,limit,p.cursor||'']);const cached=cache.get(key);if(cached&&now()-cached.at<cacheMs)return cached.value;
  const as_of=new Date(at).toISOString(),from=new Date(at-86400000).toISOString();
  const where=["effective_at>=? AND effective_at<=?","(lang='fa' OR json_extract(payload,'$.translation_status')='available')"],args=[from,as_of];
  if(category&&category!=='all'){where.push('category=?');args.push(category);}if(region&&region!=='all'){where.push("json_extract(payload,'$.region')=?");args.push(region);}
  for(const text of [q,trend])if(text){where.push('instr(search_text,?)>0');args.push(text);}
  const base=' WHERE '+where.join(' AND ');const ids=source?[source]:Object.keys(agencyNames);
  const counts=new Map(db.prepare('SELECT source_id,count(*) count FROM r_articles'+base+(source?' AND source_id=?':'')+' GROUP BY source_id').all(...args,...(source?[source]:[])).map(r=>[r.source_id,r.count]));
  const articles=[],sources=[];
  for(const id of ids){const ca=cursor?[cursor.time,cursor.time,cursor.id]:[];const rows=db.prepare('SELECT id,effective_at,payload FROM r_articles'+base+' AND source_id=?'+(cursor?' AND (effective_at<? OR (effective_at=? AND id<?))':'')+' ORDER BY effective_at DESC,id DESC LIMIT ?').all(...args,id,...ca,limit+1);const more=rows.length>limit;const page=rows.slice(0,limit),last=page.at(-1);for(const row of page)articles.push(fields(JSON.parse(row.payload)));sources.push({id,name_fa:agencyNames[id],name_en:id,total:counts.get(id)||0,next_cursor:more?Buffer.from(JSON.stringify({time:last.effective_at,id:last.id})).toString('base64url'):null});}
  const capture=db.prepare("SELECT value FROM r_meta WHERE key='last_capture'").get();let generated_at=null;try{generated_at=JSON.parse(capture?.value||'null')?.at||null;}catch{}
  const pending=db.prepare("SELECT count(*) n FROM r_articles WHERE source_id IN ("+Object.keys(agencyNames).map(()=>'?').join(',')+") AND effective_at>=? AND effective_at<=? AND lang!='fa' AND COALESCE(json_extract(payload,'$.translation_status'),'pending')!='available'").get(...Object.keys(agencyNames),from,as_of).n;
  const value={articles,sources,agencies:sources,as_of,generated_at,total:sources.reduce((s,a)=>s+a.total,0),returned:articles.length,translation_pending:pending,partial:true,scope:'24h published corpus; previews and cursor pages; filters cover the full live window'};
  if(cache.size>=48)cache.delete(cache.keys().next().value);cache.set(key,{at:now(),value});return value;
 };
}

