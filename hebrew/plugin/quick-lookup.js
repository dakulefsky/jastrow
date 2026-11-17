(function(root){
 'use strict';
 let requestSerial=0;
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
 async function meanings(word,selection){
  const records=root.HebrewLookup.lookup(word),seen=new Set(),items=[];
  for(const entry of records)for(const part of entry.parts){
   const text=part.meaning||part.text,key=[root.HebrewLookup.normalize(entry.word),part.label.replace(/\b\d+\b/g,''),text].join('|');
   if(!seen.has(key)){seen.add(key);items.push({text,entry,englishGloss:part.english||''});}
  }
  if(selection&&root.SefariaEvidence?.compareTranslation){
   const candidates=items.map((item,index)=>({id:String(index),text:item.englishGloss||''})).filter(item=>item.text);
   if(candidates.length){
    const evidence=await root.SefariaEvidence.compareTranslation(word,candidates,selection,{preparedOnly:true});
    const matched=new Map((evidence.matches||[]).map(item=>[item.id,item]));
    items.forEach((item,index)=>{const match=matched.get(String(index));if(match){item.translationMatch=true;item.translationPhrase=match.matchedPhrase;item.translationMatchType=match.matchType;item.translationScope=evidence.scope;}});
    const best=items.findIndex(item=>item.translationMatch);if(best>0)items.unshift(items.splice(best,1)[0]);
   }
  }
  return items;
 }
 function message(word,items,context){
  const short=s=>s.length>180?s.slice(0,177)+'…':s,first=items[0];
  const form=first?.entry?.matchedForm?'\nצורת המילה במילון: '+first.entry.word+' (זוהתה תחילית או סיומת)':'';
  const lines=[word+form];const origin=sourceLabel(context);if(origin)lines.push(origin);
  lines.push(...items.slice(0,2).map((x,i)=>(i+1)+'. '+(x.translationMatch?'**'+short(x.text)+'** — מומלץ':short(x.text))));
  if(items.length>2)lines.push('למשמעויות נוספות — לחצו לפתיחת המילון');
  else lines.push('לחצו לערך המלא ולמקורות');
  return lines.filter(Boolean).join('\n');
 }
 async function show(word,context){
  const serial=++requestSerial;
  if(String(word).trim().toLowerCase()==='who created this?'){try{await root.Otzaria.call('ui.showMessage',{message:'Daniel Avrahom'});}catch{console.warn('Quick dictionary lookup unavailable');}return;}
  const selection=context?.selection&&typeof context.selection==='object'?context.selection:context;
  const readerContext=await captureReaderContext(context);
  const items=await meanings(word,readerContext||selection);
  if(serial!==requestSerial||!items.length)return;
  try{
   const res=await root.Otzaria.call('ui.showMessage',{message:message(word,items,readerContext),tapPayload:{dictionaryWord:word,readerContext},tapOpenPlugin:true});
   if(res?.success===false)console.warn('Quick dictionary lookup unavailable');
  }catch{console.warn('Quick dictionary lookup unavailable');}
 }
 root.DictionaryQuick={meanings,message,show,sourceLabel,captureReaderContext};
 if(root.Otzaria)root.Otzaria.on('reader.context_menu_item_clicked',async p=>{
  const word=root.HebrewLookup.selectionText(p);
  if(p.itemId==='aramaic-hebrew-lookup'){await show(word,p);return;}
 });
})(typeof window==='undefined'?globalThis:window);
