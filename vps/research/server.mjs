import {mediaComparison} from './media-comparison.mjs';
import {legacyLive,legacyArchive}from './legacy-adapter.mjs';
import {trail} from './trail.mjs';import {homePage,articlePage} from './public-pages.mjs';
import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import {ResearchDB}from './database.cjs';import {normalize,tokens,related,techniques,topTerms,compare,csv}from './analytics.mjs';
const dir=process.env.DATA_DIR||'/data';const web=path.resolve(process.env.WEB_DIR||new URL('./web/',import.meta.url).pathname);const db=new ResearchDB(path.join(dir,'research.sqlite'));
const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
const server=http.createServer(async(req,res)=>{try{
 if(req.method!=='GET')return json(res,405,{error:'Read-only endpoint'});
 const u=new URL(req.url,'http://localhost');const p=Object.fromEntries(u.searchParams);if(p.q)p.q=normalize(p.q);
 if(u.pathname==='/api/news-proxy.php')return json(res,200,legacyLive(db));
 if(u.pathname==='/api/archive-search.php')return json(res,200,legacyArchive(db,p));
 if(['/api/weather-prayer.php','/api/today-event.php','/api/prices.php','/api/prices-history.php'].includes(u.pathname))return json(res,503,{status:'unavailable',message:'External widget not configured'});
 if(u.pathname==='/api/category.php'){res.writeHead(302,{'Location':'/research.html'});return res.end();}
 if(u.pathname==='/api/coverage')return json(res,200,db.coverage());
 if(u.pathname==='/api/trail'){const a=db.article(p.id);if(!a)return json(res,404,{error:'Not found'});return json(res,200,trail(db,a));}
 if(u.pathname==='/api/health')return json(res,200,{ok:true,...db.meta(),ingestion_configured:!!db.get('last_capture')});
 if(u.pathname==='/api/media-comparison')return json(res,200,mediaComparison(db,p));
 if(u.pathname==='/api/research')return json(res,200,db.query(p));
 if(u.pathname==='/api/article'){const a=db.article(p.id);if(!a)return json(res,404,{error:'Not found'});return json(res,200,{article:a,techniques:techniques(a),versions:db.db.prepare('SELECT recorded_at,content_hash,payload FROM r_versions WHERE article_id=? ORDER BY recorded_at').all(a.id).map(v=>({recorded_at:v.recorded_at,content_hash:v.content_hash,title:JSON.parse(v.payload).title_original}))});}
 if(u.pathname==='/api/related'){const a=db.article(p.id);if(!a)return json(res,404,{error:'Not found'});return json(res,200,{base:a,articles:related(a,db.candidates(a,tokens(a.title_fa||a.title_original)),30),method:'TF-IDF cosine on Persian headlines; 72h candidate window; suggested matches, not verified event identity'});}
 if(u.pathname==='/api/export'){const r=db.query({...p,limit:5000});res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="zohurnews-research.csv"','X-Export-Total':r.total,'X-Export-Returned':r.returned});return res.end(csv(r.articles,['id','source_id','url','published_at','first_seen_at','effective_at','date_basis','title_original','title_fa','text_original','lead','content_scope']));}
 if(u.pathname.startsWith('/api/')&&u.pathname!=='/api/article.php')return json(res,404,{error:'Not found'});
 const html=body=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; frame-ancestors 'self'"});return res.end(body);};
 if(u.pathname==='/board')return html(homePage(db.meta()));
 if(u.pathname.startsWith('/news/')||u.pathname==='/api/article.php'||u.pathname==='/article.php'){
 const id=u.pathname.startsWith('/news/')?u.pathname.slice(6):p.id;const a=db.article(id);if(!a)return json(res,404,{error:'Not found'});
 if(u.pathname!=='/news/'+a.id){res.writeHead(301,{'Location':'/news/'+a.id});return res.end();}return html(articlePage(a));}
 const name=u.pathname==='/'?'home.html':u.pathname==='/research.html'?'index.html':decodeURIComponent(u.pathname.slice(1));const full=path.resolve(web,name);if(!full.startsWith(web+path.sep)||!fs.existsSync(full)||!fs.statSync(full).isFile())return json(res,404,{error:'Not found'});
 const mime={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2'}[path.extname(full)]||'application/octet-stream';
 res.writeHead(200,{'Content-Type':mime,'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self'; object-src 'none'; frame-ancestors 'self'"});fs.createReadStream(full).pipe(res);
}catch(e){console.error(e.message);if(!res.headersSent)json(res,500,{error:'Research request failed'});else res.end();}});
server.listen(Number(process.env.PORT||8080),'0.0.0.0',()=>console.log('Research server listening'));
process.on('SIGTERM',()=>server.close(()=>{db.close();process.exit(0);}));


