(function(){
 'use strict';
 if(!window.Otzaria)return;
 const index=window.JASTROW_INDEX;
 let pending=null,running=false,revision=0,legacyRemoval=null,selectionRemoval=Promise.resolve();
 const MAX_MENU_MEANINGS=8;
 function compact(value,max){
  const text=String(value||'').replace(/\s+/g,' ').trim();
  return text.length<=max?text:text.slice(0,Math.max(1,max-1)).replace(/[\s,;:.—-]+$/,'')+'…';
 }
 function childTitle(item,word){
  const selected=item.selectedWord||'',spelling=item.spelling||'';
  const head=selected&&spelling&&JastrowSearch.normalize(selected)!==JastrowSearch.normalize(spelling)?selected+' · '+spelling:(spelling||selected||word);
  const recommended=item.recommended===true;
  let label=head+' — '+compact(item.text,recommended?34:56);
  if(recommended){
   label+=' · Recommended';
   if(item.translationPhrase)label+=' · “'+compact(item.translationPhrase,26)+'”';
  }
  return label.length>100?label.slice(0,99).trimEnd()+'…':label;
 }
 function removeLegacyVotes(){
  if(!legacyRemoval)legacyRemoval=Promise.all([
   Otzaria.call('reader.removeContextMenuItem',{id:'jastrow-community-votes'}).catch(()=>{}),
   ...[0,1,2].map(i=>Otzaria.call('reader.removeContextMenuItem',{id:'jastrow-community-vote-'+i}).catch(()=>{}))
  ]);
  return legacyRemoval;
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
      // The host's follow-up selection can omit niqqud present in the original
      // selection event. Keep whichever spelling carries more vowel detail;
      // both spellings remain valid menu-visibility variants below.
      if(!JastrowSearch.hasVowels(text)||JastrowSearch.hasVowels(current))text=current;
     }
    }catch{}
    if(job.revision!==revision)continue;
    const context=await DictionaryQuick.captureReaderContext(selection);
    const items=await DictionaryQuick.results(text,context,{maxCandidates:16});
    if(job.revision!==revision)continue;
    const choices=items.filter(item=>item.text&&Number.isInteger(item.entryId)).slice(0,MAX_MENU_MEANINGS);
    if(!choices.length){
     await Otzaria.call('reader.removeContextMenuItem',{id:'jastrow-lookup'}).catch(()=>{});
     continue;
    }
    const children=choices.map((item,i)=>({
     id:'jastrow-meaning-'+i,
     title:childTitle(item,text),
     openPlugin:true,
     param:{dictionaryWord:text,entryId:item.entryId}
    }));
    // Mirror Otzaria's own dictionary: keep the native submenu compact, but
    // never hide additional matches without a direct route to the full list.
    if(items.hasMore===true||items.length>choices.length)children.push({
     id:'jastrow-meaning-more',
     title:'Open full dictionary for more meanings',
     openPlugin:true,
     param:{dictionaryWord:text,showAll:true}
    });
    const rendered=JastrowContext.selectionText(selection);
    const variants=[...new Set([rendered,eventText,text,JastrowSearch.splitWords(text).map(JastrowSearch.normalize).join(' ')])].filter(value=>value&&value.length<=100);
    const title='Aramaic → Eng. — '+compact(text,72);
    const response=await Otzaria.call('reader.addContextMenuItem',{
     id:'jastrow-lookup',
     type:'submenu',
     title:title.length>100?title.slice(0,99).trimEnd()+'…':title,
     icon:'book_24_regular',
     contexts:['reader-selection','reader-page-shape-selection'],
     showWhen:{selectionContainsAny:variants},
     children
    });
    if(job.revision!==revision){
     await Otzaria.call('reader.removeContextMenuItem',{id:'jastrow-lookup'}).catch(()=>{});
     continue;
    }
    await removeLegacyVotes();
    if(response?.success===false&&response.error?.code!=='error.not_found')console.warn('Dictionary meaning menu registration failed',response.error?.code);
   }
  }finally{
   running=false;
   if(pending)update().catch(()=>console.warn('Dictionary meaning menu unavailable'));
  }
 }
 function offer(payload){pending={payload:payload||{},revision:++revision};selectionRemoval=Otzaria.call('reader.removeContextMenuItem',{id:'jastrow-lookup'}).catch(()=>{});update().catch(()=>console.warn('Dictionary meaning menu unavailable'));}
 Otzaria.on('reader.selection_changed',offer);
 Otzaria.on('plugin.boot',async()=>{
  await removeLegacyVotes();
  const before=revision;
  try{const response=await Otzaria.call('reader.getSelection');if(before===revision&&response?.success)offer(response.data||{});}catch{}
 });
})();
