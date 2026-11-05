'use strict';
// Parse public server-rendered JSON only; never execute publisher scripts.
function parseFars(html){
 const match=html.match(/window\.__hydrationDataString\s*=\s*("(?:\\.|[^"\\])*")/);if(!match)throw Error('Fars public data format unavailable');
 const state=JSON.parse(JSON.parse(match[1])),groups=state.apiCache?.['/showcase/block/listV2'];if(!Array.isArray(groups))throw Error('Fars showcase data unavailable');
 const records=new Map();for(const group of groups){const users=new Map((group.usersSummary||[]).map(u=>[u.userID,u]));
 for(const p of group.showcaseContents||[]){const u=users.get(p.userID);if(!u||!u.roles?.some(r=>r.ID==='1767014743758181120')||u.verifiedBadge?.status!=='verified'||u.verifiedBadge?.type!=='professionalReporter')continue;
 if(!/^\d{10,25}$/.test(p.postID)||!/^[A-Za-z0-9_]+$/.test(u.username||'')||typeof p.title!=='string'||p.title.trim().length<4)continue;
 const title=p.title.trim(),text=String(p.displayingText||'').replace(/<[^>]*>/g,'').trim();records.set(p.postID,{title,description:text===title?'':text.slice(0,400),sourceUrl:'https://farsnews.ir/'+u.username+'/'+p.postID,pubDate:Number.isFinite(p.createdTime)?new Date(p.createdTime*1000).toISOString():null,source_categories:(p.extraData?.topics||[]).map(t=>t.name).filter(Boolean),publisher_author:u.username,source_method:'publisher_public_showcase',source_time_kind:'publisher_post_created',content_scope:'publisher_showcase_excerpt'});
 }}return [...records.values()].sort((a,b)=>(b.pubDate||'').localeCompare(a.pubDate||''));
}
module.exports={parseFars};
