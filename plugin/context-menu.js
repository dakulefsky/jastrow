(function(){
  'use strict';
  if(!window.Otzaria)return;
  const index=window.JASTROW_INDEX;
  let pending=null, running=false;
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
  Otzaria.on('reader.selection_changed',p=>{
    pending=String(p.renderedSelectedText??p.text??'').trim();
    // SDK limits showWhen strings to 100 characters.
    if(pending.length>100)pending='';
    update().catch(()=>console.warn('Jastrow context-menu unavailable'));
  });
})();
