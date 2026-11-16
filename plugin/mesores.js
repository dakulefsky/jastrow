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
 function containsPhrase(tokens,query){
  if(!query.length||query.length>tokens.length)return false;
  for(let i=0;i<=tokens.length-query.length;i++){
   let matches=true;
   for(let j=0;j<query.length;j++)if(tokens[i+j]!==query[j]){matches=false;break;}
   if(matches)return true;
  }
  return false;
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
  if(cache.has(key))return cache.get(key);
  const promise=(async()=>{
   const request={startLine:source.line,endLine:source.line,connectionTypes:[CONNECTION_TYPE]};
   if(source.bookUid)request.bookUid=source.bookUid;else request.bookId=source.bookId;
   const response=await root.Otzaria.call('library.getLinks',request);
   if(!response?.success||!Array.isArray(response.data?.links))return null;
   const seen=new Set();
   const links=response.data.links.filter(link=>{
    if(String(link?.connectionType||'').toUpperCase()!==CONNECTION_TYPE)return false;
    if(!link.targetTitle||!Number.isInteger(link.targetLine))return false;
    const id=[link.targetTitle,link.targetLine,link.targetLineEnd??''].join('|');
    if(seen.has(id))return false;seen.add(id);return true;
   }).slice(0,MAX_LINKS);
   if(!links.length)return [];
   const loaded=await root.Otzaria.call('library.getLinkContent',{links:links.map(contentRequest)});
   if(!loaded?.success||!Array.isArray(loaded.data?.items))return null;
   return links.map((link,index)=>{
    const item=loaded.data.items[index]||{};
    if(item.error||typeof item.content!=='string')return null;
    const text=htmlToText(item.content).replace(/\s+/g,' ').trim();
    if(!text)return null;
    return {
     title:String(link.targetTitle||''),
     reference:String(link.targetHeRef||''),
     text,
     connectionType:CONNECTION_TYPE
    };
   }).filter(Boolean);
  })();
  cache.set(key,promise);
  while(cache.size>32)cache.delete(cache.keys().next().value);
  try{const result=await promise;if(result===null){cache.delete(key);return [];}return result;}catch{cache.delete(key);return [];}
 }
 function makeExcerpt(tokens,index,length){
  const start=Math.max(0,index-12),end=Math.min(tokens.length,index+length+18);
  return (start?'…':'')+tokens.slice(start,end).join(' ')+(end<tokens.length?'…':'');
 }
 async function find(selection,word){
  const query=tokenize(word);if(!query.length)return [];
  const passages=await passagesFor(selection),matches=[];
  for(const passage of passages){
   const tokens=tokenize(passage.text);let at=-1;
   for(let i=0;i<=tokens.length-query.length;i++){
    let ok=true;for(let j=0;j<query.length;j++)if(tokens[i+j]!==query[j]){ok=false;break;}
    if(ok){at=i;break;}
   }
   if(at<0)continue;
   matches.push({
    title:passage.title,
    reference:passage.reference||passage.title,
    excerpt:makeExcerpt(tokens,at,query.length),
    connectionType:passage.connectionType
   });
  }
  return matches;
 }
 function element(tag,text,className){
  const node=root.document.createElement(tag);
  if(text!==undefined)node.textContent=text;
  if(className)node.className=className;
  return node;
 }
 function clear(target){
  if(!target?.querySelector)return;
  const old=target.querySelector('.mesores-parallels');if(old)old.remove();
 }
 function render(target,matches,language='en'){
  if(!target||!root.document||!matches.length)return null;
  const hebrew=language==='he',section=element('section',undefined,'mesores-parallels');
  section.setAttribute('aria-label',hebrew?'מקבילות במסורת הש״ס':'Mesores HaShas parallels');
  section.append(element('span',hebrew?'מסורת הש״ס':'MESORES HASHAS','mesores-kicker'));
  section.append(element('h3',hebrew?'סוגיות מקבילות':'Cross-referenced Gemara passages','mesores-title'));
  section.append(element('p',hebrew
   ?'ההפניות של מסורת הש״ס שמופיעות כאן מובילות לקטעים שבהם נמצאה המילה או הביטוי שנבחרו. כדאי להשוות את ההקשר; ההפניה לבדה אינה מוכיחה שהמשמעות זהה.'
   :'These Mesores HaShas links lead to passages where the selected word or phrase also appears. Compare the wording; a cross-reference alone does not prove that the meaning is the same.','mesores-description'));
  const list=element('div',undefined,'mesores-list');
  for(const match of matches){
   const card=element('article',undefined,'mesores-card');
   card.append(element('strong',match.reference,'mesores-reference'));
   if(match.title&&match.title!==match.reference)card.append(element('small',match.title,'mesores-book-title'));
   card.append(element('p',match.excerpt,'mesores-excerpt'));
   list.append(card);
  }
  section.append(list);target.append(section);return section;
 }
 async function attach(target,word,selection,language='en',options={}){
  clear(target);
  if(!selection||!word)return [];
  let matches=[];
  try{matches=await find(selection,word);}catch{return [];}
  if(typeof options.isCurrent==='function'&&!options.isCurrent())return matches;
  if(matches.length)render(target,matches,language);
  return matches;
 }

 // Use an established contextual consensus from a Mesores-linked occurrence
 // only when every exact occurrence agrees. This never creates a vote.
 async function propagatedPreference(selection,word,entries,rank){
  if(!selection||!word||!Array.isArray(entries)||!entries.length||typeof rank!=='function')return null;
  const query=tokenize(word);if(!query.length)return null;
  const passages=await passagesFor(selection),preferences=[];
  for(const passage of passages){
   const tokens=tokenize(passage.text);
   for(let i=0;i<=tokens.length-query.length;i++){
    let exact=true;for(let j=0;j<query.length;j++)if(tokens[i+j]!==query[j]){exact=false;break;}
    if(!exact)continue;
    const before=tokens.slice(Math.max(0,i-8),i).join(' ');
    const after=tokens.slice(i+query.length,i+query.length+8).join(' ');
    if(!before||!after)continue;
    const linkedSelection={sourceRange:{beforeText:{raw:before},afterText:{raw:after}}};
    let ranked;
    try{ranked=await rank(word,entries,linkedSelection);}catch{continue;}
    if(ranked?.preferenceScope!=='contextual'||!ranked.preferredEntryId)continue;
    preferences.push(ranked.preferredEntryId);
   }
  }
  if(!preferences.length)return null;
  const winner=preferences[0];
  return preferences.every(id=>id===winner)?{preferredEntryId:winner,occurrences:preferences.length}:null;
 }

 const api={connectionType:CONNECTION_TYPE,tokenize,containsPhrase,find,attach,clear,propagatedPreference};
 root.MesoresHaShas=api;
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window==='undefined'?globalThis:window);
