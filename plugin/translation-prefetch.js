(function(root){
 'use strict';
 const DELAY_MS=2000;
 const host=root.Otzaria;
 if(!host||typeof host.on!=='function'||typeof host.call!=='function')return;
 let timer=null,generation=0,scheduledKey='',preparedKey='',active=true;

 function keyOf(location){
  const ref=String(location?.currentRef||'').trim();
  if(!ref)return '';
  return [ref,String(location?.currentBookId||''),String(location?.currentIndex??'')].join('|');
 }
 function cancel(){
  generation++;
  if(timer!==null){root.clearTimeout(timer);timer=null;}
  scheduledKey='';
 }
 function schedule(location){
  const key=keyOf(location);
  if(!active||!key){cancel();return;}
  if(key===scheduledKey||key===preparedKey)return;
  cancel();
  const token=generation,snapshot={
   currentRef:String(location.currentRef).trim(),
   currentBook:String(location.currentBook||''),
   currentBookId:String(location.currentBookId||''),
   currentIndex:Number.isInteger(location.currentIndex)?location.currentIndex:null
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
    const currentIndex=current?.data?.currentIndex;
    if(!currentRef||currentRef!==snapshot.currentRef)return;
    if(snapshot.currentBookId&&currentBookId&&snapshot.currentBookId!==currentBookId)return;
    if(Number.isInteger(snapshot.currentIndex)&&Number.isInteger(currentIndex)&&snapshot.currentIndex!==currentIndex)return;
    const corpus=root.SefariaOfflineTranslation;
    if(typeof corpus?.prepareDaf!=='function')return;
    await corpus.prepareDaf(snapshot);
    if(token===generation)preparedKey=key;
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
 host.on('reader.current_ref_changed',schedule);
 host.on('plugin.boot',refresh);
 host.on('plugin.resumed',refresh);
 host.on('navigation.changed',payload=>{
  if(payload?.screen==='reading'){active=true;refresh();}
  else{active=false;cancel();preparedKey='';}
 });
 host.on('plugin.suspended',()=>{active=false;cancel();});
 host.on('plugin.resumed',()=>{active=true;refresh();});
 root.SefariaDafPrefetch={cancel,refresh,delayMs:DELAY_MS};
})(typeof window==='undefined'?globalThis:window);
