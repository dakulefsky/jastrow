'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const file=path.join(__dirname,'sefaria-evidence.js');
delete require.cache[require.resolve(file)];
global.Otzaria={call:async method=>method==='app.getGrantedPermissions'?{success:true,data:{permissions:['network.access']}}:{success:true,data:{currentRef:'ברכות דף ב'}}};
const calls=[];
global.fetch=async url=>{
 calls.push(String(url));
 if(String(url).includes('/api/ref/'))return {ok:true,json:async()=>({is_ref:true,normalized:'Berakhot 2a',url_ref:'Berakhot_2a'})};
 if(String(url).includes('/api/words/')){
  return {ok:true,json:async()=>[
   {parent_lexicon:'Jastrow Dictionary',headword:'אָמַר I',refs:['Berakhot 2a']},
   {parent_lexicon:'Jastrow Dictionary',headword:'אָמַר II',refs:['Berakhot 3a']},
   {parent_lexicon:'Klein Dictionary',headword:'אָמַר',refs:['Berakhot 2a']}
  ]};
 }
 throw Error('Unexpected URL '+url);
};
(async()=>{
 const evidence=require(file);
 const entries=[{r:'J001',h:'אָמַר I'},{r:'J002',h:'אָמַר II'}];
 const result=await evidence.lookup('אָמַר',entries,{currentRef:'ברכות דף ב'});
 assert.deepEqual(result.entryIds,['jastrow:J001']);
 assert.equal(result.reference,'ברכות דף ב');
 assert.equal(result.canonicalReference,'Berakhot 2a');
 assert.equal(calls.length,2);
 const reordered=await evidence.reorder('אָמַר',entries,{currentRef:'ברכות דף ב'});
 assert.equal(reordered.entries[0].r,'J001');
 const cached=await evidence.lookup('אָמַר',entries,{currentRef:'ברכות דף ב'});
 assert.deepEqual(cached.entryIds,['jastrow:J001']);
 assert.equal(calls.length,2,'repeated lookup should use the cache');
 delete require.cache[require.resolve(file)];
 let deniedFetches=0;
 global.Otzaria={call:async method=>method==='app.getConnectivity'?{success:true,data:{isOnline:true}}:{success:true,data:{permissions:[]}}};
 global.fetch=async()=>{deniedFetches++;throw Error('network must not be used without permission');};
 const denied=require(file);
 const deniedResult=await denied.lookup('אָמַר',entries,{currentRef:'ברכות דף ב'});
 assert.equal(deniedResult.reason,'permission');
 assert.equal(deniedFetches,0,'network permission denial must prevent external requests');
 console.log('Sefaria evidence tests passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
