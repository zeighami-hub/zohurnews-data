export const agencyNames={irna:'ایرنا',isna:'ایسنا',khabaronline:'خبرآنلاین',mashregh:'مشرق',yjc:'باشگاه خبرنگاران',asriran:'عصر ایران',mehrnews:'مهر انگلیسی',guardian:'گاردین',bbc:'بی‌بی‌سی',reuters:'رویترز',aljazeera:'الجزیره',france24:'فرانس ۲۴',dw:'دویچه‌وله',nytimes:'نیویورک تایمز',skynews:'اسکای‌نیوز',independent:'ایندیپندنت',rt:'آرتی',economist:'اکونومیست',foreignpolicy:'فارن پالیسی'};
export function legacyArticle(a){return {id:a.id,title:a.title_original,title_fa:a.title_fa,lead:a.lead||a.text_original||'',sourceUrl:a.url,agencyId:a.source_id,agency: {id:a.source_id,name_fa:agencyNames[a.source_id]||a.source_id,name_en:a.source_id},time:a.published_at?new Date(a.published_at).toLocaleString('fa-IR',{timeZone:'Asia/Tehran'}):'زمان انتشار نامشخص',pubDate:a.published_at,category:a.category,region:a.region,newsValues:{},sentiment:null,date:(a.effective_at||'').slice(0,10),content_scope:a.content_scope};}
export function legacyLive(db){const r=db.query({from:new Date(Date.now()-86400000).toISOString(),limit:5000});return {articles:r.articles.map(legacyArticle),agencies:r.summary.sources.map(s=>({id:s.id,name_fa:agencyNames[s.id]||s.id,name_en:s.id})),generated_at:r.meta.last_capture?.at||null,total:r.total,translation_pending:r.articles.filter(a=>a.lang!=='fa'&&a.translation_status!=='available').length};}
export function legacyArchive(db,p){
 let from=p.dateFrom?String(p.dateFrom)+'T00:00:00.000Z':undefined,to=p.dateTo?String(p.dateTo)+'T23:59:59.999Z':undefined;
 if(p.action==='day'&&/^\d{4}-\d{2}-\d{2}$/.test(p.date||'')){from=p.date+'T00:00:00.000Z';to=p.date+'T23:59:59.999Z';}
 if(Number(p.minIranScore)>0)return {results:[],articles:[],total:0,unsupported_filters:['minIranScore'],message:'Legacy score unavailable; use the research panel'};
 const f=db.filters({q:p.q,source:p.agencyId,category:p.category==='all'?'':p.category,from,to});
 if(p.region&&p.region!=='all'){f.sql+=(f.sql?' AND ':' WHERE ')+"json_extract(payload,'$.region')=?";f.args.push(p.region);}
 const limit=p.action==='day'?5000:Math.max(1,Math.min(2000,Number(p.limit)||200));
 const total=db.db.prepare('SELECT count(*) n FROM r_articles'+f.sql).get(...f.args).n;
 const articles=db.db.prepare('SELECT payload FROM r_articles'+f.sql+' ORDER BY effective_at DESC,id LIMIT ?').all(...f.args,limit).map(r=>legacyArticle(JSON.parse(r.payload)));
 return {results:articles,articles,total,truncated:articles.length<total,date_basis:'UTC archive day'};
}
