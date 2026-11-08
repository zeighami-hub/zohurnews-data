// Isolated test fixture; never used by production.
import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {DatabaseSync}from'node:sqlite';import {createAcademic}from'./academic-api.mjs';import {hash}from'./academic-methods.mjs';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'academic-ui-')),sql=new DatabaseSync(':memory:');sql.exec('CREATE TABLE r_versions(article_id TEXT,content_hash TEXT,recorded_at TEXT)');
const articles=[1,2].map(i=>({id:hash('ui'+i).slice(0,24),url:'https://publisher.example/news/'+i,source_id:i===1?'irna':'bbc',title_original:'تیتر اصلی خبر آزمایشی '+i,title_fa:'خبر فارسی آزمایشی '+i,text_original:'این متن ثابت برای آزمایش رابط است؛ خبر واقعی تولیدی نیست.',lead:'لید آزمایشی',content_scope:'test_fixture',published_at:'2026-11-01T12:00:00Z',provenance:'test-fixture'}));
const ac=createAcademic({article:id=>articles.find(a=>a.id===id),db:sql},temp);
const server=http.createServer(async(req,res)=>{const u=new URL(req.url,'http://localhost');if(await ac.handle(req,res,u))return;
 if(u.pathname==='/api/catalog'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({summary:{sources:[{id:'irna'},{id:'bbc'}],categories:[{id:'politics'}]}}));return;}
 if(u.pathname==='/api/research'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({articles,total:2,offset:0,returned:2,truncated:false}));return;}
 if(u.pathname==='/api/trail'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({coverage:[]}));return;}
 const name=u.pathname==='/'?'academic.html':u.pathname.slice(1);const full=path.resolve(new URL('./web/',import.meta.url).pathname,name);if(!full.startsWith(path.resolve(new URL('./web/',import.meta.url).pathname)+'/')||!fs.existsSync(full)){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',full.endsWith('.mjs')?'application/javascript':full.endsWith('.css')?'text/css':'text/html; charset=utf-8');res.end(fs.readFileSync(full));
});server.listen(18111,'127.0.0.1',()=>console.log('Academic UI fixture 18111'));
process.on('SIGTERM',()=>server.close(()=>{ac.store.close();sql.close();fs.rmSync(temp,{recursive:true,force:true});process.exit(0);}));
