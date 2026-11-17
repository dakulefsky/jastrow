(function(){
 'use strict';
 if(!window.Otzaria)return;
 let revision=0,queue=Promise.resolve();
 function offer(payload){
  const rev=++revision,text=HebrewLookup.selectionText(payload||{});
  queue=queue.catch(()=>{}).then(async()=>{
   if(rev!==revision)return;
   const found=HebrewLookup.lookup(text).length>0;
   if(rev!==revision)return;
   await Otzaria.call(found?'reader.addContextMenuItem':'reader.removeContextMenuItem',found?{id:'aramaic-hebrew-lookup',title:'ארמית לעברית',label:'ארמית לעברית',icon:'book_24_regular',contexts:['reader-selection','reader-page-shape-selection'],showWhen:{selectionContainsAny:[text]}}:{id:'aramaic-hebrew-lookup'});
   await Otzaria.call('reader.removeContextMenuItem',{id:'aramaic-hebrew-community-votes'}).catch(()=>{});
   for(let i=0;i<3;i++)await Otzaria.call('reader.removeContextMenuItem',{id:'aramaic-hebrew-community-vote-'+i}).catch(()=>{});
  });
 }
 Otzaria.on('reader.selection_changed',offer);
 Otzaria.on('plugin.boot',async()=>{const before=revision;try{const r=await Otzaria.call('reader.getSelection');if(before===revision&&r?.success)offer(r.data||{});}catch{}});
})();