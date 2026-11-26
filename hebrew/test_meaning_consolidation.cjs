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
assert.equal(reorderedHebrew[0].text,'בית, ביתו','reordered equivalent Hebrew alternatives should display once in a consolidated list');
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
assert.equal(sharedCondition.items.map(item=>item.displayMeaning).join(', '),'בתנאי, בתנאי','the shared condition group should carry only its own display sense into recommendation evidence');
assert.equal(separateIntention.items[0].displayMeaning,'בכוונה','the extra intention group should carry only its separated display sense into recommendation evidence');
assert.deepEqual(Array.from(ctx.HebrewMeaningConsolidation.splitAlternatives('תנאי (כך, וכך), דבר נוסף')),['תנאי (כך, וכך)','דבר נוסף'],'commas inside parenthetical explanations must not split Hebrew alternatives');

const distinctHebrewHomonyms=merge([{word:'ברא',records:[
 {word:'בְּרָא²',rid:'KRU9020',parts:[{meaning:'נקב',text:'נקב',label:''}]},
 {word:'בְּרָא³',rid:'KRU9021',parts:[{meaning:'נקב',text:'נקב',label:''}]}
]}],'ברא');
assert.equal(distinctHebrewHomonyms.length,2,'explicitly different numbered Hebrew homonyms must never consolidate');

const ambiguousUnnumberedHomonym=merge([{word:'ברא',records:[
 {word:'בְּרָא²',rid:'KRU9022',parts:[{meaning:'נקב',text:'נקב',label:''}]},
 {word:'בְּרָא³',rid:'KRU9023',parts:[{meaning:'נקב',text:'נקב',label:''}]},
 {word:'בְּרָא',rid:'KRU9024',parts:[{meaning:'נקב',text:'נקב',label:''}]}
]}],'ברא');
assert.equal(ambiguousUnnumberedHomonym.length,3,'an unnumbered Hebrew record must not be arbitrarily attached when multiple numbered homonyms are present');

const globallyAmbiguousUnnumberedHomonym=merge([{word:'ברא',records:[
 {word:'בְּרָא²',rid:'KRU9027',parts:[{meaning:'נקב',text:'נקב',label:''}]},
 {word:'בְּרָא',rid:'KRU9028',parts:[{meaning:'נקב',text:'נקב',label:''}]}
]}],'ברא');
assert.equal(globallyAmbiguousUnnumberedHomonym.length,2,'an unnumbered counterpart must remain separate when the full dictionary has multiple numbered homonyms, even if only one numbered entry is in this lookup');


const unambiguousUnnumberedHomonym=merge([{word:'בדיקה',records:[
 {word:'בדיקה²',rid:'KRU9025',parts:[{meaning:'משמעות',text:'משמעות',label:''}]},
 {word:'בדיקה',rid:'KRU9026',parts:[{meaning:'משמעות',text:'משמעות',label:''}]}
]}],'בדיקה');
assert.equal(unambiguousUnnumberedHomonym.length,1,'a numbered Hebrew record may consolidate with one unnumbered counterpart when no competing homonym exists');

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
assert.equal(reviewed[0].text,'הפסד, אובדן','the consolidated Hebrew gloss should visibly preserve both original synonym forms');
ctx.HebrewMeaningConsolidation.reviewedSynonymPairs.delete(ctx.HebrewMeaningConsolidation.pairKey(reviewedA,reviewedB));
function assertRejectedPair(a,b,meaningA,meaningB){
 const key=[a,b].sort().join('|')+'::'+[lookup.normalize(meaningA),lookup.normalize(meaningB)].sort().join(' | ');
 assert(ctx.HebrewMeaningConsolidation.reviewedNonSynonymPairs.has(key),'source-reviewed non-synonym must be excluded from the candidate queue: '+a+' / '+b);
}
function assertDeferredPair(a,b,meaningA,meaningB){
 const key=[a,b].sort().join('|')+'::'+[lookup.normalize(meaningA),lookup.normalize(meaningB)].sort().join(' | ');
 assert(ctx.HebrewMeaningConsolidation.deferredSynonymPairs.has(key),'ambiguous Hebrew pair must remain deferred: '+a+' / '+b);
}
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
assertReviewedPair('KRU09162','KRU09163','כון','עשה ישר ומכוון','1) עשה ישר');
const crossReferencedSenseRecords=ctx.HEBREW_DICTIONARY.entries.filter(entry=>['KRU17474','KRU17475'].includes(entry.rid));
assert.equal(crossReferencedSenseRecords.length,2,'both source records for the קנט cross-reference must exist');
const crossReferencedSenses=merge([{word:'קנט',records:crossReferencedSenseRecords}],'קנט');
const vexGroup=crossReferencedSenses.find(group=>group.items.some(item=>item.e.rid==='KRU17474')&&group.items.some(item=>item.e.rid==='KRU17475'));
assert(vexGroup,'the explicit כנ״ל cross-reference should consolidate with the preceding vex sense');
assert.equal(vexGroup.text,'הִקְנִיט הרגיז','the cross-reference should display the actual Hebrew meaning, not the shorthand כנ״ל');
const loatheGroup=crossReferencedSenses.find(group=>group.items.some(item=>item.e.rid==='KRU17475')&&!group.items.some(item=>item.e.rid==='KRU17474'));
assert(loatheGroup&&ctx.HebrewMeaningConsolidation.normalize(loatheGroup.text).includes(ctx.HebrewMeaningConsolidation.normalize('קצה נפשו')),'the separate loathing sense must remain independent');
assert(loatheGroup.items.some(item=>item.p.meaning.includes('2) קצה נפשו')),'the original complete source part must remain attached');
assert(ctx.HebrewMeaningConsolidation.reviewedSenseSegmentPairRefs.has(['KRU17474','KRU17475'].sort().join('|')),'the partial mapping must be recorded for candidate discovery');

