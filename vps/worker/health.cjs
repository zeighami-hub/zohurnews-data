const {Store}=require('./store.cjs');const path=require('node:path');const fs=require('node:fs');
const dir=process.env.DATA_DIR||'/data';const file=path.join(dir,'news.sqlite');
if(!fs.existsSync(file)){console.log(JSON.stringify({healthy:false,reason:'not_started'}));process.exit(1);}
const store=new Store(file);const last=store.get('last_success');const age=last?Date.now()-Date.parse(last):Infinity;
const disk=fs.statfsSync(dir);const enough=disk.bavail*disk.bsize>=512*1024*1024;
const latest=store.db.prepare('SELECT status,detail FROM runs ORDER BY started DESC LIMIT 1').get();
const healthy=age<=3600000&&enough&&!store.pending();
console.log(JSON.stringify({healthy,last_success:last||null,age_minutes:Number.isFinite(age)?Math.round(age/60000):null,free_mib:Math.floor(disk.bavail*disk.bsize/1048576),pending_publication:!!store.pending(),latest_run:latest||null}));
store.close();process.exitCode=healthy?0:1;
