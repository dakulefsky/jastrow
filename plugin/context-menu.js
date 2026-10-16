(function(){
  'use strict';
  if(!window.Otzaria)return;
  const index=window.JASTROW_INDEX;
  let pending=null, running=false,selectionRevision=0;
  async function update(){
    if(running)return;
    running=true;
    try{
      while(pending!==null){
        const text=pending;pending=null;
        const matched=JastrowSearch.hasTranslation(index,text);
        // Gate the last registered item to its selection while newer events are processed.
        const args=matched?{
          id:'jastrow-lookup',label:'Jastrow — English',icon:'book_24_regular',
          contexts:['reader-selection','reader-page-shape-selection'],openPlugin:true,
          showWhen:{selectionContainsAny:[text]}
        }:{id:'jastrow-lookup'};
        const result=await Otzaria.call(matched?'reader.addContextMenuItem':'reader.removeContextMenuItem',args);
        if(result?.success===false && result.error?.code!=='error.not_found'){
          console.warn('Jastrow context-menu update failed',result.error?.code);
        }
      }
    }finally{running=false;}
  }
  function offer(text){
    pending=String(text??'').trim();
    // SDK limits showWhen strings to 100 characters.
    if(pending.length>100)pending='';
    update().catch(()=>console.warn('Jastrow context-menu unavailable'));
  }
  Otzaria.on('reader.selection_changed',p=>{
    selectionRevision++;
    offer(p.renderedSelectedText??p.text);
  });
  Otzaria.on('plugin.boot',async()=>{
    // Recover an already-active selection after a cold background/page start.
    // A newer selection event must win over this asynchronous initial read.
    const revision=selectionRevision;
    try{const result=await Otzaria.call('reader.getSelection');
      if(revision===selectionRevision&&result?.success)offer(result.data?.renderedSelectedText??result.data?.text);
    }catch{console.warn('Jastrow initial selection unavailable');}
  });
})();
