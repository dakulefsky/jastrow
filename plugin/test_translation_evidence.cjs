'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const file=path.join(__dirname,'sefaria-evidence.js');
delete require.cache[require.resolve(file)];
global.Otzaria={call:async method=>method==='app.getConnectivity'?{success:true,data:{isOnline:true}}:method==='app.getGrantedPermissions'?{success:true,data:{permissions:['network.access']}}:{success:true,data:{}}};
const calls=[];
global.fetch=async url=>{
 calls.push(String(url));
 if(String(url).includes('/api/ref/'))return {ok:true,json:async()=>({is_ref:true,normalized:'Berakhot 2a:1'})};
 if(String(url).includes('/api/v3/texts/'))return {ok:true,json:async()=>({versions:[{
  versionTitle:'William Davidson Edition - English',license:'CC-BY-NC',
  text:['The discussion is completed. The forest is mentioned elsewhere.']
 }]})};
 throw Error('Unexpected URL '+url);
};
(async()=>{
 const evidence=require(file);
 const candidates=[{id:'completion',text:'completion'},{id:'forest',text:'forest'},{id:'short',text:'a'}];
 const result=await evidence.compareTranslation('אָמַר',candidates,{sourceRange:{ref:'ברכות ב ע״א:א'}});
 assert.deepEqual(result.matches.map(x=>x.id),['completion','forest']);
 assert.equal(result.versionTitle,'William Davidson Edition - English');
 assert.equal(result.license,'CC-BY-NC');
 assert.equal(result.scope,'paragraph');
 const again=await evidence.compareTranslation('אָמַר',candidates,{sourceRange:{ref:'ברכות ב ע״א:א'}});
 assert.deepEqual(again.matches,result.matches);
 assert.equal(calls.length,2,'reference and translation should be cached');
 delete require.cache[require.resolve(file)];
 let deniedFetches=0;
 global.Otzaria={call:async method=>method==='app.getConnectivity'?{success:true,data:{isOnline:true}}:{success:true,data:{permissions:[]}}};
 global.fetch=async()=>{deniedFetches++;throw Error('network must not be used without permission');};
 const denied=require(file);
 const deniedResult=await denied.compareTranslation('אָמַר',candidates,{currentRef:'Berakhot 2a'});
 assert.equal(deniedResult.reason,'permission');
 assert.equal(deniedFetches,0);
 console.log('Sefaria translation evidence tests passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
