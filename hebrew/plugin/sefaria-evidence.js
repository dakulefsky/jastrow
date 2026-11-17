(function(root){
 'use strict';
 const BASE='https://www.sefaria.org';
 const CACHE_TTL=6*60*60*1000, MAX_CACHE=256, TIMEOUT=2400;
 const cache=new Map(), refCache=new Map();
 let permissionState=null, permissionCheckedAt=0;

 function stripMarks(value){
  return String(value||'').normalize('NFKD').replace(/\p{M}/gu,'');
 }
 function normalizeHeadword(value){
  return stripMarks(value).replace(/[ךםןףץ]/g,ch=>({ך:'כ',ם:'מ',ן:'נ',ף:'פ',ץ:'צ'})[ch])
   .replace(/^\s*\*/,'').replace(/[^\u05d0-\u05eaA-Za-z0-9 ]/g,' ')
   .replace(/\s+/g,' ').trim().toUpperCase();
 }
 function normalizeRef(value){
  return stripMarks(value).replace(/\s+/g,' ').trim().toLowerCase();
 }
 function localHeadwords(entry){return [entry?.h||entry?.word||entry?.headword||'',...(Array.isArray(entry?.alt)?entry.alt:[])].map(normalizeHeadword).filter(Boolean);}
 function localId(entry){
  if(entry?.rid)return 'krupnik:'+entry.rid;
  if(entry?.source==='krupnik')return 'krupnik:'+(entry.r||entry.id||'');
  return entry?.r?'jastrow:'+entry.r:'';
 }
 function empty(reason){return {entryIds:[],reference:null,reason:reason||'unavailable'};}
 async function permitted(){
  if(root.navigator?.onLine===false)return false;
  try{
   const connectivity=await root.Otzaria?.call?.('app.getConnectivity',{});
   if(connectivity?.success&&connectivity.data&&(connectivity.data.isOfflineMode===true||connectivity.data.isOnline===false))return false;
  }catch{}
  const now=Date.now();
  if(permissionState!==null&&now-permissionCheckedAt<30000)return permissionState;
  permissionCheckedAt=now;
  try{
   const result=await root.Otzaria?.call?.('app.getGrantedPermissions',{});
   permissionState=!!(result?.success===true&&Array.isArray(result.data?.permissions)&&result.data.permissions.includes('network.access'));
  }catch{permissionState=false;}
  return permissionState;
 }
 async function request(url){
  const controller=typeof root.AbortController==='function'?new root.AbortController():null;
  let timer=null;
  try{
   if(controller&&typeof root.setTimeout==='function')timer=root.setTimeout(()=>controller.abort(),TIMEOUT);
   const response=await root.fetch(url,{headers:{Accept:'application/json'},...(controller?{signal:controller.signal}:{})});
   if(!response.ok)throw Error('Sefaria request failed: '+response.status);
   return await response.json();
  }finally{if(timer!==null)root.clearTimeout(timer);}
 }
 async function resolveReference(ref){
  const key=normalizeRef(ref),cached=refCache.get(key);
  if(cached&&cached.expires>Date.now())return cached.value;
  const data=await request(BASE+'/api/ref/'+encodeURIComponent(ref));
  if(data?.is_ref===false)return null;
  const canonical=typeof data?.normalized==='string'&&data.normalized.trim()?data.normalized.trim():
   typeof data?.url_ref==='string'&&data.url_ref.trim()?data.url_ref.trim():
   typeof data?.ref==='string'&&data.ref.trim()?data.ref.trim():
   typeof data?.tref==='string'&&data.tref.trim()?data.tref.trim():
   typeof data?.heRef==='string'&&data.heRef.trim()?data.heRef.trim():ref;
  refCache.set(key,{value:canonical,expires:Date.now()+CACHE_TTL});
  return canonical;
 }
 async function currentReference(selection){
  const s=selection||{};
  for(const value of [s.currentRef,s.ref,s.reference,s.sourceRange?.ref,s.sections?.[0]?.currentRef]){
   if(typeof value==='string'&&value.trim())return value.trim();
  }
  try{
   const result=await root.Otzaria?.call?.('reader.getCurrentRef',{});
   if(result?.success&&typeof result.data?.currentRef==='string'&&result.data.currentRef.trim())return result.data.currentRef.trim();
  }catch{}
  return '';
 }
 async function lookup(word,entries,selection){
  if(typeof word!=='string'||!word.trim()||/\s/.test(word.trim())||!Array.isArray(entries)||!entries.length)return empty('invalid_input');
  if(!(await permitted()))return empty('permission');
  const ref=await currentReference(selection);
  if(!ref)return empty('no_reference');
  const cacheKey=normalizeRef(ref)+'|'+stripMarks(word).replace(/\s+/g,'');
  const cached=cache.get(cacheKey);
  let associatedHeadwords,canonicalReference;
  if(cached&&cached.expires>Date.now()){associatedHeadwords=cached.headwords;canonicalReference=cached.canonicalReference;}
  else{
   try{
    const canonicalRef=await resolveReference(ref);
    if(!canonicalRef)return empty('invalid_reference');
    const params=new URLSearchParams({always_consonants:'1',never_split:'1',lookup_ref:canonicalRef});
    const data=await request(BASE+'/api/words/'+encodeURIComponent(word)+'?'+params.toString());
    if(!Array.isArray(data))return empty('invalid_response');
    associatedHeadwords=data.filter(item=>item&&item.parent_lexicon==='Jastrow Dictionary'&&
      Array.isArray(item.refs)&&item.refs.some(itemRef=>normalizeRef(itemRef)===normalizeRef(canonicalRef)))
      .map(item=>normalizeHeadword(item.headword)).filter(Boolean);
    associatedHeadwords=[...new Set(associatedHeadwords)];
    canonicalReference=canonicalRef;
    cache.set(cacheKey,{headwords:associatedHeadwords,canonicalReference,expires:Date.now()+CACHE_TTL});
    while(cache.size>MAX_CACHE)cache.delete(cache.keys().next().value);
   }catch{return empty('request_failed');}
  }
  if(!associatedHeadwords.length)return {entryIds:[],reference:ref,canonicalReference,reason:'no_passage_association'};
  const wanted=new Set(associatedHeadwords),matched=[];
  for(const entry of entries){
   const headwords=localHeadwords(entry),id=localId(entry);
   if(id&&headwords.some(headword=>wanted.has(headword)))matched.push(id);
  }
  return {entryIds:[...new Set(matched)],reference:ref,canonicalReference,headwords:associatedHeadwords,
   reason:matched.length?'passage_association':'no_local_headword_match'};
 }
 async function reorder(word,entries,selection){
  const evidence=await lookup(word,entries,selection);
  if(!evidence.entryIds.length)return {...evidence,entries};
  const preferred=new Set(evidence.entryIds);
  return {...evidence,entries:[...entries.filter(entry=>preferred.has(localId(entry))),...entries.filter(entry=>!preferred.has(localId(entry)))]};
 }

 const TRANSLATION_VERSION='William Davidson Edition - English';
 const translationCache=new Map();
 function normalizeEnglish(value){
  return String(value||'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase()
   .replace(/&amp;/g,' and ').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
 }
 function candidatePhrases(value){
  return String(value||'').split(/[;,/|]+/).map(normalizeEnglish).filter(Boolean)
   .flatMap(part=>part.split(/\s+(?:or|and)\s+/).map(x=>x.trim()).filter(Boolean));
 }
 function phraseInText(phrase,text){
  if(!phrase||!text)return false;
  const words=phrase.split(' '),haystack=text.split(' ');
  if(words.length===1&&words[0].length<5)return false;
  const variants=[words];
  if(words.length===1&&words[0].length>=5){
   const stem=words[0];
   if(stem.endsWith('y')&&stem.length>5)variants.push([stem.slice(0,-1)+'ies']);
   else if(!stem.endsWith('s'))variants.push([stem+'s']);
  }
  return variants.some(needle=>haystack.some((_,i)=>needle.every((w,j)=>haystack[i+j]===w)));
 }

 function translationReference(selection){
  const s=selection||{},ranges=[s.sourceRange,s.renderedRange,s.sections?.[0]?.sourceRange,s.sections?.[0]?.renderedRange];
  for(const range of ranges)for(const value of [range?.ref,range?.currentRef,range?.reference]){
   if(typeof value==='string'&&value.trim())return value.trim();
  }
  return currentReference(selection);
 }
 async function compareTranslation(word,candidates,selection){
  if(!Array.isArray(candidates)||!candidates.length)return {matches:[],reason:'no_candidates'};
  const ref=await translationReference(selection);if(!ref)return {matches:[],reason:'no_reference'};
  const candidateKey=candidates.map(c=>String(c?.id||'')+'='+String(c?.text||'')).join('|');
  const key=normalizeRef(ref)+'|'+stripMarks(word)+'|'+candidateKey;
  const cached=translationCache.get(key);
  if(cached&&cached.expires>Date.now())return cached.value;
  try{
   // Prefer the complete bundled Bavli. This path is local and works even
   // when network permission is denied or the device is offline.
   let local=null;
   try{local=await root.SefariaOfflineTranslation?.getPassage?.(ref,selection);}catch{}
   if(local?.text){
    const passage=normalizeEnglish(local.text),matches=[];
    for(const candidate of candidates){
     const matched=candidatePhrases(candidate.text).map(phrase=>({candidatePhrase:phrase,passagePhrase:findPhraseMatch(phrase,passage)})).find(item=>item.passagePhrase);
     if(matched)matches.push({id:String(candidate.id),matchedPhrase:matched.passagePhrase,candidatePhrase:matched.candidatePhrase,
      matchType:matched.candidatePhrase===matched.passagePhrase?'exact':matched.candidatePhrase.includes(' ')?'inflected_phrase':'inflected_word'});
    }
    const value={matches,reason:matches.length?'candidate_wording_found':'no_candidate_wording_found',
     reference:ref,canonicalReference:local.dafReference||ref,versionTitle:local.versionTitle||TRANSLATION_VERSION,
     license:local.license||'CC-BY-NC',scope:local.scope||'daf',source:'offline'};
    translationCache.set(key,{value,expires:Date.now()+CACHE_TTL});
    while(translationCache.size>MAX_CACHE)translationCache.delete(translationCache.keys().next().value);
    return value;
   }

   // Retain the existing live fallback for references outside the bundled
   // Bavli or for older installations without the offline corpus.
   if(!(await permitted()))return {matches:[],reason:'permission'};
   const canonical=await resolveReference(ref);if(!canonical)return {matches:[],reason:'invalid_reference'};
   const params=new URLSearchParams({version:'en|'+TRANSLATION_VERSION,return_format:'text_only'});
   const data=await request(BASE+'/api/v3/texts/'+encodeURIComponent(canonical)+'?'+params.toString());
   const versions=Array.isArray(data?.versions)?data.versions:[];
   const version=versions.find(v=>String(v?.versionTitle||'').trim()===TRANSLATION_VERSION);
   if(!version)return {matches:[],reason:'translation_unavailable'};
   const license=String(version.license||'').toUpperCase().replace(/_/g,'-');
   if(!['CC-BY-NC','CC BY-NC'].includes(license))
    return {matches:[],reason:'license_unrecognized',license};
   const paragraphs=[];
   const collect=value=>{if(typeof value==='string')paragraphs.push(normalizeEnglish(value));else if(Array.isArray(value))value.forEach(collect);};
   collect(version.text);
   const passage=paragraphs.filter(Boolean).join(' ');
   if(!passage)return {matches:[],reason:'empty_translation',license};
   const matches=[];
   for(const candidate of candidates){
    const matched=candidatePhrases(candidate.text).map(phrase=>({candidatePhrase:phrase,passagePhrase:findPhraseMatch(phrase,passage)})).find(item=>item.passagePhrase);
    if(matched)matches.push({id:String(candidate.id),matchedPhrase:matched.passagePhrase,candidatePhrase:matched.candidatePhrase,
     matchType:matched.candidatePhrase===matched.passagePhrase?'exact':matched.candidatePhrase.includes(' ')?'inflected_phrase':'inflected_word'});
   }
   const value={matches,reason:matches.length?'candidate_wording_found':'no_candidate_wording_found',
    reference:ref,canonicalReference:canonical,versionTitle:TRANSLATION_VERSION,license,scope:/[:.](\\d+)$/.test(canonical)?'paragraph':'daf',source:'online'};
   translationCache.set(key,{value,expires:Date.now()+CACHE_TTL});
   while(translationCache.size>MAX_CACHE)translationCache.delete(translationCache.keys().next().value);
   return value;
  }catch{return {matches:[],reason:'request_failed'};}
 }

 function clearCache(){cache.clear();refCache.clear();translationCache.clear();}
 try{root.Otzaria?.on?.('plugin.permissions_changed',()=>{permissionState=null;permissionCheckedAt=0;});}catch{}
 root.SefariaEvidence={lookup,reorder,compareTranslation,normalizeHeadword,normalizeRef,clearCache};
 if(typeof module!=='undefined'&&module.exports)module.exports=root.SefariaEvidence;
})(typeof window==='undefined'?globalThis:window);
