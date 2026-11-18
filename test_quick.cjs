const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const events={},calls=[],c={console,Otzaria:{on:(e,f)=>events[e]=f,call:async(method,args)=>{calls.push({method,args});return {success:true}}}};
c.window=c;vm.createContext(c);
for(const f of ['search.js','data/index.js','data/attested-forms.js','data/ranking.js','data/krupnik-index.js','data/phrases.js','data/inflections.js','context-menu.js','reading-view.js','unified-view.js'])vm.runInContext(fs.readFileSync(__dirname+'/plugin/'+f,'utf8'),c);
c.JASTROW_CHUNKS={};
for(const f of fs.readdirSync(__dirname+'/plugin/data').filter(x=>/^(krupnik-|chunk-)\d+\.js$/.test(x)))vm.runInContext(fs.readFileSync(__dirname+'/plugin/data/'+f,'utf8'),c);
vm.runInContext(fs.readFileSync(__dirname+'/plugin/quick-lookup.js','utf8'),c);
(async()=>{
 const selection={currentBook:'ברכות',sourceRange:{ref:'ברכות, דף ב עמוד א:1',beforeText:{raw:'הדבר הוא '},afterText:{raw:' בפועל'} }};
 const offline=await c.DictionaryQuick.results('נפקא מינה',null,{maxCandidates:24});
 assert(offline.length>0,'known phrase should have dictionary meanings');
 assert(offline[0].text.includes('the practical difference is'));
 assert(Number.isInteger(offline[0].entryId),'each quick choice must retain its source entry id');
 let comparisonCalled=false;
 c.SefariaEvidence={compareTranslation:async(word,candidates,context,options)=>{
  comparisonCalled=true;assert.equal(word,'נפקא מינה');assert(context.sourceRange?.ref);assert.equal(options.preparedOnly,true);
  assert(candidates.length>0);
  return {matches:[{id:candidates[0].id,matchedPhrase:'the practical difference',matchType:'exact'}],scope:'paragraph',source:'offline'};
 }};
 const contextual=await c.DictionaryQuick.results('נפקא מינה',selection,{maxCandidates:24});
 assert(comparisonCalled,'prepared offline translation evidence should be checked');
 assert.equal(contextual[0].translationMatch,true,'the strongest contextual candidate should rank first');
 assert.equal(contextual[0].translationPhrase,'the practical difference');
 assert(Number.isInteger(contextual[0].entryId));
 assert.equal(typeof c.DictionaryQuick.captureReaderContext,'function');
 assert.equal(c.DictionaryQuick.message,undefined,'the old message-based quick result is no longer the UI');
 assert.equal(calls.filter(x=>x.method==='ui.showMessage').length,0);
 console.log('PASS: offline phrase meanings, source-entry identity, prepared contextual evidence ranking, and native-menu data (no message popup).');
})().catch(e=>{console.error(e);process.exit(1)});
