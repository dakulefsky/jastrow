'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=__dirname;
const pluginPaths=['plugin/mesores.js','hebrew/plugin/mesores.js'];
const selection={
 bookId:'source-book',
 currentIndex:42,
 currentBook:'ברכות',
 sourceRange:{beforeText:{raw:'פלוני כי אמר'},afterText:{raw:'לימא הכי'}}
};
const link=(reference,line,extra={})=>({
 connectionType:'MESORAT_HASHAS',
 sourceLine:42,
 targetTitle:reference.split(' ')[0],
 targetHeRef:reference,
 targetLine:line,
 targetLineEnd:null,
 targetIsUserBook:false,
 targetSource:'o',
 ...extra
});
function load(pluginPath,{links,passages,preferredByReference={},matchesByReference={},truncated=false,contentTruncated=false}={}){
 const calls=[],comparisons=[];
 const sandbox={console};
 sandbox.window=sandbox;sandbox.globalThis=sandbox;
 sandbox.SefariaEvidence={
  compareTranslation:async(word,entries,linkedSelection)=>{
   const reference=linkedSelection?.sourceRange?.ref||'';
   comparisons.push({word,reference,book:linkedSelection?.currentBook,entries,sourceRange:linkedSelection?.sourceRange});
   if(matchesByReference[reference])return {matches:matchesByReference[reference]};
   const preferred=preferredByReference[reference];
   return {matches:preferred===undefined?[]:[{id:preferred,matchType:'exact'}]};
  }
 };
 sandbox.Otzaria={
  call:async(method,args)=>{
   calls.push({method,args});
   if(method==='library.getLinks')return {success:true,data:{truncated,links:links||[]}};
   if(method==='library.getLinkContent')return {success:true,data:{truncated:contentTruncated,items:(passages||[]).map(value=>typeof value==='string'?{content:value}:value)}};
   throw Error('Unexpected Otzaria call '+method);
  }
 };
 vm.runInNewContext(fs.readFileSync(path.join(root,pluginPath),'utf8'),sandbox,{filename:pluginPath});
 return {api:sandbox.MesoresHaShas,calls,comparisons};
}
const entries=[{id:'0',text:'to say'},{id:'1',text:'he said'}];
const text='סוגיה אחרת כי אמר דאמר לימא הכי ועוד';

