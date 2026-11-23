(function(root){
 'use strict';
 const TRANSLATION_VERSION='William Davidson Edition - English';
 const CACHE_TTL=30*60*1000,MAX_CACHE=160;
 const translationCache=new Map();
 const IRREGULAR={
  am:'be',is:'be',are:'be',was:'be',were:'be',been:'be',being:'be',
  has:'have',had:'have',does:'do',did:'do',done:'do',
  said:'say',says:'say',went:'go',gone:'go',made:'make',makes:'make',
  took:'take',taken:'take',takes:'take',came:'come',comes:'come',
  saw:'see',seen:'see',gave:'give',given:'give',got:'get',
  ran:'run',written:'write',wrote:'write',thought:'think',
  brought:'bring',bought:'buy',taught:'teach',caught:'catch',
  kept:'keep',left:'leave',felt:'feel',found:'find',held:'hold',
  told:'tell',sold:'sell',spoke:'speak',spoken:'speak',
  ate:'eat',eaten:'eat',drank:'drink',drunk:'drink',
  sat:'sit',stood:'stand',understood:'understand',paid:'pay',
  children:'child',men:'man',women:'woman',people:'person',
  feet:'foot',teeth:'tooth',mice:'mouse'
 };
 const STOP_WORDS=new Set(('a an the and or of to in on at by for from with without as is are was were be been being do does did have has had it its this that these those he she they we you I his her their our your who which what when where how very more most some any all each every other same such into onto over under up down out off not no yes can could may might must shall should will would').toLowerCase().split(/\s+/));
 function normalizeEnglish(value){
  return String(value||'').replace(/<[^>]*>/g,' ').replace(/&amp;/gi,' and ')
   .replace(/&nbsp;/gi,' ').replace(/&#39;|&apos;/gi,"'")
   .normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase()
   .replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
 }
 function candidatePhrases(value){
  return [...new Set(String(value||'').split(/[;,/|]+/).map(normalizeEnglish).filter(Boolean))];
 }
 function tokenForms(word){
  const forms=new Set([word]);
  if(IRREGULAR[word])forms.add(IRREGULAR[word]);
  for(const suffix of ['ing','ed']){
   if(word.endsWith(suffix)&&word.length>suffix.length+2){
    let stem=word.slice(0,-suffix.length);
    if(stem.length>2&&stem.at(-1)===stem.at(-2))stem=stem.slice(0,-1);
    forms.add(stem);
    if(/[bcdfghjklmnpqrstvwxyz]$/.test(stem))forms.add(stem+'e');
   }
  }
  if(word.endsWith('ies')&&word.length>4)forms.add(word.slice(0,-3)+'y');
  if(word.endsWith('es')&&word.length>4&&/(s|x|z|ch|sh)es$/.test(word))forms.add(word.slice(0,-2));
  if(word.endsWith('s')&&!/(ss|us|is)$/.test(word)&&word.length>3)forms.add(word.slice(0,-1));
  return forms;
 }
 function tokenMatch(a,b){
  const left=tokenForms(a),right=tokenForms(b);
  return [...left].some(value=>right.has(value));
 }
 function findPhraseMatch(phrase,text){
  if(!phrase||!text)return null;
  const original=phrase.split(' '),variants=[original];
  // Drop only a leading article/infinitive marker; preserve every content word
  // and its order so a broad bag-of-words coincidence cannot count as a phrase.
  let start=0;
  while(start<original.length-1&&['to','a','an','the'].includes(original[start]))start++;
  if(start)variants.push(original.slice(start));
  const haystack=text.split(' ');
  for(const words of variants){
   if(words.length===1&&(STOP_WORDS.has(words[0])||words[0].length<3))continue;
   for(let i=0;i+words.length<=haystack.length;i++){
    if(words.every((word,j)=>tokenMatch(word,haystack[i+j])))
     return {phrase:haystack.slice(i,i+words.length).join(' '),type:words.every((word,j)=>word===haystack[i+j])?'exact':words.length===1?'inflected_word':'inflected_phrase'};
   }
  }
  return null;
 }
 function passageStats(text){
  const tokens=normalizeEnglish(text).split(' ').filter(Boolean),frequencies=new Map();
  for(const token of tokens)frequencies.set(token,(frequencies.get(token)||0)+1);
  return {tokens,frequencies};
 }
 function assessPhrase(phrase,match,stats){
  const words=normalizeEnglish(phrase).split(' ').filter(Boolean);
  const content=words.map((word,index)=>({word,index})).filter(item=>!STOP_WORDS.has(item.word)&&item.word.length>=3);
  const matched=normalizeEnglish(match.phrase).split(' ').filter(Boolean);
  const frequencies=content.map(item=>{
   const actual=matched[item.index]||item.word;
   return stats.frequencies.get(actual)||stats.frequencies.get(item.word)||0;
  });
  // One generic word is not enough. A lone long, rare word may count, but
  // multiword meanings need at least two content words in the same sequence.
  if(content.length<2&&!(content.length===1&&content[0].word.length>=6&&frequencies[0]===1))return null;
  const rarity=content.reduce((sum,word,index)=>{
   const frequency=Math.max(1,frequencies[index]||0);
   return sum+Math.log2((stats.tokens.length+1)/(frequency+1));
  },0);
  const score=(match.type==='exact'?30:20)+content.length*18+
   Math.min(rarity,18)*3+Math.min(words.length,8);
  return {score,contentWordCount:content.length,rarity:Number(rarity.toFixed(3))};
 }
 async function translationReference(selection){
  const s=selection||{},ranges=[s.sourceRange,s.renderedRange,s.sections?.[0]?.sourceRange,s.sections?.[0]?.renderedRange];
  for(const range of ranges)for(const value of [range?.ref,range?.currentRef,range?.reference])
   if(typeof value==='string'&&value.trim())return value.trim();
  for(const value of [s.currentRef,s.currentTitle,s.reference])
   if(typeof value==='string'&&value.trim())return value.trim();
  try{
   const result=await root.Otzaria?.call?.('reader.getCurrentRef');
   if(result?.success){const value=result.data?.currentRef||result.data?.currentTitle;if(typeof value==='string'&&value.trim())return value.trim();}
  }catch{}
  return '';
 }
 async function compareTranslation(word,candidates,selection,options){
  if(!Array.isArray(candidates)||!candidates.length)return {matches:[],reason:'no_candidates'};
  const ref=await translationReference(selection);
  if(!ref)return {matches:[],reason:'no_reference'};
  if(options?.preparedOnly&&!root.SefariaOfflineTranslation?.isDafPrepared?.(ref,selection))
   return {matches:[],reason:'not_prepared',reference:ref,source:'offline'};
  const candidateKey=candidates.map(candidate=>String(candidate?.id||'')+'='+String(candidate?.text||'')).join('|');
  const key=[ref.toLowerCase().replace(/\s+/g,' ').trim(),selection?.currentBookId||'',selection?.currentBook||'',String(word||''),candidateKey].join('|');
  const cached=translationCache.get(key);
  if(cached&&cached.expires>Date.now())return cached.value;
  try{
   const local=await root.SefariaOfflineTranslation?.getPassage?.(ref,selection);
   if(!local?.text)return {matches:[],reason:local?.reason||'translation_unavailable'};
   const passage=normalizeEnglish(local.text),stats=passageStats(passage),matches=[];
   for(const candidate of candidates){
    const possible=candidatePhrases(candidate.text).map(phrase=>{
     const found=findPhraseMatch(phrase,passage);if(!found)return null;
     const assessment=assessPhrase(phrase,found,stats);if(!assessment)return null;
     return {candidatePhrase:phrase,passagePhrase:found.phrase,matchType:found.type,...assessment};
    }).filter(Boolean).sort((a,b)=>b.score-a.score);
    const matched=possible[0];
    if(matched)matches.push({id:String(candidate.id),matchedPhrase:matched.passagePhrase,
     candidatePhrase:matched.candidatePhrase,matchType:matched.matchType,
     evidenceScore:matched.score,contentWordCount:matched.contentWordCount,rarity:matched.rarity});
   }
   const value={matches,reason:matches.length?'candidate_wording_found':'no_candidate_wording_found',
    reference:ref,canonicalReference:local.dafReference||ref,versionTitle:local.versionTitle||TRANSLATION_VERSION,
    license:local.license||'CC-BY-NC',scope:local.scope||'daf',source:'offline'};
   translationCache.set(key,{value,expires:Date.now()+CACHE_TTL});
   while(translationCache.size>MAX_CACHE)translationCache.delete(translationCache.keys().next().value);
   return value;
  }catch{return {matches:[],reason:'translation_unavailable'};}
 }
 function scoreMatch(match){
  if(Number.isFinite(match?.evidenceScore))return match.evidenceScore;
  const phrase=normalizeEnglish(match?.candidatePhrase||''),words=phrase.split(' ').filter(Boolean);
  const content=words.filter(token=>!STOP_WORDS.has(token)&&token.length>=3);
  if(content.length<2&&!(content.length===1&&content[0].length>=6))return 0;
  const base=match?.matchType==='exact'?30:match?.matchType==='inflected_phrase'?20:match?.matchType==='inflected_word'?20:0;
  return base+content.length*18+words.length;
 }
 function bestMatch(matches,scope){
  if(scope!=='paragraph')return null;
  const ranked=(Array.isArray(matches)?matches:[]).map(match=>({match,score:scoreMatch(match)}))
   .filter(item=>item.score>0).sort((a,b)=>b.score-a.score);
  if(!ranked.length)return null;
  // If two meanings have comparable evidence, leave the result unmarked.
  if(ranked.length>1&&ranked[0].score-ranked[1].score<Math.max(8,ranked[0].score*0.18))return null;
  return ranked[0].match;
 }
 function clearCache(){translationCache.clear();}
 root.SefariaEvidence={compareTranslation,clearCache,normalizeEnglish,scoreMatch,bestMatch,findPhraseMatch};
 if(typeof module!=='undefined'&&module.exports)module.exports=root.SefariaEvidence;
})(typeof window==='undefined'?globalThis:window);
