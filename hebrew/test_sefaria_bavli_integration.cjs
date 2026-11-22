'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

(async()=>{
 const pluginPath=path.join(__dirname,'plugin'),fetched=[];
 const root={console,Otzaria:{on(){},call:async method=>{throw new Error('Offline Hebrew comparison unexpectedly called host API: '+method);}}};
 root.document={
  createElement(){return {src:'',async:false,onload:null,onerror:null,remove(){}};},
  head:{appendChild(script){
   const asset=String(script.src);fetched.push(asset);
   try{vm.runInNewContext(fs.readFileSync(path.join(pluginPath,asset),'utf8'),context);script.onload?.();}
   catch(error){script.onerror?.(error);}
  }}
 };
 const context={window:root,globalThis:root,console};
 vm.runInNewContext(fs.readFileSync(path.join(pluginPath,'sefaria-offline.js'),'utf8'),context);
 vm.runInNewContext(fs.readFileSync(path.join(pluginPath,'sefaria-evidence.js'),'utf8'),context);
 const selection={sourceRange:{ref:'ברכות, דף ב עמוד א:1'},currentBook:'ברכות'};
 const passage=await root.SefariaOfflineTranslation.getPassage(selection.sourceRange.ref,selection);
 assert.equal(passage.source,'offline');
 assert.equal(passage.scope,'paragraph');
 assert.equal(passage.versionTitle,'William Davidson Edition - Hebrew');
 assert(passage.text&&/[א-ת]/.test(passage.text),'Hebrew Steinsaltz paragraph should be readable');
 const phrase=root.SefariaEvidence.normalizeHebrew(passage.text).split(' ').slice(0,4).join(' ');
 assert(phrase.split(' ').length>=2);
 const result=await root.SefariaEvidence.compareTranslation('בדיקה',[{id:'hebrew-source',text:phrase}],selection);
 assert.equal(result.source,'offline');
 assert.equal(result.scope,'paragraph');
 assert.equal(result.versionTitle,'William Davidson Edition - Hebrew');
 assert.equal(result.matches[0]?.id,'hebrew-source');
 assert.equal(result.matches[0]?.matchedPhrase,phrase);
 assert.deepEqual(fetched,['data/sefaria-bavli/manifest.js','data/sefaria-bavli/texts/berakhot.js']);
 console.log('Full offline Hebrew Steinsaltz paragraph comparison passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
