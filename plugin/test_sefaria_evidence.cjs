'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const file=path.join(__dirname,'sefaria-evidence.js');
delete require.cache[require.resolve(file)];
let localReads=0,networkCalls=0,hostCalls=0,expectedRef='ברכות, דף ב עמוד א:1';
let passageText='The discussion was completed after the law and order were explained.';
global.SefariaOfflineTranslation={getPassage:async(ref,selection)=>{
 localReads++;
 assert.equal(ref,expectedRef);
 assert.equal(selection.currentBook,'ברכות');
 return {text:passageText,scope:'paragraph',
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
 ],'paragraph');
 assert.equal(preferred?.id,'specific','specific contextual phrase should outrank an incidental exact word');
 assert.equal(evidence.bestMatch([
  {id:'one',candidatePhrase:'land',matchType:'exact'},
  {id:'two',candidatePhrase:'land',matchType:'exact'}
 ],'paragraph'),null,'equal evidence must remain unmarked');
 assert.equal(evidence.bestMatch([
  {id:'specific',candidatePhrase:'the fertile land',matchType:'inflected_phrase'}
 ],'daf'),null,'a whole-daf match is not precise enough to recommend a meaning for one selected word');
 assert.equal(evidence.bestMatch([
  {id:'weak',candidatePhrase:'law',matchType:'exact'}
 ],'paragraph'),null,'a lone short/common English word must not trigger a recommendation');
 assert.equal(evidence.bestMatch([
  {id:'near-a',candidatePhrase:'fertile land',matchType:'exact'},
  {id:'near-b',candidatePhrase:'explained law',matchType:'exact'}
 ],'paragraph'),null,'near-equal multiword evidence must remain ambiguous');
 assert.equal(evidence.bestMatch([
  {id:'same',evidenceScore:100},{id:'same',evidenceScore:99}
 ],'paragraph')?.id,'same','multiple phrase hits for one meaning must not create a false tie');
 assert.equal(evidence.bestMatch([
  {id:'strong',evidenceScore:100},{id:'near',evidenceScore:83}
 ],'paragraph'),null,'the shared 18-percent confidence margin must suppress close competitors');
 assert.equal(evidence.bestMatch([
  {id:'strong',evidenceScore:100},{id:'weaker',evidenceScore:81}
 ],'paragraph')?.id,'strong','a sufficiently separated best meaning should be recommended');
 const candidates=[{id:'complete',text:'complete'},{id:'law-order',text:'law and order'},
  {id:'weak-law',text:'law'},{id:'absent',text:'mountain'}];
 const selection={sourceRange:{ref:'ברכות, דף ב עמוד א:1'},currentBook:'ברכות'};
 const result=await evidence.compareTranslation('אָמַר',candidates,selection);
 assert.equal(result.source,'offline');
 assert.equal(result.scope,'paragraph');
 assert.deepEqual(result.matches.map(x=>x.id),['complete','law-order','weak-law']);
 assert.equal(result.matches[0].matchedPhrase,'completed');
 assert.equal(result.matches[1].matchedPhrase,'law and order');
 assert.equal(result.matches.find(item=>item.id==='weak-law')?.evidenceScore,0,
  'a short one-word coincidence may be retained as a lexical hit but carries no recommendation weight');
 assert.equal(evidence.bestMatch(result.matches,result.scope)?.id,'law-order',
  'the two-content-word contextual phrase should outrank a lone inflected word');
 assert.equal(localReads,1);
 await evidence.compareTranslation('אָמַר',candidates,selection);
 assert.equal(localReads,1,'repeat comparison should use the in-memory result cache');
 evidence.clearCache();
 await evidence.compareTranslation('אָמַר',candidates,selection);
 assert.equal(localReads,2,'clearCache should invalidate the comparison cache');
 expectedRef='ברכות, דף ב עמוד א:2';
 passageText='fertile land fertile fertile';
 const shifted=await evidence.compareTranslation('אָמַר',[
  {id:'with-article',text:'the fertile land'},
  {id:'without-article',text:'fertile land'}
 ],{sourceRange:{ref:expectedRef},currentBook:'ברכות'});
 assert.equal(shifted.matches.find(x=>x.id==='with-article')?.evidenceScore,
  shifted.matches.find(x=>x.id==='without-article')?.evidenceScore,
  'dropping a leading article must not shift content-word frequency lookup or inflate rarity');

 assert.equal(networkCalls,0);
 assert.equal(hostCalls,0);
 console.log('Offline translation evidence tests passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
