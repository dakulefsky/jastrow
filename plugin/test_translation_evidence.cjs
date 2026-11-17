'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const file=path.join(__dirname,'sefaria-evidence.js');
delete require.cache[require.resolve(file)];
let localReads=0,hostCalls=0,networkCalls=0;
global.SefariaOfflineTranslation={getPassage:async(ref,selection)=>{
 localReads++;
 assert.equal(ref,'ברכות, דף ב');
 assert.equal(selection.currentBook,'ברכות');
 return {text:'The law is established and the discussion is complete.',scope:'daf',
  dafReference:'Berakhot 2',license:'CC-BY-NC',versionTitle:'William Davidson Edition - English'};
}};
global.Otzaria={call:async method=>{hostCalls++;assert.equal(method,'reader.getCurrentRef');return {success:true,data:{currentRef:'ברכות, דף ב'}};}};
global.fetch=async()=>{networkCalls++;throw Error('no runtime network requests are allowed');};

(async()=>{
 const evidence=require(file);
 const result=await evidence.compareTranslation('אָמַר',[{id:'law',text:'law'},{id:'complete',text:'complete'}],
  {currentRef:'ברכות, דף ב',currentBook:'ברכות'});
 assert.equal(result.source,'offline');
 assert.equal(result.scope,'daf');
 assert.deepEqual(result.matches.map(x=>x.id),['law','complete']);
 assert.equal(localReads,1);
 const fallback=await evidence.compareTranslation('אָמַר',[{id:'law',text:'law'}],{});
 assert.equal(fallback.reason,'no_reference');
 assert.equal(hostCalls,1);
 assert.equal(networkCalls,0);
 console.log('Offline translation reference tests passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
