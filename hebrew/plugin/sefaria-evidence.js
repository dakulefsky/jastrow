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
 function localHeadword(entry){return entry?.h||entry?.word||entry?.headword||'';}
 function localId(entry){
  if(entry?.rid)return 'krupnik:'+entry.rid;
  if(entry?.source==='krupnik')return 'krupnik:'+(entry.r||entry.id||'');
  return entry?.r?'jastrow:'+entry.r:'';
 }
 function empty(reason){return {entryIds:[],reference:null,reason:reason||'unavailable'};}
 async function permitted(){
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
  const canonical=typeof data?.ref==='string'&&data.ref.trim()?data.ref.trim():
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
  let associatedHeadwords;
  if(cached&&cached.expires>Date.now())associatedHeadwords=cached.headwords;
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
    cache.set(cacheKey,{headwords:associatedHeadwords,expires:Date.now()+CACHE_TTL});
    while(cache.size>MAX_CACHE)cache.delete(cache.keys().next().value);
   }catch{return empty('request_failed');}
  }
  if(!associatedHeadwords.length)return {entryIds:[],reference:ref,canonicalReference:null,reason:'no_passage_association'};
  const wanted=new Set(associatedHeadwords),matched=[];
  for(const entry of entries){
   const headword=normalizeHeadword(localHeadword(entry)),id=localId(entry);
   if(id&&headword&&wanted.has(headword))matched.push(id);
  }
  return {entryIds:[...new Set(matched)],reference:ref,canonicalReference:null,headwords:associatedHeadwords,
   reason:matched.length?'passage_association':'no_local_headword_match'};
 }
 async function reorder(word,entries,selection){
  const evidence=await lookup(word,entries,selection);
  if(!evidence.entryIds.length)return {...evidence,entries};
  const preferred=new Set(evidence.entryIds);
  return {...evidence,entries:[...entries.filter(entry=>preferred.has(localId(entry))),...entries.filter(entry=>!preferred.has(localId(entry)))]};
 }
 function clearCache(){cache.clear();refCache.clear();}
 root.SefariaEvidence={lookup,reorder,normalizeHeadword,normalizeRef,clearCache};
 if(typeof module!=='undefined'&&module.exports)module.exports=root.SefariaEvidence;
})(typeof window==='undefined'?globalThis:window);
