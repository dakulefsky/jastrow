'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname);
const pluginPaths=['plugin/mesorat-hashas.js','hebrew/plugin/mesorat-hashas.js'];
const selection={
 currentBookId:'ברכות',currentIndex:42,type:'text',source:'library',
 sourceRange:{beforeText:{raw:'פלוני כי אמר'},afterText:{raw:'לימא הכי'}}
};
const link=(overrides={})=>({
 sourceLine:42,targetTitle:'ברכות',targetLine:81,targetLineEnd:null,
 targetIsUserBook:false,targetCategoryId:7,targetSource:'o',
 connectionType:'MESORAT_HASHAS',...overrides
});
function load(pluginPath,handler){
 const calls=[],sandbox={console};
 sandbox.window=sandbox;sandbox.globalThis=sandbox;
 sandbox.Otzaria={call:async(method,args)=>{calls.push({method,args});return handler(method,args,calls.length);}};
 vm.runInNewContext(fs.readFileSync(path.join(root,pluginPath),'utf8'),sandbox,{filename:pluginPath});
 return {api:sandbox.MesoratHashasContext,calls};
}
function okLinks(links){return {success:true,data:{truncated:false,links}};}
function okContent(items){return {success:true,data:{items}};}


async function testCommunityClient(communityPath){
 const crypto=require('node:crypto').webcrypto,storage=new Map(),suggestions=[],votes=[];
 let suggestionCount=0;
 const sandbox={console,crypto,TextEncoder,URL,Event,AbortController,setTimeout,clearTimeout,
  navigator:{onLine:true},DICTIONARY_COMMUNITY_API:'https://otzaria-dictionary-community.dakulefsky.workers.dev',
  localStorage:{getItem:key=>storage.has(key)?storage.get(key):null,setItem:(key,value)=>storage.set(key,String(value))},
  addEventListener:()=>{},dispatchEvent:()=>{}
 };
 sandbox.window=sandbox;sandbox.globalThis=sandbox;
 sandbox.Otzaria={
  on:()=>{},
  call:async method=>{
   if(method==='app.getGrantedPermissions')return {success:true,data:{permissions:['network.access']}};
   if(method==='app.getConnectivity')return {success:true,data:{isOfflineMode:false,isOnline:true}};
   throw new Error('Unexpected Otzaria call '+method);
  }
 };
 sandbox.fetch=async(url,options={})=>{
  const href=String(url);
  if(href.endsWith('/health'))return {ok:true,json:async()=>({ok:true})};
  if(href.includes('/v1/suggestions')){
   const params=new URL(href).searchParams,context=params.get('context');
   suggestions.push(context?JSON.parse(context):[]);
   suggestionCount++;
   return {ok:true,json:async()=>suggestionCount===1?
    {preferredEntryId:'krupnik:1',preferenceScope:'general',totalVotes:8,contextualVotes:0}:
    {preferredEntryId:'krupnik:2',preferenceScope:'contextual',totalVotes:4,contextualVotes:4}};
  }
  if(href.endsWith('/v1/vote')){
   const payload=JSON.parse(options.body);votes.push(payload);
   return {ok:true,json:async()=>({accepted:true,duplicate:false,votes:3})};
  }
  throw new Error('Unexpected fetch '+href);
 };
 vm.runInNewContext(fs.readFileSync(path.join(root,communityPath),'utf8'),sandbox,{filename:communityPath});
 await sandbox.DictionaryCommunity.ready;
 assert.equal(sandbox.DictionaryCommunity.enabled,true,'network permission should enable community client');
 const source={sourceRange:{beforeText:{raw:'כי אמר'},afterText:{raw:'לימא הכי'}}};
 const parallel={sourceRange:{beforeText:{raw:'רב תנן'},afterText:{raw:'מאי טעמא'}}};
 const ranked=await sandbox.DictionaryCommunity.rank('דאמר',[{rid:'1'},{rid:'2'}],source,[parallel]);
 assert.equal(suggestions.length,2,'one request per separate context is expected');
 assert.equal(ranked.preferredEntryId,'krupnik:2','a contextual parallel-passage result should outrank a general fallback');
 assert.notDeepEqual(suggestions[0],suggestions[1],'contexts must remain separate, not be concatenated');
 const vote=await sandbox.DictionaryCommunity.vote('דאמר',{rid:'1'},{scope:'contextual',selection:source,parallelContexts:[parallel]});
 assert.equal(vote.ok,true);
 assert.equal(votes.length,2,'a selected local vote should be submitted once for the source context and once for its one verified parallel');
 assert.notDeepEqual(votes[0].contextFeatures,votes[1].contextFeatures,'each passage must have its own fingerprint');
 assert.equal(votes[0].voterId,votes[1].voterId,'parallel evidence must remain tied to the same installation');
 const payloadText=JSON.stringify(votes);
 for(const privateTerm of ['ברכות','לימא','מאי טעמא','כי אמר'])assert.equal(payloadText.includes(privateTerm),false,'raw context or references must not leave the device');
 for(const feature of votes.flatMap(x=>x.contextFeatures))assert.match(feature.hash,/^[a-f0-9]{64}$/);
}

