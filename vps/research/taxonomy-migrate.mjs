import{DatabaseSync}from'node:sqlite';import{classify,VERSION}from'../worker/classification.cjs';
const db=new DatabaseSync((process.env.DATA_DIR||'/data')+'/research.sqlite');db.exec('PRAGMA busy_timeout=10000');
const apply=process.argv.includes('--apply');let cursor='',seen=0,changed=0;const transitions=new Map();
const update=db.prepare('UPDATE r_articles SET category=?,payload=? WHERE id=?');
try{while(true){const rows=db.prepare('SELECT id,category,payload FROM r_articles WHERE id>? ORDER BY id LIMIT 500').all(cursor);if(!rows.length)break;
 if(apply)db.exec('BEGIN IMMEDIATE');try{for(const row of rows){const a=JSON.parse(row.payload),coding=classify({title:a.title_original,description:a.text_original,source_categories:a.source_categories||[]});seen++;if(row.category!==coding.category){changed++;const key=row.category+' -> '+coding.category;transitions.set(key,(transitions.get(key)||0)+1);}if(apply){const next={...a,...coding,category_previous:a.category_previous||a.category};update.run(next.category,JSON.stringify(next),a.id);}cursor=row.id;}if(apply)db.exec('COMMIT');}catch(e){if(apply)db.exec('ROLLBACK');throw e;}}
 const report={method:VERSION,at:new Date().toISOString(),seen,changed,transitions:Object.fromEntries([...transitions].sort((a,b)=>b[1]-a[1])),applied:apply,scope:'All current stored articles; content versions and original text retained; automatic coding, not human validation'};
 if(apply)db.prepare('INSERT OR REPLACE INTO r_meta VALUES (?,?)').run('taxonomy_migration',JSON.stringify(report));console.log(JSON.stringify(report));
}finally{db.close();}
