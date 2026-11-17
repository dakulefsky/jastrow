(function(root){
 'use strict';
 let requestSerial=0;
 async function meanings(word,selection){
  const records=root.HebrewLookup.lookup(word),seen=new Set(),items=[];
  for(const entry of records)for(const part of entry.parts){
   const text=part.meaning||part.text,key=[root.HebrewLookup.normalize(entry.word),part.label.replace(/\b\d+\b/g,''),text].join('|');
   if(!seen.has(key)){seen.add(key);items.push({text,entry,englishGloss:part.english||''});}
  }
  if(selection&&root.SefariaEvidence?.compareTranslation){
   const candidates=items.map((item,index)=>({id:String(index),text:item.englishGloss||''})).filter(item=>item.text);
   if(candidates.length){
    const evidence=await root.SefariaEvidence.compareTranslation(word,candidates,selection);
    const matched=new Map((evidence.matches||[]).map(item=>[item.id,item]));
    items.forEach((item,index)=>{const match=matched.get(String(index));if(match){item.translationMatch=true;item.translationPhrase=match.matchedPhrase;item.translationMatchType=match.matchType;item.translationScope=evidence.scope;}});
   }
  }
  return items;
 }
 function message(word,items){const short=s=>s.length>180?s.slice(0,177)+'…':s;const first=items[0],form=first?.entry?.matchedForm?'\nצורת המילה במילון: '+first.entry.word+' (זוהתה תחילית או סיומת)':'';return [word+form,...items.slice(0,2).map((x,i)=>(i+1)+'. '+short(x.text)+(x.translationMatch?'\nהניסוח בתרגום סטיינזלץ: “'+x.translationPhrase+'”'+(x.translationScope==='paragraph'?' של פסקה זו.':' של הדף.'):'')),items.length>2?'למשמעויות נוספות — לחצו לפתיחת המילון':'לחצו לערך המלא ולמקורות'].filter(Boolean).join('\n');}
 async function show(word,selection){const serial=++requestSerial;if(String(word).trim().toLowerCase()==='who created this?'){try{await root.Otzaria.call('ui.showMessage',{message:'Daniel Avrahom'});}catch{console.warn('Quick dictionary lookup unavailable');}return;}const items=await meanings(word,selection);if(serial!==requestSerial||!items.length)return;try{const res=await root.Otzaria.call('ui.showMessage',{message:message(word,items),tapPayload:{dictionaryWord:word},tapOpenPlugin:true});if(res?.success===false)console.warn('Quick dictionary lookup unavailable');}catch{console.warn('Quick dictionary lookup unavailable');}}
 root.DictionaryQuick={meanings,message,show};
 if(root.Otzaria)root.Otzaria.on('reader.context_menu_item_clicked',async p=>{
  const word=root.HebrewLookup.selectionText(p);
  if(p.itemId==='aramaic-hebrew-lookup'){await show(word,p.selection);return;}

 });
})(typeof window==='undefined'?globalThis:window);
