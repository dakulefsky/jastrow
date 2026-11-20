'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

(async()=>{
 const events=new Map(),menus=[];
 const selection={renderedSelectedText:'נפקא מינה',currentRef:'ברכות, דף ב עמוד א:1',currentBook:'ברכות',
  sourceRange:{ref:'ברכות, דף ב עמוד א:1'}};
 let prepared=false;
 const host={
  on(name,fn){if(!events.has(name))events.set(name,[]);events.get(name).push(fn);},
  async call(method,args){
   if(method==='reader.getSelection')return {success:true,data:selection};
   if(method==='reader.addContextMenuItem'){menus.push(args);return {success:true};}
   if(method==='reader.removeContextMenuItem')return {success:true};
   throw Error('Unexpected host call '+method);
  }
 };
 const root={Otzaria:host,console,JASTROW_INDEX:{},
  JastrowSearch:{hasSelectionTranslations:()=>true,normalize:x=>String(x||'').normalize('NFKC'),splitWords:x=>String(x||'').split(/\s+/),hasVowels:()=>false},
  JastrowContext:{selectionText:p=>p?.renderedSelectedText||p?.selectedText||p?.text||''},
  DictionaryQuick:{captureReaderContext:async p=>p,results:async()=>[{text:'the practical difference is',spelling:'נפקא מינה',entryId:7,recommended:prepared}]}
 };
 root.window=root;
 vm.runInNewContext(fs.readFileSync('plugin/availability.js','utf8'),{window:root,console});
 const emit=async(name,payload)=>{for(const fn of events.get(name)||[])await fn(payload);};
 async function waitForMenu(count){
  for(let i=0;i<40;i++){const current=menus.filter(x=>x.id==='jastrow-lookup'&&x.children?.some(c=>c.param?.entryId===7));if(current.length>=count)return current.at(-1);await new Promise(resolve=>setImmediate(resolve));}
  throw Error('Timed out waiting for refreshed native menu');
 }
 await emit('reader.selection_changed',selection);
 const first=await waitForMenu(1);
 assert(!first.children[0].title.startsWith('★'),'first immediate menu should show choices without premature recommendation');
 prepared=true;
 assert.equal(await root.JastrowRefreshMenu({reference:selection.currentRef}),true,'background preparation should refresh the live selected word');
 const refreshed=await waitForMenu(2);
 assert(refreshed.children[0].title.startsWith('★'),'reopening the same selection must now show the evidence-backed recommendation');
 assert.equal(refreshed.children[0].param.entryId,7);
 console.log('PASS: the same native right-click menu refreshes from immediate choices to a contextual recommendation after daf preparation.');
})().catch(error=>{console.error(error);process.exit(1)});