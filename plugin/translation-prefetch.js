(function(root){
 'use strict';
 const DELAY_MS=2000;
 const host=root.Otzaria;
 if(!host||typeof host.on!=='function'||typeof host.call!=='function')return;
 let timer=null,generation=0,scheduledKey='',preparedKey='',active=false,isReading=false,backgroundInstance=false;

 function parsedReference(value,book){
  try{return root.SefariaOfflineTranslation?.parseReference?.(value,book)||null;}catch{return null;}
 }
 function dafReference(value,book,bookId){
  const parsed=parsedReference(value,book);
  if(parsed)return String(bookId||parsed.book||book||'').trim()+'|'+parsed.daf;
  const ref=String(value||'').trim();
  const match=ref.match(/^(.*?\b\d+[ab])(?::.*)?$/i);
  return match?match[1].trim():ref;
 }
 function keyOf(location){
  const parsed=parsedReference(location?.currentRef,location?.currentBook);
  if(!parsed)return '';
  return [String(location?.currentBookId||parsed.book||location?.currentBook||''),parsed.daf].join('|');
 }
 function cancel(){
  generation++;
  if(timer!==null){root.clearTimeout(timer);timer=null;}
  scheduledKey='';
 }
 function schedule(location){
  const key=keyOf(location);
  if(!active||!isReading||!key){cancel();return;}
  if(key===scheduledKey||key===preparedKey)return;
  cancel();
  const token=generation,snapshot={
   currentRef:String(location.currentRef||'').trim(),
   currentBook:String(location.currentBook||''),
   currentBookId:String(location.currentBookId||''),
  };
  scheduledKey=key;
  timer=root.setTimeout(async()=>{
   timer=null;
   if(token!==generation||!active)return;
   try{
    const current=await host.call('reader.getCurrentRef');
    if(token!==generation||!active)return;
    const currentRef=String(current?.data?.currentRef||'').trim();
    const currentBookId=String(current?.data?.currentBookId||'');
    if(!currentRef||dafReference(currentRef,current?.data?.currentBook,currentBookId)!==dafReference(snapshot.currentRef,snapshot.currentBook,snapshot.currentBookId))return;
    if(snapshot.currentBookId&&currentBookId&&snapshot.currentBookId!==currentBookId)return;
    const corpus=root.SefariaOfflineTranslation;
    if(typeof corpus?.prepareDaf!=='function')return;
    const result=await corpus.prepareDaf(snapshot,()=>token===generation&&active);
    if(token===generation&&result?.ready===true){
     preparedKey=key;
     // The first right-click may have shown immediate meanings before the
     // offline English daf finished loading. Rebuild the native submenu now,
     // using the still-current selected word and the newly prepared passage.
     try{await root.JastrowRefreshMenu?.({reference:snapshot.currentRef});}
     catch(error){console.warn('Prepared dictionary menu refresh skipped',error);}
    }
   }catch(error){
    if(token===generation)console.warn('Offline translation preparation skipped',error);
   }finally{
    if(token===generation)scheduledKey='';
   }
  },DELAY_MS);
 }
 async function refresh(){
  try{
   const result=await host.call('reader.getCurrentRef');
   if(result?.success&&result.data)schedule(result.data);
   else cancel();
  }catch{cancel();}
 }
 host.on('plugin.boot',async payload=>{
  backgroundInstance=payload?.app?.runMode==='background';
  active=backgroundInstance;
  isReading=backgroundInstance;
  if(active)await refresh();
  else cancel();
 });
 host.on('reader.current_ref_changed',location=>{if(backgroundInstance)schedule(location);});
 host.on('navigation.changed',payload=>{
  if(!backgroundInstance)return;
  if(payload?.screen==='reading'){isReading=true;active=true;refresh();}
  else{isReading=false;active=false;cancel();preparedKey='';}
 });
 host.on('plugin.suspended',()=>{if(!backgroundInstance)return;active=false;cancel();});
 host.on('plugin.resumed',()=>{if(!backgroundInstance)return;active=isReading;if(active)refresh();});
 root.SefariaDafPrefetch={cancel,refresh,delayMs:DELAY_MS};
})(typeof window==='undefined'?globalThis:window);