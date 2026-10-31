'use strict';
const {DatabaseSync}=require('node:sqlite');const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
function canonicalUrl(raw) {try {const u=new URL(raw);if(!['http:','https:'].includes(u.protocol))return null;u.hash='';for(const k of [...u.searchParams.keys()])if(/^utm_|^(fbclid|gclid)$/i.test(k))u.searchParams.delete(k);return u.href;}catch{return null;}}
function validDate(raw){const t=Date.parse(raw||'');return Number.isFinite(t)&&t>=Date.UTC(2000,0,1)&&t<Date.now()+86400000?new Date(t).toISOString():null;}
function convert(a,recorded=null){
 const url=canonicalUrl(a.sourceUrl||a.url||'');if(!url)return null;
 const id=crypto.createHash('sha256').update(url).digest('hex').slice(0,24);
 const source=String(a.agencyId||a.source_id||'unknown').slice(0,80);
 const lang=a.lang||(['irna','khabaronline','mashregh','isna','yjc','asriran'].includes(source)?'fa':'en');
 const title=typeof a.title==='string'?a.title:'';const desc=typeof a.description==='string'?a.description:'';
 const d={id,legacy_id:a.id||null,source_id:source,url,title_original:title,title_fa:a.title_fa||title,text_original:desc,lead:a.lead||'',lang,category:a.category||'unknown',region:a.region||'unknown',published_at:validDate(a.pubDate),first_seen_at:validDate(a.first_seen_at),analyzed_at:validDate(a.analyzed_at),recorded_at:validDate(recorded),content_scope:a.content_scope||'rss_excerpt',recovery:a.recovery||null,provenance:a.provenance||'legacy-import',model:a.analysis_model||null,model_suggestions:Array.isArray(a.research?.techniques)?a.research.techniques:[]};
 d.effective_at=d.published_at||d.first_seen_at||d.analyzed_at||d.recorded_at;d.date_basis=d.published_at?'source_published':d.first_seen_at?'first_observed':d.analyzed_at?'legacy_analysis':d.recorded_at?'archive_record':'unknown';d.translation_status=lang==='fa'?'not_required':a.title_fa?'available':'pending';return d;
}
class ResearchDB {
 constructor(file){fs.mkdirSync(path.dirname(file),{recursive:true});this.db=new DatabaseSync(file);this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA temp_store=MEMORY; PRAGMA busy_timeout=5000; PRAGMA synchronous=NORMAL;
 CREATE TABLE IF NOT EXISTS r_articles(id TEXT PRIMARY KEY,url TEXT UNIQUE,source_id TEXT,category TEXT,lang TEXT,effective_at TEXT,published_at TEXT,title TEXT,search_text TEXT,payload TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS r_legacy ON r_articles(json_extract(payload,'$.legacy_id'));CREATE INDEX IF NOT EXISTS r_time ON r_articles(effective_at);CREATE INDEX IF NOT EXISTS r_source ON r_articles(source_id,effective_at);CREATE INDEX IF NOT EXISTS r_category ON r_articles(category);
 CREATE TABLE IF NOT EXISTS r_versions(article_id TEXT,content_hash TEXT,payload TEXT,recorded_at TEXT,PRIMARY KEY(article_id,content_hash));
 CREATE VIRTUAL TABLE IF NOT EXISTS r_fts USING fts5(id UNINDEXED,search_text,tokenize='unicode61');
 CREATE TRIGGER IF NOT EXISTS r_insert AFTER INSERT ON r_articles BEGIN INSERT INTO r_fts(rowid,id,search_text) VALUES(new.rowid,new.id,new.search_text);END;
 CREATE TRIGGER IF NOT EXISTS r_update AFTER UPDATE OF search_text ON r_articles WHEN old.search_text != new.search_text BEGIN DELETE FROM r_fts WHERE rowid=old.rowid;INSERT INTO r_fts(rowid,id,search_text) VALUES(new.rowid,new.id,new.search_text);END;
 CREATE TABLE IF NOT EXISTS r_meta(key TEXT PRIMARY KEY,value TEXT);`);}
 set(k,v){this.db.prepare('INSERT OR REPLACE INTO r_meta VALUES (?,?)').run(k,JSON.stringify(v));}
 get(k){const v=this.db.prepare('SELECT value FROM r_meta WHERE key=?').get(k);return v?JSON.parse(v.value):null;}
 import(items,recorded,normalize){let n=0;this.db.exec('BEGIN');try{
 const insert=this.db.prepare(`INSERT INTO r_articles VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET source_id=excluded.source_id,category=excluded.category,lang=excluded.lang,effective_at=excluded.effective_at,published_at=excluded.published_at,title=excluded.title,search_text=excluded.search_text,payload=excluded.payload`);
 const version=this.db.prepare('INSERT OR IGNORE INTO r_versions VALUES (?,?,?,?)');
 const prior=this.db.prepare('SELECT payload FROM r_articles WHERE id=?');
 for(const a of items){let d=convert(a,recorded);if(!d)continue;const hash=crypto.createHash('sha256').update(JSON.stringify([d.title_original,d.title_fa,d.text_original,d.lead])).digest('hex');
 const old=prior.get(d.id);if(old){const prev=JSON.parse(old.payload);if(!d.text_original)d.text_original=prev.text_original;if(!d.published_at&&prev.published_at){d.published_at=prev.published_at;d.effective_at=prev.published_at;d.date_basis='source_published';}if(prev.first_seen_at&&(!d.first_seen_at||prev.first_seen_at<d.first_seen_at))d.first_seen_at=prev.first_seen_at;if(d.date_basis==='first_observed')d.effective_at=d.first_seen_at;if(!a.title_fa&&prev.title_fa){d.title_fa=prev.title_fa;d.lead=prev.lead;d.translation_status=prev.translation_status;}if(!d.model)d.model=prev.model;if(!d.recovery)d.recovery=prev.recovery||null;}
 const payload=JSON.stringify(d);version.run(d.id,hash,payload,d.recorded_at||new Date().toISOString());
 if(old?.payload===payload)continue;
 insert.run(d.id,d.url,d.source_id,d.category,d.lang,d.effective_at,d.published_at,d.title_fa,normalize([d.title_original,d.title_fa,d.text_original,d.lead].join(' ')),payload);n++;
 }this.db.exec('COMMIT');return n;}catch(e){try{this.db.exec('ROLLBACK');}catch{}throw e;}}
 filters(p={}){const where=[],args=[];for(const [key,col]of [['source','source_id'],['category','category'],['lang','lang']])if(p[key]){where.push(col+'=?');args.push(String(p[key]).slice(0,100));}
 const sources=String(p.sources||'').split(',').filter(Boolean).slice(0,30);if(sources.length){where.push('source_id IN ('+sources.map(()=>'?').join(',')+')');args.push(...sources);}
 if(p.translation==='ready'){where.push("(lang='fa' OR json_extract(payload,'$.translation_status')='available')");}
 if(p.date_basis==='published'){where.push('published_at IS NOT NULL');}
 if(p.from){where.push('effective_at>=?');args.push(p.from);}if(p.to){where.push('effective_at<=?');args.push(p.to);}
 if(p.q){const words=String(p.q).match(/[\p{L}\p{N}]+/gu)?.slice(0,12)||[];if(words.length){where.push('id IN (SELECT id FROM r_fts WHERE r_fts MATCH ?)');args.push(words.map(x=>'"'+x+'"').join(' AND '));}}
 return{sql:where.length?' WHERE '+where.join(' AND '):'',args};}
 query(p={}){const f=this.filters(p);const total=this.db.prepare('SELECT COUNT(*) n FROM r_articles'+f.sql).get(...f.args).n;const limit=Math.max(1,Math.min(5000,Number(p.limit)||500));const offset=Math.max(0,Math.min(1000000,Number(p.offset)||0));
 const articles=this.db.prepare('SELECT payload FROM r_articles'+f.sql+' ORDER BY effective_at DESC,id LIMIT ? OFFSET ?').all(...f.args,limit,offset).map(x=>JSON.parse(x.payload));
 const sources=this.db.prepare('SELECT source_id id,COUNT(*) count FROM r_articles'+f.sql+' GROUP BY source_id ORDER BY count DESC').all(...f.args);
 const days=this.db.prepare("SELECT substr(effective_at,1,10) day,COUNT(*) count FROM r_articles"+f.sql+' GROUP BY day ORDER BY day').all(...f.args);
 const categories=this.db.prepare('SELECT category id,COUNT(*) count FROM r_articles'+f.sql+' GROUP BY category ORDER BY count DESC').all(...f.args);
 const known=this.db.prepare('SELECT COUNT(*) n FROM r_articles'+f.sql+(f.sql?' AND ':' WHERE ')+'published_at IS NOT NULL').get(...f.args).n;
 return{articles,total,returned:articles.length,offset,truncated:offset+articles.length<total,summary:{sources,days,categories,published_known:known},meta:this.meta()};}
 meta(){return {...this.get('import_report'),...this.db.prepare('SELECT COUNT(*) total,MIN(effective_at) earliest,MAX(effective_at) latest FROM r_articles').get(),versions:this.db.prepare('SELECT COUNT(*) n FROM r_versions').get().n,last_capture:this.get('last_capture'),last_translation:this.get('last_translation'),method:'zohur-research-1.0',content_scope:'rss_excerpt',now:new Date().toISOString()};}
 article(id){if(typeof id!=='string'||id.length>200)return null;const exact=this.db.prepare('SELECT payload FROM r_articles WHERE id=?').get(id);if(exact)return JSON.parse(exact.payload);const legacy=this.db.prepare("SELECT payload FROM r_articles WHERE json_extract(payload,'$.legacy_id')=? LIMIT 2").all(id);return legacy.length===1?JSON.parse(legacy[0].payload):null;}
 candidates(a,terms){const center=Date.parse(a.effective_at||'');const from=Number.isFinite(center)?new Date(center-72*3600000).toISOString():'2000';const to=Number.isFinite(center)?new Date(center+72*3600000).toISOString():'2100';
 const expression=terms.slice(0,12).map(t=>'"'+t.replaceAll('"','')+'"').join(' OR ');if(!expression)return [];
 return this.db.prepare('SELECT payload FROM r_articles WHERE effective_at>=? AND effective_at<=? AND id!=? AND id IN (SELECT id FROM r_fts WHERE r_fts MATCH ?) LIMIT 600').all(from,to,a.id,expression).map(x=>JSON.parse(x.payload));}
 historyCandidates(a,terms){
 const center=Date.parse(a.published_at||a.effective_at||'');if(!Number.isFinite(center))return [];
 const expression=terms.slice(0,12).map(t=>'"'+t.replaceAll('"','')+'"').join(' OR ');if(!expression)return [];
 return this.db.prepare('SELECT payload FROM r_articles WHERE effective_at>=? AND effective_at<? AND id!=? AND id IN (SELECT id FROM r_fts WHERE r_fts MATCH ?) ORDER BY effective_at DESC LIMIT 1200').all(new Date(center-180*86400000).toISOString(),new Date(center-72*3600000).toISOString(),a.id,expression).map(x=>JSON.parse(x.payload));
 }
 coverage(){return {recovered_by_source:this.db.prepare("SELECT source_id id,COUNT(*) count FROM r_articles WHERE json_extract(payload,'$.provenance')='publisher-archive-recovery' GROUP BY source_id").all(),gap:{from:'2026-10-08T22:15:00Z',to:'2026-10-30T08:00:00Z',status:'incomplete-recovery-in-progress'},recovery:this.get('recovery_status'),days:this.db.prepare("SELECT substr(published_at,1,10) day,source_id,COUNT(*) count FROM r_articles WHERE published_at>='2026-10-01' GROUP BY day,source_id ORDER BY day,source_id").all()};}
 close(){this.db.close();}
}
module.exports={ResearchDB,convert,canonicalUrl};


