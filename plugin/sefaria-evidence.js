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

 function stripMarks(value){return String(value||'').normalize('NFKD').replace(/\p{M}/gu,'');}
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
    let stem=word.slice(0,-suffix.length),doubled=false;
    if(stem.length>2&&stem.at(-1)===stem.at(-2)){stem=stem.slice(0,-1);doubled=true;}
    forms.add(stem);
    if(!doubled&&/[bcdfghjklmnpqrstvwxyz]$/.test(stem))forms.add(stem+'e');
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
  // Dictionary glosses commonly use infinitive/article framing that English
  // translations omit ("to say" -> "said", "the land" -> "land").
  // Try this narrowly reviewed leading-word normalization only after the
  // complete phrase, and never reduce a phrase to a stop word.
  let start=0;
  while(start<original.length-1&&['to','a','an','the'].includes(original[start]))start++;
  if(start)variants.push(original.slice(start));
  const haystack=text.split(' ');
  for(const words of variants){
   if(words.length===1&&(STOP_WORDS.has(words[0])||words[0].length<3))continue;
   for(let i=0;i+words.length<=haystack.length;i++){
    if(words.every((word,j)=>tokenMatch(word,haystack[i+j])))return haystack.slice(i,i+words.length).join(' ');
   }
  }
  return null;
 }
 async function translationReference(selection){
  const s=selection||{},ranges=[s.sourceRange,s.renderedRange,s.sections?.[0]?.sourceRange,s.sections?.[0]?.renderedRange];
  for(const range of ranges)for(const value of [range?.ref,range?.currentRef,range?.reference]){
   if(typeof value==='string'&&value.trim())return value.trim();
  }
  for(const value of [s.currentRef,s.currentTitle,s.reference]){
   if(typeof value==='string'&&value.trim())return value.trim();
  }
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
  const key=[ref.toLowerCase().replace(/\s+/g,' ').trim(),selection?.currentBookId||'',selection?.currentBook||'',stripMarks(word),candidateKey].join('|');
  const cached=translationCache.get(key);
  if(cached&&cached.expires>Date.now())return cached.value;
  try{
   const local=await root.SefariaOfflineTranslation?.getPassage?.(ref,selection);
   if(!local?.text)return {matches:[],reason:local?.reason||'translation_unavailable'};
   const passage=normalizeEnglish(local.text),matches=[];
   for(const candidate of candidates){
    const possible=candidatePhrases(candidate.text).map(phrase=>{
     const passagePhrase=findPhraseMatch(phrase,passage);
     if(!passagePhrase)return null;
     return {candidatePhrase:phrase,passagePhrase,
      matchType:phrase===passagePhrase?'exact':phrase.includes(' ')?'inflected_phrase':'inflected_word'};
    }).filter(Boolean).sort((a,b)=>scoreMatch(b)-scoreMatch(a));
    const matched=possible[0];
    if(matched)matches.push({id:String(candidate.id),matchedPhrase:matched.passagePhrase,
     candidatePhrase:matched.candidatePhrase,matchType:matched.matchType});
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
  const base=match?.matchType==='exact'?30:match?.matchType==='inflected_phrase'?20:match?.matchType==='inflected_word'?10:0;
  const phrase=normalizeEnglish(match?.candidatePhrase||'').split(' ').filter(Boolean);
  const content=phrase.filter(token=>!STOP_WORDS.has(token));
  return base+Math.min(content.length,8)*12+Math.min(phrase.length,8);
 }
 function bestMatch(matches){
  const ranked=(Array.isArray(matches)?matches:[]).map(match=>({match,score:scoreMatch(match)})).filter(item=>item.score>0).sort((a,b)=>b.score-a.score);
  if(!ranked.length||ranked.length>1&&ranked[0].score===ranked[1].score)return null;
  return ranked[0].match;
 }
 function clearCache(){translationCache.clear();}
 root.SefariaEvidence={compareTranslation,clearCache,normalizeEnglish,scoreMatch,bestMatch};
 if(typeof module!=='undefined'&&module.exports)module.exports=root.SefariaEvidence;
})(typeof window==='undefined'?globalThis:window);
