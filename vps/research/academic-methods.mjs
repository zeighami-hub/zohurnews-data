import {createHash} from 'node:crypto';
export const METHOD='academic-1.0.0';
export const hash=x=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
export const norm=x=>String(x||'').normalize('NFKC').replace(/[يى]/g,'ی').replace(/ك/g,'ک').replace(/\u200c/g,' ').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export function alpha(units,level='nominal'){
 if(!['nominal','interval'].includes(level))return {alpha:null,reason:'unsupported_level'};
 const rows=units.map(r=>r.filter(x=>x!==null&&x!==undefined&&x!=='')).filter(r=>r.length>1);
 if(level==='interval'&&rows.some(r=>r.some(x=>typeof x!=='number'||!Number.isFinite(x))))return {alpha:null,reason:'non_numeric_interval'};
 const all=rows.flat(),N=all.length;
 if(rows.length<2)return {alpha:null,reason:'insufficient_pairable_units',units:rows.length,pairable_values:N};
 const delta=(a,b)=>level==='interval'?(a-b)**2:(a===b?0:1);
 let obs=0,agree=0,pairs=0;for(const row of rows)for(let i=0;i<row.length;i++)for(let j=0;j<row.length;j++)if(i!==j){obs+=delta(row[i],row[j])/(row.length-1);pairs++;if(row[i]===row[j])agree++;}
 const counts=new Map();for(const v of all)counts.set(v,(counts.get(v)||0)+1);
 let exp=0;if(level==='nominal')exp=N*N-[...counts.values()].reduce((s,n)=>s+n*n,0);else{const mean=all.reduce((s,v)=>s+v,0)/N;exp=2*N*all.reduce((s,v)=>s+(v-mean)**2,0);}
 const Do=obs/N,De=exp/(N*(N-1));
 return {alpha:De?1-Do/De:null,reason:De?null:'no_expected_variation',observed_disagreement:Do,expected_disagreement:De,agreement:pairs?agree/pairs:null,units:rows.length,pairable_values:N,level,method:METHOD};
}
export function sampleFrame(items,{method='census',size,seed='',stratum='source',ids=[],criteria=''}={}){
 const allowed=['census','random','stratified','systematic','purposive'];if(!allowed.includes(method))throw Error('روش نمونه‌گیری نامعتبر است.');
 const eligible=items.filter(x=>x.eligibility==='included').sort((a,b)=>a.id.localeCompare(b.id));
 const n=method==='census'?eligible.length:Number(size);if(!Number.isInteger(n)||n<1||n>eligible.length)throw Error('حجم نمونه باید بین یک و تعداد واجد شرایط باشد.');
 if(['random','stratified','systematic'].includes(method)&&!seed.trim())throw Error('بذر تصادفی لازم است.');
 const shuffled=list=>[...list].sort((a,b)=>hash(seed+'|'+a.id).localeCompare(hash(seed+'|'+b.id))||a.id.localeCompare(b.id));
 let selected=[],allocation=[];
 if(method==='census')selected=eligible;
 if(method==='random')selected=shuffled(eligible).slice(0,n);
 if(method==='systematic'){const step=eligible.length/n,start=parseInt(hash(seed).slice(0,12),16)/0x1000000000000*step;selected=Array.from({length:n},(_,i)=>eligible[Math.floor(start+i*step)]);}
 if(method==='purposive'){if(!criteria.trim())throw Error('معیار نمونه‌گیری هدفمند را ثبت کنید.');const set=new Set(ids);selected=eligible.filter(x=>set.has(x.id));if(selected.length!==n)throw Error('شناسه‌ها و حجم نمونه هدفمند سازگار نیستند.');}
 if(method==='stratified'){
  if(!['source','day'].includes(stratum))throw Error('طبقه باید رسانه یا روز باشد.');
  const groups=new Map();for(const x of eligible){const a=x.snapshot,key=stratum==='source'?a.source_id:(a.published_at||a.effective_at||'missing').slice(0,10);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(x);}
  allocation=[...groups].map(([key,list])=>({key,population:list.length,n:Math.floor(n*list.length/eligible.length),remainder:n*list.length/eligible.length%1})).sort((a,b)=>b.remainder-a.remainder||a.key.localeCompare(b.key));
  let left=n-allocation.reduce((s,a)=>s+a.n,0);for(const a of allocation)if(left-->0)a.n++;
  for(const a of allocation)selected.push(...shuffled(groups.get(a.key)).slice(0,a.n));
 }
 return {method,size:n,seed,stratum,criteria,algorithm:'sha256-rank-v1; systematic uses stable ID order; proportional largest remainder strata',eligible:eligible.length,excluded:items.filter(x=>x.eligibility==='excluded').map(x=>({id:x.id,reason:x.reason})),allocation,frame:eligible.map(x=>({id:x.id,hash:x.content_hash})),selected:selected.map(x=>x.id)};
}
export function lexical(items,{target='',companions='',window=8}={}){
 const term=norm(target).split(' ').filter(Boolean);const peers=companions.split(/[،,\n]/).map(norm).filter(Boolean);window=Math.max(1,Math.min(50,Number(window)||8));
 const rows=[];for(const item of items){const a=item.snapshot;let frequency=0,cooccurrences=0;const evidence=[];
  for(const field of ['title_original','lead','text_original']){const text=a[field]||'',words=norm(text).split(' ');if(!term.length)continue;for(let i=0;i<=words.length-term.length;i++)if(term.every((t,j)=>words[i+j]===t)){frequency++;const context=words.slice(Math.max(0,i-window),i+term.length+window).join(' ');const found=peers.filter(p=>(' '+context+' ').includes(' '+p+' '));cooccurrences+=found.length;evidence.push({field,context,companions:found});}}
  rows.push({id:item.id,source_id:a.source_id,day:(a.published_at||a.effective_at||'').slice(0,10),frequency,cooccurrences,evidence});
 }return {method:'normalized token/phrase counts, fixed token window; fields counted separately; translated lead explicitly marked',target,companions:peers,window,rows,warning:'هم‌وقوعی واژگان اثبات شرطی‌سازی یا اقناع نیست. تیتر و متن ممکن است هم‌پوشانی داشته باشند؛ لید ممکن است ترجمه باشد.'};
}
const v=(id,label,axis,type='text',values=[])=>({id,label,axis,type,level:type==='number'?'interval':'nominal',conceptual:label,operational:'پژوهشگر باید تعریف عملیاتی، دامنه و قاعده تصمیم را پیش از تأیید تکمیل کند.',values,instructions:'به عبارت دقیق متن و محل آن ارجاع دهید؛ داده ناموجود را خالی بگذارید.',example:'مثال باید توسط پژوهشگر تأیید شود.',required:false});
export function initialCodebook(){return {title:'پیش‌نویس: تکرار، هم‌نشینی ارزشی و چارچوب‌بندی',notes:'شاخص‌های پیشنهادی؛ نیازمند بازبینی و تأیید انسانی. تحلیل محتوا به‌تنهایی اثر شناختی بر مخاطب را اثبات نمی‌کند.',variables:[
 v('rep_keywords','تکرار واژگان کلیدی','تکرار','number'),v('rep_claims','گزاره‌های تکرارشده','تکرار'),v('rep_frames','چارچوب‌های روایی تکرارشده','تکرار'),v('rep_period','بسامد در بازه تعریف‌شده','تکرار','number'),v('republication','نوع رابطه با روایت دیگر','تکرار','categorical',[{value:1,label:'همان رکورد'},{value:2,label:'بازنشر مستقیم'},{value:3,label:'بازنویسی'},{value:4,label:'روایت مستقل'},{value:5,label:'نامطمئن'}]),v('rep_gap','فاصله زمانی تکرارها (دقیقه)','تکرار','number'),v('rep_scope','درون یا میان رسانه‌ها','تکرار','categorical',[{value:1,label:'درون رسانه'},{value:2,label:'میان رسانه‌ها'},{value:3,label:'هر دو'}]),
 v('target','مفهوم هدف','هم‌نشینی'),v('companions','واژگان و توصیف‌های همراه','هم‌نشینی'),v('valence','بار ارزشی','هم‌نشینی','categorical',[{value:1,label:'مثبت'},{value:2,label:'منفی'},{value:3,label:'خنثی'},{value:4,label:'مختلط'}]),v('intensity','شدت ارزیابی با معیار عملیاتی','هم‌نشینی','number'),v('cofrequency','بسامد هم‌وقوعی','هم‌نشینی','number'),v('position','محل حضور','هم‌نشینی','categorical',[{value:1,label:'تیتر'},{value:2,label:'لید'},{value:3,label:'متن'},{value:4,label:'چند بخش'}]),v('quotation','نقل‌قول مستقیم','هم‌نشینی','categorical',[{value:0,label:'ندارد'},{value:1,label:'دارد'}]),
 v('problem','تعریف مسئله','چارچوب‌بندی'),v('causes','علل مطرح‌شده','چارچوب‌بندی'),v('responsibility','نسبت‌دادن مسئولیت','چارچوب‌بندی'),v('moral','ارزیابی اخلاقی','چارچوب‌بندی'),v('solution','راهکار ارائه‌شده','چارچوب‌بندی'),v('salience','عناصر برجسته‌شده','چارچوب‌بندی'),v('omission','عناصر غایب نسبت به روایت‌های در دسترس','چارچوب‌بندی'),v('sources','منابع مورد استناد','چارچوب‌بندی'),v('dominant_frame','چارچوب غالب','چارچوب‌بندی')
 ]};}
