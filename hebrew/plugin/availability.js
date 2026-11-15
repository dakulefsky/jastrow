(function(){
 if(!window.Otzaria)return;
 let revision=0,queue=Promise.resolve(),latestPayload=null;
 function removeCommunityItems(){revision++;queue=queue.catch(()=>{}).then(async()=>{for(let i=0;i<3;i++)await Otzaria.call('reader.removeContextMenuItem',{id:'aramaic-hebrew-community-vote-'+i});}).catch(()=>{});}
 if(typeof window.addEventListener==='function')window.addEventListener('dictionary-community-disabled',removeCommunityItems);
 if(typeof window.addEventListener==='function')window.addEventListener('dictionary-community-permission-granted',()=>{if(latestPayload)offer(latestPayload);});
 function offer(p){
  latestPayload=p||{};
  const rev=++revision,text=HebrewLookup.selectionText(latestPayload);
  queue=queue.catch(()=>{}).then(async()=>{
   if(rev!==revision)return;
   const records=HebrewLookup.lookup(text),found=records.length>0;
   for(const [id,title,openPlugin] of [['aramaic-hebrew-lookup','ארמית לעברית',false],['aramaic-hebrew-open','פתיחת המילון',true]]){
    if(rev!==revision)return;
    await Otzaria.call(found?'reader.addContextMenuItem':'reader.removeContextMenuItem',found?{id,title,label:title,icon:'book_24_regular',contexts:['reader-selection','reader-page-shape-selection'],openPlugin,showWhen:{selectionContainsAny:[text]}}:{id});
   }
   if(window.DictionaryCommunity?.enabled&&rev===revision){
    const candidates=found?records.slice(0,3):[];
    for(let i=0;i<3;i++){
     if(rev!==revision||!window.DictionaryCommunity?.enabled)return;
     const id='aramaic-hebrew-community-vote-'+i,entry=candidates[i];
     if(entry){
      const preview=entry.parts?.map(part=>part.meaning||part.text).find(Boolean)||'';
     const shortMeaning=String(preview||'').replace(/\s+/g,' ').trim(),title='הצבעה '+(i+1)+' · '+entry.word+(shortMeaning?' — '+shortMeaning.slice(0,36)+(shortMeaning.length>36?'…':''):'');
      await Otzaria.call('reader.addContextMenuItem',{id,title,label:title,contexts:['reader-selection','reader-page-shape-selection'],openPlugin:false,onClickEvent:'reader.context_menu_item_clicked',showWhen:{selectionContainsAny:[text]}});
     }else await Otzaria.call('reader.removeContextMenuItem',{id});
    }
   }else{
    for(let i=0;i<3;i++)await Otzaria.call('reader.removeContextMenuItem',{id:'aramaic-hebrew-community-vote-'+i});
   }
  });
 }
 Otzaria.on('reader.selection_changed',offer);
 window.DictionaryCommunity?.ready?.then(()=>{if(window.DictionaryCommunity.enabled&&latestPayload)offer(latestPayload);}).catch(()=>{});
 Otzaria.on('plugin.boot',async()=>{const before=revision;try{const r=await Otzaria.call('reader.getSelection');if(before===revision&&r?.success)offer(r.data);}catch{}});
})();
