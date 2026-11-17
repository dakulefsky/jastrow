import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
async function settle(){for(let i=0;i<8;i++)await new Promise(resolve=>setTimeout(resolve,5));}

async function testEnglish(){
 const events=new Map(),calls=[],items=new Map();
 const entries=[{h:'נפקא',source:'krupnik',r:'KRU0001'},{h:'נפקא',source:'jastrow',r:'A00001'}];
 const root={
  JASTROW_INDEX:{entries},
  JastrowContext:{selectionText:p=>p?.selection?.renderedSelectedText||p?.selectedText||''},
  JastrowSearch:{splitWords:w=>[w],normalize:w=>w,hasSelectionTranslations:()=>true},
  Otzaria:{
   on:(name,fn)=>{if(!events.has(name))events.set(name,[]);events.get(name).push(fn);},
   call:async(method,args)=>{calls.push({method,args});if(method==='reader.addContextMenuItem')items.set(args.id,args);if(method==='reader.removeContextMenuItem')items.delete(args.id);return {success:true};}
  }
 };
 const context={window:root,globalThis:root,Otzaria:root.Otzaria,JastrowContext:root.JastrowContext,JastrowSearch:root.JastrowSearch,JASTROW_INDEX:root.JASTROW_INDEX,console};
 vm.runInNewContext(await read('plugin/availability.js'),context);
 for(const fn of events.get('reader.selection_changed')||[])fn({selection:{renderedSelectedText:'נפקא'}});
 await settle();
 assert(items.has('jastrow-lookup'),'English quick lookup must remain available');
 assert(![...items.keys()].some(id=>id.includes('community-vote')),'English voting submenu must not be registered');
 assert.equal(calls.filter(x=>x.method==='reader.addContextMenuItem').length,1,'English should register only the quick lookup menu item');
 assert(calls.some(x=>x.method==='reader.removeContextMenuItem'&&x.args.id==='jastrow-community-votes'),'stale English voting submenu must be removed');
}

async function testHebrew(){
 const events=new Map(),calls=[],items=new Map();
 const root={
  HebrewLookup:{selectionText:p=>p?.selection?.renderedSelectedText||p?.selectedText||'',lookup:()=>[{word:'נפקא',rid:'KRU0001'}]},
  Otzaria:{
   on:(name,fn)=>{if(!events.has(name))events.set(name,[]);events.get(name).push(fn);},
   call:async(method,args)=>{calls.push({method,args});if(method==='reader.addContextMenuItem')items.set(args.id,args);if(method==='reader.removeContextMenuItem')items.delete(args.id);return {success:true};}
  }
 };
 const context={window:root,globalThis:root,Otzaria:root.Otzaria,HebrewLookup:root.HebrewLookup,console};
 vm.runInNewContext(await read('hebrew/plugin/availability.js'),context);
 for(const fn of events.get('reader.selection_changed')||[])fn({selection:{renderedSelectedText:'נפקא'}});
 await settle();
 assert(items.has('aramaic-hebrew-lookup'),'Hebrew quick lookup must remain available');
 assert(![...items.keys()].some(id=>id.includes('community-vote')),'Hebrew voting submenu must not be registered');
 assert.equal(calls.filter(x=>x.method==='reader.addContextMenuItem').length,1,'Hebrew should register only the quick lookup menu item');
 assert(calls.some(x=>x.method==='reader.removeContextMenuItem'&&x.args.id==='aramaic-hebrew-community-votes'),'stale Hebrew voting submenu must be removed');
}
await testEnglish();
await testHebrew();
console.log('PASS: both right-click menus retain dictionary lookup and disable community voting.');
