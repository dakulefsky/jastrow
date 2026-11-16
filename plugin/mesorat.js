(function(root){
 'use strict';
 const CACHE_TTL=120000,MAX_LINKS=4,MAX_CACHE=60,cache=new Map();
 function normalizeWord(value){
  return String(value||'').normalize('NFKD').replace(/\\p{M}/gu,'').replace(/[^א-ת]/g,'').slice(0,100);
 }
 function words(value){
  return String(value||'').normalize('NFKD').replace(/\\p{M}/gu,'').match(/[א-ת]+/g)||[];
 }
 function rangeOf(selection){
  return selection?.sourceRange||selection?.renderedRange||
   selection?.sections?.[0]?.sourceRange||selection?.sections?.[0]?.renderedRange||null;
 }
 function specsAround(tokens,index){
  const left=tokens.slice(Math.max(0,index-2),index),right=tokens.slice(index+1,index+3),specs=[];
  if(left.length)specs.push({label:'L1',value:left[left.length-1],weight:1});
  if(right.length)specs.push({label:'R1',value:right[0],weight:1});
  if(left.length>1)specs.push({label:'L2',value:left.slice(-2).join(' '),weight:3});
  if(right.length>1)specs.push({label:'R2',value:right.slice(0,2).join(' '),weight:3});
  if(left.length&&right.length)specs.push({label:'AROUND',value:left[left.length-1]+'|'+right[0],weight:4});
  return specs;
 }
 function specsSignature(specs){
  return specs.map(x=>x.label+'='+x.value+':'+x.weight).sort().join(';');
 }
 function plainText(value){
  return String(value||'')
   .replace(/<script\\b[^>]*>[\\s\\S]*?<\\/script>/gi,' ')
   .replace(/<style\\b[^>]*>[\\s\\S]*?<\\/style>/gi,' ')
   .replace(/<\\/?(?:br|p|div|li|tr|td|th|section|article|h[1-6])\\b[^>]*>/gi,' ')
   .replace(/<[^>]*>/g,' ')
   .replace(/&nbsp;|&#160;/gi,' ')
   .replace(/&#(\\d+);/g,(_m,n)=>{const cp=Number(n);try{return Number.isInteger(cp)&&cp>=0&&cp<=0x10ffff?String.fromCodePoint(cp):' ';}catch{return ' ';}})
   .replace(/&#x([0-9a-f]+);/gi,(_m,n)=>{const cp=parseInt(n,16);try{return Number.isInteger(cp)&&cp>=0&&cp<=0x10ffff?String.fromCodePoint(cp):' ';}catch{return ' ';}})
   .replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'")
   .replace(/&lt;/gi,'<').replace(/&gt;/gi,'>');
 }
 async function currentLocation(selection){
  const input=selection||{};
  let bookId=input.currentBookId||input.bookId||null;
  let index=Number.isInteger(input.currentIndex)?input.currentIndex:
   (Number.isInteger(input.sectionIndex)?input.sectionIndex:null);
  let type=input.currentType||input.type||null;
  let source=input.currentSource||input.source||null;
  if(!bookId||!Number.isInteger(index)||index<0){
   try{
    const response=await root.Otzaria.call('reader.getCurrentRef',{});
    if(!response?.success||!response.data)return null;
    const data=response.data;
    bookId=bookId||data.currentBookId||data.currentBook||data.bookId||null;
    index=Number.isInteger(index)?index:
     (Number.isInteger(data.currentIndex)?data.currentIndex:null);
    type=type||data.currentType||data.currentType||data.type||null;
    source=source||data.currentSource||data.source||null;
   }catch{return null;}
  }
  if(!bookId||!Number.isInteger(index)||index<0)return null;
  if(type&&type!=='text')return null;
  if(source&&source!=='library')return null;
  return {bookId,index};
 }
 function matchedContext(sourceSpecs,targetSpecs){
  const target=new Map(targetSpecs.map(item=>[item.label+'|'+item.value,item.weight]));
  const matches=sourceSpecs.filter(item=>target.has(item.label+'|'+item.value));
  const weight=matches.reduce((sum,item)=>sum+item.weight,0);
  const sourceWeight=sourceSpecs.reduce((sum,item)=>sum+item.weight,0);
  return {count:matches.length,weight,required:Math.min(4,sourceWeight*.8)};
 }
 function profileForText(content,word,sourceSpecs){
  const tokens=words(plainText(content)),positions=[];
  for(let i=0;i<tokens.length;i++)if(tokens[i]===word)positions.push(i);
  if(!positions.length)return null;
  const candidates=new Map();
  for(const position of positions){
   const specs=specsAround(tokens,position);
   if(specs.length<2)continue;
   const match=matchedContext(sourceSpecs,specs);
   if(match.count<2||match.weight<match.required)continue;
   const signature=specsSignature(specs);
   const prior=candidates.get(signature);
   if(!prior||match.weight>prior.weight)candidates.set(signature,{specs,weight:match.weight});
  }
  if(!candidates.size)return null;
  const ranked=[...candidates.values()].sort((a,b)=>b.weight-a.weight);
  // If the same target passage contains equally plausible occurrences with
  // different contexts, do not guess which occurrence is the parallel one.
  if(ranked.length>1&&ranked[0].weight===ranked[1].weight)return null;
  return ranked[0].specs;
 }
 function cacheGet(key){
  const entry=cache.get(key);if(!entry)return null;
  if(Date.now()-entry.at>CACHE_TTL){cache.delete(key);return null;}
  return entry.profiles.map(profile=>({group:profile.group,specs:profile.specs.map(x=>({...x}))}));
 }
 function cachePut(key,profiles){
  if(cache.size>=MAX_CACHE)cache.delete(cache.keys().next().value);
  cache.set(key,{at:Date.now(),profiles:profiles.map(profile=>({group:profile.group,specs:profile.specs.map(x=>({...x}))}))});
 }
 async function getParallelProfiles(selection,selectedWord,sourceSpecs){
  if(!root.Otzaria?.call||!Array.isArray(sourceSpecs)||sourceSpecs.length<2)return [];
  const word=normalizeWord(selectedWord);
  if(!word)return [];
  const range=rangeOf(selection);
  if(!range)return [];
  const location=await currentLocation(selection);
  if(!location)return [];
  const key=[location.bookId,location.index,word,specsSignature(sourceSpecs)].join('|');
  const cached=cacheGet(key);if(cached)return cached;
  try{
   const linkResponse=await root.Otzaria.call('library.getLinks',{
    bookId:location.bookId,startLine:location.index,endLine:location.index,
    connectionTypes:['MESORAT_HASHAS']
   });
   if(!linkResponse?.success||!Array.isArray(linkResponse.data?.links)||linkResponse.data.truncated)return [];
   const links=[...new Map(linkResponse.data.links
    .filter(link=>String(link.connectionType||'').toUpperCase()==='MESORAT_HASHAS'&&
      typeof link.targetTitle==='string'&&link.targetTitle.trim()&&
      Number.isInteger(link.targetLine)&&link.targetLine>=0)
    .map(link=>[String(link.targetTitle)+'|'+link.targetLine+'|'+String(link.targetCategoryId??''),link]))
    .values()]
    .sort((a,b)=>(a.targetTitle+'|'+a.targetLine).localeCompare(b.targetTitle+'|'+b.targetLine))
    .slice(0,MAX_LINKS);
   if(!links.length){cachePut(key,[]);return [];}
   const requests=links.map(link=>{
    const item={targetTitle:link.targetTitle,targetLine:link.targetLine};
    for(const field of ['targetLineEnd','targetIsUserBook','targetCategoryId'])
     if(Object.prototype.hasOwnProperty.call(link,field))item[field]=link[field];
    return item;
   });
   const contentResponse=await root.Otzaria.call('library.getLinkContent',{links:requests});
   if(!contentResponse?.success||!Array.isArray(contentResponse.data?.items))return [];
   const found=[];
   for(let i=0;i<links.length&&i<contentResponse.data.items.length;i++){
    const item=contentResponse.data.items[i];
    if(!item||item.error||typeof item.content!=='string')continue;
    const specs=profileForText(item.content,word,sourceSpecs);
    if(specs)found.push({specs,signature:specsSignature(specs),sortKey:links[i].targetTitle+'|'+links[i].targetLine});
   }
   const unique=[...new Map(found.map(x=>[x.signature,x])).values()]
    .sort((a,b)=>a.sortKey.localeCompare(b.sortKey)).slice(0,MAX_LINKS);
   const profiles=unique.map((item,index)=>({group:'mesora-'+index,specs:item.specs}));
   cachePut(key,profiles);
   return profiles.map(profile=>({group:profile.group,specs:profile.specs.map(x=>({...x}))}));
  }catch{
   // Library permissions, missing books, or older hosts must never break lookup.
   return [];
  }
 }
 root.DictionaryMesorat={getParallelProfiles,clearCache:()=>cache.clear()};
})(typeof window==='undefined'?globalThis:window);
