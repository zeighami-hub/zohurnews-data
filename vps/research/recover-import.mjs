import fs from 'node:fs';import path from 'node:path';import{ResearchDB}from './database.cjs';import{normalize}from './analytics.mjs';
const file=process.argv[2];const data=JSON.parse(fs.readFileSync(file,'utf8'));const db=new ResearchDB(path.join(process.env.DATA_DIR||'/data','research.sqlite'));
try{const imported=db.import(data.articles||[],new Date().toISOString(),normalize);if(data.status)db.set('recovery_status',data.status);console.log(JSON.stringify({imported}));}finally{db.close();}
