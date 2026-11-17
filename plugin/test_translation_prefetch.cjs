'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

async function run(path){
 const listeners=new Map(),timers=new Map(),calls=[],prepared=[];
 let nextTimer=0,current={currentRef:'בראשית פרק א',currentBook:'בראשית',currentBookId:'genesis',currentIndex:0};
 const host={
  on(name,fn){if(!listeners.has(name))listeners.set(name,[]);listeners.get(name).push(fn);},
  async call(method){calls.push(method);if(method==='reader.getCurrentRef')return {success:true,data:{...current}};return {success:true};}
 };
 const root={
  Otzaria:host,console,
  setTimeout(fn,delay){const id=++nextTimer;timers.set(id,{fn,delay});return id;},
  clearTimeout(id){timers.delete(id);}
 };
 vm.runInNewContext(fs.readFileSync('plugin/sefaria-offline.js','utf8'),{window:root,globalThis:root,console});
 root.SefariaOfflineTranslation.prepareDaf=async location=>{prepared.push({...location});};
 vm.runInNewContext(fs.readFileSync(path,'utf8'),{window:root,globalThis:root,console});
 const emit=async(name,payload)=>{for(const fn of listeners.get(name)||[])await fn(payload);};
 const fire=async(id)=>{const timer=timers.get(id);assert(timer,'expected timer');timers.delete(id);assert.equal(timer.delay,2000);await timer.fn();};
 const onlyTimer=()=>{assert.equal(timers.size,1);return [...timers.keys()][0];};

 // Non-Bavli locations do not schedule any preparation.
 await emit('reader.current_ref_changed',current);
 assert.equal(timers.size,0);

 // The daf event only arms the timer; no preparation or reader API call yet.
 current={currentRef:'ברכות, דף ב עמוד א',currentBook:'ברכות',currentBookId:'berakhot',currentIndex:10};
 await emit('reader.current_ref_changed',current);
 const first=onlyTimer();
 assert.equal(prepared.length,0);
 assert.equal(calls.length,0);

 // Moving from amud aleph to amud bet is still the same daf; do not restart.
 current={currentRef:'ברכות, דף ב עמוד ב',currentBook:'ברכות',currentBookId:'berakhot',currentIndex:11};
 await emit('reader.current_ref_changed',current);
 assert.equal(onlyTimer(),first,'switching amudim on the same daf must not restart the two-second wait');
 assert.equal(prepared.length,0);

 // Moving to the next daf before two seconds cancels the old timer.
 current={currentRef:'ברכות, דף ג',currentBook:'ברכות',currentBookId:'berakhot',currentIndex:12};
 await emit('reader.current_ref_changed',current);
 assert.equal(timers.has(first),false);
 assert.equal(prepared.length,0);
 await fire(onlyTimer());
 assert.equal(prepared.length,1);
 assert.equal(prepared[0].currentRef,'ברכות, דף ג');

 // Returning to the already prepared daf does not redo work in this session.
 await emit('reader.current_ref_changed',current);
 assert.equal(timers.size,0);
 assert.equal(prepared.length,1);

 // A mismatched live reader state fails closed.
 current={currentRef:'ברכות, דף ד',currentBook:'ברכות',currentBookId:'berakhot',currentIndex:13};
 await emit('reader.current_ref_changed',{...current,currentRef:'ברכות, דף ה'});
 await fire(onlyTimer());
 assert.equal(prepared.length,1);

 // Navigating away cancels any pending work.
 current={currentRef:'ברכות, דף ו',currentBook:'ברכות',currentBookId:'berakhot',currentIndex:14};
 await emit('reader.current_ref_changed',current);
 const pending=onlyTimer();
 await emit('navigation.changed',{screen:'library'});
 assert.equal(timers.has(pending),false);
 assert.equal(prepared.length,1);
}

(async()=>{
 await run('plugin/translation-prefetch.js');
 await run('hebrew/plugin/translation-prefetch.js');
 console.log('Delayed daf prefetch tests passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
