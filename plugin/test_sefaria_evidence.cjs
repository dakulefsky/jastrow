'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const file=path.join(__dirname,'sefaria-evidence.js');
delete require.cache[require.resolve(file)];
global.Otzaria={call:async method=>method==='app.getGrantedPermissions'?{success:true,data:{permissions:['network.access']}}:{success:true,data:{currentRef:'ברכות דף ב'}}};
const calls=[];
global.fetch=async url=>{
 calls.push(String(url));
 if(String(url).includes('/api/ref/'))return {ok:true,json:async()=>({is_ref:true,ref:'Berakhot 2a'})};
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
 assert.equal(calls.length,2);
 const reordered=await evidence.reorder('אָמַר',entries,{currentRef:'ברכות דף ב'});
 assert.equal(reordered.entries[0].r,'J001');
 const cached=await evidence.lookup('אָמַר',entries,{currentRef:'ברכות דף ב'});
 assert.deepEqual(cached.entryIds,['jastrow:J001']);
 assert.equal(calls.length,2,'repeated lookup should use the cache');
 console.log('Sefaria evidence tests passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