(async()=>{
 for(const pluginPath of pluginPaths){
  const refs=['ברכות דף ג עמוד א','שבת דף ד עמוד ב'];
  const loaded=load(pluginPath,{
   links:[link(refs[0],81),link(refs[1],22)],
   passages:[text,text],
   preferredByReference:{[refs[0]]:'1',[refs[1]]:'1'}
  });
  const result=await loaded.api.propagatedPreference(selection,'דאמר',entries);
  assert.equal(result.preferredEntryId,'1',pluginPath+' should carry one uniquely supported parallel meaning');
  assert.equal(result.occurrences,2);
  assert.deepEqual(loaded.comparisons.map(x=>x.reference),refs,'linked Sefaria references must be passed to offline evidence');
  assert(loaded.comparisons.every(x=>Object.keys(x.sourceRange||{}).join(',')==='ref'),'Mesores evidence must not depend on surrounding words');
  assert.equal(loaded.calls.filter(x=>x.method==='library.getLinks').length,1);
  assert.equal(loaded.calls.filter(x=>x.method==='library.getLinkContent').length,1);
  let activeRanks=0,maxConcurrentRanks=0;
  const parallel=load(pluginPath,{links:[link(refs[0],81),link(refs[1],22)],passages:[text,text]});
  const parallelResult=await parallel.api.propagatedPreference(selection,'דאמר',entries,async()=>{
   activeRanks++;maxConcurrentRanks=Math.max(maxConcurrentRanks,activeRanks);
   await new Promise(resolve=>setTimeout(resolve,5));activeRanks--;
   return {preferredEntryId:'1',preferenceScope:'contextual'};
  });
  assert.equal(parallelResult.preferredEntryId,'1');
  assert.equal(maxConcurrentRanks,2,'linked passage translation checks should run concurrently');

  const conflict=load(pluginPath,{
   links:[link(refs[0],81),link(refs[1],22)],
   passages:[text,text],
   preferredByReference:{[refs[0]]:'1',[refs[1]]:'0'}
  });
  assert.equal(await conflict.api.propagatedPreference(selection,'דאמר',entries),null,'conflicting parallel passages must not rank a meaning');

  const ambiguous=load(pluginPath,{
   links:[link(refs[0],81)],
   passages:[text],
   matchesByReference:{[refs[0]]:[
    {id:'0',matchType:'exact'},{id:'1',matchType:'exact'}
   ]}
  });
  assert.equal(await ambiguous.api.propagatedPreference(selection,'דאמר',entries),null,'tied candidate evidence must fail closed');

  const repeated=load(pluginPath,{
   links:[link(refs[0],81)],
   passages:['דאמר כי אמר דאמר לימא הכי'],
   preferredByReference:{[refs[0]]:'1'}
  });
  assert.equal(await repeated.api.propagatedPreference(selection,'דאמר',entries),null,'repeated word occurrences in a linked passage are ambiguous');
  assert.equal(repeated.comparisons.length,0);

  const noOccurrence=load(pluginPath,{
   links:[link(refs[0],81)],
   passages:['סוגיה אחרת אמר לימא הכי'],
   preferredByReference:{[refs[0]]:'1'}
  });
  assert.equal(await noOccurrence.api.propagatedPreference(selection,'דאמר',entries),null);

  const partialContent=load(pluginPath,{
   links:[link(refs[0],81),link(refs[1],22)],
   passages:[text],
   preferredByReference:{[refs[0]]:'1',[refs[1]]:'1'}
  });
  assert.equal(await partialContent.api.propagatedPreference(selection,'דאמר',entries),null,'missing linked content must not allow a partial recommendation');
  assert.equal(partialContent.comparisons.length,0);

  const restrictedContent=load(pluginPath,{
   links:[link(refs[0],81),link(refs[1],22)],
   passages:[text,{error:'forbidden'}],
   preferredByReference:{[refs[0]]:'1',[refs[1]]:'1'}
  });
  assert.equal(await restrictedContent.api.propagatedPreference(selection,'דאמר',entries),null,'restricted linked content must not allow a partial recommendation');
  assert.equal(restrictedContent.comparisons.length,0);

  const partialFlag=load(pluginPath,{
   links:[link(refs[0],81),link(refs[1],22)],
   passages:[text,{content:text,partial:true}],
   preferredByReference:{[refs[0]]:'1',[refs[1]]:'1'}
  });
  assert.equal(await partialFlag.api.propagatedPreference(selection,'דאמר',entries),null,'explicitly partial linked content must fail closed');
  assert.equal(partialFlag.comparisons.length,0);

  const contentTruncated=load(pluginPath,{
   links:[link(refs[0],81),link(refs[1],22)],
   passages:[text,text],
   preferredByReference:{[refs[0]]:'1',[refs[1]]:'1'},
   contentTruncated:true
  });
  assert.equal(await contentTruncated.api.propagatedPreference(selection,'דאמר',entries),null,'truncated linked-content batches must fail closed');
  assert.equal(contentTruncated.comparisons.length,0);

  const truncated=load(pluginPath,{
   links:[link(refs[0],81)],
   passages:[text],
   preferredByReference:{[refs[0]]:'1'},
   truncated:true
  });
  assert.equal(await truncated.api.propagatedPreference(selection,'דאמר',entries),null,'truncated link results must not produce a partial recommendation');
  assert.equal(truncated.calls.filter(x=>x.method==='library.getLinkContent').length,0);

  const unknownSource=load(pluginPath,{
   links:[link(refs[0],81,{targetIsUserBook:undefined,targetSource:undefined})],
   passages:[text],
   preferredByReference:{[refs[0]]:'1'}
  });
  assert.equal(await unknownSource.api.propagatedPreference(selection,'דאמר',entries),null,'unknown link provenance must fail closed');
  assert.equal(unknownSource.calls.filter(x=>x.method==='library.getLinkContent').length,0);

  const userBook=load(pluginPath,{
   links:[link(refs[0],81,{targetIsUserBook:true})],
   passages:[text],
   preferredByReference:{[refs[0]]:'1'}
  });
  assert.equal(await userBook.api.propagatedPreference(selection,'דאמר',entries),null,'user-book links must be excluded');
  assert.equal(userBook.calls.filter(x=>x.method==='library.getLinkContent').length,0);
 }
 console.log('PASS: offline Mesores evidence is unique, reference-aware, agreement-gated, and fail-closed in both dictionaries.');
})().catch(error=>{console.error(error);process.exitCode=1;});
