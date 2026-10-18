(function(root){
 'use strict';
 function meanings(word){const records=root.HebrewLookup.lookup(word),seen=new Set(),items=[];for(const e of records)for(const p of e.parts){const text=p.meaning||p.text,key=[root.HebrewLookup.normalize(e.word),p.label.replace(/\b\d+\b/g,''),text].join('|');if(!seen.has(key)){seen.add(key);items.push(text);}}return items;}
 function message(word,items){const short=s=>s.length>180?s.slice(0,177)+'…':s;return [word,...items.slice(0,2).map((s,i)=>(i+1)+'. '+short(s)),items.length>2?'למשמעויות נוספות — לחצו לפתיחת המילון':'לחצו לערך המלא ולמקורות'].join('\n');}
 async function show(word){const items=meanings(word);if(!items.length)return;try{const res=await root.Otzaria.call('ui.showMessage',{message:message(word,items),tapPayload:{dictionaryWord:word},tapOpenPlugin:true});if(res?.success===false)console.warn('Quick dictionary lookup unavailable');}catch{console.warn('Quick dictionary lookup unavailable');}}
 root.DictionaryQuick={meanings,message,show};if(root.Otzaria)root.Otzaria.on('reader.context_menu_item_clicked',p=>p.itemId==='aramaic-hebrew-lookup'&&show(root.HebrewLookup.selectionText(p)));
})(typeof window==='undefined'?globalThis:window);
