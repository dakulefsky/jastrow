(function(root){
 'use strict';
 const CONNECTION_TYPE='MESORAT_HASHAS';
 const MAX_LINKS=8;
 const cache=new Map();
 const finals={ך:'כ',ם:'מ',ן:'נ',ף:'פ',ץ:'צ'};

 function tokenize(value){
  return (String(value||'').normalize('NFKD').replace(/\p{M}/gu,'').replace(/[ךםןףץ]/g,ch=>finals[ch]).match(/[\u05d0-\u05ea]+/g)||[])
   .map(word=>word.replace(/[ךםןףץ]/g,ch=>finals[ch]));
 }
 function htmlToText(html){
  const source=String(html||'').replace(/<br\s*\/?>/gi,' ').replace(/<\/(?:p|div|li|section|blockquote|h[1-6])\s*>/gi,' ');
  if(root.document&&typeof root.document.createElement==='function'){
   try{const node=root.document.createElement('div');node.innerHTML=source;return node.textContent||node.innerText||'';}catch{}
  }
  return source.replace(/<[^>]*>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'");
 }
 function firstInteger(values){
  for(const value of values)if(Number.isInteger(value)&&value>=0)return value;
  return null;
 }
 function firstString(values){
  for(const value of values)if(typeof value==='string'&&value.trim())return value.trim();
  return '';
 }
 async function sourceLocation(selection){
  const s=selection||{},nested=Array.isArray(s.sections)?s.sections[0]||{}:{};
  let bookUid=firstString([s.bookUid,nested.bookUid]);
  let bookId=firstString([s.bookId,s.currentBookId,s.currentBook,nested.bookId,nested.currentBookId]);
  let line=firstInteger([s.sectionIndex,s.currentIndex,s.sourceRange?.sectionIndex,nested.sectionIndex,nested.currentIndex]);
  let current={};
  if((!bookUid&&!bookId)||line===null){
   try{
    const response=await root.Otzaria.call('reader.getCurrentRef');
    if(response?.success&&response.data)current=response.data;
   }catch{}
  }
  if(!bookUid)bookUid=firstString([current.bookUid]);
  if(!bookId)bookId=firstString([current.currentBookId,current.currentBook]);
  if(line===null)line=firstInteger([current.currentIndex]);
  if((!bookUid&&!bookId)||line===null)return null;
  return {bookUid,bookId,line};
 }
 function contentRequest(link){
  const item={targetTitle:link.targetTitle,targetLine:link.targetLine};
  for(const key of ['targetLineEnd','targetIsUserBook','targetCategoryId']){
   if(link[key]!==undefined)item[key]=link[key];
  }
  return item;
 }
 async function passagesFor(selection){
  if(!root.Otzaria||typeof root.Otzaria.call!=='function')return [];
  const source=await sourceLocation(selection);if(!source)return [];
  const sourceId=source.bookUid||source.bookId;
  const key=sourceId+'|'+source.line;
  if(cache.has(key)){
   const cached=cache.get(key);
   cache.delete(key);cache.set(key,cached);
   return cached;
  }
  const promise=(async()=>{
   const request={startLine:source.line,endLine:source.line,connectionTypes:[CONNECTION_TYPE]};
   if(source.bookUid)request.bookUid=source.bookUid;else request.bookId=source.bookId;
   const response=await root.Otzaria.call('library.getLinks',request);
   if(!response?.success||response.data?.truncated===true||!Array.isArray(response.data?.links))return null;
   const seen=new Set();
   const links=response.data.links.filter(link=>{
    if(String(link?.connectionType||'').toUpperCase()!==CONNECTION_TYPE)return false;
    if(link.targetIsUserBook===true||(link.targetSource&&link.targetSource!=='o')||(link.targetIsUserBook!==false&&link.targetSource!=='o'))return false;
    if(!link.targetTitle||!Number.isInteger(link.targetLine))return false;
    const id=[link.targetTitle,link.targetLine,link.targetLineEnd??''].join('|');
    if(seen.has(id))return false;seen.add(id);return true;
   });
   if(!links.length)return [];
   if(links.length>MAX_LINKS)return null;
   const loaded=await root.Otzaria.call('library.getLinkContent',{links:links.map(contentRequest)});
   if(!loaded?.success||loaded.data?.truncated===true||!Array.isArray(loaded.data?.items)||loaded.data.items.length!==links.length)return null;
   const passages=links.map((link,index)=>{
    const item=loaded.data.items[index]||{};
    if(item.error||item.forbidden===true||item.restricted===true||item.partial===true||item.isPartial===true||item.truncated===true||typeof item.content!=='string')return null;
    const text=htmlToText(item.content).replace(/\s+/g,' ').trim();
    if(!text)return null;
    return {
     title:String(link.targetTitle||''),
     reference:String(link.targetHeRef||''),
     text,
     connectionType:CONNECTION_TYPE
    };
   });
   return passages.some(item=>!item)?null:passages;
  })();
  cache.set(key,promise);
  while(cache.size>32)cache.delete(cache.keys().next().value);
  try{const result=await promise;if(result===null){cache.delete(key);return [];}return result;}catch{cache.delete(key);return [];}
 }
 function containsPhrase(text,word){
  const query=tokenize(word);if(!query.length)return false;
  const tokens=tokenize(text);
  for(let i=0;i<=tokens.length-query.length;i++){
   let exact=true;for(let j=0;j<query.length;j++)if(tokens[i+j]!==query[j]){exact=false;break;}
   if(exact)return true;
  }
  return false;
 }
 async function find(selection,word){
  if(!word||!tokenize(word).length)return [];
  const passages=await passagesFor(selection);
  return passages.filter(passage=>containsPhrase(passage.text,word));
 }
 // Use only local translation evidence from a Mesores-linked passage.
 // A parallel clue is accepted only when the exact word occurs unambiguously,
 // one candidate is uniquely supported, and every relevant linked passage agrees.
 async function translationRank(word,entries,selection){
  if(!root.SefariaEvidence?.compareTranslation)return null;
  const evidence=await root.SefariaEvidence.compareTranslation(word,entries,selection);
  const matches=Array.isArray(evidence?.matches)?evidence.matches:[];
  if(!matches.length)return null;
  const score=match=>match.matchType==='exact'?3:match.matchType==='inflected_phrase'?2:1;
  const highest=Math.max(...matches.map(score));
  const winners=[...new Set(matches.filter(match=>score(match)===highest).map(match=>String(match.id)))];
  if(winners.length!==1)return null;
  return {preferredEntryId:winners[0],preferenceScope:'contextual'};
 }
 async function propagatedPreference(selection,word,entries,rank=translationRank){
  if(!selection||!word||!Array.isArray(entries)||!entries.length||typeof rank!=='function')return null;
  const query=tokenize(word);if(!query.length)return null;
  const passages=await passagesFor(selection),relevant=[];
  for(const passage of passages){
   const tokens=tokenize(passage.text);
   let occurrences=0;
   for(let i=0;i<=tokens.length-query.length;i++){
    let exact=true;
    for(let j=0;j<query.length;j++)if(tokens[i+j]!==query[j]){exact=false;break;}
    if(exact&&++occurrences>1)return null;
   }
   if(occurrences)relevant.push(passage);
  }
  if(!relevant.length)return null;
  // Linked passages are independent. Run their offline translation checks in
  // parallel; the offline loader coalesces concurrent requests for one tractate.
  const preferences=await Promise.all(relevant.map(async passage=>{
   const linkedSelection={
    currentBook:passage.title,
    sourceRange:{ref:passage.reference||passage.title}
   };
   try{
    const ranked=await rank(word,entries,linkedSelection);
    return ranked?.preferenceScope==='contextual'&&ranked.preferredEntryId
     ?String(ranked.preferredEntryId):null;
   }catch{return null;}
  }));
  if(preferences.some(id=>!id))return null;
  const winner=preferences[0];
  return preferences.every(id=>id===winner)?{preferredEntryId:winner,occurrences:relevant.length}:null;
 }

 const api={connectionType:CONNECTION_TYPE,tokenize,find,propagatedPreference};
 root.MesoresHaShas=api;
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window==='undefined'?globalThis:window);
