'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

async function run(path){
 const listeners=new Map(),timers=new Map(),calls=[],prepared=[],refreshed=[];
 let prepareReady=true;
 let nextTimer=0,current={currentRef:'בראשית פרק א',currentBook:'בראשית',currentBookId:'genesis',currentIndex:0};
 const host={
  on(name,fn){if(!listeners.has(name))listeners.set(name,[]);listeners.get(name).push(fn);},
  async call(method){calls.push(method);if(method==='reader.getCurrentRef')return {success:true,data:{...current}};return {success:true};}
 };
 const root={
  Otzaria:host,console,
  JastrowRefreshMenu:async details=>{refreshed.push(details);return true;},
  setTimeout(fn,delay){const id=++nextTimer;timers.set(id,{fn,delay});return id;},
  clearTimeout(id){timers.delete(id);}
 };
 vm.runInNewContext(fs.readFileSync('plugin/sefaria-offline.js','utf8'),{window:root,globalThis:root,console});
 root.SefariaOfflineTranslation.prepareDaf=async location=>{prepared.push({...location});return {ready:prepareReady};};
 vm.runInNewContext(fs.readFileSync(path,'utf8'),{window:root,globalThis:root,console});
 const emit=async(name,payload)=>{for(const fn of listeners.get(name)||[])await fn(payload);};
 const fire=async(id)=>{const timer=timers.get(id);assert(timer,'expected timer');timers.delete(id);assert.equal(timer.delay,2000);await timer.fn();};
 const onlyTimer=()=>{assert.equal(timers.size,1);return [...timers.keys()][0];};
 const expectsRefresh=path==='plugin/translation-prefetch.js';

 current={currentRef:'ברכות, דף א',currentBook:'ברכות',currentBookId:'berakhot',currentIndex:1};
 await emit('plugin.boot',{app:{runMode:'foreground'}});
 assert.equal(timers.size,0,'foreground plugin UI must never prepare daf passages');
 assert.equal(prepared.length,0);

 await emit('plugin.boot',{app:{runMode:'background'}});
 const bootTimer=onlyTimer();
 assert.equal(prepared.length,0);
 assert(calls.includes('reader.getCurrentRef'));
 await emit('navigation.changed',{screen:'library'});
 assert.equal(timers.has(bootTimer),false);

 current={currentRef:'בראשית פרק א',currentBook:'בראשית',currentBookId:'genesis',currentIndex:0};
 await emit('navigation.changed',{screen:'reading'});
 calls.length=0;
 await emit('reader.current_ref_changed',current);
 assert.equal(timers.size,0,'non-Bavli locations do not schedule preparation');

 current={currentRef:'ברכות, דף ב עמוד א',currentBook:'ברכות',currentBookId:'berakhot',currentIndex:10};
 await emit('reader.current_ref_changed',current);
 const first=onlyTimer();
 assert.equal(prepared.length,0);
 assert.equal(calls.length,0);

 current={currentRef:'ברכות, דף ב עמוד א:2',currentBook:'ברכות',currentBookId:'berakhot',currentIndex:11};
 await emit('reader.current_ref_changed',current);
 assert.equal(onlyTimer(),first,'moving between paragraphs on the same daf must not restart the wait');
 current={currentRef:'ברכות, דף ב עמוד ב',currentBook:'ברכות',currentBookId:'berakhot',currentIndex:12};
 await emit('reader.current_ref_changed',current);
 assert.equal(onlyTimer(),first,'switching amudim on the same daf must not restart the wait');
 assert.equal(prepared.length,0);

 current={currentRef:'ברכות, דף ג',currentBook:'ברכות',currentBookId:'berakhot',currentIndex:12};
 await emit('reader.current_ref_changed',current);
 assert.equal(timers.has(first),false);
 assert.equal(prepared.length,0);
 await fire(onlyTimer());
 assert.equal(prepared.length,1);
 assert.equal(prepared[0].currentRef,'ברכות, דף ג');
 assert.equal(refreshed.length,expectsRefresh?1:0,'English menu should refresh immediately after its daf is ready');
 if(expectsRefresh)assert.equal(refreshed[0].reference,'ברכות, דף ג');

 await emit('reader.current_ref_changed',current);
 assert.equal(timers.size,0);
 assert.equal(prepared.length,1);
 assert.equal(refreshed.length,expectsRefresh?1:0,'an already-prepared daf should not cause repeated menu refreshes');

 current={currentRef:'ברכות, דף ד',currentBook:'ברכות',currentBookId:'berakhot',currentIndex:13};
 await emit('reader.current_ref_changed',{...current,currentRef:'ברכות, דף ה'});
 await fire(onlyTimer());
 assert.equal(prepared.length,1);
 assert.equal(refreshed.length,expectsRefresh?1:0,'stale reader references must never refresh the menu');

 current={currentRef:'ברכות, דף ו',currentBook:'ברכות',currentBookId:'berakhot',currentIndex:14};
 await emit('reader.current_ref_changed',current);
 const pending=onlyTimer();
 await emit('navigation.changed',{screen:'library'});
 assert.equal(timers.has(pending),false);
 assert.equal(prepared.length,1);
 current={currentRef:'ברכות, דף ז',currentBook:'ברכות',currentBookId:'berakhot',currentIndex:15};
 await emit('reader.current_ref_changed',current);
 assert.equal(timers.size,0,'reader location changes outside reading screen must be ignored');

 await emit('navigation.changed',{screen:'reading'});
 await new Promise(resolve=>setImmediate(resolve));
 current={currentRef:'ברכות, דף ח',currentBook:'ברכות',currentBookId:'berakhot',currentIndex:16};
 prepareReady=false;
 await emit('reader.current_ref_changed',current);
 await fire(onlyTimer());
 assert.equal(prepared.length,2);
 assert.equal(refreshed.length,expectsRefresh?1:0,'failed preparation must not refresh the menu');
 await emit('reader.current_ref_changed',current);
 assert.equal(timers.size,1,'a daf that failed preparation must be eligible for retry');
 prepareReady=true;
 await fire(onlyTimer());
 assert.equal(prepared.length,3);
 assert.equal(refreshed.length,expectsRefresh?2:0,'a successful retry must refresh the English menu');
 await emit('reader.current_ref_changed',current);
 assert.equal(timers.size,0,'a successfully prepared retry should be remembered');
}

(async()=>{
 await run('plugin/translation-prefetch.js');
 await run('hebrew/plugin/translation-prefetch.js');
 console.log('Delayed daf prefetch and English menu-refresh tests passed');
})().catch(error=>{console.error(error);process.exitCode=1;});