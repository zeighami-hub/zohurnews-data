'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Store } = require('./store.cjs');
const { fetchAllRSS, analyzeWithGemini, RSS_SOURCES } = require('./news-core.cjs');
const DATA = process.env.DATA_DIR || '/data';
const sleep = ms => new Promise(r => setTimeout(r, ms));
function validateConfig() {
  for (const key of (process.env.PUBLISH_MODE==='local'?['GEMINI_API_KEY','GEMINI_MODEL']:['GEMINI_API_KEY','GEMINI_MODEL','PUBLISH_URL','PUBLISH_SECRET'])) {
    if (!process.env[key] || /CHANGE_ME|REPLACE_ME/.test(process.env[key])) throw new Error('Missing configuration: ' + key);
  }
  if(process.env.PUBLISH_MODE==='local')return;
  const u = new URL(process.env.PUBLISH_URL);
  if (u.protocol !== 'https:' || u.username || u.password || process.env.PUBLISH_SECRET.length < 32) throw new Error('Unsafe publication configuration');
}
async function publish(store, fetcher = fetch) {
  const item = store.pending();
  if (!item) return;
  const timestamp = String(Math.floor(Date.now()/1000));
  const signature = crypto.createHmac('sha256', process.env.PUBLISH_SECRET).update(timestamp + '.' + item.body).digest('hex');
  const response = await fetcher(process.env.PUBLISH_URL, {
    method:'POST', redirect:'error', signal:AbortSignal.timeout(45000),
    headers:{'Content-Type':'application/json','X-Zohur-Timestamp':timestamp,'X-Zohur-Signature':signature}, body:item.body
  });
  if (!response.ok) throw new Error('Publish HTTP ' + response.status);
  const ack = await response.json();
  if (ack.sequence !== item.sequence || ack.sha256 !== crypto.createHash('sha256').update(item.body).digest('hex')) throw new Error('Invalid publication acknowledgement');
  store.acknowledge(item.sequence);
  console.log(JSON.stringify({event:'published',sequence:item.sequence}));
}
function buildPublication(store, now, agencies, added) {
  const previous = Number(store.get('published_sequence') || 0);
  const sequence = Math.max(now, previous + 1);
  const live = store.articles(now - 86400000);
  // Only newly committed items are transferred to the durable host archive.
  // A seed import is included on first publication, even when already expired.
  const changes = store.articles(previous ? previous + 1 : 0);
  return {schema:2,sequence,cache:{generated_at:new Date(now).toISOString(),total:live.length,new_this_cycle:added,agencies,articles:live},archive:changes};
}
async function cycle(dependencies = {}) {
  const readRSS = dependencies.readRSS || fetchAllRSS;
  const analyze = dependencies.analyze || analyzeWithGemini;
  const deliver = dependencies.deliver || publish;
  validateConfig();
  fs.mkdirSync(DATA,{recursive:true,mode:0o700});
  const disk=fs.statfsSync(DATA);
  if(disk.bavail*disk.bsize < 512*1024*1024) throw new Error('Low disk space: minimum 512 MiB required');
  // Production launch uses flock in the systemd unit. This function is not an HTTP endpoint.
  const store = new Store(path.join(DATA,'news.sqlite'));
  const started = Date.now();
  store.db.prepare('INSERT INTO runs(started,status) VALUES (?,?)').run(started,'running');
  try {
    await deliver(store); // Drain the durable outbox before analyzing or creating another snapshot.
    const seed = path.join(DATA,'seed.json');
    if (!store.get('seed_imported') && fs.existsSync(seed)) {
      const data = JSON.parse(fs.readFileSync(seed,'utf8'));
      store.add(data.articles || [],[]);
      store.set('seed_imported',new Date().toISOString());
    }
    const raw = await readRSS();
    if (!raw.articles.length) throw new Error('All RSS sources failed or were empty');
    const now = Date.now();
    const max = Number(process.env.MAX_PER_CYCLE || 100);
    const toAnalyze = raw.articles.filter(a => {
      const t = Date.parse(a.pubDate || a.first_seen_at);
      return /^https?:\/\//.test(a.sourceUrl) && Number.isFinite(t) && t >= now-86400000 && t <= now+300000 && !store.has(a) && !store.isRejected(a.sourceUrl,now);
    }).slice(0,max);
    let added = 0, failed = 0;
    for (let i=0;i<toAnalyze.length;i+=15) {
      const batch = toAnalyze.slice(i,i+15);
      let result;
      for (let attempt=0;attempt<3;attempt++) {
        try { result = await analyze(batch); break; }
        catch(e) { if(attempt<2) await sleep(2000 * 2**attempt); }
      }
      if(!result || result.kept.length+result.rejected.length === 0) { failed++; continue; }
      added += store.add(result.kept,result.rejected);
      await sleep(1500);
    }
    // Full AI failure never replaces last good live snapshot with an empty feed.
    if (toAnalyze.length && !added && failed) throw new Error('No articles analyzed successfully; previous snapshot retained');
    const stamp = Date.now();
    const payload = buildPublication(store,stamp,raw.agencies,added);
    store.enqueue(payload.sequence,payload);
    await deliver(store);
    store.db.prepare('UPDATE runs SET finished=?,status=?,detail=? WHERE started=?').run(Date.now(),failed?'partial':'ok',JSON.stringify({added,failed,total:payload.cache.total}),started);
    // Run history is bounded. Articles are durable archive and are never silently purged.
    store.db.prepare('DELETE FROM runs WHERE started<?').run(Date.now()-90*86400000);
    store.set('last_success', new Date().toISOString());
    console.log(JSON.stringify({event:'cycle_completed',added,failed,total:payload.cache.total}));
  } catch(e) {
    store.db.prepare('UPDATE runs SET finished=?,status=?,detail=? WHERE started=?').run(Date.now(),'failed',e.message,started);
    throw e;
  } finally { store.close(); }
}
if (require.main === module) {
  if(process.argv.includes('--check')) { try{validateConfig(); console.log('Configuration valid');}catch(e){console.error(e.message);process.exitCode=1;} }
  else cycle().catch(e=>{ console.error(JSON.stringify({event:'cycle_failed',error:e.message}));process.exitCode=1; });
}
module.exports = { publish, buildPublication, validateConfig, cycle };
