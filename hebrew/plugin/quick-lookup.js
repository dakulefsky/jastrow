(function(root){
 'use strict';
 let requestSerial=0;
 async function meanings(word,selection){let records=root.HebrewLookup.lookup(word),communityPreferred=false;if(root.DictionaryCommunity?.enabled&&records.length>1){const ranked=await root.DictionaryCommunity.rank(word,records.map(e=>({rid:e.rid})),selection);if(ranked.preferredEntryId){const order=new Map(ranked.entries.map((e,i)=>[e.rid,i]));records=[...records].sort((a,b)=>(order.get(a.rid)??999)-(order.get(b.rid)??999));communityPreferred=true;}}const seen=new Set(),items=[];for(const e of records)for(const p of e.parts){const text=p.meaning||p.text,key=[root.HebrewLookup.normalize(e.word),p.label.replace(/\b\d+\b/g,''),text].join('|');if(!seen.has(key)){seen.add(key);items.push({text,entry:e});}}if(communityPreferred&&items.length)items[0].communityPreferred=true;return items;}
 function message(word,items){const short=s=>s.length>180?s.slice(0,177)+'…':s;const first=items[0],form=first?.entry?.matchedForm?'\nצורת המילה במילון: '+first.entry.word+' (זוהתה תחילית או סיומת)':'';return [word+(items[0]?.communityPreferred?' — התאמה מועדפת בקהילה':'')+form,...items.slice(0,2).map((x,i)=>(i+1)+'. '+short(x.text)),items.length>2?'למשמעויות נוספות — לחצו לפתיחת המילון':'לחצו לערך המלא ולמקורות'].join('\n');}
 async function show(word,selection){const serial=++requestSerial;if(String(word).trim().toLowerCase()==='who created this?'){try{await root.Otzaria.call('ui.showMessage',{message:'Daniel Avrahom'});}catch{console.warn('Quick dictionary lookup unavailable');}return;}const items=await meanings(word,selection);if(serial!==requestSerial||!items.length)return;try{const res=await root.Otzaria.call('ui.showMessage',{message:message(word,items),tapPayload:{dictionaryWord:word},tapOpenPlugin:true});if(res?.success===false)console.warn('Quick dictionary lookup unavailable');}catch{console.warn('Quick dictionary lookup unavailable');}}
 root.DictionaryQuick={meanings,message,show};
 if(root.Otzaria)root.Otzaria.on('reader.context_menu_item_clicked',async p=>{
  const word=root.HebrewLookup.selectionText(p);
  if(p.itemId==='aramaic-hebrew-lookup'){await show(word,p.selection||p);return;}
  const match=/^aramaic-hebrew-community-vote-(\d)$/.exec(p.itemId||'');
  if(match&&root.DictionaryCommunity?.enabled){
   const entry=root.HebrewLookup.lookup(word)[Number(match[1])];
   if(entry){const result=await root.DictionaryCommunity.vote(word,{rid:entry.rid},{scope:'context',selection:p.selection||p});if(result.queued)await root.Otzaria.call('ui.showMessage',{message:'ההצבעה נשמרה במכשיר ותישלח כשיהיה חיבור לרשת.'});else if(result.ok||result.duplicate)await root.Otzaria.call('ui.showMessage',{message:result.ok?'תודה, ההצבעה נשמרה.':'כבר הצבעת עבור המילה הזאת.'});else if(result.reason!=='permission')await root.Otzaria.call('ui.showMessage',{message:result.reason==='queue_full'?'תור ההצבעות הלא־מקוונות מלא. יש להתחבר לרשת ולנסות שוב.':'לא ניתן לשמור את ההצבעה. אפשר לנסות שוב.'});}
  }
 });
})(typeof window==='undefined'?globalThis:window);
