'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const file=path.join(__dirname,'sefaria-evidence.js');
delete require.cache[require.resolve(file)];
let localReads=0,networkCalls=0,hostCalls=0;
global.SefariaOfflineTranslation={getPassage:async(ref,selection)=>{
 localReads++;
 assert.equal(ref,'ברכות, דף ב עמוד א:1');
 assert.equal(selection.currentBook,'ברכות');
 return {text:'The discussion was completed after the law and order were explained.',scope:'paragraph',
  dafReference:'Berakhot 2a',license:'CC-BY-NC',versionTitle:'William Davidson Edition - English'};
}};
global.Otzaria={call:async()=>{hostCalls++;throw Error('host fallback should not be needed');}};
global.fetch=async()=>{networkCalls++;throw Error('the dictionary must never use network access');};

(async()=>{
 const evidence=require(file);
 assert.equal(evidence.lookup,undefined);
 assert.equal(evidence.reorder,undefined);
 const preferred=evidence.bestMatch([
  {id:'incidental',candidatePhrase:'land',matchType:'exact'},
  {id:'specific',candidatePhrase:'the fertile land',matchType:'inflected_phrase'}
 ]);
 assert.equal(preferred?.id,'specific','specific contextual phrase should outrank an incidental exact word');
 assert.equal(evidence.bestMatch([
  {id:'one',candidatePhrase:'land',matchType:'exact'},
  {id:'two',candidatePhrase:'land',matchType:'exact'}
 ]),null,'equal evidence must remain unmarked');
 const candidates=[{id:'complete',text:'complete'},{id:'law-order',text:'law and order'},{id:'absent',text:'mountain'}];
 const selection={sourceRange:{ref:'ברכות, דף ב עמוד א:1'},currentBook:'ברכות'};
 const result=await evidence.compareTranslation('אָמַר',candidates,selection);
 assert.equal(result.source,'offline');
 assert.equal(result.scope,'paragraph');
 assert.deepEqual(result.matches.map(x=>x.id),['complete','law-order']);
 assert.equal(result.matches[0].matchedPhrase,'completed');
 assert.equal(result.matches[1].matchedPhrase,'law and order');
 assert.equal(localReads,1);
 await evidence.compareTranslation('אָמַר',candidates,selection);
 assert.equal(localReads,1,'repeat comparison should use the in-memory result cache');
 evidence.clearCache();
 await evidence.compareTranslation('אָמַר',candidates,selection);
 assert.equal(localReads,2,'clearCache should invalidate the comparison cache');
 assert.equal(networkCalls,0);
 assert.equal(hostCalls,0);
 console.log('Offline translation evidence tests passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
