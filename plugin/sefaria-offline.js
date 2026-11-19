(function(root){
 'use strict';
 const DATA_ROOT='data/sefaria-bavli/';
 const MAX_CACHED_TRACTATES=3,MAX_CACHED_DAFS=12;
 let manifestPromise=null,manifestData=null;
 const tractateCache=new Map(),tractatePromises=new Map(),preparedDafCache=new Map();
 let wordAlignmentPromise=null;

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
    if(data?.formatVersion!==1||!Array.isArray(data.tractates))throw Error('Unsupported offline translation manifest');
    manifestData=data;
    return data;
   }).catch(error=>{manifestPromise=null;throw error;});
  }
  return manifestPromise;
 }
 function findTractate(manifest,parsed,selection){
  const bookKey=normalizeName(parsed.book),currentBookKey=normalizeName(selection?.currentBook);
  return manifest.tractates.find(item=>{
   const names=[item.title,item.heTitle,item.slug].map(normalizeName).filter(Boolean);
   const matches=name=>name===bookKey||name===currentBookKey||
    (bookKey&&bookKey.endsWith(' '+name))||(currentBookKey&&currentBookKey.endsWith(' '+name));
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
   const source=root.SefariaOfflineSourceData?.[key];
   if(!Array.isArray(data?.text))throw Error('Offline translation has no daf structure: '+meta.title);
   if(!Array.isArray(source?.text))throw Error('Paired Aramaic source text is unavailable: '+meta.title);
   tractateCache.set(key,data);
   while(tractateCache.size>MAX_CACHED_TRACTATES){
    const oldest=tractateCache.keys().next().value;
    tractateCache.delete(oldest);
    for(const dafKey of preparedDafCache.keys())if(dafKey.startsWith(oldest+'|'))preparedDafCache.delete(dafKey);
    if(root.SefariaOfflineTranslationData)delete root.SefariaOfflineTranslationData[oldest];
    if(root.SefariaOfflineSourceData)delete root.SefariaOfflineSourceData[oldest];
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
 function collectSideSlots(data,index){
  const side=data.text[index];
  if(Array.isArray(side))return side.map(value=>typeof value==='string'?value:'');
  return typeof side==='string'?[side]:[];
 }
 function cacheDaf(meta,daf,data){
  const key=(meta.slug||meta.title)+'|'+daf;
  const sideA=collectSide(data,2*daf-2).join(' '),sideB=collectSide(data,2*daf-1).join(' ');
  const value={sideA,sideB,all:[sideA,sideB].filter(Boolean).join(' ')};
  preparedDafCache.delete(key);preparedDafCache.set(key,value);
  while(preparedDafCache.size>MAX_CACHED_DAFS)preparedDafCache.delete(preparedDafCache.keys().next().value);
  return value;
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
  if(parsed.side&&parsed.line!==null){
   const side=data.text[parsed.dafIndex];
   const paragraph=Array.isArray(side)?side[parsed.line-1]:(parsed.line===1?side:null);
   if(typeof paragraph==='string'&&paragraph.trim())return {
    text:paragraph,scope:'paragraph',reference:parsed.ref,
    dafReference:meta.title+' '+parsed.daf+parsed.side,tractate:meta.title,
    versionTitle:manifest.edition,license:'CC-BY-NC',source:'offline'
   };
  }
  const text=parsed.side==='a'?cached.sideA:parsed.side==='b'?cached.sideB:cached.all;
  if(!text)return {text:'',reason:'empty_daf',reference:parsed.ref};
  return {text,scope:'daf',reference:parsed.ref,
   dafReference:meta.title+' '+parsed.daf+(parsed.side||''),tractate:meta.title,
   versionTitle:manifest.edition,license:'CC-BY-NC',source:'offline'};
 }
 async function getParallelPassage(reference,selection){
  const parsed=parseReference(reference||selection?.sourceRange?.ref||selection?.currentRef,selection?.currentBook);
  if(!parsed)return {aligned:false,reason:'unsupported_reference',segments:[]};
  const manifest=await getManifest(),meta=findTractate(manifest,parsed,selection);
  if(!meta)return {aligned:false,reason:'tractate_not_in_offline_corpus',segments:[]};
  const translation=await loadTractate(meta),source=root.SefariaOfflineSourceData?.[meta.slug||meta.title];
  if(!Array.isArray(source?.text))return {aligned:false,reason:'source_unavailable',segments:[]};
  const pages=parsed.side? [parsed.dafIndex] : [2*parsed.daf-2,2*parsed.daf-1];
  const segments=[],sourceParts=[],translationParts=[];let compatible=true,hasContent=false;
  for(const pageIndex of pages){
   const original=collectSideSlots(source,pageIndex),translated=collectSideSlots(translation,pageIndex);
   const start=parsed.line===null?0:parsed.line-1,end=parsed.line===null?original.length:start+1;
   if(start<0||start>=original.length){compatible=false;continue;}
   const selectedOriginal=parsed.line===null?original:original.slice(start,end);
   const selectedTranslated=parsed.line===null?translated:translated.slice(start,end);
   sourceParts.push(...selectedOriginal.filter(value=>String(value||'').trim()));
   translationParts.push(...selectedTranslated.filter(value=>String(value||'').trim()));
   if(original.length!==translated.length){compatible=false;continue;}
   for(let line=start;line<end;line++){
    const sourceText=String(original[line]||'').trim(),translationText=String(translated[line]||'').trim();
    if(!sourceText&&!translationText)continue;
    if(!sourceText||!translationText){compatible=false;continue;}
    hasContent=true;
    segments.push({dafIndex:pageIndex,line:line+1,side:pageIndex%2===0?'a':'b',sourceText,translationText});
   }
  }
  return {
   aligned:compatible&&hasContent,
   reason:compatible&&hasContent?null:!compatible?'segment_count_mismatch':'no_parallel_segments',
   scope:parsed.line===null?'daf':'paragraph',
   reference:parsed.ref,
   dafReference:meta.title+' '+parsed.daf+(parsed.side||''),
   tractate:meta.title,
   versionTitle:manifest.edition,
   sourceVersionTitle:meta.sourceVersionTitle||manifest.sourceEdition||'William Davidson Edition - Vocalized Aramaic',
   license:'CC-BY-NC',
   sourceLicense:meta.sourceLicense||'CC-BY-NC',
   alignmentBasis:'matching-daf-side-and-segment-index',
   segments,
   sourceText:sourceParts.join(' '),
   translationText:translationParts.join(' ')
  };
 }
 const SOURCE_TOKEN_PATTERN=/[\u05d0-\u05ea\u0591-\u05c7]+/g;
 const ENGLISH_TOKEN_PATTERN=/[A-Za-z]+(?:[-–'’][A-Za-z]+)*/g;
 const ENGLISH_JOINERS=new Set(['a','an','the','of','to','is','it','he','she','they','and','or','in','on','at','by','for','with','as','from','that','this','his','her','their','was','were','be','are','has','have','had','do','does','did']);
 function normalizeAramaicToken(value){
  return String(value||'').normalize('NFKD').replace(/\p{M}/gu,'')
   .replace(/[ךםןףץ]/g,char=>({'ך':'כ','ם':'מ','ן':'נ','ף':'פ','ץ':'צ'}[char]))
   .replace(/[^\u05d0-\u05ea]/g,'');
 }
 function getWordAlignmentModel(){
  if(root.SefariaOfflineWordAlignment)return Promise.resolve(root.SefariaOfflineWordAlignment);
  if(!wordAlignmentPromise){
   wordAlignmentPromise=loadScript('word-alignments.js').then(()=>{
    const model=root.SefariaOfflineWordAlignment;
    if(model?.formatVersion!==1||!model.links||!Array.isArray(model.nullLinks))throw Error('Offline word-alignment model is invalid');
    return model;
   }).catch(error=>{wordAlignmentPromise=null;throw error;});
  }
  return wordAlignmentPromise;
 }
 function tokenPositions(text,pattern,normalize){
  pattern.lastIndex=0;
  return [...String(text||'').matchAll(pattern)].map(match=>({
   raw:match[0],normalized:normalize(match[0]),index:match.index
  })).filter(item=>item.normalized);
 }
 function translationMap(items){
  return new Map((Array.isArray(items)?items:[]).map(item=>[item.word,Number(item.probability)||0]));
 }
 function alignWordInSegment(word,segment,model,modelMaps){
  const source=tokenPositions(segment.sourceText,SOURCE_TOKEN_PATTERN,normalizeAramaicToken);
  const target=tokenPositions(segment.translationText,ENGLISH_TOKEN_PATTERN,value=>value.toLowerCase().replace(/[’]/g,"'"));
  const selected=source.map((token,index)=>token.normalized===word?index:-1).filter(index=>index>=0);
  if(!selected.length||!target.length)return [];
  const nullMap=modelMaps.nullMap;
  const sourceMaps=source.map(token=>{
   if(!modelMaps.cache.has(token.normalized))modelMaps.cache.set(token.normalized,translationMap(model.links[token.normalized]));
   return modelMaps.cache.get(token.normalized);
  });
  const owners=[],scores=[];
  for(const english of target){
   const nullProbability=nullMap.get(english.normalized)||0;
   let total=nullProbability,bestProbability= nullProbability,bestIndex=-1;
   for(let index=0;index<sourceMaps.length;index++){
    const probability=sourceMaps[index].get(english.normalized)||0;
    total+=probability;
    if(probability>bestProbability){bestProbability=probability;bestIndex=index;}
   }
   owners.push(bestIndex);
   scores.push(total>0&&bestIndex>=0?bestProbability/total:0);
  }
  const results=[];
  for(const sourceIndex of selected){
   const assigned=[];
   for(let index=0;index<owners.length;index++){
    if(owners[index]===sourceIndex&&scores[index]>=0.12)assigned.push(index);
   }
   if(!assigned.length)continue;
   let start=assigned[0],end=start,confidenceTotal=scores[start],confidenceCount=1;
   function flush(){
    const text=target.slice(start,end+1).map(token=>token.raw).join(' ').trim();
    if(text)results.push({text,alignmentScore:confidenceTotal/confidenceCount,sourceOccurrence:sourceIndex});
   }
   for(let i=1;i<assigned.length;i++){
    const next=assigned[i],gap=next-end;
    const joinable=gap===1||(gap===2&&owners[end+1]===-1&&ENGLISH_JOINERS.has(target[end+1].normalized));
    if(joinable){
     end=next;confidenceTotal+=scores[next];confidenceCount++;
    }else{
     flush();start=end=next;confidenceTotal=scores[next];confidenceCount=1;
    }
   }
   flush();
  }
  return results;
 }
 async function getWordTranslations(word,parallel){
  if(!parallel?.aligned||!Array.isArray(parallel.segments))return {
   status:'unaligned',reason:parallel?.reason||'parallel_passage_unavailable',translations:[]
  };
  const normalized=normalizeAramaicToken(word);
  if(!normalized)return {status:'invalid_word',translations:[]};
  const model=await getWordAlignmentModel();
  const modelMaps={cache:new Map(),nullMap:translationMap(model.nullLinks)};
  const translations=[];
  let occurrences=0;
  parallel.segments.forEach((segment,segmentIndex)=>{
   if(!tokenPositions(segment.sourceText,SOURCE_TOKEN_PATTERN,normalizeAramaicToken).some(token=>token.normalized===normalized))return;
   occurrences++;
   for(const result of alignWordInSegment(normalized,segment,model,modelMaps)){
    translations.push({...result,segmentIndex,line:segment.line,side:segment.side});
   }
  });
  const distinct=new Map();
  for(const item of translations){
   const key=item.text.toLowerCase();
   const previous=distinct.get(key);
   if(!previous||item.alignmentScore>previous.alignmentScore)distinct.set(key,item);
  }
  const ranked=[...distinct.values()].sort((a,b)=>b.alignmentScore-a.alignmentScore).slice(0,4);
  if(!occurrences)return {status:'word_not_in_parallel_passage',word,translations:[]};
  if(!ranked.length)return {
   status:'no_confident_alignment',word,occurrences,method:model.method,translations:[]
  };
  return {
   status:'ok',word,method:model.method,license:model.license,attribution:model.attribution,
   scoreSemantics:'Mean IBM Model 1 posterior alignment score within this parallel segment; not calibrated translation accuracy.',
   occurrences,translations:ranked
  };
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
   tractate:meta.title,versionTitle:manifest.edition,license:'CC-BY-NC',source:'offline'};
 }
 function clearCache(){
  manifestPromise=null;manifestData=null;tractateCache.clear();tractatePromises.clear();preparedDafCache.clear();wordAlignmentPromise=null;
  delete root.SefariaOfflineTranslationManifest;delete root.SefariaOfflineTranslationData;delete root.SefariaOfflineSourceData;delete root.SefariaOfflineWordAlignment;
 }
 root.SefariaOfflineTranslation={prepareDaf,getPassage,getParallelPassage,getWordTranslations,isDafPrepared,parseReference,clearCache};
 if(typeof module!=='undefined'&&module.exports)module.exports=root.SefariaOfflineTranslation;
})(typeof window==='undefined'?globalThis:window);