const stumbleRecords=ctx.HEBREW_DICTIONARY.entries.filter(entry=>['KRU20037','KRU20038'].includes(entry.rid));
assert.equal(stumbleRecords.length,2,'both source records for the numbered stumble sense must exist');
const stumbleGroups=merge([{word:'תקל',records:stumbleRecords}],'תקל');
const stumbleGroup=stumbleGroups.find(group=>group.items.some(item=>item.e.rid==='KRU20037')&&group.items.some(item=>item.e.rid==='KRU20038'));
assert(stumbleGroup,'KRU20038 numbered sense 2 נכשל should consolidate with KRU20037');
assert.equal(stumbleGroup.text,'הִתְקִיל נכשל','the partial Hebrew sense should display the attested shared gloss');
assert(stumbleGroup.items.some(item=>item.e.rid==='KRU20038'&&String(item.p.text||'').includes('2) נכשל')),'the complete original numbered source text must remain attached');
const weighGroup=stumbleGroups.find(group=>group.items.some(item=>item.e.rid==='KRU20038')&&!group.items.some(item=>item.e.rid==='KRU20037')&&ctx.HebrewMeaningConsolidation.normalize(group.text).includes(ctx.HebrewMeaningConsolidation.normalize('שקל')));
assert(weighGroup,'KRU20038 sense 1 שקל must remain a separate result');
assert.equal(weighGroup.items.length,1,'the unrelated weighing sense must not be absorbed into the stumble group');
assert(ctx.HebrewMeaningConsolidation.reviewedSenseSegmentPairRefs.has(['KRU20037','KRU20038'].sort().join('|')),'the second-numbered-sense mapping must be recorded for candidate discovery');
assert.equal(ctx.HebrewMeaningConsolidation.reviewedSenseSegmentPairRefs.size,2,'both exact partial-sense mappings must be registered');

const crossReferenceWithoutTarget=merge([{word:'קנט',records:[crossReferencedSenseRecords.find(entry=>entry.rid==='KRU17475')]}],'קנט');
assert(!crossReferenceWithoutTarget.some(group=>group.text==='הִקְנִיט הרגיז'),'the shorthand must not be expanded unless its exact referenced source record is present');
const changedReferenceTarget=crossReferencedSenseRecords.map(entry=>entry.rid==='KRU17474'?{...entry,parts:entry.parts.map(part=>({...part,meaning:'different source wording'}))}:entry);
const changedReferenceGroups=merge([{word:'קנט',records:changedReferenceTarget}],'קנט');
assert(!changedReferenceGroups.some(group=>group.text==='הִקְנִיט הרגיז'),'the cross-reference must not be expanded if the attested source wording changes');


