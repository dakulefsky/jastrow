(function(root){
 'use strict';
 const DATA_ROOT='data/sefaria-bavli/';
 const MAX_CACHED_TRACTATES=3;
 let manifestPromise=null;
 const tractateCache=new Map();

 function normalizeName(value){
  return String(value||'').normalize('NFKD').replace(/\p{M}/gu,'')
   .replace(/[’'״״׳]/g,'').replace(/[^\u05d0-\u05eaA-Za-z0-9]+/g,' ')
   .replace(/\s+/g,' ').trim().toLowerCase();
 }
 function parseReference(value){
  const ref=String(value||'').trim();
  const match=ref.match(/^(.*?)\s+(\d+)([ab])(?::(\d+)(?::.*)?)?$/i);
  if(!match)return null;
  const daf=Number(match[2]),side=match[3].toLowerCase();
  if(!Number.isInteger(daf)||daf<1)return null;
  return {ref,book:match[1].trim(),daf,side,line:match[4]?Number(match[4]):null,
   dafIndex:2*daf-2+(side==='b'?1:0)};
 }
 async function fetchJson(path){
  const response=await root.fetch(DATA_ROOT+path,{headers:{Accept:'application/json'}});
  if(!response?.ok)throw Error('Offline translation file unavailable: '+path);
  return response.json();
 }
 async function getManifest(){
  if(!manifestPromise){
   manifestPromise=fetchJson('manifest.json').then(data=>{
    if(data?.formatVersion!==1||!Array.isArray(data.tractates))throw Error('Unsupported offline translation manifest');
    return data;
   }).catch(error=>{manifestPromise=null;throw error;});
  }
  return manifestPromise;
 }
 async function loadTractate(meta){
  const key=meta.slug||meta.title;
  if(tractateCache.has(key)){
   const value=tractateCache.get(key);tractateCache.delete(key);tractateCache.set(key,value);return value;
  }
  const data=await fetchJson(meta.file||('texts/'+key+'.json'));
  if(!Array.isArray(data?.text))throw Error('Offline translation has no daf structure: '+meta.title);
  tractateCache.set(key,data);
  while(tractateCache.size>MAX_CACHED_TRACTATES)tractateCache.delete(tractateCache.keys().next().value);
  return data;
 }
 async function getPassage(reference,selection){
  const parsed=parseReference(reference||selection?.sourceRange?.ref||selection?.currentRef);
  if(!parsed)return {text:'',reason:'unsupported_reference'};
  const manifest=await getManifest();
  const bookKey=normalizeName(parsed.book),currentBookKey=normalizeName(selection?.currentBook);
  const meta=manifest.tractates.find(item=>{
   const names=[item.title,item.heTitle,item.slug].map(normalizeName);
   return names.includes(bookKey)||(currentBookKey&&names.includes(currentBookKey));
  });
  if(!meta)return {text:'',reason:'tractate_not_in_offline_corpus',reference:parsed.ref};
  const data=await loadTractate(meta);
  const daf=data.text[parsed.dafIndex];
  if(!Array.isArray(daf)&&typeof daf!=='string')return {text:'',reason:'daf_not_found',reference:parsed.ref};
  if(parsed.line!==null&&Array.isArray(daf)){
   const paragraph=daf[parsed.line-1];
   if(typeof paragraph==='string'&&paragraph.trim())return {
    text:paragraph,scope:'paragraph',reference:parsed.ref,
    dafReference:meta.title+' '+parsed.daf+parsed.side,tractate:meta.title,
    versionTitle:manifest.edition,license:'CC-BY-NC',source:'offline'
   };
  }
  const paragraphs=(Array.isArray(daf)?daf:[daf]).filter(value=>typeof value==='string'&&value.trim());
  if(!paragraphs.length)return {text:'',reason:'empty_daf',reference:parsed.ref};
  return {
   text:paragraphs.join(' '),scope:'daf',reference:parsed.ref,
   dafReference:meta.title+' '+parsed.daf+parsed.side,tractate:meta.title,
   versionTitle:manifest.edition,license:'CC-BY-NC',source:'offline'
  };
 }
 async function prepareDaf(location){
  return getPassage(location?.currentRef,location);
 }
 function clearCache(){manifestPromise=null;tractateCache.clear();}
 root.SefariaOfflineTranslation={prepareDaf,getPassage,parseReference,clearCache};
 if(typeof module!=='undefined'&&module.exports)module.exports=root.SefariaOfflineTranslation;
})(typeof window==='undefined'?globalThis:window);
