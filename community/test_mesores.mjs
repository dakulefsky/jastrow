import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../plugin/mesores.js', import.meta.url), 'utf8');

async function setup({links=[],items=[],currentRef=null,failMethod=null}={}){
 const calls=[];let activeFailure=failMethod;
 const root={
  Otzaria:{
   call:async(method,args)=>{
    calls.push({method,args});
    if(method===activeFailure)return {success:false,error:{code:'permission_denied'}};
    if(method==='reader.getCurrentRef')return {success:!!currentRef,data:currentRef};
    if(method==='library.getLinks')return {success:true,data:{truncated:false,links}};
    if(method==='library.getLinkContent')return {success:true,data:{items}};
    throw new Error('Unexpected API call: '+method);
   }
  }
 };
 const context={window:root,globalThis:root};
 vm.runInNewContext(source,context);
 return {api:root.MesoresHaShas,calls,setFailMethod(value){activeFailure=value;}};
}

const selection={bookId:'ברכות',sectionIndex:42};
const linked=[
 {connectionType:'MESORAT_HASHAS',targetTitle:'שבת',targetLine:17,targetHeRef:'שבת דף יז ע״א',targetCategoryId:8,targetIsUserBook:false},
 {connectionType:'COMMENTARY',targetTitle:'רש״י',targetLine:3,targetHeRef:'רש״י',targetCategoryId:2},
 {connectionType:'MESORAT_HASHAS',targetTitle:'עירובין',targetLine:28,targetHeRef:'עירובין דף כח ע״ב',targetCategoryId:9,targetIsUserBook:false}
];
const loaded=await setup({links:linked,items:[
 {content:'<p>אמר רב יהודה: נפקא מינה לדינא, שמע מינה.</p>'},
 {content:'<p>הכא נמי אמרינן: נפקא מינה.</p>'}
]});
const matches=await loaded.api.find(selection,'נפקא');
assert.equal(matches.length,2,'only Mesores links whose target text contains the selected word are shown');
assert.equal(matches[0].reference,'שבת דף יז ע״א');
assert.equal(matches[1].reference,'עירובין דף כח ע״ב');
const linksCall=loaded.calls.find(call=>call.method==='library.getLinks');
assert.equal(linksCall.args.bookId,'ברכות');
assert.equal(linksCall.args.startLine,42);
assert.equal(linksCall.args.endLine,42);
assert.deepEqual(Array.from(linksCall.args.connectionTypes),['MESORAT_HASHAS']);
const contentCall=loaded.calls.find(call=>call.method==='library.getLinkContent');
assert.equal(contentCall.args.links.length,2);
assert.equal(contentCall.args.links[0].targetCategoryId,8);
assert.equal(contentCall.args.links[0].targetIsUserBook,false);

const phrase=await loaded.api.find(selection,'שמע מינה');
assert.equal(phrase.length,1,'a multi-word lookup must appear as a contiguous phrase');

const wrongWord=await loaded.api.find(selection,'מנפקא');
assert.equal(wrongWord.length,0,'substring matches inside a longer word are rejected');

const fallback=await setup({
 links:[{connectionType:'MESORAT_HASHAS',targetTitle:'פסחים',targetLine:5,targetHeRef:'פסחים דף ה'}],
 items:[{content:'<p>הדין נפקא מינה הכא</p>'}],
 currentRef:{currentBookId:'ברכות',currentIndex:9}
});
const fallbackResults=await fallback.api.find({},'נפקא');
assert.equal(fallbackResults.length,1,'the active reader reference supplies a missing book and line');
assert.equal(fallback.calls.find(x=>x.method==='library.getLinks').args.startLine,9);

const unavailable=await setup({
 failMethod:'library.getLinks',
 links:[{connectionType:'MESORAT_HASHAS',targetTitle:'פסחים',targetLine:5,targetHeRef:'פסחים דף ה'}],
 items:[{content:'<p>הדין נפקא מינה הכא</p>'}]
});
assert.equal((await unavailable.api.find(selection,'נפקא')).length,0,'permission and host errors fail closed');
unavailable.setFailMethod(null);
assert.equal((await unavailable.api.find(selection,'נפקא')).length,1,'a failed lookup is not cached; retry works after access is restored');

assert.equal(loaded.api.tokenize('נִפְקָא').join(','),'נפקא','niqqud is ignored');
assert.equal(loaded.api.connectionType,'MESORAT_HASHAS');

const rankedPropagation=await loaded.api.propagatedPreference(selection,'נפקא',[{rid:'KRU1'},{rid:'KRU2'}],async(_word,_entries,context)=>{
 assert(context.sourceRange.beforeText.raw&&context.sourceRange.afterText.raw,'linked occurrence must be ranked using its own surrounding words');
 return {preferredEntryId:'krupnik:KRU1',preferenceScope:'contextual'};
});
assert.equal(rankedPropagation.preferredEntryId,'krupnik:KRU1','an established contextual meaning propagates from linked exact occurrences');
assert.equal(rankedPropagation.occurrences,2,'each exact occurrence in the linked passages is checked');
const conflictingPropagation=await loaded.api.propagatedPreference(selection,'נפקא',[{rid:'KRU1'},{rid:'KRU2'}],async(_word,_entries,context)=>({
 preferredEntryId:context.sourceRange.beforeText.raw.includes('הכא')?'krupnik:KRU2':'krupnik:KRU1',
 preferenceScope:'contextual'
}));
assert.equal(conflictingPropagation,null,'conflicting linked occurrences must not produce a propagated recommendation');
const generalOnly=await loaded.api.propagatedPreference(selection,'נפקא',[{rid:'KRU1'}],async()=>({preferredEntryId:'krupnik:KRU1',preferenceScope:'general'}));
assert.equal(generalOnly,null,'general word preference must never propagate as a contextual meaning');

console.log('Mesores HaShas client checks passed.');
