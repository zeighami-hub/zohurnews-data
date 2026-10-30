export const METHOD_VERSION='zohur-research-1.0';
const stop=new Set('از به با در بر برای که و یا را این آن یک است بود شد شود می ما شما آنها او تا اما اگر نه نیز خود مورد شده کرد کند شود شدن درباره خبر اخبار گفت اعلام گزارش the a an and or of in on to for from is are was were with by at as that this it be has have said says iran ایران'.split(' '));
export function normalize(text='') { return String(text).normalize('NFKC').toLowerCase().replace(/[يى]/g,'ی').replace(/ك/g,'ک').replace(/[\u064b-\u065f\u0670\u0640]/g,'').replace(/[۰-۹]/g,x=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(x))).replace(/[٠-٩]/g,x=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(x))).replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' '); }
export function tokens(text) { return normalize(text).split(' ').filter(x=>x.length>1&&!stop.has(x)); }
export function topTerms(articles,field='title_original',limit=20) {
 const counts=new Map();for(const a of articles)for(const word of tokens(a[field]||''))counts.set(word,(counts.get(word)||0)+1);
 return [...counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,limit).map(([word,count])=>({word,count}));
}
export function related(base,articles,limit=20) {
 const corpus=[base,...articles.filter(a=>a.id!==base.id)];const bags=corpus.map(a=>tokens(a.title_fa||a.title_original));
 const df=new Map();for(const bag of bags)for(const t of new Set(bag))df.set(t,(df.get(t)||0)+1);
 const vector=bag=>{const m=new Map();for(const t of bag)m.set(t,(m.get(t)||0)+1);for(const [t,c]of m)m.set(t,(c/(bag.length||1))*(Math.log((1+bags.length)/(1+df.get(t)))+1));return m;};
 const vectors=bags.map(vector),norm=v=>Math.sqrt([...v.values()].reduce((s,x)=>s+x*x,0));const q=vectors[0],qn=norm(q);
 return corpus.slice(1).map((a,i)=>{let dot=0,shared=[];for(const [t,w]of vectors[i+1])if(q.has(t)){dot+=w*q.get(t);shared.push(t);}return {...a,similarity:qn&&norm(vectors[i+1])?dot/(qn*norm(vectors[i+1])):0,shared_terms:shared};}).filter(a=>a.similarity>=.24&&a.shared_terms.length>=2).sort((a,b)=>b.similarity-a.similarity).slice(0,limit);
}
export function techniques(article) {
 const title=article.title_original||'',body=article.text_original||'';const list=[];
 if(/[?؟]/.test(title))list.push({id:'question-headline',name:'تیتر پرسشی',evidence:title,method:'وجود علامت پرسش در تیتر اصلی',certainty:'rule'});
 if(/[0-9۰-۹٠-٩]/.test(title))list.push({id:'numeric-headline',name:'عدد در تیتر',evidence:title,method:'وجود رقم در تیتر اصلی',certainty:'rule'});
 const quotes=[...body.matchAll(/«([^»]{3,600})»|“([^”]{3,600})”|"([^"\n]{3,600})"/g)].map(m=>m[0]);
 if(quotes.length)list.push({id:'direct-quotation',name:'نقل‌قول نشانه‌گذاری‌شده',evidence:quotes[0],count:quotes.length,method:'جفت علامت نقل‌قول در متن اصلیِ موجود؛ شناسایی خودکار گوینده انجام نمی‌شود',certainty:'rule'});
 const attribution=body.match(/.{0,50}(?:به گفته|به نقل از|اعلام کرد|گفت|according to|\bsaid\b).{0,100}/i);
 if(attribution)list.push({id:'attribution-marker',name:'نشانهٔ انتساب خبری',evidence:attribution[0],method:'تطبیق عبارت‌های مشخص انتساب؛ به‌معنای اعتبارسنجی منبع نیست',certainty:'rule'});
 return list;
}
export function compare(a,b) {
 const left=new Set(tokens(a.title_original+' '+a.text_original)),right=new Set(tokens(b.title_original+' '+b.text_original));
 return {same_language:a.lang===b.lang,shared:[...left].filter(x=>right.has(x)),only_left:[...left].filter(x=>!right.has(x)),only_right:[...right].filter(x=>!left.has(x)),method:METHOD_VERSION};
}
export function earliest(articles) { return articles.filter(a=>a.published_at).sort((a,b)=>Date.parse(a.published_at)-Date.parse(b.published_at))[0]||null; }
export function csv(rows,columns) {
 const safe=v=>{let s=String(v??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
 return '\uFEFF'+[columns.map(safe).join(','),...rows.map(r=>columns.map(k=>safe(r[k])).join(','))].join('\r\n');
}
