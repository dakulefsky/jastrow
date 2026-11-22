(function(root){
 'use strict';
 let requestSerial=0,selectionRevision=0,lastPresented=null;
 function readerReference(context){
  const s=context||{},ranges=[s.sourceRange,s.renderedRange,s.sections?.[0]?.sourceRange,s.sections?.[0]?.renderedRange];
  for(const range of ranges)for(const value of [range?.ref,range?.currentRef,range?.reference])if(typeof value==='string'&&value.trim())return value.trim();
  for(const value of [s.currentRef,s.currentTitle,s.reference])if(typeof value==='string'&&value.trim())return value.trim();
  return '';
 }
 async function captureReaderContext(event){
  if(!event||typeof event!=='object')return null;
  const outer=event,nested=outer.selection&&typeof outer.selection==='object'?outer.selection:outer;
  const context={...nested};
  for(const key of ['currentRef','currentTitle','currentBook','currentBookId','sourceRange','renderedRange','sections'])
   if((context[key]===undefined||context[key]===null||context[key]==='')&&outer[key]!==undefined)context[key]=outer[key];
  if(!readerReference(context)){
   try{
    const response=await root.Otzaria.call('reader.getCurrentRef');
    if(response?.success&&response.data)for(const [key,value] of Object.entries(response.data))
     if(context[key]===undefined||context[key]===null||context[key]==='')context[key]=value;
   }catch{}
  }
  return readerReference(context)?context:null;
 }
 function sourceLabel(context){
  const ref=readerReference(context);if(!ref)return '';
  const parsed=root.SefariaOfflineTranslation?.parseReference?.(ref,context?.currentBook);
  if(parsed){
   const book=parsed.book||context?.currentBook||'';
   return 'מתוך: '+book+' · דף '+parsed.daf+(parsed.side?(parsed.side==='a'?' · עמוד א׳':' · עמוד ב׳'):'');
  }
  return 'מתוך: '+ref;
 }
 function sameReference(left,right){
  const normalize=value=>String(value||'').normalize('NFKC').replace(/[״׳]/g,'"').replace(/\s+/g,' ').trim().toLowerCase();
  return !!normalize(left)&&normalize(left)===normalize(right);
 }
 async function meanings(word){
  let records=root.HebrewLookup.lookup(word),segments=null;
  if(!records.length&&String(word).trim().includes(' '))segments=root.HebrewLookup.segmentWords(word);
  const sources=segments?.length?segments.map(segment=>({word:segment.word,records:segment.records})):
   records.length?[{word:'',records}]:[];
  const seen=new Set(),items=[];
  for(const source of sources)for(const entry of source.records)for(const part of entry.parts){
   const text=part.meaning||part.text,label=String(part.label||'').replace(/\b\d+\b/g,'').trim();
   // Collapse identical Hebrew glosses across duplicate dictionary records,
   // while keeping separate selected-word segments and distinct labels.
   const key=[root.HebrewLookup.normalize(source.word||word),root.HebrewLookup.normalize(label),root.HebrewLookup.normalize(text)].join('|');
   if(!seen.has(key)){seen.add(key);items.push({text,entry,hebrewMeaning:part.meaning||'',selectedWord:source.word||undefined});}
  }
  return items;
 }
 async function applyOfflineRecommendation(word,items,selection,serial,epoch){
  if(!selection||!root.SefariaEvidence?.compareTranslation)return false;
  const candidates=items.map((item,index)=>({id:String(index),text:item.hebrewMeaning||''})).filter(item=>item.text);
  if(!candidates.length)return false;
  // Do not depend on the background webview's in-memory cache. Load the bundled
  // Hebrew Steinsaltz passage locally in this webview after the instant result.
  const evidence=await root.SefariaEvidence.compareTranslation(word,candidates,selection);
  if(serial!==requestSerial||epoch!==selectionRevision)return false;
  const best=root.SefariaEvidence.bestContextualMatch?.(evidence);
  if(!best)return false;
  const index=items.findIndex((item,i)=>String(i)===String(best.id));
  if(index<0)return false;
  const item=items[index];
  item.translationMatch=true;item.translationPhrase=best.matchedPhrase;
  item.translationMatchType=best.matchType;item.translationScope=evidence.scope;
  if(index>0)items.unshift(items.splice(index,1)[0]);
  return true;
 }
 function message(word,items,context){
  const short=s=>s.length>180?s.slice(0,177)+'…':s,first=items[0];
  const form=first?.entry?.matchedForm?'\nצורת המילה במילון: '+first.entry.word+' (זוהתה תחילית או סיומת)':'';
  const lines=[word+form];const origin=sourceLabel(context);if(origin)lines.push(origin);
  lines.push(...items.slice(0,4).map((x,i)=>(i+1)+'. '+(x.selectedWord?x.selectedWord+' · ':'')+'**'+short(x.text)+'**'+(x.translationMatch?' — ★ מומלץ':'')));
  if(items.length>4)lines.push('למשמעויות נוספות — לחצו לפתיחת המילון');
  else lines.push('לחצו לערך המלא ולמקורות');
  return lines.filter(Boolean).join('\n');
 }
 async function show(word,context){
  const serial=++requestSerial,epoch=selectionRevision;
  if(String(word).trim().toLowerCase()==='who created this?'){try{await root.Otzaria.call('ui.showMessage',{message:'Daniel Avrahom'});}catch{console.warn('Quick dictionary lookup unavailable');}return;}
  if(!root.HebrewLookup.valid(String(word||'')))return;
  const selection=context?.selection&&typeof context.selection==='object'?context.selection:context;
  const readerContext=await captureReaderContext(context);
  const evidenceContext=readerContext||selection;
  const items=await meanings(word);
  if(serial!==requestSerial||epoch!==selectionRevision||!items.length)return;
  const payload={tapPayload:{dictionaryWord:word,readerContext},tapOpenPlugin:true};
  try{
   const res=await root.Otzaria.call('ui.showMessage',{...payload,message:message(word,items,readerContext)});
   if(res?.success===false){console.warn('Quick dictionary lookup unavailable');return;}
   lastPresented={word:root.HebrewLookup.normalize(word),reference:readerReference(readerContext),selectionRevision:selectionRevision,context:readerContext||selection};
  }catch{console.warn('Quick dictionary lookup unavailable');return;}
  // The first meanings are deliberately sent before loading the local corpus.
  // This makes right-click responsive even on a cold offline start.
  try{
   const recommended=await applyOfflineRecommendation(word,items,evidenceContext,serial,epoch);
   if(recommended&&serial===requestSerial&&epoch===selectionRevision)
    await root.Otzaria.call('ui.showMessage',{...payload,message:message(word,items,readerContext)});
  }catch(error){console.warn('Offline Hebrew recommendation unavailable',error);}
 }
 async function refreshPreparedSelection(){
  const previous=lastPresented;if(!previous)return false;
  const epoch=selectionRevision;
  try{
   const response=await root.Otzaria.call('reader.getSelection');
   if(epoch!==selectionRevision||!response?.success||!response.data)return false;
   const word=root.HebrewLookup.selectionText(response.data);
   if(!word||root.HebrewLookup.normalize(word)!==previous.word)return false;
   const context=await captureReaderContext(response.data);
   if(epoch!==selectionRevision||!context||!sameReference(readerReference(context),previous.reference))return false;
   await show(word,response.data);
   return true;
  }catch{return false;}
 }
 root.DictionaryQuick={meanings,message,show,sourceLabel,captureReaderContext,refreshPreparedSelection};
 if(root.Otzaria){
  root.Otzaria.on('reader.selection_changed',()=>{selectionRevision++;});
  root.Otzaria.on('reader.context_menu_item_clicked',async p=>{
  const word=root.HebrewLookup.selectionText(p);
  if(p.itemId==='aramaic-hebrew-lookup'){await show(word,p);return;}
  });
 }
})(typeof window==='undefined'?globalThis:window);
