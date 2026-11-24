const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ctx={};ctx.window=ctx;vm.createContext(ctx);
for(const f of ['data.js','lookup.js','meaning-consolidation.js'])vm.runInContext(fs.readFileSync(__dirname+'/plugin/'+f,'utf8'),ctx);
const lookup=ctx.HebrewLookup,merge=ctx.HebrewMeaningConsolidation.merge;
const exact=lookup.lookup('נפקא');
const groups=merge([{word:'נפקא',records:exact}],'נפקא');
assert(groups.length>0);
assert(groups.every(g=>g.items.length>=1));
const same=merge([{word:'בדיקה',records:[
 {word:'א',rid:'KRU9001',parts:[{meaning:'אותה משמעות בדיוק',text:'פירוט א',label:'1'}]},
 {word:'ב',rid:'KRU9002',parts:[{meaning:'אותה משמעות בדיוק',text:'פירוט ב',label:'2'}]}
]}],'בדיקה');
assert.equal(same.length,1,'identical Hebrew meanings with equivalent numbered labels should consolidate');
assert.equal(same[0].items.length,2,'all original source records must be preserved');
assert.equal(same[0].text,'אותה משמעות בדיוק','the original Hebrew display wording should remain unchanged');
const distinctLabels=merge([{word:'בדיקה',records:[
 {word:'א',rid:'KRU9003',parts:[{meaning:'אותה משמעות בדיוק',text:'פירוט א',label:'פעל 1'}]},
 {word:'ב',rid:'KRU9004',parts:[{meaning:'אותה משמעות בדיוק',text:'פירוט ב',label:'אפע 2'}]}
]}],'בדיקה');
assert.equal(distinctLabels.length,2,'different explicit grammatical labels must remain separate');
const distinctMeaning=merge([{word:'בדיקה',records:[
 {word:'א',rid:'KRU9005',parts:[{meaning:'הפסד',text:'הפסד',label:''}]},
 {word:'ב',rid:'KRU9006',parts:[{meaning:'אבידה',text:'אבידה',label:''}]}
]}],'בדיקה');
assert.equal(distinctMeaning.length,2,'similar subject matter is not enough to merge unreviewed Hebrew synonyms');
const reviewedA={e:{rid:'KRU9007'},p:{meaning:'הפסד',text:'הפסד'}};
const reviewedB={e:{rid:'KRU9008'},p:{meaning:'אובדן',text:'אובדן'}};
ctx.HebrewMeaningConsolidation.reviewedSynonymPairs.add(ctx.HebrewMeaningConsolidation.pairKey(reviewedA,reviewedB));
const reviewed=merge([{word:'בדיקה',records:[
 {word:'א',rid:'KRU9007',parts:[reviewedA.p]},
 {word:'ב',rid:'KRU9008',parts:[reviewedB.p]}
]}],'בדיקה');
assert.equal(reviewed.length,1,'only an explicitly reviewed source-scoped Hebrew synonym pair should consolidate');
assert.equal(reviewed[0].items.length,2,'reviewed Hebrew synonym consolidation must preserve both source records');
const segments=merge([{word:'נפקא מינה',records:lookup.lookup('נפקא מינה')},{word:'נפקא',records:lookup.lookup('נפקא')}],'נפקא מינה נפקא');
assert(segments.some(g=>g.scope==='נפקא מינה')&&segments.some(g=>g.scope==='נפקא'),'separate words in a multiword selection must never be merged together');
console.log('PASS: shared Hebrew meaning consolidation preserves exact source wording, labels, source records, and phrase boundaries.');
