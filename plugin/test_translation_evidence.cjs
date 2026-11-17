'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const file=path.join(__dirname,'sefaria-evidence.js');
delete require.cache[require.resolve(file)];
global.Otzaria={call:async method=>method==='app.getConnectivity'?{success:true,data:{isOnline:true}}:method==='app.getGrantedPermissions'?{success:true,data:{permissions:['network.access']}}:{success:true,data:{}}};
const calls=[];
global.fetch=async url=>{
 calls.push(String(url));
 if(String(url).includes('/api/ref/'))return {ok:true,json:async()=>({is_ref:true,normalized:'Berakhot 2a:1'})};
 if(String(url).includes('/api/v3/texts/'))return {ok:true,json:async()=>({versions:[{
  versionTitle:'William Davidson Edition - English',license:'CC-BY-NC',
  text:['The completion of the discussion was completed after studying the law; he said it was finished. The forest is mentioned elsewhere. A poor person entered the hall. A man was hopping nearby.']
 }]})};
 throw Error('Unexpected URL '+url);
};
(async()=>{
 const evidence=require(file);
 const candidates=[{id:'completion',text:'completion'},{id:'forest',text:'forest'},{id:'complete',text:'complete'},{id:'study',text:'study'},{id:'say',text:'say'},{id:'law',text:'law'},{id:'poor-person',text:'poor person'},{id:'person-poor',text:'person poor'},{id:'hope',text:'hope'},{id:'hop',text:'hop'},{id:'stopword',text:'the'},{id:'short',text:'a'}];
 const result=await evidence.compareTranslation('אָמַר',candidates,{sourceRange:{ref:'ברכות ב ע״א:א'}});
 assert.deepEqual(result.matches.map(x=>x.id),['completion','forest','complete','study','say','law','poor-person','hop']);
 assert(result.matches.find(x=>x.id==='complete'),'silent-e inflection should match complete/completed');
 assert(result.matches.find(x=>x.id==='study'),'continuous inflection should match study/studying');
 assert(result.matches.find(x=>x.id==='say'),'irregular verb should match say/said');
 assert(!result.matches.some(x=>x.id==='hope'),'doubled-consonant forms must not create a false silent-e match');
 assert(!result.matches.some(x=>x.id==='person-poor'),'multiword candidates must match in the same word order');
 assert.equal(result.matches.find(x=>x.id==='complete').matchedPhrase,'completed','UI evidence must show the wording actually present in the translation');
 assert.equal(result.matches.find(x=>x.id==='complete').matchType,'inflected_word');
 assert.equal(result.matches.find(x=>x.id==='poor-person').matchedPhrase,'poor person','multiword candidate should match as a contiguous phrase');
 assert(!result.matches.some(x=>x.id==='stopword'),'function words must not create matches');
 assert.equal(result.versionTitle,'William Davidson Edition - English');
 assert.equal(result.license,'CC-BY-NC');
 assert.equal(result.scope,'paragraph');
 const again=await evidence.compareTranslation('אָמַר',candidates,{sourceRange:{ref:'ברכות ב ע״א:א'}});
 assert.deepEqual(again.matches,result.matches);
 assert.equal(calls.length,2,'reference and translation should be cached');
 const noMatch=await evidence.compareTranslation('אָמַר',[{id:'unrelated',text:'a completely unrelated meaning'}],{sourceRange:{ref:'ברכות ב ע״א:א'}});
 assert.equal(noMatch.matches.length,0,'a missing wording match must remain neutral');
 assert.equal(noMatch.reason,'no_candidate_wording_found');
 evidence.clearCache();
 global.fetch=async url=>String(url).includes('/api/ref/')
  ?{ok:true,json:async()=>({is_ref:true,normalized:'Berakhot 2a:1'})}
  :{ok:true,json:async()=>({versions:[{versionTitle:'William Davidson Edition - English',license:'CC-BY-SA',text:['The discussion continues.']}]})};
 const unlicensed=await evidence.compareTranslation('אָמַר',[{id:'x',text:'discussion'}],{sourceRange:{ref:'ברכות ב ע״א:א'}});
 assert.equal(unlicensed.reason,'license_unrecognized','unrecognized or changed licensing must disable the comparison');
 assert.equal(unlicensed.matches.length,0);
 const englishApp=fs.readFileSync(path.join(__dirname,'app.js'),'utf8');
 const hebrewApp=fs.readFileSync(path.join(__dirname,'../hebrew/plugin/app.js'),'utf8');
 const englishQuick=fs.readFileSync(path.join(__dirname,'quick-lookup.js'),'utf8');
 const hebrewQuick=fs.readFileSync(path.join(__dirname,'../hebrew/plugin/quick-lookup.js'),'utf8');
 assert(englishApp.includes('DictionaryMeanings.merge(records,word)')&&englishApp.includes('Steinsaltz translation cross-check'),'full English dictionary view must show candidate-level translation evidence');
 assert(hebrewApp.includes("g.items.map(({p})=>p.english||'')")&&hebrewApp.includes('translationMatches.get(String(groupIndex))'),'full Hebrew dictionary view must compare each Krupnik meaning using its original English gloss');
 assert(englishQuick.includes('Steinsaltz wording:')&&englishQuick.includes('item.translationPhrase'),'English right-click results must show the actual matching translation wording');
 assert(hebrewQuick.includes('הניסוח בתרגום סטיינזלץ:')&&hebrewQuick.includes('x.translationPhrase'),'Hebrew right-click results must show the actual matching translation wording');
 delete require.cache[require.resolve(file)];
 let deniedFetches=0;
 global.Otzaria={call:async method=>method==='app.getConnectivity'?{success:true,data:{isOnline:true}}:{success:true,data:{permissions:[]}}};
 global.fetch=async()=>{deniedFetches++;throw Error('network must not be used without permission');};
 const denied=require(file);
 const deniedResult=await denied.compareTranslation('אָמַר',candidates,{currentRef:'Berakhot 2a'});
 assert.equal(deniedResult.reason,'permission');
 assert.equal(deniedFetches,0);

 // The bundled English Bavli must work with network permission denied.
 global.SefariaOfflineTranslation={getPassage:async(ref,selection)=>{
  assert.equal(ref,'Berakhot 2a:1');
  assert.equal(selection.currentBook,'Berakhot');
  return {text:'The discussion was completed after the law was explained.',scope:'paragraph',
   dafReference:'Berakhot 2a',license:'CC-BY-NC',versionTitle:'William Davidson Edition - English'};
 }};
 const offline=await denied.compareTranslation('מילתא',[{id:'complete',text:'complete'},{id:'law',text:'law'}],
  {sourceRange:{ref:'Berakhot 2a:1'},currentBook:'Berakhot'});
 assert.equal(offline.source,'offline');
 assert.deepEqual(offline.matches.map(x=>x.id),['complete','law']);
 assert.equal(offline.matches[0].matchedPhrase,'completed');
 assert.equal(offline.scope,'paragraph');
 assert.equal(deniedFetches,0,'offline comparison must not make any network request');
 console.log('Sefaria translation evidence tests passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
