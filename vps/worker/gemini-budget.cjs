'use strict';
const KEY='gemini_free_budget_v1';
const dayFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'});
const dayKey=now=>dayFormatter.format(new Date(now));
function nextReset(now){let lo=now,hi=now+30*3600000;const day=dayKey(now);while(hi-lo>1){const mid=Math.floor((lo+hi)/2);if(dayKey(mid)===day)lo=mid;else hi=mid;}return hi;}
class BudgetPause extends Error{constructor(reason,retryAt){super('Gemini translation paused: '+reason);this.code='GEMINI_BUDGET_PAUSED';this.reason=reason;this.retryAt=retryAt;}}
function policy(env=process.env){
 const bounded=(key,fallback,min,max)=>{const n=Number(env[key]);return Number.isFinite(n)&&n>0?Math.max(min,Math.min(max,Math.floor(n))):fallback;};
 return {dailyLimit:bounded('GEMINI_DAILY_REQUEST_LIMIT',400,1,400),cycleLimit:bounded('GEMINI_REQUESTS_PER_CYCLE',4,1,4),minInterval:bounded('GEMINI_MIN_INTERVAL_MS',20000,20000,60000)};
}
function providerQuota(data={},header=null,now=Date.now()){
 const encoded=JSON.stringify(data);const daily=/requestsperday|requests.per.day|per day limit|daily|\brpd\b/i.test(encoded);
 let until=now+60000;
 for(const d of data.details||[]){if(typeof d.retryDelay==='string'&&/^\d+(?:\.\d+)?s$/.test(d.retryDelay))until=Math.max(until,now+Math.ceil(parseFloat(d.retryDelay)*1000));}
 if(header){const seconds=Number(header);const date=Date.parse(header);if(Number.isFinite(seconds))until=Math.max(until,now+seconds*1000);else if(Number.isFinite(date))until=Math.max(until,date);}
 if(daily)until=Math.max(until,nextReset(now)+60000);
 return {daily,retryAt:until};
}
class GeminiBudget{
 constructor(store,options={}){this.store=store;this.config=options.policy||policy();this.now=options.now||Date.now;this.sleep=options.sleep||(ms=>new Promise(resolve=>setTimeout(resolve,ms)));this.cycleUsed=0;}
 load(now){
  let state;try{state=JSON.parse(this.store.get(KEY)||'null');}catch{}
  // Unknown pre-installation usage must never grant a fresh allowance mid-day.
  if(!state||typeof state.day!=='string'||!Number.isFinite(state.used))state={day:dayKey(now),used:this.config.dailyLimit,bootstrap:'unknown-usage-blocked-until-reset'};
  if(state.day!==dayKey(now))state={day:dayKey(now),used:0,lastRequestAt:state.lastRequestAt||0,notBefore:state.notBefore||0};
  return state;
 }
 status(){return this.store.transaction(()=>{const now=this.now(),s=this.load(now);this.store.set(KEY,JSON.stringify(s));return{...s,dailyLimit:this.config.dailyLimit,cycleLimit:this.config.cycleLimit,cycleUsed:this.cycleUsed,minIntervalMs:this.config.minInterval,resetAt:nextReset(now),remaining:Math.max(0,this.config.dailyLimit-s.used)};});}
 async reserve(){
  for(;;){
   const wait=this.store.transaction(()=>{
    const now=this.now(),s=this.load(now);
    this.store.set(KEY,JSON.stringify(s));
    if(s.notBefore>now)throw new BudgetPause('provider-cooldown',s.notBefore);
    if(s.used>=this.config.dailyLimit)throw new BudgetPause('daily-budget',nextReset(now));
    if(this.cycleUsed>=this.config.cycleLimit)throw new BudgetPause('cycle-budget',null);
    const delay=(s.lastRequestAt||0)+this.config.minInterval-now;if(delay>0)return delay;
    // Reserve before network I/O, counting failed requests, retries and process crashes.
    s.used++;s.lastRequestAt=now;this.store.set(KEY,JSON.stringify(s));this.cycleUsed++;return 0;
   });
   if(!wait)return;await this.sleep(wait);
  }
 }
 pause(quota){return this.store.transaction(()=>{const now=this.now(),s=this.load(now);s.notBefore=Math.max(s.notBefore||0,quota.retryAt||now+60000);if(quota.daily)s.used=this.config.dailyLimit;this.store.set(KEY,JSON.stringify(s));return s.notBefore;});}
}
module.exports={GeminiBudget,BudgetPause,dayKey,nextReset,providerQuota,policy,KEY};
