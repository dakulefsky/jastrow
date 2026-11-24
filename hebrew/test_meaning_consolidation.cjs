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
const unknownLabel=merge([{word:'בדיקה',records:[
 {word:'א',rid:'KRU9010',parts:[{meaning:'משמעות משותפת',text:'פירוט א',label:'פעל 1'}]},
 {word:'ב',rid:'KRU9011',parts:[{meaning:'משמעות משותפת',text:'פירוט ב',label:''}]}
]}],'בדיקה');
assert.equal(unknownLabel.length,1,'an unknown grammatical label must not block an otherwise exact meaning match');
const distinctLabels=merge([{word:'בדיקה',records:[
 {word:'א',rid:'KRU9003',parts:[{meaning:'אותה משמעות בדיוק',text:'פירוט א',label:'פעל 1'}]},
 {word:'ב',rid:'KRU9004',parts:[{meaning:'אותה משמעות בדיוק',text:'פירוט ב',label:'אפע 2'}]}
]}],'בדיקה');
assert.equal(distinctLabels.length,2,'different explicit grammatical labels must remain separate');
const reorderedHebrew=merge([{word:'בדיקה',records:[
 {word:'א',rid:'KRU9050',parts:[{meaning:'בית, ביתו',text:'פירוט א',label:''}]},
 {word:'ב',rid:'KRU9051',parts:[{meaning:'ביתו; בית',text:'פירוט ב',label:''}]}
]}],'בדיקה');
assert.equal(reorderedHebrew.length,1,'the same exact Hebrew alternatives should consolidate when their order and punctuation differ');
assert.equal(reorderedHebrew[0].items.length,2,'both original Hebrew records must remain available');
assert.notEqual(ctx.HebrewMeaningConsolidation.canonicalMeaningKey('אח אב'),ctx.HebrewMeaningConsolidation.canonicalMeaningKey('אב אח'),'word order within a Hebrew meaning must remain significant');
const partialHebrewSense=merge([{word:'בדיקה',records:[
 {word:'א',rid:'KRU9101',parts:[{meaning:'בתנאי',text:'פירוט א',label:''}]},
 {word:'ב',rid:'KRU9102',parts:[{meaning:'בתנאי, בכוונה',text:'פירוט ב',label:''}]}
]}],'בדיקה');
assert.equal(partialHebrewSense.length,2,'an exact shared Hebrew alternative should consolidate without absorbing an extra sense');
const sharedCondition=partialHebrewSense.find(group=>group.text==='בתנאי');
const separateIntention=partialHebrewSense.find(group=>group.text==='בכוונה');
assert(sharedCondition&&separateIntention,'the shared condition and additional intention should remain independently visible');
assert.equal(sharedCondition.items.length,2,'the exact shared alternative should retain both source records');
assert.equal(separateIntention.items.length,1,'the additional intention sense should remain on its own');
assert.equal(separateIntention.items[0].p.meaning,'בתנאי, בכוונה','the original complete Hebrew source wording must remain accessible');
assert.deepEqual(Array.from(ctx.HebrewMeaningConsolidation.splitAlternatives('תנאי (כך, וכך), דבר נוסף')),['תנאי (כך, וכך)','דבר נוסף'],'commas inside parenthetical explanations must not split Hebrew alternatives');

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
assert.equal(reviewed[0].text,'הפסד / אובדן','the consolidated Hebrew gloss should visibly preserve both original synonym forms');
ctx.HebrewMeaningConsolidation.reviewedSynonymPairs.delete(ctx.HebrewMeaningConsolidation.pairKey(reviewedA,reviewedB));
function assertReviewedPair(a,b,word,meaningA,meaningB){
 const records=ctx.HEBREW_DICTIONARY.entries.filter(entry=>entry.rid===a||entry.rid===b);
 assert.equal(records.length,2,'both original Hebrew source records must exist: '+a+' / '+b);
 const groups=merge([{word,records}],word);
 const norm=ctx.HebrewMeaningConsolidation.normalize;
 const matching=groups.filter(group=>
  group.items.some(item=>item.e.rid===a&&norm(item.p.meaning||item.p.text)===norm(meaningA))&&
  group.items.some(item=>item.e.rid===b&&norm(item.p.meaning||item.p.text)===norm(meaningB))
 );
 assert.equal(matching.length,1,'the exact reviewed Hebrew gloss pair should consolidate without collapsing other senses: '+a+' / '+b);
}
assertReviewedPair('KRU03116','KRU15803','בעל פקדון','מי שמפקידין אצלו','נאמן, שומר');
assertReviewedPair('KRU03661','KRU03664','גדל','קלע וסבך חוטים או שערות וכדומה','עשה מעשה גדיל, קלע');
assertReviewedPair('KRU06890','KRU06892','חזר','שנה, עשה שוב','שב ועשה');
assertReviewedPair('KRU07618','KRU07619','חשוך','כהה','תרג׳ עמ׳ ה׳ כ׳ (חושך יום ה׳): חשוך יומא דעתיד למיתי.');
assertReviewedPair('KRU15532','KRU15533','פלח','העריץ ועבד לאלהות','עבד לאלהות');
assertReviewedPair('KRU15825','KRU15827','פקע','נבקע','נפקע');
assertReviewedPair('KRU02835','KRU02882','בליי','השחית','שחק, קילקל');
assertReviewedPair('KRU14546','KRU16290','עלי ועל צוארי','על אחריותי','אני מקבל עלי את האחריות');
assertReviewedPair('KRU15796','KRU15797','פצל','ביקע, הפריד','חילק');
assertReviewedPair('KRU00145','KRU04650','אגב גררא','בהזדמנות','על ידי המשך הדבור, דרך אגב');
assertReviewedPair('KRU02736','KRU02892','בית הבליעה','מקום הבליעה בגרון','פנים הגרון');
const segments=merge([{word:'נפקא מינה',records:lookup.lookup('נפקא מינה')},{word:'נפקא',records:lookup.lookup('נפקא')}],'נפקא מינה נפקא');
assert(segments.some(g=>g.scope==='נפקא מינה')&&segments.some(g=>g.scope==='נפקא'),'separate words in a multiword selection must never be merged together');
assert.equal(ctx.HebrewMeaningConsolidation.reviewedSynonymPairs.size,11,'only the ten manually reviewed Hebrew synonym pairs should be active');
console.log('PASS: shared Hebrew meaning consolidation preserves exact source wording, labels, source records, and phrase boundaries.');
