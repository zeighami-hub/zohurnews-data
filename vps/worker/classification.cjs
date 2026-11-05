'use strict';
// Versioned, reproducible topic coding. Scores are rule weights, never probabilities.
const VERSION='rules-fa-en-2.1';
const norm=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[يى]/g,'ی').replace(/ك/g,'ک').replace(/[\u064b-\u065f\u0670\u0640]/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim();
const definitions=[
 ['sports','ورزش','ورزش|ورزشی|فوتبال|والیبال|بسکتبال|تکواندو|کشتی گیر|لیگ قهرمانان|پرسپولیس|گلزنی|المپیک|مربی|قهرمانی|ورزشکار|تیم استقلال|پیشکسوت فوتبال|sports|sport|football|soccer|basketball|volleyball|olympics|champions league'],
 ['health','سلامت','سلامت|بهداشت|پزشکی|بیمارستان|واکسن|بیماری|درمان|سرطان|پرستار|فرآورده های خونی|health|medical|hospital|vaccine|cancer|disease'],
 ['education','آموزش','آموزش|مدرسه|مدارس|دانش آموز|معلم|کنکور|دانشگاه|دانشجویان|education|school|schools|university|students|teachers'],
 ['accidents','حوادث','زلزله|تصادف|آتش سوزی|سیلاب|تلفات جاده|حوادث|earthquake|accident|wildfire|flood|crash'],
 ['diplomacy','دیپلماسی','دیپلماسی|دیپلماتیک|سفیر|وزیر خارجه|وزیر امور خارجه|مذاکره|مذاکرات|روابط دوجانبه|رایزنی|diplomacy|diplomatic|ambassador|foreign minister|foreign policy|negotiations|treaty|summit'],
 ['military','نظامی','نظامی|ارتش|سپاه|موشک|موشکی|پدافند|جنگنده|بمباران|حمله نظامی|رزمایش|جنگ|military|army|missile|troops|defense|weapons|airstrike|war|robotic systems'],
 ['economy','اقتصاد','اقتصاد|اقتصادی|بورس|بانک|تورم|ارز|دلار|یورو|قیمت|تجارت|صادرات|واردات|گمرک|بودجه|دستمزد|بیمه|economy|economic|economics|business|finance|inflation|currency|stock|shares|market|markets|bank|trade|exports|imports|unemployment|employment|jobs|gdp|tariffs'],
 ['technology','فناوری','فناوری|تکنولوژی|هوش مصنوعی|تراشه|سایبری|استارتاپ|اینترنت|نرم افزار|technology|tech|artificial intelligence|cyber|chip|startup|software'],
 ['environment','محیط زیست','محیط زیست|اقلیم|آلودگی هوا|خشکسالی|گرمایش زمین|هواشناسی|environment|climate|pollution|emissions|drought|weather'],
 ['culture','فرهنگ','فرهنگ|فرهنگی|سینما|تئاتر|موسیقی|جشنواره|هنری|فیلم|کتاب|نمایشگاه کتاب|میراث فرهنگی|culture|cultural|film|cinema|music|theater|festival|heritage|arts'],
 ['energy','انرژی','انرژی|نفت|گاز|برق|پتروشیمی|پالایشگاه|نیروگاه|energy|oil|gas|petroleum|electricity|refinery|nuclear power'],
 ['politics','سیاست','سیاست|سیاسی|انتخابات|مجلس|پارلمان|رئیس جمهور|دولت|رهبری|حزب|احزاب|حکمرانی|politics|political|election|parliament|president|government|congress|senate'],
 ['society','جامعه','جامعه|اجتماعی|شهرداری|شهروند|خانواده|ترافیک|جاده|راه روستایی|فاضلاب|آبرسانی|مسکن|پلیس|اعتصاب|society|social|housing|municipal|traffic|police|protests|strike']
];
const re=values=>new RegExp('(?:^| )('+values.split('|').map(norm).join('|')+')(?= |$)','u');
const rules=definitions.map(([id,label,words])=>({id,label,match:re(words)}));
const aliases=new Map(definitions.flatMap(([id,label,words])=>[[norm(id),id],[norm(label),id],...words.split('|').map(w=>[norm(w),id])]));
for(const [key,id]of Object.entries({ورزشی:'sports',فرهنگی:'culture',اقتصادی:'economy',سیاسی:'politics',اجتماعی:'society',علمی:'technology',بین_الملل:'',جهان:'',ایران:'',tech:'technology','foreign policy':'diplomacy','russian politics diplomacy':'diplomacy','business economy':'economy','military defense':'military','russia s defense industry':'military','science technology':'technology',حوادث:'accidents',سلامت:'health','آموزش و پرورش':'education'}))aliases.set(norm(key),id);
const regions=[['iran','ایران|تهران|ایرانی|iran|iranian|tehran'],['west_asia','غزه|فلسطین|اسرائیل|لبنان|سوریه|عراق|یمن|خلیج فارس|عمان|قطر|ترکیه|سعودی|gaza|palestine|israel|lebanon|syria|iraq|yemen|gulf|oman|qatar|turkey|saudi'],['eurasia','روسیه|مسکو|اوکراین|کی یف|russia|russian|moscow|ukraine|kyiv'],['europe','اروپا|فرانسه|آلمان|انگلیس|بریتانیا|پاریس|لندن|ناتو|europe|european|france|germany|britain|paris|london|nato'],['americas','آمریکا|امریکا|واشنگتن|کانادا|برزیل|america|american|washington|canada|brazil|united states|us'],['asia','آسیا|چین|پکن|هند|ژاپن|کره|پاکستان|افغانستان|asia|china|beijing|india|japan|korea|pakistan|afghanistan'],['africa','آفریقا|سودان|مصر|africa|sudan|egypt'],['oceania','استرالیا|نیوزیلند|australia|new zealand']].map(([id,words])=>({id,match:re(words)}));
function classify({title='',description='',source_categories=[]}={}){
 const head=norm(title),body=norm(description),hints=[...new Set((Array.isArray(source_categories)?source_categories:[]).map(x=>String(x).slice(0,100)))].slice(0,20),scores=new Map(),evidence=[];
 for(const rule of rules){const h=head.match(rule.match)?.[1],b=body.match(rule.match)?.[1];const titleHits=[...new Set([...head.matchAll(new RegExp(rule.match.source,'gu'))].map(m=>m[1]))];let score=Math.min(3,titleHits.length)*3+(b?1:0);const labels=hints.filter(x=>aliases.get(norm(x))===rule.id);if(labels.length)score+=6;if(score){scores.set(rule.id,score);evidence.push({category:rule.id,score,title_match:h||null,excerpt_match:b||null,publisher_labels:labels});}}
 const ranked=[...scores].sort((a,b)=>b[1]-a[1]);const tie=ranked.length>1&&ranked[0][1]===ranked[1][1];const category=!ranked.length||tie?'unknown':ranked[0][0];
 const locate=text=>regions.flatMap(r=>{const match=text.match(r.match)?.[1];return match?[{id:r.id,evidence:match}]:[];});const mentioned=locate(head),location=mentioned.length?mentioned:locate(body);
 return {category,region:location.length===1?location[0].id:location.length>1?'multi_region':'unknown',tags:ranked.map(([id])=>id),source_categories:hints,classification:{method:VERSION,basis:'original_headline_excerpt_and_publisher_labels',status:'unverified_rule_coding',decision:!ranked.length?'no_evidence':tie?'ambiguous':'weighted_rules',evidence,regions:location}};
}
module.exports={classify,norm,VERSION};
