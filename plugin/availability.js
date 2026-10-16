(function(){
 'use strict';
 if(!window.Otzaria)return;
 const index=window.JASTROW_INDEX;
 let pending=null,running=false,revision=0;
 async function update(){
  if(running)return;running=true;
  try{
   while(pending){
    const job=pending;pending=null;
    let text=JastrowContext.selectionText(job.payload),rendered=text;
    if(JastrowSearch.hasTranslation(index,text)&&!job.payload.renderedSelectedText){
     try{const res=await Otzaria.call('reader.getSelection');const current=JastrowContext.selectionText(res?.data);
      if(job.revision!==revision)continue;
      if(res?.success&&JastrowSearch.normalize(current)===JastrowSearch.normalize(text))rendered=current;
     }catch{}
    }
    if(job.revision!==revision)continue;
    const matched=JastrowSearch.hasTranslation(index,text);
    const variants=[...new Set([rendered,text,JastrowSearch.normalize(text)])].filter(x=>x&&x.length<=100);
    const method=matched&&variants.length?'reader.addContextMenuItem':'reader.removeContextMenuItem';
    const args=method==='reader.addContextMenuItem'?{id:'jastrow-lookup',title:'Aramaic to English Dictionary',icon:'book_24_regular',contexts:['reader-selection','reader-page-shape-selection'],openPlugin:true,showWhen:{selectionContainsAny:variants}}:{id:'jastrow-lookup'};
    const res=await Otzaria.call(method,args);
    if(res?.success===false&&res.error?.code!=='error.not_found')console.warn('Dictionary filtered lookup registration failed',res.error?.code);
   }
  }finally{running=false;}
 }
 function offer(payload){pending={payload:payload||{},revision:++revision};update().catch(()=>console.warn('Dictionary filtered lookup unavailable'));}
 Otzaria.on('reader.selection_changed',offer);
 Otzaria.on('plugin.boot',async()=>{
  const before=revision;
  try{const res=await Otzaria.call('reader.getSelection');if(before===revision&&res?.success)offer(res.data||{});}catch{}
 });
})();
