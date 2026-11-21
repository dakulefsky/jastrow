'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');

(async()=>{
 const events=new Map(),timers=new Map(),calls=[],messages=[];
 let nextTimer=0,prepared=false;
 const selection={selectedText:'נפקא מינה',currentRef:'ברכות, דף ב עמוד א:1',currentBook:'ברכות',
  sourceRange:{ref:'ברכות, דף ב עמוד א:1'}};
 const current={currentRef:'ברכות, דף ב עמוד א:1',currentBook:'ברכות',currentBookId:'berakhot'};
 const host={
  on(name,fn){if(!events.has(name))events.set(name,[]);events.get(name).push(fn);},
  async call(method,args){
   calls.push({method,args});
   if(method==='reader.getCurrentRef')return {success:true,data:{...current}};
   if(method==='reader.getSelection')return {success:true,data:{...selection,sourceRange:{...selection.sourceRange}}};
   if(method==='ui.showMessage'){messages.push(args);return {success:true};}
   return {success:true};
  }
 };
 const root={Otzaria:host,console,setTimeout(fn,delay){const id=++nextTimer;timers.set(id,{fn,delay});return id;},
  clearTimeout(id){timers.delete(id);}};
 root.window=root;
 const context={window:root,globalThis:root,Otzaria:host,console,Map,Set,Date,Promise};
 vm.createContext(context);
 for(const file of ['data.js','lookup.js','sefaria-offline.js','sefaria-evidence.js','quick-lookup.js','availability.js','translation-prefetch.js'])
  vm.runInContext(fs.readFileSync(__dirname+'/plugin/'+file,'utf8'),context);
 root.HebrewLookup.lookup=word=>word==='נפקא מינה'?[
  {word:'נפקא מינה',rid:'KRU00001',parts:[{meaning:'היוצא לנו מזה למעשה',text:'היוצא לנו מזה למעשה',english:'the practical difference is',label:''}]},
  {word:'נפקא מינה',rid:'KRU00002',parts:[{meaning:'הבדל',text:'הבדל',english:'difference',label:''}]}
 ]:[];
 root.SefariaOfflineTranslation.isDafPrepared=()=>prepared;
 root.SefariaOfflineTranslation.getPassage=async()=>prepared
  ?{text:'the practical difference is clear',scope:'paragraph',reference:current.currentRef,dafReference:'Berakhot 2a',source:'offline'}
  :{text:'',reason:'not_prepared'};
 root.SefariaOfflineTranslation.prepareDaf=async()=>{prepared=true;return {ready:true};};
 const emit=async(name,payload)=>{for(const fn of events.get(name)||[])await fn(payload);};
 await emit('reader.context_menu_item_clicked',{itemId:'aramaic-hebrew-lookup',...selection});
 assert.equal(messages.length,1,'right-click should show immediate Hebrew meanings');
 assert(messages[0].message.includes('היוצא לנו מזה למעשה'));
 assert(!messages[0].message.includes('★ מומלץ'),'no recommendation before passage preparation');

 await emit('plugin.boot',{app:{runMode:'background'}});
 assert.equal(timers.size,1,'background should schedule the two-second daf preparation');
 const [timerId,timer]=[...timers.entries()][0];
 assert.equal(timer.delay,2000);
 timers.delete(timerId);
 await timer.fn();
 assert.equal(prepared,true);
 assert.equal(messages.length,2,'same selected word should refresh after the daf is ready');
 assert(messages[1].message.includes('★ מומלץ'),'prepared paragraph evidence should mark the supported Hebrew meaning');
 assert(messages[1].message.includes('היוצא לנו מזה למעשה'));
 assert.equal(messages[1].tapPayload.dictionaryWord,'נפקא מינה');

 selection.selectedText='מילה אחרת';
 const before=messages.length;
 assert.equal(await root.DictionaryQuick.refreshPreparedSelection(),false,'a changed selection must not receive the previous word recommendation');
 assert.equal(messages.length,before);
 console.log('PASS: Hebrew immediate meanings, two-second background preparation, same-selection refresh, paragraph-only ★ מומלץ, stale-selection protection.');
})().catch(error=>{console.error(error);process.exit(1);});
