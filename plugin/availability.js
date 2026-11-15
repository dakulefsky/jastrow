(function(){
 'use strict';
 if(!window.Otzaria)return;
 const index=window.JASTROW_INDEX;
 let pending=null,running=false,revision=0,latestPayload=null,removalRequested=false;
 async function drainCommunityRemovals(){if(running)return;running=true;removalRequested=false;try{for(let i=0;i<3;i++)await Otzaria.call('reader.removeContextMenuItem',{id:'jastrow-community-vote-'+i});}catch{}finally{running=false;if(pending)update().catch(()=>{});else if(removalRequested)drainCommunityRemovals().catch(()=>{});}}
 function removeCommunityItems(){revision++;pending=null;removalRequested=true;if(!running)drainCommunityRemovals().catch(()=>{});}
 if(typeof window.addEventListener==='function')window.addEventListener('dictionary-community-disabled',removeCommunityItems);
 if(typeof window.addEventListener==='function')window.addEventListener('dictionary-community-permission-granted',()=>{if(latestPayload)offer(latestPayload);});
 async function update(){
  if(running)return;running=true;
  try{
   while(pending){
    const job=pending;pending=null;
    let text=JastrowContext.selectionText(job.payload),rendered=text;
    if(JastrowSearch.hasSelectionTranslations(index,text)&&!job.payload.renderedSelectedText){
     try{const res=await Otzaria.call('reader.getSelection');const current=JastrowContext.selectionText(res?.data);
      if(job.revision!==revision)continue;
      if(res?.success&&JastrowSearch.splitWords(current).map(JastrowSearch.normalize).join(' ')===JastrowSearch.splitWords(text).map(JastrowSearch.normalize).join(' '))rendered=current;
     }catch{}
    }
    if(job.revision!==revision)continue;
    const matched=JastrowSearch.hasSelectionTranslations(index,text);
    const variants=[...new Set([rendered,text,JastrowSearch.splitWords(text).map(JastrowSearch.normalize).join(' ')])].filter(x=>x&&x.length<=100);
    const method=matched&&variants.length?'reader.addContextMenuItem':'reader.removeContextMenuItem';
    const args=method==='reader.addContextMenuItem'?{id:'jastrow-lookup',title:'Aramaic → Eng. — Quick result',label:'Aramaic → Eng. — Quick result',icon:'book_24_regular',contexts:['reader-selection','reader-page-shape-selection'],openPlugin:false,showWhen:{selectionContainsAny:variants}}:{id:'jastrow-lookup'};
    const res=await Otzaria.call(method,args);
    if(job.revision!==revision)continue;
    await Otzaria.call(method,method==='reader.addContextMenuItem'?{...args,id:'jastrow-open',title:'Open dictionary',label:'Open dictionary',openPlugin:true,onClickEvent:'reader.context_menu_item_clicked'}:{id:'jastrow-open'});
    if(window.DictionaryCommunity?.enabled){
     const candidateResult=matched?JastrowSearch.lookup(index,text,3,'length',false):null;
     const candidates=candidateResult?.ids||[];
     const previews=candidateResult&&window.DictionaryQuick?.previewCandidates?await window.DictionaryQuick.previewCandidates(text,candidateResult):[];
     if(job.revision!==revision||!window.DictionaryCommunity?.enabled)continue;
     for(let i=0;i<3;i++){
      const id='jastrow-community-vote-'+i;
      if(job.revision!==revision||!window.DictionaryCommunity?.enabled)continue;
      if(candidates[i]!==undefined){
       const entry=index.entries[candidates[i]],preview=previews.find(x=>x.id===candidates[i])?.meaning||'';
       const source=entry.source==='krupnik'?'Krupnik':'Jastrow',shortMeaning=String(preview||'').replace(/\s+/g,' ').trim(),title='Vote '+(i+1)+' · '+entry.h+' ('+source+')'+(shortMeaning?' — '+shortMeaning.slice(0,36)+(shortMeaning.length>36?'…':''):'');
       await Otzaria.call('reader.addContextMenuItem',{id,title,label:title,contexts:['reader-selection','reader-page-shape-selection'],openPlugin:false,onClickEvent:'reader.context_menu_item_clicked',showWhen:{selectionContainsAny:variants}});
      }else await Otzaria.call('reader.removeContextMenuItem',{id});
     }
    }else{
     for(let i=0;i<3;i++)await Otzaria.call('reader.removeContextMenuItem',{id:'jastrow-community-vote-'+i});
    }
    if(res?.success===false&&res.error?.code!=='error.not_found')console.warn('Dictionary filtered lookup registration failed',res.error?.code);
   }
  }finally{running=false;if(pending)update().catch(()=>console.warn('Dictionary filtered lookup unavailable'));else if(removalRequested)drainCommunityRemovals().catch(()=>{});}
 }
 function offer(payload){latestPayload=payload||{};removalRequested=false;pending={payload:latestPayload,revision:++revision};update().catch(()=>console.warn('Dictionary filtered lookup unavailable'));}
 Otzaria.on('reader.selection_changed',offer);
 window.DictionaryCommunity?.ready?.then(()=>{if(window.DictionaryCommunity.enabled&&latestPayload)offer(latestPayload);}).catch(()=>{});
 Otzaria.on('plugin.boot',async()=>{
  const before=revision;
  try{const res=await Otzaria.call('reader.getSelection');if(before===revision&&res?.success)offer(res.data||{});}catch{}
 });
})();
