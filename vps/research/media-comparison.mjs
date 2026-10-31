function calculate(db, p={}) {
 const f=db.filters(p), where=f.sql, args=f.args;
 const total=db.db.prepare('SELECT COUNT(*) n FROM r_articles'+where).get(...args).n;
 const rows=db.db.prepare(`SELECT source_id id,COUNT(*) count,
 SUM(published_at IS NOT NULL) published_known,
 SUM(length(COALESCE(json_extract(payload,'$.text_original'),''))>0) original_excerpt,
 SUM(lang!='fa' AND COALESCE(json_extract(payload,'$.translation_status'),'pending')!='available') translation_pending,
 SUM(json_extract(payload,'$.provenance')='publisher-archive-recovery') recovered,
 MIN(published_at) first_published,MAX(published_at) last_published
 FROM r_articles${where} GROUP BY source_id ORDER BY count DESC,source_id`).all(...args);
 const selected=String(p.sources||p.source||'').split(',').filter(Boolean).slice(0,30);
 for(const id of selected)if(!rows.some(r=>r.id===id))rows.push({id,count:0,published_known:0,original_excerpt:0,translation_pending:0,recovered:0,first_published:null,last_published:null});
 const first=rows.filter(r=>r.first_published).map(r=>r.first_published).sort()[0]||null;
 const capture=db.get('last_capture');
 for(const r of rows){
  r.share_percent=total?r.count/total*100:0;
  r.relative_minutes=r.first_published&&first?(Date.parse(r.first_published)-Date.parse(first))/60000:null;
  const ff=db.filters({...p,source:r.id});
  const found=r.count?db.db.prepare('SELECT payload FROM r_articles'+ff.sql+' AND published_at IS NOT NULL ORDER BY published_at,id LIMIT 1').get(...ff.args):null;
  r.first_article=found?JSON.parse(found.payload):null;
  r.last_feed_check=capture?.sources?.find(s=>s.id===r.id)||null;
 }
 const days=db.db.prepare("SELECT substr(effective_at,1,10) day,source_id,COUNT(*) count FROM r_articles"+where+' GROUP BY day,source_id ORDER BY day,source_id').all(...args);
 const scopes=db.db.prepare("SELECT COALESCE(json_extract(payload,'$.content_scope'),'unknown') scope,COUNT(*) count FROM r_articles"+where+' GROUP BY scope').all(...args);
 const languages=db.db.prepare('SELECT lang,COUNT(*) count FROM r_articles'+where+' GROUP BY lang').all(...args);
 const recovery=db.get('recovery_status');
 return {method:'zohur-media-comparison-1.0',generated_at:new Date().toISOString(),filters:{q:p.q||'',sources:selected,source:p.source||null,category:p.category||null,from:p.from||null,to:p.to||null,date_basis:p.date_basis||'available'},total,sources:rows,days,scopes,languages,recovery:{state:recovery?.state||'unknown',recovered:recovery?.counts?.recovered||0,at:recovery?.at||null,from:'2026-10-08T22:15:00Z',to:'2026-10-30T08:00:00Z'},definitions:{count:'Unique stored source URLs in the filtered corpus; not total publisher output',share:'Source count / total matched stored records',relative_minutes:'Difference from the earliest declared publication in this query; a topic may contain different events',zero:'No matching stored record; does not establish absence of coverage',scope:'Original headline and available excerpt; full article text is not guaranteed',timeline:'UTC calendar days using effective_at; source publication preferred, fallback labelled'}};
}

// Keep all aggregates and their evidence on one SQLite read snapshot during ingestion.
export function mediaComparison(db,p={}){
 db.db.exec('BEGIN');
 try{const result=calculate(db,p);db.db.exec('COMMIT');return result;}
 catch(error){try{db.db.exec('ROLLBACK');}catch{}throw error;}
}