(async()=>{
 for(const pluginPath of pluginPaths){
  let loaded=load(pluginPath,(method,args)=>{
   if(method==='library.getLinks')return okLinks([
    link({connectionType:'REFERENCE',targetLine:99}),
    link({sourceLine:41,targetLine:98}),
    link()
   ]);
   if(method==='library.getLinkContent')return okContent([{content:'<p>סוגיה אחרת כי אמר דאמר לימא הכי ועוד</p>'}]);
   throw new Error('Unexpected RPC '+method);
  });
  const parallel=await loaded.api.findParallelContext('דאמר',selection);
  assert.equal(loaded.calls.length,2,pluginPath+' should make one links and one content call');
  assert.equal(loaded.calls[0].method,'library.getLinks');
  assert.deepEqual(JSON.parse(JSON.stringify(loaded.calls[0].args)),{
   bookId:'ברכות',startLine:42,endLine:42,connectionTypes:['MESORAT_HASHAS'],includeAnchors:false
  });
  assert.equal(loaded.calls[1].method,'library.getLinkContent');
  assert.equal(loaded.calls[1].args.links.length,1);
  assert.equal(loaded.calls[1].args.links[0].targetTitle,'ברכות');
  assert.equal(loaded.calls[1].args.links[0].targetLine,81);
  assert.equal(JSON.stringify(parallel),JSON.stringify({
   sourceRange:{beforeText:{raw:'כי אמר'},afterText:{raw:'לימא הכי'}}
  }));
  assert.equal('targetTitle' in parallel,false,'no reference metadata may leave the local resolver');

  loaded=load(pluginPath,(method)=>{
   if(method==='library.getLinks')return okLinks([link()]);
   if(method==='library.getLinkContent')return okContent([{content:'<p>סוגיה כי אמר דאמר מימרא אחרת</p>'}]);
  });
  assert.equal(await loaded.api.findParallelContext('דאמר',selection),null,'one-sided match must be rejected');

  loaded=load(pluginPath,(method)=>{
   if(method==='library.getLinks')return okLinks([link()]);
   if(method==='library.getLinkContent')return okContent([{content:'<p>כי אמר דאמר לימא הכי; כי אמר דאמר לימא הכי</p>'}]);
  });
  assert.equal(await loaded.api.findParallelContext('דאמר',selection),null,'repeated selected word must be rejected');

  loaded=load(pluginPath,(method)=>{
   if(method==='library.getLinks')return okLinks([link()]);
   if(method==='library.getLinkContent')return okContent([{content:'<p>פלוני כי אמר דאמר אחרת מילה</p>'}]);
  });
  assert.equal(await loaded.api.findParallelContext('דאמר',selection),null,'weak match below 75 percent must be rejected');

  loaded=load(pluginPath,(method)=>{
   if(method==='library.getLinks')return okLinks([
    link({targetLine:80}),link({targetLine:82})
   ]);
   if(method==='library.getLinkContent')return okContent([
    {content:'<p>כאן כי אמר דאמר לימא אחרת</p>'},
    {content:'<p>שם פלוני אמר דאמר לימא הכי</p>'}
   ]);
  });
  assert.equal(await loaded.api.findParallelContext('דאמר',selection),null,'equally strong but conflicting matches must be rejected');

  loaded=load(pluginPath,(method)=>{
   if(method==='library.getLinks')return {success:false,error:'forbidden'};
   throw new Error('content must not be fetched after permission failure');
  });
  assert.equal(await loaded.api.findParallelContext('דאמר',selection),null,'denied link permission must fail closed');
  assert.equal(loaded.calls.length,1);

  loaded=load(pluginPath,(method)=>{
   if(method==='library.getLinks')return okLinks([link()]);
   if(method==='library.getLinkContent')return {success:false,error:'forbidden'};
  });
  assert.equal(await loaded.api.findParallelContext('דאמר',selection),null,'denied content permission must fail closed');

  for(const invalid of [
   {...selection,sections:[{},{}]},
   {...selection,sourceRange:undefined},
   {...selection,currentIndex:undefined,sectionIndex:undefined},
   {...selection,source:'user'},
   {...selection,type:'pdf'}
  ]){
   loaded=load(pluginPath,()=>{throw new Error('invalid selection should not make RPC calls');});
   assert.equal(await loaded.api.findParallelContext('דאמר',invalid),null);
   assert.equal(loaded.calls.length,0);
  }
  loaded=load(pluginPath,(method)=>{
   if(method==='library.getLinks')return okLinks([link({targetIsUserBook:true})]);
   throw new Error('user book target must not be fetched');
  });
  assert.equal(await loaded.api.findParallelContext('דאמר',selection),null,'user-book targets must be ignored');
  assert.equal(loaded.calls.length,1);
 }
 for(const communityPath of ['plugin/community.js','hebrew/plugin/community.js'])await testCommunityClient(communityPath);
 console.log('Mesores HaShas local matching and separate-context community tests passed for both plugins.');
})().catch(error=>{console.error(error);process.exitCode=1;});
