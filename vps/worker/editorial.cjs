'use strict';
const{classify,norm}=require('./classification.cjs');
const VERSION='editorial-1';
function editorial(a){
 const c=classify({title:a.title_original||a.title,description:a.text_original||a.description,source_categories:a.source_categories||[]});const text=norm((a.title_original||a.title||'')+' '+(a.text_original||a.description||''));let allowed=true,reason='general-news';
 if(c.category==='sports'||(c.category==='unknown'&&c.tags.includes('sports'))){
 const world=/المپیک|پارالمپیک|جام جهانی|قهرمانی جهان|مسابقات جهانی|olympic|paralympic|world cup|world championship/.test(text);
 const result=/قهرمان|مدال|سهمیه|صعود|شرکت|حضور|راه یافت|راهیابی|اعزام|برنده|پیروز|champion|medal|qualif|participat|compete|wins?\b|won\b/.test(text);
 allowed=world&&result;reason=allowed?'global-sport-milestone':'routine-sport';
 }else if(c.category==='culture'||(c.category==='unknown'&&c.tags.includes('culture'))){
 const award=/نوبل|اسکار|جشنواره کن|شیر طلایی|خرس طلایی|بوکر|پولیتزر|nobel|oscar|palme d or|golden lion|golden bear|booker|pulitzer/.test(text)&&/برنده|دریافت|کسب|اهدا|جایزه|awarded|wins?\b|won\b|prize/.test(text);
 const heritage=/میراث جهانی|ثبت جهانی|یونسکو|world heritage|unesco/.test(text)&&/ثبت|تخریب|آسیب|حفاظت|ثبت شد|inscri|destroy|damage|protect/.test(text);
 allowed=award||heritage;reason=allowed?'major-cultural-event':'routine-culture';
 }
 return{allowed,reason,method:VERSION,topic:c.category,evidence_scope:'Original feed headline, excerpt and publisher categories; no model request'};
}
function canonicalCategory(category){return ['sports','health','education','accidents'].includes(category)?'society':category==='tech'?'technology':category;}
module.exports={editorial,canonicalCategory,VERSION};
