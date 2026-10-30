import fs from 'node:fs';import path from 'node:path';import {ResearchDB} from './database.cjs';import {normalize}from './analytics.mjs';
const [file,source]=process.argv.slice(2);if(!file||!source)throw new Error('Usage: import.mjs DATABASE ARCHIVE_DIRECTORY');
const db=new ResearchDB(file);let files=0,records=0,invalid=0;
function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,entry.name);if(entry.isDirectory())walk(p);else if(entry.name.endsWith('.json')&&entry.name!=='index.json'&&!entry.name.includes('queue')){
 try{const d=JSON.parse(fs.readFileSync(p,'utf8'));const articles=Array.isArray(d)?d:d.articles;if(!Array.isArray(articles))continue;files++;records+=articles.length;const date=d.generated_at||d.date||entry.name.match(/\d{4}-\d{2}-\d{2}/)?.[0];db.import(articles,date,normalize);}catch(e){invalid++;console.error(JSON.stringify({file:entry.name,error:e.message}));}
}}}
walk(source);const report={files_read:files,input_records:records,invalid_files:invalid,imported_at:new Date().toISOString(),source:'GitHub archive + legacy live cache'};db.set('import_report',report);console.log(JSON.stringify({...report,...db.meta()}));db.close();if(invalid)process.exitCode=1;
