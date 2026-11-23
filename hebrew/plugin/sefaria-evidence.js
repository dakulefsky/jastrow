(function(root){
 'use strict';
 const TRANSLATION_VERSION='William Davidson Edition - Hebrew';
 const CACHE_TTL=30*60*1000,MAX_CACHE=160,cache=new Map();
 const FINAL={'ך':'כ','ם':'מ','ן':'נ','ף':'פ','ץ':'צ'};
 const STOP=new Set('של את על אל עם אם או גם כי לא כן הוא היא הם הן אני אתה אתם אנחנו אשר זה זאת אלה אלו כל מן בין תוך עבור אחרי לפני כאשר'.split(' ').map(word=>word.replace(/[ךםןףץ]/g,ch=>FINAL[ch])));
 function normalizeHebrew(value){
  return String(value||'').replace(/<[^>]*>/g,' ').replace(/&nbsp;/gi,' ').normalize('NFKD')
   .replace(/\p{M}/gu,'').replace(/[ךםןףץ]/g,ch=>FINAL[ch])
   .replace(/[^\u05d0-\u05ea]+/g,' ').replace(/\s+/g,' ').trim();
 }
 function candidatePhrases(value){return [...new Set(String(value||'').split(/[;,،/|\n]+/).map(normalizeHebrew).filter(Boolean))];}
 const PREFIXES=['ו','ב','כ','ל','מ','ד','ה','ש','וב','וכ','ול','ומ','וד','וה','וש','כש','שה'];
 const SUFFIXES=['יהון','תיהון','יהי','תיהי','יהו','תיהו','תין','תון','נון','יהם','יהן','יכם','יכן','ינו','יה','יו','ין','ון','נן','ים','יות','ות'].map(value=>value.replace(/[ךםןףץ]/g,ch=>FINAL[ch]));
 function tokenForms(word){
  const forms=new Set([word]);
  for(const prefix of PREFIXES)if(word.startsWith(prefix)&&word.length-prefix.length>=3)forms.add(word.slice(prefix.length));
  for(const suffix of SUFFIXES)if(word.endsWith(suffix)&&word.length-suffix.length>=3)forms.add(word.slice(0,-suffix.length));
  for(const prefix of PREFIXES)if(word.startsWith(prefix))for(const suffix of SUFFIXES)
   if(word.length-prefix.length-suffix.length>=3&&word.endsWith(suffix))forms.add(word.slice(prefix.length,-suffix.length));
  return forms;
 }
 function findPhraseMatch(phrase,text){
  if(!phrase||!text)return null;
  const words=phrase.split(' '),haystack=text.split(' ');
  if(words.length===1&&(STOP.has(words[0])||words[0].length<2))return null;
  for(let i=0;i+words.length<=haystack.length;i++)
   if(words.every((word,j)=>word===haystack[i+j]))return {phrase:haystack.slice(i,i+words.length).join(' '),type:'exact'};
  const content=words.filter(word=>!STOP.has(word)&&word.length>=2);
  if(content.length<2)return null;
  for(let i=0;i+words.length<=haystack.length;i++){
   let changed=false,valid=true;
   for(let j=0;j<words.length;j++){
    if(words[j]===haystack[i+j])continue;
    const forms=tokenForms(haystack[i+j]);
    if(!forms.has(words[j])){valid=false;break;}
    changed=true;
   }
   if(valid&&changed)return {phrase:haystack.slice(i,i+words.length).join(' '),type:'inflected_phrase'};
  }
  return null;
 }
 function passageStats(text){
  const tokens=normalizeHebrew(text).split(' ').filter(Boolean),frequencies=new Map();
  for(const token of tokens)frequencies.set(token,(frequencies.get(token)||0)+1);
  return {tokens,frequencies};
 }
 function assessPhrase(phrase,match,stats){
  const words=normalizeHebrew(phrase).split(' ').filter(Boolean);
  const content=words.map((word,index)=>({word,index})).filter(item=>!STOP.has(item.word)&&item.word.length>=2);
  const matched=normalizeHebrew(match.phrase).split(' ').filter(Boolean);
  const frequencies=content.map(item=>stats.frequencies.get(matched[item.index]||item.word)||stats.frequencies.get(item.word)||0);
  // A single short/common Hebrew token is weak evidence; accept it only when
  // it is a longer lexical item occurring exactly once in the selected paragraph.
  const eligible=content.length>=2||(content.length===1&&content[0].word.length>=4&&frequencies[0]===1);
  const rarity=content.reduce((sum,word,index)=>{
   const frequency=Math.max(1,frequencies[index]||0);
   return sum+Math.log2((stats.tokens.length+1)/(frequency+1));
  },0);
  const score=eligible?(match.type==='exact'?30:20)+content.length*20+
   Math.min(rarity,18)*4+Math.min(words.length,8):0;
  return {score,eligible,contentWordCount:content.length,rarity:Number(rarity.toFixed(3))};
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
   const passage=normalizeHebrew(local.text),stats=passageStats(passage),matches=[];
   for(const candidate of candidates){
    const possible=candidatePhrases(candidate.text).map(phrase=>{
     const found=findPhraseMatch(phrase,passage);if(!found)return null;
     const assessment=assessPhrase(phrase,found,stats);if(!assessment)return null;
     return {phrase,match:found,...assessment};
    }).filter(Boolean).sort((a,b)=>b.score-a.score);
    const matched=possible[0];
    if(matched)matches.push({id:String(candidate.id),matchedPhrase:matched.match.phrase,
     candidatePhrase:matched.phrase,matchType:matched.match.type,
     evidenceScore:matched.score,contentWordCount:matched.contentWordCount,rarity:matched.rarity});
   }
   const value={matches,reason:matches.length?'dictionary_meaning_found_in_translation':'no_dictionary_meaning_found',
    reference:ref,canonicalReference:local.dafReference||ref,versionTitle:local.versionTitle||TRANSLATION_VERSION,
    license:local.license||'CC-BY-NC',scope:local.scope||'daf',source:'offline'};
   cache.set(key,{value,expires:Date.now()+CACHE_TTL});while(cache.size>MAX_CACHE)cache.delete(cache.keys().next().value);return value;
  }catch{return {matches:[],reason:'translation_unavailable'};}
 }
 function matchScore(match,phrase){
  const normalized=normalizeHebrew(phrase),words=normalized.split(' ').filter(Boolean);
  if(!normalized)return match?.type==='exact'?30:match?.type==='inflected_phrase'?20:match?.type==='inflected_word'?10:0;
  const content=words.filter(word=>!STOP.has(word)&&word.length>=2);
  if(content.length<2&&!(content.length===1&&content[0].length>=4))return 0;
  return (match?.type==='exact'?30:20)+content.length*20+words.length;
 }
 function bestContextualMatch(evidence){
  if(evidence?.scope!=='paragraph'||!Array.isArray(evidence.matches)||!evidence.matches.length)return null;
  const byMeaning=new Map();
  for(const match of evidence.matches){
   const score=Number.isFinite(match.evidenceScore)?match.evidenceScore:matchScore({type:match.matchType},match.candidatePhrase);
   if(score<=0)continue;
   const id=String(match.id);
   if(!byMeaning.has(id)||score>byMeaning.get(id).score)byMeaning.set(id,{match,score});
  }
  const ranked=[...byMeaning.values()].sort((a,b)=>b.score-a.score);
  if(!ranked.length)return null;
  if(ranked.length>1&&ranked[0].score-ranked[1].score<Math.max(10,ranked[0].score*0.18))return null;
  return ranked[0].match;
 }
 function clearCache(){cache.clear();}
 root.SefariaEvidence={compareTranslation,clearCache,normalizeHebrew,candidatePhrases,findPhraseMatch,bestContextualMatch,tokenForms};
 if(typeof module!=='undefined'&&module.exports)module.exports=root.SefariaEvidence;
})(typeof window==='undefined'?globalThis:window);
