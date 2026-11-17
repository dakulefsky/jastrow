'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

async function run(path){
 const listeners=new Map(),timers=new Map(),calls=[],prepared=[];
 let nextTimer=0,current={currentRef:'Berakhot 2a:1',currentBook:'Berakhot',currentBookId:'berakhot',currentIndex:0};
 const host={
  on(name,fn){if(!listeners.has(name))listeners.set(name,[]);listeners.get(name).push(fn);},
  async call(method){calls.push(method);if(method==='reader.getCurrentRef')return {success:true,data:{...current}};return {success:true};}
 };
 const root={
  Otzaria:host,
  console,
  setTimeout(fn,delay){const id=++nextTimer;timers.set(id,{fn,delay});return id;},
  clearTimeout(id){timers.delete(id);},
  SefariaOfflineTranslation:{async prepareDaf(location){prepared.push({...location});}}
 };
 vm.runInNewContext(fs.readFileSync(path,'utf8'),{window:root,globalThis:root,console});
 const emit=async(name,payload)=>{for(const fn of listeners.get(name)||[])await fn(payload);};
 const fire=async(id)=>{const timer=timers.get(id);assert(timer,'expected timer');timers.delete(id);assert.equal(timer.delay,2000);await timer.fn();};
 const onlyTimer=()=>{assert.equal(timers.size,1);return [...timers.keys()][0];};

 // A location event only arms a timer. It does not begin preparation.
 await emit('reader.current_ref_changed',current);
 const first=onlyTimer();
 current={currentRef:'Berakhot 2a:2',currentBook:'Berakhot',currentBookId:'berakhot',currentIndex:1};
 await emit('reader.current_ref_changed',current);
 assert.equal(onlyTimer(),first,'moving between paragraphs on the same daf must not restart the two-second wait');
 assert.equal(prepared.length,0);
 assert.equal(calls.length,0);

 // Leaving the daf before two seconds cancels its preparation.
 current={currentRef:'Berakhot 2b',currentBook:'Berakhot',currentBookId:'berakhot',currentIndex:1};
 await emit('reader.current_ref_changed',current);
 assert.equal(timers.has(first),false);
 assert.equal(prepared.length,0);
 await fire(onlyTimer());
 assert.equal(prepared.length,1);
 assert.equal(prepared[0].currentRef,'Berakhot 2b');

 // Returning to an already prepared daf does not redo work in this session.
 await emit('reader.current_ref_changed',current);
 assert.equal(timers.size,0);
 assert.equal(prepared.length,1);

 // A mismatched live reader state fails closed.
 current={currentRef:'Berakhot 3a',currentBook:'Berakhot',currentBookId:'berakhot',currentIndex:2};
 await emit('reader.current_ref_changed',{...current,currentRef:'Berakhot 3b',currentIndex:3});
 await fire(onlyTimer());
 assert.equal(prepared.length,1);

 // Navigating away cancels any pending work.
 current={currentRef:'Berakhot 4a',currentBook:'Berakhot',currentBookId:'berakhot',currentIndex:4};
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
