(function(root){
 'use strict';
 const TRANSLATION_VERSION='William Davidson Edition - Hebrew';
 const CACHE_TTL=30*60*1000,MAX_CACHE=160,cache=new Map();
 const FINAL={'ך':'כ','ם':'מ','ן':'נ','ף':'פ','ץ':'צ'};
 const STOP=new Set('של את על אל עם אם או גם כי לא כן הוא היא הם הן אני אתה אתם אנחנו אשר זה זאת אלה אלו כל מן בין תוך עבור אחרי לפני כאשר'.split(' '));
 function normalizeHebrew(value){
  return String(value||'').replace(/<[^>]*>/g,' ').replace(/&nbsp;/gi,' ').normalize('NFKD').replace(/\p{M}/gu,'').replace(/[ךםןףץ]/g,ch=>FINAL[ch]).replace(/[^\u05d0-\u05ea]+/g,' ').replace(/\s+/g,' ').trim();
 }
 function candidatePhrases(value){return [...new Set(String(value||'').split(/[;|\n]+/).map(normalizeHebrew).filter(Boolean))];}
 function findPhraseMatch(phrase,text){
  if(!phrase||!text)return null;const words=phrase.split(' ');if(words.length===1&&(STOP.has(words[0])||words[0].length<2))return null;
  const haystack=text.split(' ');for(let i=0;i+words.length<=haystack.length;i++)if(words.every((w,j)=>w===haystack[i+j]))return haystack.slice(i,i+words.length).join(' ');return null;
 }
 async function translationReference(s){
  s=s||{};const ranges=[s.sourceRange,s.renderedRange,s.sections?.[0]?.sourceRange,s.sections?.[0]?.renderedRange];
  for(const range of ranges)for(const value of [range?.ref,range?.currentRef,range?.reference])if(typeof value==='string'&&value.trim())return value.trim();
  for(const value of [s.currentRef,s.currentTitle,s.reference])if(typeof value==='string'&&value.trim())return value.trim();
  try{const r=await root.Otzaria?.call?.('reader.getCurrentRef');if(r?.success){const v=r.data?.currentRef||r.data?.currentTitle;if(typeof v==='string'&&v.trim())return v.trim();}}catch{}return '';
 }
 async function compareTranslation(word,candidates,selection,options){
  if(!Array.isArray(candidates)||!candidates.length)return {matches:[],reason:'no_candidates'};
  const ref=await translationReference(selection);if(!ref)return {matches:[],reason:'no_reference'};
  if(options?.preparedOnly&&!root.SefariaOfflineTranslation?.isDafPrepared?.(ref,selection))return {matches:[],reason:'not_prepared',reference:ref,source:'offline'};
  const candidateKey=candidates.map(c=>String(c?.id||'')+'='+String(c?.text||'')).join('|'),key=[ref.toLowerCase().replace(/\s+/g,' ').trim(),selection?.currentBookId||'',selection?.currentBook||'',normalizeHebrew(word),candidateKey].join('|');
  const cached=cache.get(key);if(cached&&cached.expires>Date.now())return cached.value;
  try{
   const local=await root.SefariaOfflineTranslation?.getPassage?.(ref,selection);if(!local?.text)return {matches:[],reason:local?.reason||'translation_unavailable'};
   const passage=normalizeHebrew(local.text),matches=[];
   for(const candidate of candidates){const matched=candidatePhrases(candidate.text).map(phrase=>({candidatePhrase:phrase,passagePhrase:findPhraseMatch(phrase,passage)})).find(x=>x.passagePhrase);if(matched)matches.push({id:String(candidate.id),matchedPhrase:matched.passagePhrase,candidatePhrase:matched.candidatePhrase,matchType:'exact'});}
   const value={matches,reason:matches.length?'dictionary_meaning_found_in_translation':'no_dictionary_meaning_found',reference:ref,canonicalReference:local.dafReference||ref,versionTitle:local.versionTitle||TRANSLATION_VERSION,license:local.license||'CC-BY-NC',scope:local.scope||'daf',source:'offline'};
   cache.set(key,{value,expires:Date.now()+CACHE_TTL});while(cache.size>MAX_CACHE)cache.delete(cache.keys().next().value);return value;
  }catch{return {matches:[],reason:'translation_unavailable'};}
 }
 function bestContextualMatch(evidence){
  if(evidence?.scope!=='paragraph'||!Array.isArray(evidence.matches)||!evidence.matches.length)return null;
  const score=m=>{const words=String(m.candidatePhrase||'').split(' ').filter(Boolean),content=words.filter(w=>!STOP.has(w));return content.length*100+words.length*10+String(m.candidatePhrase||'').length;};
  const high=Math.max(...evidence.matches.map(score)),winners=new Map();for(const m of evidence.matches)if(score(m)===high&&!winners.has(String(m.id)))winners.set(String(m.id),m);
  return winners.size===1?[...winners.values()][0]:null;
 }
 function clearCache(){cache.clear();}
 root.SefariaEvidence={compareTranslation,clearCache,normalizeHebrew,bestContextualMatch};
 if(typeof module!=='undefined'&&module.exports)module.exports=root.SefariaEvidence;
})(typeof window==='undefined'?globalThis:window);
