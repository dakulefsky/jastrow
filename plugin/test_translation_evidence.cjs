'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const file=path.join(__dirname,'sefaria-evidence.js');
delete require.cache[require.resolve(file)];
let localReads=0,hostCalls=0,networkCalls=0,prepared=false;
global.SefariaOfflineTranslation={isDafPrepared:()=>prepared,getPassage:async(ref,selection)=>{
 localReads++;
 assert.equal(ref,'ברכות, דף ב');
 if(selection.currentBook)assert.equal(selection.currentBook,'ברכות');
 return {text:'The law is established and the discussion is complete.',scope:'daf',
  dafReference:'Berakhot 2',license:'CC-BY-NC',versionTitle:'William Davidson Edition - English'};
}};
global.Otzaria={call:async method=>{hostCalls++;assert.equal(method,'reader.getCurrentRef');return {success:true,data:{currentRef:'ברכות, דף ב'}};}};
global.fetch=async()=>{networkCalls++;throw Error('no runtime network requests are allowed');};

(async()=>{
 const evidence=require(file);
 const cold=await evidence.compareTranslation('אָמַר',[{id:'law-context',text:'law is established'}],
  {currentRef:'ברכות, דף ב',currentBook:'ברכות'},{preparedOnly:true});
 assert.equal(cold.reason,'not_prepared');
 assert.equal(localReads,0,'quick lookup must not trigger a cold tractate load');
 prepared=true;
 const result=await evidence.compareTranslation('אָמַר',[{id:'law-context',text:'law is established'},{id:'complete',text:'complete'}],
  {currentRef:'ברכות, דף ב',currentBook:'ברכות'});
 assert.equal(result.source,'offline');
 assert.equal(result.scope,'daf');
 assert.deepEqual(result.matches.map(x=>x.id),['law-context','complete']);
 assert.equal(localReads,1);
 const fallback=await evidence.compareTranslation('אָמַר',[{id:'law-context',text:'law is established'}],{});
 assert.equal(fallback.reason,'candidate_wording_found');
 assert.equal(localReads,2,'reader.getCurrentRef should supply the active daf when selection has no reference');
 assert.equal(hostCalls,1);
 assert.equal(networkCalls,0);
 console.log('Offline translation reference tests passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
