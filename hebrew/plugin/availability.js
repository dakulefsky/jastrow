(function(){
 'use strict';
 if(!window.Otzaria)return;
 let revision=0,queue=Promise.resolve(),latestPayload=null;
 function removeCommunityItems(){revision++;queue=queue.catch(()=>{}).then(async()=>{await Otzaria.call('reader.removeContextMenuItem',{id:'aramaic-hebrew-community-votes'});for(let i=0;i<3;i++)await Otzaria.call('reader.removeContextMenuItem',{id:'aramaic-hebrew-community-vote-'+i});}).catch(()=>{});}
 if(typeof window.addEventListener==='function')window.addEventListener('dictionary-community-disabled',removeCommunityItems);
 if(typeof window.addEventListener==='function')window.addEventListener('dictionary-community-permission-granted',()=>{if(latestPayload)offer(latestPayload);});
 function offer(payload){
  latestPayload=payload||{};
  const rev=++revision,text=HebrewLookup.selectionText(latestPayload);
  queue=queue.catch(()=>{}).then(async()=>{
   if(rev!==revision)return;
   const records=HebrewLookup.lookup(text),found=records.length>0;
   if(rev!==revision)return;
   await Otzaria.call(found?'reader.addContextMenuItem':'reader.removeContextMenuItem',found?{id:'aramaic-hebrew-lookup',title:'ארמית לעברית',label:'ארמית לעברית',icon:'book_24_regular',contexts:['reader-selection','reader-page-shape-selection'],showWhen:{selectionContainsAny:[text]}}:{id:'aramaic-hebrew-lookup'});
   if(window.DictionaryCommunity?.enabled&&rev===revision){
    const candidates=found?records.slice(0,3):[];
    let preferredId=null;
    if(candidates.length&&latestPayload.selection&&window.DictionaryCommunity.hasContext?.(latestPayload.selection)){
     const ranked=await window.DictionaryCommunity.rank(text,candidates.map(e=>({rid:e.rid})),latestPayload.selection);
     if(ranked.preferenceScope==='contextual'&&ranked.preferredEntryId)preferredId=ranked.preferredEntryId;
    }
    if(rev!==revision||!window.DictionaryCommunity?.enabled)return;
    const children=[];
    for(let i=0;i<candidates.length;i++){
     const entry=candidates[i],preview=entry.parts?.map(part=>part.meaning||part.text).find(Boolean)||'';
     const recommended=!!preferredId&&('krupnik:'+entry.rid)===preferredId;
     const shortMeaning=String(preview||'').replace(/\s+/g,' ').trim();
     const title=(recommended?'• ':'')+entry.word+(shortMeaning?' — '+shortMeaning.slice(0,48)+(shortMeaning.length>48?'…':''):'')+(recommended?' · מסתבר בהקשר זה':'');
     children.push({id:'aramaic-hebrew-community-vote-'+i,title,label:title,onClickEvent:'reader.context_menu_item_clicked'});
    }
    if(children.length)await Otzaria.call('reader.addContextMenuItem',{id:'aramaic-hebrew-community-votes',type:'submenu',title:'בחירת משמעות',label:'בחירת משמעות',contexts:['reader-selection','reader-page-shape-selection'],children,showWhen:{selectionContainsAny:[text]}});
    else await Otzaria.call('reader.removeContextMenuItem',{id:'aramaic-hebrew-community-votes'});
   }else await Otzaria.call('reader.removeContextMenuItem',{id:'aramaic-hebrew-community-votes'});
  });
 }
 Otzaria.on('reader.selection_changed',offer);
 window.DictionaryCommunity?.ready?.then(()=>{if(window.DictionaryCommunity.enabled&&latestPayload)offer(latestPayload);}).catch(()=>{});
 Otzaria.on('plugin.boot',async()=>{const before=revision;try{const r=await Otzaria.call('reader.getSelection');if(before===revision&&r?.success)offer(r.data||{});}catch{}});
})();
