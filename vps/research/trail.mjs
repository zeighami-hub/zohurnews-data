import {tokens,related,earliest,techniques,compare} from './analytics.mjs';
export function trail(db,base){
 const terms=[...new Set(tokens(base.title_fa||base.title_original))];
 const nearby=related(base,db.candidates(base,terms),60);
 const same=nearby.filter(a=>a.source_id!==base.source_id);
 const history=related(base,db.historyCandidates(base,terms),40).filter(a=>a.similarity>=.32&&a.shared_terms.length>=3).sort((a,b)=>(a.published_at||'').localeCompare(b.published_at||''));
 const close=same.filter(a=>a.similarity>=.6&&a.shared_terms.length>=3);
 const first=earliest([base,...close]);
 return {base,coverage:same.map(a=>({...a,match_type:a.similarity>=.6&&a.shared_terms.length>=3?'close_headline':'topic_candidate',comparison:compare(base,a),techniques:techniques(a)})),history,
 earliest_candidate:first,techniques:techniques(base),
 method:{version:'trail-1.0',coverage_window_hours:72,history_days:180,coverage_candidate_limit:600,history_candidate_limit:1200,minimum_similarity:.24,close_similarity:.6,event_identity:'unverified',first_publication:'earliest declared timestamp among base and close headline candidates; not proof of origin',history_scope:'topic similarity, not necessarily the same event',languages:'Lexical matching only; untranslated cross-language stories may be missed'}};
}
