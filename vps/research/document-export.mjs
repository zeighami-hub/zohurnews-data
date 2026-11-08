import{spawn}from'node:child_process';import{mediaComparison}from'./media-comparison.mjs';import{trail}from'./trail.mjs';import{techniques}from'./analytics.mjs';
let busy=false;
export function exportDataset(db,p={}){
 const format=p.format;if(!['pdf','xlsx'].includes(format))throw Object.assign(Error('Invalid export format'),{status:400});
 const kind=p.kind||'archive';if(!['archive','media','selected','dossier'].includes(kind))throw Object.assign(Error('Invalid export kind'),{status:400});
 const filters={...p,editorial:p.editorial||'accepted',offset:0};delete filters.ids;delete filters.format;delete filters.kind;delete filters.limit;delete filters.offset;
 const out={format,kind,generated_at:new Date().toISOString(),filters,articles:[],sources:[],days:[],evidence:[],coverage:[],history:[]};
 if(kind==='archive'){const r=db.query({...filters,limit:format==='pdf'?200:5000});Object.assign(out,{articles:r.articles,total:r.total,returned:r.articles.length,truncated:r.total>r.articles.length,categories:r.summary.categories,sources:r.summary.sources.map(s=>({...s,share_percent:r.total?s.count/r.total*100:0})),days:r.summary.days.map(d=>({...d,source_id:'all_sources'}))});}
 else if(kind==='media'){const r=mediaComparison(db,filters);Object.assign(out,{sources:r.sources,days:r.days,total:r.total,returned:r.sources.length,truncated:false});}
 else{const ids=[...new Set(String(p.ids||'').split(',').filter(Boolean))];if(!ids.length||ids.length>(kind==='dossier'?1:4)||ids.some(id=>!/^[a-f0-9]{24}$/.test(id)))throw Object.assign(Error('Select one to four valid articles'),{status:400});
 out.filters={selection_ids:ids,note:'Explicit selected articles; archive filters do not restrict this selection'};out.articles=ids.map(id=>db.article(id));if(out.articles.some(a=>!a))throw Object.assign(Error('Article not found'),{status:404});out.total=out.returned=out.articles.length;out.truncated=false;
 for(const a of out.articles)for(const t of techniques(a))out.evidence.push({article_id:a.id,source_id:a.source_id,...t});
 if(kind==='dossier'){const t=trail(db,out.articles[0]);out.coverage=t.coverage;out.history=t.history;out.earliest_candidate=t.earliest_candidate;out.versions=db.db.prepare('SELECT recorded_at,content_hash FROM r_versions WHERE article_id=? ORDER BY recorded_at').all(ids[0]);}}
 return out;
}
export async function documentExport(db,p,res){
 if(busy){res.writeHead(429,{'Content-Type':'application/json; charset=utf-8','Retry-After':'5'});res.end(JSON.stringify({error:'ساخت خروجی دیگری در جریان است؛ چند ثانیه بعد تلاش کنید.'}));return;}
 busy=true;try{const data=exportDataset(db,p);
 const bytes=await new Promise((resolve,reject)=>{const child=spawn('python3',[new URL('./render-export.py',import.meta.url).pathname],{stdio:['pipe','pipe','pipe']});const chunks=[];let size=0,err='',finished=false;
 const timer=setTimeout(()=>{child.kill('SIGKILL');},25000);const done=(error,value)=>{if(finished)return;finished=true;clearTimeout(timer);error?reject(error):resolve(value);};child.on('error',e=>done(e));child.stdout.on('data',c=>{size+=c.length;if(size>32*1024*1024){child.kill('SIGKILL');done(Error('Export size exceeded'));}else chunks.push(c);});child.stderr.on('data',c=>{err=(err+c.toString()).slice(-2000);});child.on('close',code=>code===0?done(null,Buffer.concat(chunks)):done(Error('Document rendering failed')));child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify(data));});
 res.writeHead(200,{'Content-Type':p.format==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':'attachment; filename="zohurnews-'+data.kind+'-'+new Date().toISOString().slice(0,10)+'.'+p.format+'"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Export-Total':String(data.total),'X-Export-Returned':String(data.returned),'X-Export-Truncated':String(data.truncated),'Content-Length':bytes.length});res.end(bytes);
 }catch(e){res.writeHead(e.status||500,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error:e.status?e.message:'ساخت خروجی ممکن نشد؛ بازه را کوچک‌تر کنید و دوباره تلاش کنید.'}));}finally{busy=false;}
}
