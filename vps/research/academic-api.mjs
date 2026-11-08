import path from 'node:path';import fs from 'node:fs';
import {AcademicStore,fail} from './academic-store.mjs';
import {academicExport} from './academic-export.mjs';
const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
async function body(req){let size=0,parts=[];for await(const b of req){size+=b.length;if(size>900000)fail('درخواست بیش از حد بزرگ است.',413);parts.push(b);}try{return JSON.parse(Buffer.concat(parts).toString('utf8')||'{}');}catch{fail('داده JSON نامعتبر است.');}}
export function createAcademic(archive,dir){
 const store=new AcademicStore(path.join(dir,'academic.sqlite'),archive),attempts=new Map();let globalAttempts=[];
 return {store,async handle(req,res,u){if(!u.pathname.startsWith('/api/academic/'))return false;
  try{
   const route=u.pathname.slice('/api/academic/'.length),p=Object.fromEntries(u.searchParams),token=String(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('zn_academic='))?.slice(12),session=store.session(token);
   if(!['GET','POST'].includes(req.method))fail('روش درخواست مجاز نیست.',405);
   if(req.method==='POST'){
    const origin=req.headers.origin;if(origin){let valid=false;try{valid=new URL(origin).host===req.headers.host;}catch{}if(!valid)fail('مبدأ درخواست مجاز نیست.',403);}
    if(!String(req.headers['content-type']||'').startsWith('application/json'))fail('JSON لازم است.',415);
   }
   if(route==='session'&&req.method==='GET'){json(res,200,{user:session?.user||null,csrf:session?.csrf||null,registration:true});return true;}
   if(['login','register'].includes(route)&&req.method==='POST'){
    const d=await body(req),key=String(d.username||'').slice(0,50),t=Date.now();globalAttempts=globalAttempts.filter(x=>x>t-60000);if(globalAttempts.length>=30)fail('تعداد تلاش‌ها زیاد است؛ یک دقیقه صبر کنید.',429);globalAttempts.push(t);const prior=(attempts.get(key)||[]).filter(x=>x>t-900000);if(prior.length>=8)fail('تعداد تلاش‌ها زیاد است؛ ۱۵ دقیقه بعد تلاش کنید.',429);if(attempts.size>1000)attempts.clear();attempts.set(key,[...prior,t]);
    if(route==='register'){if(store.db.prepare('SELECT 1 FROM ac_users WHERE username=?').get(key))fail('این نام ورود در دسترس نیست.',409);store.addUser({username:key,name:d.name,password:d.password,admin:false});}const s=store.login(key,d.password);attempts.delete(key);res.setHeader('Set-Cookie','zn_academic='+s.token+'; Path=/api/academic/; HttpOnly; SameSite=Strict; Secure; Max-Age=43200');json(res,200,{user:s.user,csrf:s.csrf});return true;
   }
   if(!session)fail('ابتدا وارد حساب پژوهشی شوید.',401);const user=session.user;
   if(req.method==='POST'&&req.headers['x-csrf-token']!==session.csrf)fail('نشست معتبر نیست؛ دوباره وارد شوید.',403);
   if(route==='logout'&&req.method==='POST'){store.logout(token);res.setHeader('Set-Cookie','zn_academic=; Path=/api/academic/; HttpOnly; Secure; SameSite=Strict; Max-Age=0');json(res,200,{ok:true});return true;}
   if(route==='projects'){json(res,200,req.method==='GET'?{projects:store.projects(user)}:store.createProject(user,await body(req)));return true;}
   const m=route.match(/^projects\/([a-f0-9-]{36})(?:\/([a-z-]+))?$/);if(!m)fail('مسیر موجود نیست.',404);const pid=m[1],resource=m[2]||'project';store.role(user,pid);
   if(req.method==='GET'){
    let result;
    switch(resource){
     case 'project':result=store.project(user,pid);break;
     case 'members':result={members:store.members(user,pid)};break;
     case 'items':result={items:store.items(user,pid)};break;
     case 'item':{const item=store.item(pid,p.id);result={item,versions:store.db.prepare('SELECT content_hash,snapshot,observed_at FROM ac_versions WHERE item_id=? ORDER BY observed_at').all(item.id).map(x=>({...x,snapshot:JSON.parse(x.snapshot)}))};break;}
     case 'duplicates':result=store.duplicates(user,pid);break;
     case 'samples':result={samples:store.samples(user,pid)};break;
     case 'codebooks':result={codebooks:store.books(user,pid)};break;
     case 'batches':result={batches:store.batches(user,pid)};break;
     case 'codes':result=store.codes(user,pid,p.batch_id);break;
     case 'reliability':result=store.reliability(user,pid,p.batch_id);break;
     case 'analysis':result=store.analysis(user,pid,p);break;
     case 'experts':result={experts:store.experts(user,pid)};break;
     case 'audit':result={audit:store.auditLog(user,pid)};break;
     case 'suggestions':{store.role(user,pid,['manager']);result={suggestions:store.db.prepare('SELECT * FROM ac_suggestions WHERE project_id=? ORDER BY created_at').all(pid).map(x=>({...x,data:JSON.parse(x.data)}))};break;}
     case 'export':await academicExport(store,user,pid,p,res);return true;
     default:fail('مسیر موجود نیست.',404);
    }json(res,200,result);return true;
   }
   const disk=fs.statfsSync(dir);if(disk.bavail*disk.bsize<512*1024*1024)fail('فضای آزاد برای ذخیره امن کافی نیست؛ داده قبلی حفظ شد.',507);
   const d=await body(req);let result;
   switch(resource){
    case 'project':result=store.updateProject(user,pid,d);break;
    case 'copy':result=store.copyProject(user,pid);break;
    case 'members':result=store.setMember(user,pid,d);break;
    case 'add-articles':result=store.addArticles(user,pid,d);break;
    case 'manual':result=store.addManual(user,pid,d);break;
    case 'item':result=store.updateItem(user,pid,d);break;
    case 'check':result=store.checkItem(user,pid,d.id);break;
    case 'sample':result=store.sample(user,pid,d);break;
    case 'codebook':result=store.saveBook(user,pid,d);break;
    case 'approve-codebook':result=store.approveBook(user,pid,d);break;
    case 'assign':result=store.assign(user,pid,d);break;
    case 'code':result=store.saveCode(user,pid,d);break;
    case 'release':result=store.release(user,pid,d);break;
    case 'adjudicate':result=store.adjudicate(user,pid,d);break;
    case 'expert':result=store.expert(user,pid,d);break;
    case 'suggestion':result=store.suggestions(user,pid,d);break;
    default:fail('مسیر موجود نیست.',404);
   }json(res,200,result);return true;
  }catch(e){if(!res.headersSent)json(res,e.status||500,{error:e.status?e.message:'عملیات پژوهشی انجام نشد؛ داده قبلی حفظ شده است.'});else res.end();if(!e.status)console.error('Academic:',e.message);return true;}
 }};
}
