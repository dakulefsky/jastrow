(function(){
 'use strict';
 if(!window.Otzaria)return;
 const index=window.JASTROW_INDEX;
 let pending=null,running=false,revision=0,legacyRemoval=null,selectionRemoval=Promise.resolve(),fallbackQueue=Promise.resolve(),latestPayload={};
 const MAX_MENU_MEANINGS=4;
 function compact(value,max){
  const text=String(value||'').replace(/\s+/g,' ').trim();
  return text.length<=max?text:text.slice(0,Math.max(1,max-1)).replace(/[\s,;:.—-]+$/,'')+'…';
 }
 function childTitle(item,word){
  const selected=item.selectedWord||'',spelling=item.spelling||'';
  const head=selected&&spelling&&JastrowSearch.normalize(selected)!==JastrowSearch.normalize(spelling)?selected+' · '+spelling:(spelling||selected||word);
  const label=(item.recommended===true?'★ ':'')+head+' — '+compact(item.text,40);
  return label.length>100?label.slice(0,99).trimEnd()+'…':label;
 }
 function removeLegacyVotes(){
  if(!legacyRemoval)legacyRemoval=Promise.all([
   Otzaria.call('reader.removeContextMenuItem',{id:'jastrow-community-votes'}).catch(()=>{}),
   ...[0,1,2].map(i=>Otzaria.call('reader.removeContextMenuItem',{id:'jastrow-community-vote-'+i}).catch(()=>{}))
  ]);
  return legacyRemoval;
 }
 function registerFallback(payload,expectedRevision=revision){
  const word=JastrowContext.selectionText(payload||{});
  const task=async()=>{
   if(expectedRevision!==revision)return;
   if(!word)return Otzaria.call('reader.removeContextMenuItem',{id:'jastrow-lookup'}).catch(()=>{});
   return Otzaria.call('reader.addContextMenuItem',{
    id:'jastrow-lookup',type:'submenu',title:'Aramaic → Eng.',
    icon:'alef_with_score_24_regular',
    contexts:['reader-selection','reader-page-shape-selection'],
    children:[{id:'jastrow-meaning-fallback',title:'Open full dictionary',openPlugin:true,param:{dictionaryWord:word,showAll:true}}]
   }).catch(()=>{});
  };
  const next=fallbackQueue.then(task,task);
  fallbackQueue=next.catch(()=>{});
  return next;
 }
 async function update(){
  if(running)return;running=true;
  try{
   while(pending){
    const job=pending;pending=null;
    await selectionRemoval;
    if(job.revision!==revision)continue;
    const eventText=JastrowContext.selectionText(job.payload);
    let text=eventText;
    if(!text||text.length>100||!JastrowSearch.hasSelectionTranslations(index,text))continue;
    let selection=job.payload;
    try{
     const response=await Otzaria.call('reader.getSelection');
     const current=JastrowContext.selectionText(response?.data);
     if(job.revision!==revision)continue;
     if(response?.success&&current&&JastrowSearch.splitWords(current).map(JastrowSearch.normalize).join(' ')===JastrowSearch.splitWords(text).map(JastrowSearch.normalize).join(' ')){
      selection=response.data||selection;
      if(!JastrowSearch.hasVowels(text)||JastrowSearch.hasVowels(current))text=current;
     }
    }catch{}
    if(job.revision!==revision)continue;
    const context=await DictionaryQuick.captureReaderContext(selection);
    const items=await DictionaryQuick.results(text,context,{maxCandidates:24});
    if(job.revision!==revision)continue;
    const available=items.filter(item=>item.text&&Number.isInteger(item.entryId));
    const hasMore=items.hasMore===true||available.length>MAX_MENU_MEANINGS;
    const choices=available.slice(0,hasMore?MAX_MENU_MEANINGS-1:MAX_MENU_MEANINGS);
    if(!choices.length)continue;
    const children=choices.map((item,i)=>({
     id:'jastrow-meaning-'+i,
     title:childTitle(item,text),
     openPlugin:true,
     param:{dictionaryWord:text,entryId:item.entryId}
    }));
    if(hasMore)children.push({
     id:'jastrow-meaning-more',
     title:'Open full dictionary for more meanings',
     openPlugin:true,
     param:{dictionaryWord:text,showAll:true}
    });
    const rendered=JastrowContext.selectionText(selection);
    const variants=[...new Set([rendered,eventText,text,JastrowSearch.splitWords(text).map(JastrowSearch.normalize).join(' ')])].filter(value=>value&&value.length<=100);
    const title='Aramaic → Eng. — '+compact(text,72);
    const response=await Otzaria.call('reader.addContextMenuItem',{
     id:'jastrow-lookup',type:'submenu',
     title:title.length>100?title.slice(0,99).trimEnd()+'…':title,
     icon:'alef_with_score_24_regular',
     contexts:['reader-selection','reader-page-shape-selection'],
     showWhen:{selectionContainsAny:variants},children
    });
    if(job.revision!==revision){
     await registerFallback(latestPayload);
     continue;
    }
    await removeLegacyVotes();
    // The native menu is already populated with immediate dictionary choices.
    // Load the bundled translation in this foreground webview, then replace
    // the same menu only if the selected paragraph uniquely supports a meaning.
    try{
     const ranked=await DictionaryQuick.applyOfflineRecommendation(text,available,context);
     if(job.revision!==revision)continue;
     if(ranked.some(item=>item.recommended===true)){
      const refreshedChoices=ranked.slice(0,hasMore?MAX_MENU_MEANINGS-1:MAX_MENU_MEANINGS);
      const refreshedChildren=refreshedChoices.map((item,i)=>({
       id:'jastrow-meaning-'+i,title:childTitle(item,text),openPlugin:true,
       param:{dictionaryWord:text,entryId:item.entryId}
      }));
      if(hasMore)refreshedChildren.push({
       id:'jastrow-meaning-more',title:'Open full dictionary for more meanings',
       openPlugin:true,param:{dictionaryWord:text,showAll:true}
      });
      await Otzaria.call('reader.addContextMenuItem',{
       id:'jastrow-lookup',type:'submenu',
       title:title.length>100?title.slice(0,99).trimEnd()+'…':title,
       icon:'alef_with_score_24_regular',
       contexts:['reader-selection','reader-page-shape-selection'],
       showWhen:{selectionContainsAny:variants},children:refreshedChildren
      });
     }
    }catch(error){console.warn('Offline English recommendation refresh skipped',error);}
    if(response?.success===false&&response.error?.code!=='error.not_found')console.warn('Dictionary meaning menu registration failed',response.error?.code);
   }
  }finally{
   running=false;
   if(pending)update().catch(()=>console.warn('Dictionary meaning menu unavailable'));
  }
 }
 function offer(payload){
  latestPayload=payload||{};
  const current=++revision;
  pending={payload:latestPayload,revision:current};
  selectionRemoval=registerFallback(latestPayload,current);
  update().catch(()=>console.warn('Dictionary meaning menu unavailable'));
 }
 // Called by the background daf-preparation worker after the offline passage
 // becomes available. Re-read the live selection and rebuild its native menu,
 // so reopening the same selected word shows the new evidence-backed star
 // without requiring the user to select the word again.
 async function refreshPreparedSelection(){
  try{
   const response=await Otzaria.call('reader.getSelection');
   if(!response?.success||!response.data||!JastrowContext.selectionText(response.data))return false;
   offer(response.data);
   return true;
  }catch{return false;}
 }
 window.JastrowRefreshMenu=refreshPreparedSelection;
 Otzaria.on('reader.selection_changed',offer);
 Otzaria.on('plugin.boot',async()=>{
  await removeLegacyVotes();
  const before=revision;
  try{const response=await Otzaria.call('reader.getSelection');if(before===revision&&response?.success)offer(response.data||{});}catch{}
 });
})();