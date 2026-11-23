'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

(async()=>{
 {
  const pluginPath=__dirname;
  const fetched=[];
  const root={console,Otzaria:{on(){},call:async (method,args)=>{
    if(method==='library.getBookToc')return {success:true,data:[
     {text:'ברכות, דף ב עמוד א',index:0},
     {text:'ברכות, דף ב עמוד ב',index:100}
    ]};
    throw new Error('Unexpected host API call: '+method);
   }}};
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
  assert.equal(result.source,'offline','English plugin');
  assert.equal(result.scope,'paragraph','English plugin');
  assert.equal(result.matches[0].id,'candidate-1','English plugin');
  assert.equal(result.matches[0].matchedPhrase,'beginning of tractate','English plugin');
  assert.deepEqual(fetched,['data/sefaria-bavli/manifest.js','data/sefaria-bavli/texts/berakhot.js']);
  // Actual Otzaria selection shape: currentRef identifies the daf side,
  // while currentIndex identifies the selected source line. The Aramaic
  // sourceRange text is not the English translation and cannot be matched
  // directly against the bundled translation.
  const data=root.SefariaOfflineTranslationData?.berakhot;
  assert(Array.isArray(data?.text?.[0])&&data.text[2].length>1,'Berakhot 2a has multiple English segments');
  assert(Array.isArray(data?.text?.[1])&&data.text[3].length>1,'Berakhot 2b has multiple English segments');
  for(const [side,index,expected] of [
   ['a',0,data.text[2][0]],['a',1,data.text[2][1]],
   ['b',100,data.text[3][0]],['b',101,data.text[3][1]]
  ]){
   const selected={currentRef:'ברכות, דף ב עמוד '+(side==='a'?'א':'ב'),currentBook:'ברכות',
    currentBookId:'berakhot',currentIndex:index,sectionIndex:index,
    sourceRange:{exactText:'שמע ישראל'}};
   const passage=await root.SefariaOfflineTranslation.getPassage(selected.currentRef,selected);
   assert.equal(passage.scope,'paragraph','TOC-relative English paragraph scope '+side+':'+index);
   assert.equal(passage.text,expected,'correct English paragraph for selected source line '+side+':'+index);
  }
 }
 console.log('Full offline English Bavli comparison passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
