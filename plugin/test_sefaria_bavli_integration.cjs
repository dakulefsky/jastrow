'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

(async()=>{
 for(const pluginRoot of ['plugin','hebrew/plugin']){
  const pluginPath=pluginRoot==='plugin'?__dirname:path.join(__dirname,'..','hebrew','plugin');
  const fetched=[];
  const root={console,Otzaria:{on(){},call:async method=>{throw new Error('Offline comparison unexpectedly called host API: '+method);}}};
  root.document={
   createElement(){return {src:'',async:false,onload:null,onerror:null,remove(){}};},
   head:{appendChild(script){
    const asset=String(script.src);fetched.push(asset);
    try{
     const file=path.join(pluginPath,asset);
     vm.runInNewContext(fs.readFileSync(file,'utf8'),context);
     script.onload?.();
    }catch(error){script.onerror?.(error);}
   }}
  };
  const context={window:root,globalThis:root,console};
  vm.runInNewContext(fs.readFileSync(path.join(pluginPath,'sefaria-offline.js'),'utf8'),context);
  vm.runInNewContext(fs.readFileSync(path.join(pluginPath,'sefaria-evidence.js'),'utf8'),context);
  const result=await root.SefariaEvidence.compareTranslation('שמע',[{id:'candidate-1',text:'beginning of tractate'}],
   {sourceRange:{ref:'ברכות, דף ב עמוד א:1'},currentBook:'ברכות'});
  assert.equal(result.source,'offline',pluginRoot);
  assert.equal(result.scope,'paragraph',pluginRoot);
  assert.equal(result.matches[0].id,'candidate-1',pluginRoot);
  assert.equal(result.matches[0].matchedPhrase,'beginning of tractate',pluginRoot);
  assert.deepEqual(fetched,['data/sefaria-bavli/manifest.js','data/sefaria-bavli/texts/berakhot.js']);
 }
 console.log('Full offline Bavli comparison passed in both plugins');
})().catch(error=>{console.error(error);process.exitCode=1;});
