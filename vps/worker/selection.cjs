'use strict';
function selectForeign(items,limit=100){
 const groups=new Map();
 for(const a of items){const key=a.agencyId||'unknown';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(a);}
 for(const list of groups.values())list.sort((a,b)=>(Number(b.iranScore)||0)-(Number(a.iranScore)||0)||Date.parse(b.pubDate||b.first_seen_at)-Date.parse(a.pubDate||a.first_seen_at));
 const out=[];
 while(out.length<limit){let progressed=false;for(const list of groups.values())if(list.length&&out.length<limit){out.push(list.shift());progressed=true;}if(!progressed)break;}
 return out;
}
function prepareNative(a){return {...a,title_fa:a.title,lead:a.description||a.title,analysis_model:null,research:{techniques:[]},processing_method:'original-persian-no-model'};}
module.exports={selectForeign,prepareNative};