const segments=merge([{word:'נפקא מינה',records:lookup.lookup('נפקא מינה')},{word:'נפקא',records:lookup.lookup('נפקא')}],'נפקא מינה נפקא');
assert(segments.some(g=>g.scope==='נפקא מינה')&&segments.some(g=>g.scope==='נפקא'),'separate words in a multiword selection must never be merged together');
assert.equal(ctx.HebrewMeaningConsolidation.reviewedSynonymPairs.size,12,'only the manually reviewed Hebrew synonym pairs should be active');
assertRejectedPair('KRU02691','KRU02692',"ירוש׳ שבי׳ פ״ו ל״ו ע״ג: ביריי רבתא.","שם אמורא");
assertRejectedPair('KRU18231','KRU18232',"ריכך, עשה רך","כנ״ל. תרג׳ איוב כ״ג ט״ז (הרך לבי): רכך לבבי. אִתְרַכֵּךְ אתפ׳, נעשה רך");
assertRejectedPair('KRU07060','KRU07061',"שם עיר בארץ ישראל","שם אמורא");
assertRejectedPair('KRU02827','KRU02828',"1) ילד בפעם הראשונה","ליקט בכורים");
assertRejectedPair('KRU00180','KRU04150',"פ״י, כתת","אפע׳, שמר, הגין");
assertRejectedPair('KRU00207','KRU00208',"שכר","חולין ק״ד ע״ב: אגרא חמוה דר׳ אבא.");
assertRejectedPair('KRU00372','KRU00373',"אוזן","נאד");
assertRejectedPair('KRU00372','KRU00373',"אוזן","הדום, שרפרף");
assertRejectedPair('KRU00467','KRU00468',"שטר מכירה או מתנה","פקעת");
assertRejectedPair('KRU00585','KRU00586',"יסוד","שם עיר בגליל");
assertRejectedPair('KRU00594','KRU00595',"אכסניא","בעל אכסניא");
assertRejectedPair('KRU00722','KRU00724',"חג של עכו״ם","איזו");
assertRejectedPair('KRU00728','KRU00729',"שם אמורא","מערב");
assertRejectedPair('KRU00751','KRU00752',"שליח","תל, גבעה");
assertRejectedPair('KRU00848','KRU00850',"בר׳ י״ח ע״ב: אימא לה לאימא; ירוש׳ נדה פ״א מ״ט ע״א: אבא טבי ואימה טביתה.","פלך לטויה");
assertRejectedPair('KRU00985','KRU00986',"אגודה, חבילה","שר של מעלה, מלאך");
assertRejectedPair('KRU01073','KRU01074',"נשואין","חפרפרת");
assertRejectedPair('KRU01341','KRU01342',"– אמונה","הר בצפונה של א״י");
assertRejectedPair('KRU01562','KRU01563',"בגד","ציון לדרך וגבול");
assertRejectedPair('KRU01660','KRU01661',"תורן","רפסודה, דוברה");
assertRejectedPair('KRU01687','KRU01690',"– אַף אֵלָהֵין ובפרט, ומה גם","שם מלאך");
assertRejectedPair('KRU01755','KRU01756',"הדום, שרפרף","מרדעת, אוכף");
assertRejectedPair('KRU01989','KRU01991',"דרך","אור");
assertRejectedPair('KRU01989','KRU01991',"אורח","אור");
assertRejectedPair('KRU02026','KRU02027',"נעשה ארוך","תקן, הכין");
assertRejectedPair('KRU02026','KRU02027',"נעשה ארוך","נקה");
assertRejectedPair('KRU02581','KRU02582',"צנור","יחי!");
assertRejectedPair('KRU02788','KRU02789',"אות שניה של אלף בית","בית");
assertRejectedPair('KRU02788','KRU02789',"אות שניה של אלף בית","בת, מדת הלח");
assertRejectedPair('KRU02859','KRU02860',"ציר הדלת","אלון");
assertRejectedPair('KRU02859','KRU02860',"ציר הדלת","פרי האלון");
assertRejectedPair('KRU02859','KRU02860',"שן המפתח","אלון");
assertRejectedPair('KRU02859','KRU02860',"שן המפתח","פרי האלון");
assertRejectedPair('KRU02827','KRU02828',"1) ילד בפעם הראשונה","בשל (הפרי)");
assertRejectedPair('KRU02827','KRU02828',"1) ילד בפעם הראשונה","ביכר");
assertRejectedPair('KRU02827','KRU02828',"1) ילד בפעם הראשונה","כנ״ל. בכור׳ פ״ג מ״ב: המבכירות מניקות.");
assertDeferredPair('KRU12499','KRU12500',"התרומם","התנופף ברוח");

console.log('PASS: shared Hebrew meaning consolidation preserves exact source wording, labels, source records, and phrase boundaries.');
