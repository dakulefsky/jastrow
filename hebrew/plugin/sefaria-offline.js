(function(root){
 'use strict';
 const DATA_ROOT='data/sefaria-bavli/';
 const MAX_CACHED_TRACTATES=3,MAX_CACHED_DAFS=12;
 let manifestPromise=null,manifestData=null;
 const tractateCache=new Map(),tractatePromises=new Map(),preparedDafCache=new Map();

 function normalizeName(value){
  return String(value||'').normalize('NFKD').replace(/\p{M}/gu,'')
   .replace(/[’'״״׳]/g,'').replace(/[^\u05d0-\u05eaA-Za-z0-9]+/g,' ')
   .replace(/\s+/g,' ').trim().toLowerCase();
 }
 function hebrewNumber(value){
  const values={א:1,ב:2,ג:3,ד:4,ה:5,ו:6,ז:7,ח:8,ט:9,י:10,כ:20,ך:20,ל:30,מ:40,ם:40,נ:50,ן:50,ס:60,ע:70,פ:80,ף:80,צ:90,ץ:90,ק:100,ר:200,ש:300,ת:400};
  return [...String(value||'')].reduce((sum,char)=>sum+(values[char]||0),0);
 }
 function parseReference(value,fallbackBook){
  const ref=String(value||'').trim();
  let match=ref.match(/^(.*?)\s+(\d+)([ab])(?::(\d+)(?::.*)?)?$/i);
  if(match){
   const daf=Number(match[2]),side=match[3].toLowerCase();
   if(Number.isInteger(daf)&&daf>0)return {ref,book:match[1].trim()||String(fallbackBook||''),daf,side,line:match[4]?Number(match[4]):null,
    dafIndex:2*daf-2+(side==='b'?1:0)};
  }
  match=ref.match(/(?:^|[,;\s])(?:(דף)\s*)?([א-ת״׳']{1,5})(?:\s*,?\s*(?:עמוד\s*([אב])|ע[״"׳']?\s*([אב])|([.:]))(?::(\d+)(?::.*)?)?)?$/);
  if(!match)return null;
  const daf=hebrewNumber(match[2]),sideToken=match[3]||match[4]||match[5],marker=match[1];
  if(!Number.isInteger(daf)||daf<1||(!sideToken&&!marker))return null;
  const prefix=ref.slice(0,match.index).replace(/[,;\s]+$/,'').trim();
  const book=prefix||String(fallbackBook||'');
  const side=sideToken?(sideToken==='ב'||sideToken===':'?'b':'a'):null;
  return {ref,book,daf,side,line:match[6]?Number(match[6]):null,
   dafIndex:2*daf-2+(side==='b'?1:0)};
 }
 function loadScript(path){
  return new Promise((resolve,reject)=>{
   const doc=root.document;
   if(!doc?.createElement||!doc.head){reject(Error('Local plugin asset loader is unavailable'));return;}
   const script=doc.createElement('script');
   script.async=true;script.src=DATA_ROOT+path;
   script.onload=()=>{script.remove?.();resolve();};
   script.onerror=()=>{script.remove?.();reject(Error('Offline translation asset unavailable: '+path));};
   doc.head.appendChild(script);
  });
 }
 async function getManifest(){
  if(!manifestPromise){
   manifestPromise=loadScript('manifest.js').then(()=>{
    const data=root.SefariaOfflineTranslationManifest;
    if(data?.formatVersion!==1||data.language!=='Hebrew'||data.edition!=='William Davidson Edition - Hebrew'||!Array.isArray(data.tractates))throw Error('Expected the Hebrew William Davidson / Steinsaltz offline corpus; refusing another language or edition');
    manifestData=data;
    return data;
   }).catch(error=>{manifestPromise=null;throw error;});
  }
  return manifestPromise;
 }
 function findTractate(manifest,parsed,selection){
  const bookKey=normalizeName(parsed.book),currentBookKey=normalizeName(selection?.currentBook),currentBookIdKey=normalizeName(selection?.currentBookId);
  return manifest.tractates.find(item=>{
   const names=[item.title,item.heTitle,item.slug].map(normalizeName).filter(Boolean);
   const matches=name=>name===bookKey||name===currentBookKey||name===currentBookIdKey||
    (bookKey&&bookKey.endsWith(' '+name))||(currentBookKey&&currentBookKey.endsWith(' '+name))||(currentBookIdKey&&currentBookIdKey.endsWith(' '+name));
   return names.some(matches);
  });
 }
 async function loadTractate(meta){
  const key=meta.slug||meta.title;
  if(tractateCache.has(key)){
   const value=tractateCache.get(key);tractateCache.delete(key);tractateCache.set(key,value);return value;
  }
  if(tractatePromises.has(key))return tractatePromises.get(key);
  const promise=loadScript(meta.file||('texts/'+key+'.js')).then(()=>{
   const data=root.SefariaOfflineTranslationData?.[key];
   if(!Array.isArray(data?.text))throw Error('Offline translation has no daf structure: '+meta.title);
   tractateCache.set(key,data);
   while(tractateCache.size>MAX_CACHED_TRACTATES){
    const oldest=tractateCache.keys().next().value;
    tractateCache.delete(oldest);
    for(const dafKey of preparedDafCache.keys())if(dafKey.startsWith(oldest+'|'))preparedDafCache.delete(dafKey);
    if(root.SefariaOfflineTranslationData)delete root.SefariaOfflineTranslationData[oldest];
   }
   return data;
  }).finally(()=>tractatePromises.delete(key));
  tractatePromises.set(key,promise);
  return promise;
 }
 function collectSide(data,index){
  const side=data.text[index];
  if(Array.isArray(side))return side.filter(value=>typeof value==='string'&&value.trim());
  return typeof side==='string'&&side.trim()?[side]:[];
 }
 function cacheDaf(meta,daf,data){
  const key=(meta.slug||meta.title)+'|'+daf;
  const sideA=collectSide(data,2*daf-2).join(' '),sideB=collectSide(data,2*daf-1).join(' ');
  const value={sideA,sideB,all:[sideA,sideB].filter(Boolean).join(' ')};
  preparedDafCache.delete(key);preparedDafCache.set(key,value);
  while(preparedDafCache.size>MAX_CACHED_DAFS)preparedDafCache.delete(preparedDafCache.keys().next().value);
  return value;
 }
 function normalizedAnchorText(value){
  return root.SefariaEvidence?.normalizeHebrew?.(value)||
   String(value||'').normalize('NFKD').replace(/\p{M}/gu,'').replace(/[ךםןףץ]/g,ch=>({'ך':'כ','ם':'מ','ן':'נ','ף':'פ','ץ':'צ'}[ch]))
    .replace(/[^\u05d0-\u05ea]+/g,' ').replace(/\s+/g,' ').trim();
 }
 function paragraphAtBookIndex(data,index,expectedSide){
  if(!Number.isInteger(index)||index<0||!Array.isArray(data?.text))return null;
  let offset=0;
  for(let sideIndex=0;sideIndex<data.text.length;sideIndex++){
   const raw=data.text[sideIndex],paragraphs=Array.isArray(raw)?raw:(typeof raw==='string'?[raw]:[]);
   if(index<offset+paragraphs.length){
    if(sideIndex!==expectedSide)return null;
    const value=paragraphs[index-offset];
    return typeof value==='string'&&value.trim()?value:null;
   }
   offset+=paragraphs.length;
  }
  return null;
 }
 function anchoredParagraph(side,selection){
  const paragraphs=collectSide({text:[side]},0);
  if(!paragraphs.length)return null;
  const anchors=[selection?.sourceRange,selection?.renderedRange,
   ...(Array.isArray(selection?.sections)&&selection.sections.length===1?[selection.sections[0]?.sourceRange,selection.sections[0]?.renderedRange]:[])].filter(Boolean);
  for(const anchor of anchors){
   const exact=normalizedAnchorText(anchor.exactText||selection?.sourceSelectedText||selection?.text||selection?.selectedText);
   if(!exact)continue;
   const before=normalizedAnchorText(anchor.beforeText?.raw||anchor.beforeText?.normalized);
   const after=normalizedAnchorText(anchor.afterText?.raw||anchor.afterText?.normalized);
   const matches=paragraphs.map((text,index)=>({text,index,normalized:normalizedAnchorText(text)}))
    .filter(item=>item.normalized.includes(exact));
   if(matches.length===1)return matches[0].text;
   if(matches.length>1){
    const beforeTail=before.split(' ').filter(Boolean).slice(-4).join(' ');
    const afterHead=after.split(' ').filter(Boolean).slice(0,4).join(' ');
    const ranked=matches.map(item=>{
     let score=0;
     if(beforeTail&&item.normalized.includes(beforeTail+' '+exact))score++;
     if(afterHead&&item.normalized.includes(exact+' '+afterHead))score++;
     return {...item,score};
    }).sort((a,b)=>b.score-a.score);
    if(ranked[0]?.score>0&&ranked[0].score>ranked[1]?.score)return ranked[0].text;
   }
  }
  return null;
 }
 function isDafPrepared(reference,selection){
  const parsed=parseReference(reference||selection?.currentRef,selection?.currentBook);
  if(!parsed||!manifestData)return false;
  const meta=findTractate(manifestData,parsed,selection);
  if(!meta)return false;
  const key=(meta.slug||meta.title)+'|'+parsed.daf;
  return tractateCache.has(meta.slug||meta.title)&&preparedDafCache.has(key);
 }
 async function getPassage(reference,selection){
  const parsed=parseReference(reference||selection?.sourceRange?.ref||selection?.currentRef,selection?.currentBook);
  if(!parsed)return {text:'',reason:'unsupported_reference'};
  const manifest=await getManifest(),meta=findTractate(manifest,parsed,selection);
  if(!meta)return {text:'',reason:'tractate_not_in_offline_corpus',reference:parsed.ref};
  const data=await loadTractate(meta),cacheKey=(meta.slug||meta.title)+'|'+parsed.daf;
  let cached=preparedDafCache.get(cacheKey);
  if(cached){preparedDafCache.delete(cacheKey);preparedDafCache.set(cacheKey,cached);}
  else cached=cacheDaf(meta,parsed.daf,data);
  if(parsed.side){
   const side=data.text[parsed.dafIndex];
   const lineParagraph=parsed.line!==null
    ?(Array.isArray(side)?side[parsed.line-1]:(parsed.line===1?side:null)):null;
   // In Otzaria, currentIndex/sectionIndex is the zero-based paragraph
   // index in the whole text book. Sefaria's Bavli JSON keeps the same
   // paragraph sequence flattened across daf sides; map it back to this daf.
   const bookIndex=selection?.currentIndex??selection?.sectionIndex;
   const indexedParagraph=parsed.line===null
    ?paragraphAtBookIndex(data,bookIndex,parsed.dafIndex):null;
   const paragraph=typeof lineParagraph==='string'&&lineParagraph.trim()
    ?lineParagraph:(indexedParagraph||anchoredParagraph(side,selection));
   if(typeof paragraph==='string'&&paragraph.trim())return {
    text:paragraph,scope:'paragraph',reference:parsed.ref,
    dafReference:meta.title+' '+parsed.daf+parsed.side,tractate:meta.title,
    versionTitle:manifest.edition,license:meta.license||manifest.license||'CC-BY-NC',source:'offline'
   };
  }
  const text=parsed.side==='a'?cached.sideA:parsed.side==='b'?cached.sideB:cached.all;
  if(!text)return {text:'',reason:'empty_daf',reference:parsed.ref};
  return {text,scope:'daf',reference:parsed.ref,
   dafReference:meta.title+' '+parsed.daf+(parsed.side||''),tractate:meta.title,
   versionTitle:manifest.edition,license:meta.license||manifest.license||'CC-BY-NC',source:'offline'};
 }
 async function prepareDaf(location,shouldContinue){
  const current=()=>typeof shouldContinue!=='function'||shouldContinue();
  const parsed=parseReference(location?.currentRef,location?.currentBook);
  if(!parsed)return {text:'',reason:'unsupported_reference'};
  if(!current())return {ready:false,reason:'stale'};
  const manifest=await getManifest();
  if(!current())return {ready:false,reason:'stale'};
  const meta=findTractate(manifest,parsed,location);
  if(!meta)return {text:'',reason:'tractate_not_in_offline_corpus',reference:parsed.ref};
  const data=await loadTractate(meta);
  if(!current())return {ready:false,reason:'stale'};
  const cached=cacheDaf(meta,parsed.daf,data);
  return {ready:!!cached.all,scope:'daf',reference:parsed.ref,dafReference:meta.title+' '+parsed.daf,
   tractate:meta.title,versionTitle:manifest.edition,license:meta.license||manifest.license||'CC-BY-NC',source:'offline'};
 }
 function clearCache(){
  manifestPromise=null;manifestData=null;tractateCache.clear();tractatePromises.clear();preparedDafCache.clear();
  delete root.SefariaOfflineTranslationManifest;delete root.SefariaOfflineTranslationData;
 }
 root.SefariaOfflineTranslation={prepareDaf,getPassage,isDafPrepared,parseReference,clearCache};
 if(typeof module!=='undefined'&&module.exports)module.exports=root.SefariaOfflineTranslation;
})(typeof window==='undefined'?globalThis:window);
