const assert=require('node:assert/strict'),S=require('./plugin/search.js'),U=require('./plugin/unified-view.js'),fs=require('node:fs'),vm=require('node:vm');
const c={window:{}};vm.createContext(c);for(const n of ['index','attested-forms','ranking','krupnik-index','phrases'])vm.runInContext(fs.readFileSync(__dirname+'/plugin/data/'+n+'.js','utf8'),c);
const index=c.window.JASTROW_INDEX;
assert.equal(U.reviewedSourceGlossPairCount,1492,'every reviewed source gloss pair must be loaded; malformed adjacent array entries must not be silently dropped');

const dataDir=__dirname+'/plugin/data';
c.window.JASTROW_CHUNKS={};
for(const file of fs.readdirSync(dataDir).filter(n=>/^(?:chunk-\d+|krupnik-\d+)\.js$/.test(n)).sort()){
 vm.runInContext(fs.readFileSync(dataDir+'/'+file,'utf8'),c);
}
const sourceEntries=Object.values(c.window.JASTROW_CHUNKS).flatMap(chunk=>Object.values(chunk));
const sourceByRef=new Map(sourceEntries.filter(entry=>entry.r).map(entry=>[entry.r,entry]));
const cleanGloss=value=>String(value).normalize('NFKC').toLowerCase().replace(/[’‘]/g,"'").replace(/[‐‑–—]/g,'-').replace(/[.\s]+$/,'').trim().replace(/\s+/g,' ');
const displayCorrectionSource=fs.readFileSync(__dirname+'/plugin/unified-view.js','utf8').match(/const displayCorrections=new Map\(\[([\s\S]*?)\]\);/);
assert(displayCorrectionSource,'display corrections must remain inspectable for normalization checks');
for(const match of displayCorrectionSource[1].matchAll(/^\s*\[(['"])(.*?)\1,/gm)){
 const key=match[2].split('::')[1]||'';
 assert.equal(key,cleanGloss(key),'display-correction keys must already use runtime normalization: '+match[2]);
}
const decodeHtml=value=>value.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16)));
for(const pair of U.reviewedSourceGlossPairs){
 const [refs,glossText]=pair.split('::'),[firstRef,secondRef]=refs.split('|'),glosses=glossText.split(' | ');
 assert.equal(glosses.length,2,'each reviewed mapping must contain exactly two glosses: '+pair);
 const krupnikRef=[firstRef,secondRef].find(id=>id.startsWith('KRU'));
 const jastrowRef=[firstRef,secondRef].find(id=>!id.startsWith('KRU'));
 const krupnik=sourceByRef.get(krupnikRef),jastrow=sourceByRef.get(jastrowRef);
 assert(krupnik?.source==='krupnik','reviewed Krupnik source record must exist: '+krupnikRef);
 assert(jastrow?.html,'reviewed Jastrow source record must exist: '+jastrowRef);
 const krupnikHeadwords=[krupnik.h,...(krupnik.alt||[])].map(S.normalize).filter(Boolean);
 const jastrowHeadwords=[jastrow.h,...(jastrow.alt||[])].map(S.normalize).filter(Boolean);
 assert(krupnikHeadwords.some(headword=>jastrowHeadwords.includes(headword)),'reviewed source records must share an attested consonantal headword or alias: '+krupnikRef+' / '+jastrowRef);
 const krupnikGloss=glosses.find(gloss=>(krupnik.glosses||[]).some(item=>cleanGloss(item.text)===gloss));
 assert(krupnikGloss,'Krupnik gloss must match source wording for '+krupnikRef+': '+glosses.join(' / '));
 const italicGlosses=[...jastrow.html.matchAll(/<i\b[^>]*>([\s\S]*?)<\/i>/gi)].map(match=>cleanGloss(decodeHtml(match[1].replace(/<[^>]*>/g,' '))));
 const jastrowGloss=glosses.find(gloss=>italicGlosses.includes(gloss));
 assert(jastrowGloss,'Jastrow gloss must occur in an explicit italic source phrase for '+jastrowRef+': '+glosses.join(' / '));
}
assert.deepEqual(S.lookup(index,'אַרְעָא').ids.slice(0,2),[33935,3221]);
assert.deepEqual(S.lookup(index,'אִרְעָא').ids.slice(0,2),[33936,3220]);
assert.equal(S.vowelRank({h:'אֲרַע²',alt:['אַרְעָא']},'אַרְעָא'),0);
assert.equal(S.vowelRank({h:'אִרְעָא'},'אַרְעָא'),2);
assert.equal(S.vowelRank({h:'ארעא'},'אַרְעָא'),1);
assert.equal(S.vowelRank({h:'אַרְעָא'},'אַרעא'),0); // Partial supplied pointing.
assert.equal(U.compatible('בּוּר I','בּוּר²','בור'),false,'explicitly different numbered homonyms must not consolidate');
assert.equal(U.compatible('בּוּר I','בּוּר','בור'),true,'an unnumbered source counterpart may still be reviewed');
assert.equal(U.compatible('גֵּו ²','גַּו','גו'),true,'a single numbered source may match an unnumbered counterpart');

assert.equal(S.vowelRank({h:'אַרְעָא'},'אַרְעָ֑א'),0); // Cantillation is not a vowel.
assert.equal(S.displayHeadword({h:'אִרְעָא',alt:['אַרְעָא']},'אַרְעָא'),'אַרְעָא');
const records=[{id:1,entry:{h:'אֲרַע²',alt:['אַרְעָא'],source:'krupnik'},meanings:[{text:'land, ground',label:''}]},{id:2,entry:{h:'אַרְעָא',alt:[]},meanings:[{text:'land, earth, ground, field',label:''}]},{id:3,entry:{h:'אִרְעָא',alt:[]},meanings:[{text:'accident, occurrence',label:''}]}];
const merged=U.merge(records,'אַרְעָא');assert.equal(merged.length,2);assert.equal(merged[0].sources.length,2);assert.equal(merged[0].text,'land, ground, earth, field');assert.equal(merged[0].rank,0);assert.equal(merged[1].rank,2);
assert.equal(U.merge([{id:1,entry:{h:'אָמַר'},meanings:[{text:'to say',label:'Af.'}]},{id:2,entry:{h:'אָמַר'},meanings:[{text:'to say',label:'Pa.'}]}],'אמר').length,2);
assert.equal(U.merge([{id:1,entry:{h:'אָמַר'},meanings:[{text:'charge, fee',label:''}]},{id:2,entry:{h:'אָמַר'},meanings:[{text:'charge, accusation',label:''}]}],'אמר').length,2);
assert.equal(U.merge([{id:1,entry:{h:'אַרְעָא'},meanings:[{text:'land',label:'1'}]},{id:2,entry:{h:'אַרְעָא'},meanings:[{text:'land.',label:'2)'}]}],'ארעא').length,1);

// Curated synonyms are recognized inside multi-alternative glosses too.
const partSynonym=U.merge([
 {id:201,entry:{h:'קם',r:'KRU-SYN-1',source:'krupnik'},meanings:[{text:'to happen',label:''}]},
 {id:202,entry:{h:'קם',r:'SYN-1',source:'jastrow'},meanings:[{text:'to occur, to take place',label:''}]}
],'קם');
assert.equal(partSynonym.length,1,'a curated synonym inside a comma-separated gloss should consolidate');
assert.equal(partSynonym[0].sources.length,2,'part-level synonym consolidation must preserve both sources');
assert.equal(partSynonym[0].text,'to happen, to occur, to take place','the consolidated display should preserve all reviewed synonym alternatives from both dictionaries');

const mixedSynonymAndDistinctSense=U.merge([
 {id:207,entry:{h:'קם'},meanings:[{text:'to happen',label:''}]},
 {id:208,entry:{h:'קם'},meanings:[{text:'to occur, charge',label:''}]}
],'קם');
assert.equal(mixedSynonymAndDistinctSense.length,2,'a shared curated synonym must not merge a gloss that also contains a distinct sense');
assert.equal(U.sharesReviewedSynonym('to happen','to occur, to take place'),true);
assert.equal(U.sharesReviewedSynonym('to happen','to occur, charge'),false);
const sourceAttestedSynonyms=[
 ['sometimes','at times'],['from time to time','occasionally'],
 ['happen','occur'],['to happen','to take place'],
 ['heap','pile'],['pile','mound'],['present','gift'],['sediment','dregs'],
 ['to frighten','to scare'],['to dwell','to reside'],['edge','rim'],
 ['capital','metropolis'],['gathering','assembly'],['deity','divinity'],
 ['strength','force'],['to glue','to paste'],['glue','paste'],
 ['to grow better','to improve'],['to set on fire','to burn'],
 ['to tremble','to shake'],['indulgence','clemency'],['caterer','purveyor'],
 ['to be disqualified','to be made unfit'],['to be made unfit','to be declared unfit'],
 ['to apportion','to assign'],['to recite a Bible verse','to recite a verse'],
 ['to bubble','to boil']
];
for(const [a,b] of sourceAttestedSynonyms)assert.equal(U.sharesReviewedSynonym(a,b),true,'reviewed synonym group should consolidate: '+a+' / '+b);
assert.equal(U.sharesReviewedSynonym('to frighten','to scare, to threaten'),false,'an unrelated extra sense must prevent synonym-group consolidation');
assert.equal(U.sharesReviewedSynonym('heap','pile, accusation'),false,'a synonym must not absorb an unrelated alternative');
assert.equal(U.sharesReviewedSynonym('to frighten','to frighten, scare'),true,'coordinated infinitives may omit the repeated "to"');
assert.equal(U.sharesReviewedSynonym('to dwell','to dwell, reside'),true,'the omitted infinitive marker should be restored for matching');
assert.equal(U.sharesReviewedSynonym('to set on fire','to set on fire, burn'),true,'a coordinated bare verb should match its infinitive synonym');
assert.equal(U.sharesReviewedSynonym('burn','to burn'),false,'noun and infinitive readings must not be conflated');
assert.equal(U.alternativeMatchKey('to veil one’s self','to veil one’s self').key,U.alternativeMatchKey('to veil oneself','to veil oneself').key,'orthographic reflexive variants should normalize to the same phrase');
const passiveCoordinated=U.alternativeMatchKey('be saturated','to be moist, be saturated, drip');
const passiveFull=U.alternativeMatchKey('to be saturated','to be saturated');
assert.equal(passiveCoordinated.key,passiveFull.key,'a repeated passive marker may be omitted from later alternatives without duplicating "be"');
assert.equal(passiveCoordinated.voice,'passive','coordinated passive alternatives must retain passive voice');

const passiveAlternativeMerge=U.merge([
 {id:415,entry:{h:'רוּי',r:'T00358'},meanings:[{text:'to be moist, be saturated, drip',label:'',section:'verb'}]},
 {id:416,entry:{h:'רוּי',r:'KRU18022',source:'krupnik'},meanings:[{text:'to be saturated',label:''}]}
],'רוי');
assert.equal(passiveAlternativeMerge.length,1,'a repeated passive marker omitted from a later alternative should consolidate the same passive sense');
assert.equal(passiveAlternativeMerge[0].sources.length,2,'passive alternative consolidation must retain both source records');




// Alternative-level review: match the shared phrase while retaining
// comma-listed synonyms in the same sense and Jastrow's semicolon-separated
// second sense separately.

const coordinatedAlternativeMatch=U.merge([
 {id:401,entry:{h:'חוּץ I',r:'H00428'},meanings:[{text:'to wedge in, form a partition; to intervene',label:'',section:'verb'}]},
 {id:402,entry:{h:'חוּץ I',r:'KRU06819',source:'krupnik'},meanings:[{text:'to form a partition',label:''}]}
],'חוץ');
assert.equal(coordinatedAlternativeMatch.length,2,'an omitted repeated infinitive marker should allow the matching alternative to consolidate while the extra semicolon sense remains separate');
const coordinatedPartition=coordinatedAlternativeMatch.find(group=>group.sources.some(source=>source.entry.r==='KRU06819'));
assert(coordinatedPartition,'the shared partition meaning should be identified');
assert.equal(coordinatedPartition.sources.length,2,'the coordinated alternative match must preserve both dictionary sources');
const separateIntervention=coordinatedAlternativeMatch.find(group=>group.text==='to intervene');
assert(separateIntervention&&separateIntervention.sources.length===1,'the unrelated second Jastrow sense must remain separate');

const activePassiveMismatch=U.merge([
 {id:403,entry:{h:'בדיקה',r:'J-ACT'},meanings:[{text:'to crush',label:'',section:'verb'}]},
 {id:404,entry:{h:'בדיקה',r:'KRU-ACT',source:'krupnik'},meanings:[{text:'to be crushed',label:''}]}
],'בדיקה');
assert.equal(activePassiveMismatch.length,2,'active and passive verbs must never consolidate through alternative normalization');
const nounVerbMismatch=U.merge([
 {id:405,entry:{h:'בדיקה',r:'J-NOUN'},meanings:[{text:'march, procession',label:'',section:'noun'}]},
 {id:406,entry:{h:'בדיקה',r:'KRU-VERB',source:'krupnik'},meanings:[{text:'to march',label:''}]}
],'בדיקה');
assert.equal(nounVerbMismatch.length,2,'a noun and an infinitive must not match merely because the leading "to" is normalized');


assert.equal(U.reviewedSourceAlternativePairs.size,287,'every source-scoped alternative match must be loaded');

const steepMeaning=U.merge([
 {id:2401,entry:{h:'גִּידּוּד',r:'KRU04044',source:'krupnik'},meanings:[{text:'earth embankment, steep banks',label:'1'}]},
 {id:2402,entry:{h:'גִּידּוּד',r:'C00632'},meanings:[{text:'a steep',label:'',section:''}]}
],'גִּידּוּד');
assert(steepMeaning.some(group=>group.sources.some(source=>source.entry.r==='KRU04044')&&group.sources.some(source=>source.entry.r==='C00632')),'the shared Eruvin 93b embankment sense should consolidate');

const festivalOffering=U.merge([
 {id:3061,entry:{h:'חֲגִיגָה',r:'H00148'},meanings:[{text:'the festive offering of the visitors of the Temple on the festivals',label:'',section:'—2)'}]},
 {id:3062,entry:{h:'חֲגִיגָה',r:'KRU06660',source:'krupnik'},meanings:[{text:'the festive offering',label:'2'}]}
],'חֲגִיגָה');
assert(festivalOffering.some(group=>group.sources.some(source=>source.entry.r==='H00148')&&group.sources.some(source=>source.entry.r==='KRU06660')),'the shared festival-offering sense should consolidate');

const preventiveEnactment=U.merge([
 {id:3059,entry:{h:'גְּזֵרָה',r:'C00581'},meanings:[{text:'a rabbinical enactment issued as a guard',label:'',section:'—3)'}]},
 {id:3060,entry:{h:'גְּזֵרָה',r:'KRU03996',source:'krupnik'},meanings:[{text:'in gen. prohibition, esp. a rabbinical enactment issued as a preventive measure',label:'3'}]}
],'גְּזֵרָה');
assert(preventiveEnactment.some(group=>group.sources.some(source=>source.entry.r==='C00581')&&group.sources.some(source=>source.entry.r==='KRU03996')),'the shared rabbinical preventive-enactment sense should consolidate');

const uppermostLayer=U.merge([
 {id:3055,entry:{h:'אַרְכַּבְתָּא',r:'A03131'},meanings:[{text:'the uppermost layer of a clay dam around a field',label:''}]},
 {id:3056,entry:{h:'אַרְכַּבְתָּא',r:'KRU02031',source:'krupnik'},meanings:[{text:'the uppermost layer',label:''}]}
],'אַרְכַּבְתָּא');
assert(uppermostLayer.some(group=>group.sources.some(source=>source.entry.r==='A03131')&&group.sources.some(source=>source.entry.r==='KRU02031')),'the shared Bava Metzia 103b uppermost-layer sense should consolidate');
const templePavement=U.merge([
 {id:3057,entry:{h:'רוֹבֶד',r:'T00299'},meanings:[{text:'mosaic pavement',label:'',section:'1)'}]},
 {id:3058,entry:{h:'רוֹבֶד',r:'KRU18006',source:'krupnik'},meanings:[{text:'pavement, terrace',label:'1'}]}
],'רוֹבֶד');
assert(templePavement.some(group=>group.sources.some(source=>source.entry.r==='T00299')&&group.sources.some(source=>source.entry.r==='KRU18006')),'the shared Yoma IV:3 Temple-pavement sense should consolidate');

const troopDetachment=U.merge([
 {id:3053,entry:{h:'נִימוֹרֶת',r:'N00685'},meanings:[{text:'a detachment of troops sent to take hostages',label:''}]},
 {id:3054,entry:{h:'נִימוֹרֶת',r:'KRU12677',source:'krupnik'},meanings:[{text:'detachment of troops',label:''}]}
],'נִימוֹרֶת');
assert(troopDetachment.some(group=>group.sources.some(source=>source.entry.r==='N00685')&&group.sources.some(source=>source.entry.r==='KRU12677')),'the shared Yerushalmi Pesachim IV:31b troop-detachment sense should consolidate');

const flowingWater=U.merge([
 {id:3051,entry:{h:'זָחַל',r:'G00246'},meanings:[{text:'to let collected water run into a channel.',label:'Hif. הִזְחִיל'}]},
 {id:3052,entry:{h:'זָחַל',r:'KRU06334',source:'krupnik'},meanings:[{text:'to let run',label:''}]}
],'זָחַל');
assert(flowingWater.some(group=>group.sources.some(source=>source.entry.r==='G00246')&&group.sources.some(source=>source.entry.r==='KRU06334')),'the shared Mikvaot V:5 Hifil water-flowing sense should consolidate');

const cutFruit=U.merge([
 {id:2411,entry:{h:'עָקַץ',r:'KRU14780',source:'krupnik'},meanings:[
  {text:'to cut (fruits) by the stalks',label:'1'},
  {text:'to sting',label:'2'},
  {text:'to prick, to taunt',label:'3'}
 ]},
 {id:2412,entry:{h:'עָקַץ',r:'P01211'},meanings:[
  {text:'to cut fruit by the stalks.',label:'',section:'1)'},
  {text:'to sting, prick',label:'',section:'—2)'}
 ]}
],'עָקַץ');
const cutFruitGroup=cutFruit.find(group=>group.sources.some(source=>source.entry.r==='KRU14780')&&group.sources.some(source=>source.entry.r==='P01211'));
assert(cutFruitGroup,'the shared Sanhedrin 41a fruit-cutting sense should consolidate');
assert.equal(cutFruitGroup.sources.length,2,'the original fruit-cutting source records should both remain');
const stingJastrow=cutFruit.find(group=>group.sources.some(source=>source.entry.r==='P01211')&&!group.sources.some(source=>source.entry.r==='KRU14780'));
assert(stingJastrow,'the ambiguous Jastrow sting/prick phrase must remain separate until its two KRU senses can be isolated');

const stoveStand=U.merge([
 {id:2501,entry:{h:'טִיף II',r:'KRU07984',source:'krupnik'},meanings:[
  {text:'a stand for a stove',label:'1'},
  {text:'drop',label:'2'}
 ]},
 {id:2502,entry:{h:'טִיף II',r:'I00408'},meanings:[{text:'receptacle of overflow, a stand for a portable stove',label:'',section:''}]}
],'טִיף II');
assert(stoveStand.some(group=>group.sources.some(source=>source.entry.r==='KRU07984')&&group.sources.some(source=>source.entry.r==='I00408')),'the shared Tosefta Kelim stove-stand sense should consolidate');
const dropSense=stoveStand.find(group=>group.text==='drop');
assert(dropSense&&dropSense.sources.length===1,'KRU07984 sense 2 drop must remain separate');

const tallPerson=U.merge([
 {id:2511,entry:{h:'גָּבוֹהַּ',r:'KRU03526',source:'krupnik'},meanings:[
  {text:'high, exalted',label:'1'},
  {text:'The Most High',label:'2'},
  {text:'an abnormally tall person',label:'3'}
 ]},
 {id:2512,entry:{h:'גָּבוֹהַּ',r:'C00053'},meanings:[{text:'an abnormally tall and slim person with shaking gait',label:'',section:'—2)'}]}
],'גָּבוֹהַּ');
assert(tallPerson.some(group=>group.sources.some(source=>source.entry.r==='KRU03526')&&group.sources.some(source=>source.entry.r==='C00053')),'the shared Bekhorot 45b tall-person sense should consolidate');
const divineTitle=tallPerson.find(group=>group.text==='The Most High');
assert(divineTitle&&divineTitle.sources.length===1,'the separate divine-title sense must not be absorbed into the tall-person mapping');

const hairMeaning=U.merge([
 {id:2521,entry:{h:'בִּינְתָא II',r:'KRU02652',source:'krupnik'},meanings:[
  {text:'kernel',label:'1'},
  {text:'hair',label:'2'}
 ]},
 {id:2522,entry:{h:'בִּינְתָא II',r:'B00656'},meanings:[{text:'thread, a single hair',label:'',section:'2)'}]}
],'בִּינְתָא II');
assert(hairMeaning.some(group=>group.sources.some(source=>source.entry.r==='KRU02652')&&group.sources.some(source=>source.entry.r==='B00656')),'the shared Berakhot 8a hair sense should consolidate');
const kernelSense=hairMeaning.find(group=>group.text==='kernel');
assert(kernelSense&&kernelSense.sources.length===1,'KRU02652 sense 1 kernel must remain separate');

const mixture=U.merge([
 {id:2601,entry:{h:'בִּילָה',r:'KRU02633',source:'krupnik'},meanings:[{text:'mixture',label:''}]},
 {id:2602,entry:{h:'בִּילָה',r:'B00615'},meanings:[{text:'thorough mixture, even distribution of mixed objects'}]}
],'בִּילָה');
assert(mixture.some(group=>group.sources.some(source=>source.entry.r==='KRU02633')&&group.sources.some(source=>source.entry.r==='B00615')),'the shared Rosh Hashanah 13b mixture sense should consolidate');

const romanShoes=U.merge([
 {id:2611,entry:{h:'גולגוקין',r:'KRU03814',source:'krupnik'},meanings:[{text:'Roman) shoes, which leave the toes uncovered'}]},
 {id:2612,entry:{h:'גולגוקין',r:'C00377'},meanings:[{text:'shoes'}]}
],'גולגוקין');
assert(romanShoes.some(group=>group.sources.some(source=>source.entry.r==='KRU03814')&&group.sources.some(source=>source.entry.r==='C00377')),'the shared Yerushalmi Beitzah Roman-shoes sense should consolidate');

const treading=U.merge([
 {id:2621,entry:{h:'דּוּשׁ ²',r:'KRU04973',source:'krupnik'},meanings:[
  {text:'to tread',label:'1'},
  {text:'to thresh',label:'2'}
 ]},
 {id:2622,entry:{h:'דּוּשׁ ²',r:'D00390'},meanings:[
  {text:'to thresh',section:'1)'},
  {text:'to tread upon, trample',section:'—2)'}
 ]}
],'דּוּשׁ ²');
assert(treading.some(group=>group.sources.some(source=>source.entry.r==='KRU04973')&&group.sources.some(source=>source.entry.r==='D00390')),'the shared Bava Kamma 9a treading sense should consolidate');

const wrestling=U.merge([
 {id:2631,entry:{h:'גָּשַׁשׁ',r:'KRU04675',source:'krupnik'},meanings:[
  {text:'to touch',label:'1'},
  {text:'to wrestle',label:'Hithpael'}
 ]},
 {id:2632,entry:{h:'גָּשַׁשׁ',r:'C01425'},meanings:[
  {text:'to touch a substance, to strike against',section:'1)'},
  {text:'to wrestle, fight',label:'Hithpael'}
 ]}
],'גָּשַׁשׁ');
assert(wrestling.some(group=>group.sources.some(source=>source.entry.r==='KRU04675')&&group.sources.some(source=>source.entry.r==='C01425')),'the shared Genesis Rabbah wrestling sense should consolidate');

const netMeaning=U.merge([
 {id:2701,entry:{h:'כָּמַר',r:'KRU09533',source:'krupnik'},meanings:[
  {text:'to store fruits in the ground',label:'1'},
  {text:'to lay a net',label:'2'}
 ]},
 {id:2702,entry:{h:'כָּמַר',r:'K00817'},meanings:[
  {text:'to lay a trap, net',label:'Hifil'},
  {text:'to lay a trap',label:'Hifil'}
 ]}
],'כָּמַר');
assert(netMeaning.some(group=>group.sources.some(source=>source.entry.r==='KRU09533')&&group.sources.some(source=>source.entry.r==='K00817')),'the shared Yevamot net-laying sense should consolidate');

const plantShoot=U.merge([
 {id:2711,entry:{h:'גִּיר III',r:'KRU04203',source:'krupnik'},meanings:[
  {text:'projectile',label:'1'},
  {text:'shoot (of a plant)',label:'2'}
 ]},
 {id:2712,entry:{h:'גִּיר III',r:'C00806'},meanings:[{text:'shoot',section:'—2)'}]}
],'גִּיר III');
assert(plantShoot.some(group=>group.sources.some(source=>source.entry.r==='KRU04203')&&group.sources.some(source=>source.entry.r==='C00806')),'the shared Shabbat 109b plant-shoot sense should consolidate');
const projectile=plantShoot.find(group=>group.text==='projectile');
assert(projectile&&projectile.sources.length===1,'KRU04203 sense 1 projectile must remain separate');

const camelStuff=U.merge([
 {id:2721,entry:{h:'דָּרַס',r:'KRU05539',source:'krupnik'},meanings:[
  {text:'to stamp',label:'1'},
  {text:'to press (the knife)',label:'2'},
  {text:'to throttle',label:'3'},
  {text:'to stuff',label:'4'}
 ]},
 {id:2722,entry:{h:'דָּרַס',r:'D01113'},meanings:[
  {text:'to tread, stamp',section:'1)'},
  {text:'to press',section:'—2)'},
  {text:'to throttle',section:'—3)'},
  {text:'to stuff food into the camel’s mouth',section:'—4)'}
 ]}
],'דָּרַס');
const mappedCamelGroups=camelStuff.filter(group=>group.sources.some(source=>source.entry.r==='KRU05539')&&group.sources.some(source=>source.entry.r==='D01113'));
assert.equal(mappedCamelGroups.length,4,'the three reviewed D01113/KRU05539 senses plus the exact throttle sense should consolidate separately');

const creatureMeaning=U.merge([
 {id:2801,entry:{h:'גְּוִיָּה',r:'KRU03800',source:'krupnik'},meanings:[
  {text:'creature',label:'1'},
  {text:'membrum virile',label:'2'}
 ]},
 {id:2802,entry:{h:'גְּוִיָּה',r:'C00362'},meanings:[
  {text:'inner body, creature',section:'1)'},
  {text:'membrum',section:'—2)'}
 ]}
],'גְּוִיָּה');
assert(creatureMeaning.some(group=>group.sources.some(source=>source.entry.r==='KRU03800')&&group.sources.some(source=>source.entry.r==='C00362')),'the shared Yerushalmi Berakhot creature sense should consolidate');
const membrumGroup=creatureMeaning.find(group=>group.text==='membrum virile');
assert(membrumGroup&&membrumGroup.sources.length===1,'the separate membrum sense must not be absorbed into creature');

const cheeseMeaning=U.merge([
 {id:2811,entry:{h:'חוּבָּץ II',r:'KRU06720',source:'krupnik'},meanings:[
  {text:'cheese',label:'1'},
  {text:'a mash of pressed dates',label:'2'}
 ]},
 {id:2812,entry:{h:'חוּבָּץ II',r:'H00248'},meanings:[{text:'soft cheese',section:'1)'}]}
],'חוּבָּץ II');
assert(cheeseMeaning.some(group=>group.sources.some(source=>source.entry.r==='KRU06720')&&group.sources.some(source=>source.entry.r==='H00248')),'the shared Yerushalmi Pesachim cheese sense should consolidate');
const dateMash=cheeseMeaning.find(group=>group.text==='a mash of pressed dates');
assert(dateMash&&dateMash.sources.length===1,'the separate pressed-date mash sense must remain separate');

const growHigh=U.merge([
 {id:2901,entry:{h:'גְּאִי',r:'KRU03500',source:'krupnik'},meanings:[
  {text:'to grow',label:'1'},
  {text:'to be elated, to be exalted',label:'2'}
 ]},
 {id:2902,entry:{h:'גְּאִי',r:'C00016'},meanings:[
  {text:'to grow high',section:'1)'},
  {text:'to be exalted; to be proud',section:'—2)'}
 ]}
],'גְּאִי');
assert.equal(growHigh.filter(group=>group.sources.some(source=>source.entry.r==='KRU03500')&&group.sources.some(source=>source.entry.r==='C00016')).length,2,'both numbered Targum Job/Exodus growth senses should consolidate separately');

const recoverStrong=U.merge([
 {id:2911,entry:{h:'בְּרִי',r:'KRU03320',source:'krupnik'},meanings:[{text:'to recover, to get strong',label:'2'}]},
 {id:2912,entry:{h:'בְּרִי',r:'B01237'},meanings:[{text:'to get well, strong',section:'—2)'}]}
],'בְּרִי');
assert(recoverStrong.some(group=>group.sources.some(source=>source.entry.r==='KRU03320')&&group.sources.some(source=>source.entry.r==='B01237')),'the shared recovery/health sense should consolidate');

const circumcisionSenses=U.merge([
 {id:3001,entry:{h:'גְּזוּרְתָּא',r:'KRU03954',source:'krupnik'},meanings:[
  {text:'circumcision, feast of circumcision',label:'1'},
  {text:'the circumcised membrum',label:'2'}
 ]},
 {id:3002,entry:{h:'גְּזוּרְתָּא',r:'C00536'},meanings:[
  {text:'circumcision, feast of circumcision; the circumcised membrum',section:''}
 ]}
],'גְּזוּרְתָּא');
const circumcisionSense1=circumcisionSenses.find(group=>group.sources.some(source=>source.entry.r==='KRU03954'&&source.meaning.text==='circumcision, feast of circumcision')&&group.sources.some(source=>source.entry.r==='C00536'));
const circumcisionSense2=circumcisionSenses.find(group=>group.sources.some(source=>source.entry.r==='KRU03954'&&source.meaning.text==='the circumcised membrum')&&group.sources.some(source=>source.entry.r==='C00536'));
assert(circumcisionSense1&&circumcisionSense2&&circumcisionSense1!==circumcisionSense2,'the two circumcision sub-senses must consolidate separately without swallowing each other');

const dressedSkin=U.merge([
 {id:3101,entry:{h:'אַשְׁפָּא',r:'KRU02166',source:'krupnik'},meanings:[{text:'skin'}]},
 {id:3102,entry:{h:'*אַשְׁפָּא',r:'A03336'},meanings:[{text:'dressed skin'}]}
],'אַשְׁפָּא');
assert(dressedSkin.some(group=>group.sources.some(source=>source.entry.r==='KRU02166')&&group.sources.some(source=>source.entry.r==='A03336')),'the shared hide-shavings source phrase should consolidate the dressed-skin sense');

const gemalSenses=U.merge([
 {id:3201,entry:{h:'גְּמַל',r:'KRU04385',source:'krupnik'},meanings:[
  {text:'to do one good or evil'},
  {text:'to be bestowed',label:'Ithpeal'}
 ]},
 {id:3202,entry:{h:'גְּמַל',r:'C01038'},meanings:[
  {text:'to do one good'},
  {text:'to be laden with; to be bestowed',label:'Ithpeal'}
 ]}
],'גְּמַל');
assert.equal(gemalSenses.filter(group=>group.sources.some(source=>source.entry.r==='KRU04385')&&group.sources.some(source=>source.entry.r==='C01038')).length,2,'the good-deed and bestowed senses should consolidate separately');

const dachiSenses=U.merge([
 {id:3211,entry:{h:'דחי',r:'KRU04979',source:'krupnik'},meanings:[
  {text:'to be suspended',label:'Nifal'},
  {text:'to push, to hurry'},
  {text:'to remove',label:'Hifil'}
 ]},
 {id:3212,entry:{h:'דחי',r:'D00406'},meanings:[
  {text:'to be pushed aside, suspended; to give way',label:'Nifal'},
  {text:'to push away, thrust'},
  {text:'to remove hurriedly',label:'Hifil'}
 ]}
],'דחי');
assert(dachiSenses.some(group=>group.sources.some(source=>source.entry.r==='KRU04979')&&group.sources.some(source=>source.entry.r==='D00406')),'the suspended and hurried-removal senses should consolidate with their exact alternatives');

const flaxBeating=U.merge([
 {id:3301,entry:{h:'כִּיתָּא I',r:'KRU09387',source:'krupnik'},meanings:[
  {text:'beating (of flax)',label:'1'},
  {text:'band',label:'2'}
 ]},
 {id:3302,entry:{h:'כִּיתָּא I',r:'K00643'},meanings:[{text:'beating'}]}
],'כִּיתָּא I');
assert(flaxBeating.some(group=>group.sources.some(source=>source.entry.r==='KRU09387')&&group.sources.some(source=>source.entry.r==='K00643')),'the shared Shabbat 140b flax-beating sense should consolidate');
const bandSense=flaxBeating.find(group=>group.text==='band');
assert(bandSense&&bandSense.sources.length===1,'the separate band sense must remain distinct');

const debtRemit=U.merge([
 {id:3311,entry:{h:'מָחַל',r:'KRU11063',source:'krupnik'},meanings:[
  {text:'to forgive, to pardon',label:'1'},
  {text:'to remit (a debt)',label:'2'}
 ]},
 {id:3312,entry:{h:'מָחַל',r:'M00885'},meanings:[{text:'to remit'}]}
],'מָחַל');
assert(debtRemit.some(group=>group.sources.some(source=>source.entry.r==='KRU11063')&&group.sources.some(source=>source.entry.r==='M00885')),'the shared debt-remission sense should consolidate');

const wringAndSuck=U.merge([
 {id:3321,entry:{h:'מְצִי II',r:'KRU11886',source:'krupnik'},meanings:[
  {text:'to wring out',label:'2'},
  {text:'to suck',label:'3'}
 ]},
 {id:3322,entry:{h:'מְצִי II',r:'M02309'},meanings:[
  {text:'to wring'},
  {text:'to give suck',label:'Pa.'}
 ]}
],'מְצִי II');
assert(wringAndSuck.some(group=>group.sources.some(source=>source.entry.r==='KRU11886')&&group.sources.some(source=>source.entry.r==='M02309')),'the shared wringing sense should consolidate');
const giveSuckGroup=wringAndSuck.find(group=>group.sources.some(source=>source.entry.r==='M02309'&&source.meaning.text==='to give suck'));
const suckGroup=wringAndSuck.find(group=>group.sources.some(source=>source.entry.r==='KRU11886'&&source.meaning.text==='to suck'));
assert(giveSuckGroup&&suckGroup&&giveSuckGroup!==suckGroup,'Pa. give-suck and simple suck must remain distinct');

const clapping=U.merge([
 {id:3401,entry:{h:'סִיפּוּק',r:'KRU13548',source:'krupnik'},meanings:[
  {text:'clapping of the hands',label:'1'},
  {text:'adequate power',label:'2'}
 ]},
 {id:3402,entry:{h:'סִיפּוּק',r:'O00788'},meanings:[
  {text:'clapping',section:'1)'},
  {text:'connection, affixed object, attachment',section:'—2)'}
 ]}
],'סִיפּוּק');
assert(clapping.some(group=>group.sources.some(source=>source.entry.r==='KRU13548')&&group.sources.some(source=>source.entry.r==='O00788')),'the shared Yerushalmi Beitzah clapping sense should consolidate');
const adequatePower=clapping.find(group=>group.text==='adequate power');
assert(adequatePower&&adequatePower.sources.length===1,'the separate adequate-power sense must remain distinct');

const bellClapper=U.merge([
 {id:3411,entry:{h:'עִינְבּוֹל',r:'KRU14428',source:'krupnik'},meanings:[{text:'clapper'}]},
 {id:3412,entry:{h:'עִינְבּוֹל',r:'P00605'},meanings:[{text:'clapper of a bell.'}]}
],'עִינְבּוֹל');
assert(bellClapper.some(group=>group.sources.some(source=>source.entry.r==='KRU14428')&&group.sources.some(source=>source.entry.r==='P00605')),'the shared Shabbat 58b bell-clapper sense should consolidate');

const dateCluster=U.merge([
 {id:3501,entry:{h:'קִיבּוּרָא',r:'KRU17095',source:'krupnik'},meanings:[
  {text:'coil',label:'1'},
  {text:'cluster of dates',label:'2'}
 ]},
 {id:3502,entry:{h:'קִיבּוּרָא',r:'S00855'},meanings:[{text:'cluster',section:'—2)'}]}
],'קִיבּוּרָא');
assert(dateCluster.some(group=>group.sources.some(source=>source.entry.r==='KRU17095')&&group.sources.some(source=>source.entry.r==='S00855')),'the shared cluster-of-dates sense should consolidate');
const coilSense=dateCluster.find(group=>group.text==='coil');
assert(coilSense&&coilSense.sources.length===1,'the separate coil sense must remain distinct');

const ravenCroak=U.merge([
 {id:3511,entry:{h:'קּוּרְקוּר',r:'KRU16991',source:'krupnik'},meanings:[{text:'croaking (raven)'}]},
 {id:3512,entry:{h:'קּוּרְקוּר',r:'S00645'},meanings:[{text:'croaking'}]}
],'קּוּרְקוּר');
assert(ravenCroak.some(group=>group.sources.some(source=>source.entry.r==='KRU16991')&&group.sources.some(source=>source.entry.r==='S00645')),'the shared raven-croaking sense should consolidate');













const roughStone=U.merge([
 {id:3803,entry:{h:'גְּוִיל',r:'KRU03803',source:'krupnik'},meanings:[
  {text:'rough untrimmed stone, cobble',label:'1'},
  {text:'a roll of parchment, a certain kind of parchment',label:'2'}
 ]},
 {id:364,entry:{h:'גְּוִיל',r:'C00364'},meanings:[
  {text:'a rolling stone, rough untrimmed stone, cobble',label:'1'},
  {text:'a roll of parchment',label:'—2)'}
 ]}
],'גְּוִיל');
assert.equal(roughStone.length,2,'the rough-stone sense should consolidate without absorbing the separate parchment sense');
assert(roughStone.some(group=>group.sources.length===2&&group.text.includes('rough untrimmed stone')),'both Bava Batra stone definitions should consolidate');
assert(roughStone.some(group=>group.text.includes('parchment')&&group.sources.length===2),'the separate parchment sense should remain independently available');

const bubblingForth=U.merge([
 {id:3169,entry:{h:'בִּצְבֵּץ',r:'KRU03169',source:'krupnik'},meanings:[{text:'to bubble forth, to burst forth'}]},
 {id:1075,entry:{h:'בִּצְבֵּץ',r:'B01075'},meanings:[{text:'to break through, bubble forth, burst forth'}]}
],'בִּצְבֵּץ');
assert.equal(bubblingForth.length,1,'the same bubble/burst-forth verbal sense should consolidate');
assert.equal(bubblingForth[0].sources.length,2,'both sources citing the same verbal usage should remain available');

assert.equal(U.reviewedSourceGlossPairs.size,1492,'all source-specific whole-gloss mappings must be loaded');

const houseAndPlace=U.merge([
 {id:2301,entry:{h:'בֵּי',r:'KRU02534',source:'krupnik'},meanings:[
  {text:'house',label:'2'},
  {text:'place',label:'3'}
 ]},
 {id:2302,entry:{h:'בֵּי',r:'B00536'},meanings:[
  {text:'house of, school of; home, place of',label:'',section:'—4)'}
 ]}
],'בֵּי');
assert.equal(houseAndPlace.length,2,'the house-of and place-of senses must remain separate');
const houseOfGroup=houseAndPlace.find(group=>group.text.toLowerCase().includes('house'));
const placeOfGroup=houseAndPlace.find(group=>group.text.toLowerCase().includes('place'));
assert(houseOfGroup&&houseOfGroup.sources.length===2,'the house-of sense should consolidate with Krupnik sense 2');
assert(placeOfGroup&&placeOfGroup.sources.length===2,'the place-of sense should consolidate with Krupnik sense 3');
assert.notEqual(houseOfGroup,placeOfGroup,'the two numbered senses must not collapse into one');

const rollIn=U.merge([
 {id:2311,entry:{h:'פַּלְפֵּל II',r:'KRU15603',source:'krupnik'},meanings:[{text:'to roll',label:''}]},
 {id:2312,entry:{h:'פַּלְפֵּל II',r:'Q01116'},meanings:[
  {text:'to roll in, cover with',label:'',section:''},
  {text:'to roll oneself',label:'Ithpalp. אִתְפַּלְפֵּל',section:''}
 ]}
],'פַּלְפֵּל II');
const rollInGroup=rollIn.find(group=>group.sources.some(source=>source.entry.r==='KRU15603')&&group.sources.some(source=>source.entry.r==='Q01116'));
assert(rollInGroup,'the shared Targum Job XVI, 15 rolling sense should consolidate');
assert.equal(rollInGroup.sources.length,2,'both original rolling source records must remain available');
const reflexiveRoll=rollIn.find(group=>group.text==='to roll oneself');
assert(reflexiveRoll&&reflexiveRoll.sources.length===1,'the separate reflexive rolling sense must remain independent');


const pourAndEmpty=U.merge([
 {id:2101,entry:{h:'זָלַף',r:'KRU06469',source:'krupnik'},meanings:[{text:'to empty',label:'2'}]},
 {id:2102,entry:{h:'זָלַף',r:'G00500'},meanings:[
  {text:'to pour, empty over',label:'',section:'1)'},
  {text:'to sprinkle',label:'',section:'—2)'}
 ]}
],'זָלַף');
const emptyingGroup=pourAndEmpty.find(group=>group.sources.some(source=>source.entry.r==='KRU06469')&&group.sources.some(source=>source.entry.r==='G00500'));
assert(emptyingGroup,'the shared Toh. X, 7 emptying sense should consolidate');
assert.equal(emptyingGroup.sources.length,2,'both original emptying source records must remain available');
const sprinkleGroup=pourAndEmpty.find(group=>group.text==='to sprinkle');
assert(sprinkleGroup&&sprinkleGroup.sources.length===1,'the separate Jastrow sprinkling sense must remain independent');


const likenessVariant=U.merge([
 {id:1100,entry:{h:'דִּכְוָת',r:'KRU05268',source:'krupnik'},meanings:[{text:'like, as',label:''}]},
 {id:1101,entry:{h:'דִּכְוָת',r:'D00769'},meanings:[{text:'the like of, resemblance, appearance',label:''}]}
],'דִּכְוָת');
assert.equal(likenessVariant.length,1,'the same likeness meaning should consolidate across its prepositional and nominal wording');
assert.equal(likenessVariant[0].sources.length,2,'both source records must remain accessible');


const lastReviewedSemanticFixtures=[
 {word:'נָהַג',kr:'KRU12418',jr:'N00250',k:'to conduct o. s.',j:'to lead, conduct; to demean one’s self; to be guided by, be wont to; to apply, be practiced'},
 {word:'מַעֲמָד',kr:'KRU11796',jr:'M02143',k:'in the presence of',j:'presence'},
 {word:'חָבַק',kr:'KRU06638',jr:'H00104',k:'to embrace one another',j:'to embrace, press, fasten.'}
];
for(const [n,item] of lastReviewedSemanticFixtures.entries()){
 const groups=U.merge([
  {id:1000+n*2,entry:{h:item.word,r:item.kr,source:'krupnik'},meanings:[{text:item.k,label:''}]},
  {id:1001+n*2,entry:{h:item.word,r:item.jr},meanings:[{text:item.j,label:''}]}
 ],item.word);
 const matched=groups.find(group=>group.sources.some(source=>source.entry.r===item.kr)&&group.sources.some(source=>source.entry.r===item.jr));
 assert(matched,'reviewed semantic equivalence should consolidate: '+item.jr+' / '+item.kr);
 assert.equal(matched.sources.length,2,'both dictionary sources must be retained: '+item.jr+' / '+item.kr);
}


const finalReviewedGlossVariants=[
 {word:'דִּין',kr:'KRU05163',jr:'D00634',k:'to have a law-suit',j:'to argue, dispute, have a law-suit with'},
 {word:'מְטֵי',kr:'KRU11129',jr:'M00995',k:'to reach, to arrive',j:'to arrive at; to obtain; to happen to'},
 {word:'חָלַק',kr:'KRU07227',jr:'H01112',k:'to differ with',j:'to differ.'},
 {word:'תָּבַע',kr:'KRU19569',jr:'V00067',k:'to sue, to ask for',j:'to ask, claim, summon'},
];
for(const [n,item] of finalReviewedGlossVariants.entries()){
 const groups=U.merge([
  {id:900+n*2,entry:{h:item.word,r:item.kr,source:'krupnik'},meanings:[{text:item.k,label:''}]},
  {id:901+n*2,entry:{h:item.word,r:item.jr},meanings:[{text:item.j,label:''}]}
 ],item.word);
 const matched=groups.find(group=>group.sources.some(source=>source.entry.r===item.kr)&&group.sources.some(source=>source.entry.r===item.jr));
 assert(matched,'reviewed source-level variant should consolidate: '+item.jr+' / '+item.kr);
 assert.equal(matched.sources.length,2,'the source pair must be retained: '+item.jr+' / '+item.kr);
}


const finalSemanticFixtures=[
 {word:'יֵבָא',kr:'KRU08390',jr:'J00028',k:'it corresponds to',j:'it agrees with, corresponds to'},
 {word:'נוֹחַ II',kr:'KRU12467',jr:'N00343',k:'good, better (for)',j:'it is good'},
 {word:'גָּרַע I',kr:'KRU04637',jr:'C01379',k:'to deduct from',j:'to scrape off, to diminish, deduct'},
 {word:'חֲתַם',kr:'KRU07673',jr:'H01900',k:'to close, to end',j:'to close up'}
];
for(const [n,item] of finalSemanticFixtures.entries()){
 const groups=U.merge([
  {id:800+n*2,entry:{h:item.word,r:item.kr,source:'krupnik'},meanings:[{text:item.k,label:''}]},
  {id:801+n*2,entry:{h:item.word,r:item.jr},meanings:[{text:item.j,label:''}]}
 ],item.word);
 const matched=groups.find(group=>group.sources.some(source=>source.entry.r===item.kr)&&group.sources.some(source=>source.entry.r===item.jr));
 assert(matched,'reviewed semantic equivalent should consolidate: '+item.jr+' / '+item.kr);
 assert.equal(matched.sources.length,2,'both original dictionary sources must be preserved: '+item.jr+' / '+item.kr);
}


const finalReviewedAlternativeFixtures=[
 {word:'רְחֵם',kr:'KRU18096',jr:'T00517',k:'to have pity',j:'to have compassion on, pity'},
 {word:'מוּקְצֶה',kr:'KRU10885',jr:'M00596',k:'an animal set aside for a sacrifice',j:'an animal set aside'},
 {word:'לָקִיט II',kr:'KRU10422',jr:'L00689',k:'bass-relief',j:'pinched out, chiselled, in bass-relief'},
 {word:'טְרַף I',kr:'KRU08326',jr:'I00860',k:'to knock',j:'to knock at, shake, rap'}
];
for(const [n,item] of finalReviewedAlternativeFixtures.entries()){
 const groups=U.merge([
  {id:700+n*2,entry:{h:item.word,r:item.kr,source:'krupnik'},meanings:[{text:item.k,label:''}]},
  {id:701+n*2,entry:{h:item.word,r:item.jr},meanings:[{text:item.j,label:''}]}
 ],item.word);
 const matched=groups.find(group=>group.sources.some(source=>source.entry.r===item.kr)&&group.sources.some(source=>source.entry.r===item.jr));
 assert(matched,'reviewed semantic alternative should consolidate: '+item.jr+' / '+item.kr);
 assert.equal(matched.sources.length,2,'both original sources must be retained: '+item.jr+' / '+item.kr);
}


const additionalReviewedAlternativeFixtures=[
 {word:'גֵּירוּמִים',kr:'KRU04213',jr:'C00821',k:'customary addition to weight or measure',j:'that which goes along, customary addition to weight'},
 {word:'גַּמְזוּז',kr:'KRU04374',jr:'C01015',k:'a fig ripened through caprification',j:'a fig or carob ripened through caprification'},
 {word:'דִּיאַטְרִיטָא',kr:'KRU05017',jr:'D00453',k:'cut glass vessels',j:'cut or engraved glass vessels'},
 {word:'לוֹפְיָן',kr:'KRU10126',jr:'L00307',k:'one having thick eye-brows',j:'one having thick and connected eye-brows'},
 {word:'עוֹנָה I',kr:'KRU14250',jr:'P00294',k:'a period of twelve hours',j:'‘Onah, a period of twelve astronomical hours, one half of the natural day and of the natural night'},
 {word:'נְטוּלָה',kr:'KRU12583',jr:'N00545',k:'an animal in whose body an organ is found to be absent or destroyed',j:'the case of an animal in whose body an organ is found to be absent'},
 {word:'תַּכְבְּרָא',kr:'KRU19830',jr:'V00526',k:'the body of an animal stuffed with its loose pieces and roasted',j:'the body of an animal stuffed with its loose pieces'}
];
for(const [n,item] of additionalReviewedAlternativeFixtures.entries()){
 const groups=U.merge([
  {id:600+n*2,entry:{h:item.word,r:item.kr,source:'krupnik'},meanings:[{text:item.k,label:''}]},
  {id:601+n*2,entry:{h:item.word,r:item.jr},meanings:[{text:item.j,label:''}]}
 ],item.word);
 const matched=groups.find(group=>group.sources.some(source=>source.entry.r===item.kr)&&group.sources.some(source=>source.entry.r===item.jr));
 assert(matched,'reviewed expanded alternative should consolidate: '+item.jr+' / '+item.kr);
 assert.equal(matched.sources.length,2,'both original sources must be retained: '+item.jr+' / '+item.kr);
}
assert.equal(U.alternativeMatchKey('conqueror!','conqueror!').key,U.alternativeMatchKey('conqueror','conqueror').key,'terminal punctuation must not prevent an otherwise identical gloss match');
assert.equal(U.alternativeMatchKey('in ecstacy ?','in ecstacy ?').key,U.alternativeMatchKey('in ecstacy','in ecstacy').key,'whitespace before terminal punctuation must not change the alternative key');

const reviewedAlternativeFixtures=[
 {word:'סְקוֹרְטְיָא',kr:'KRU13933',jr:'O01464',k:'leather apron',j:'leather coat; also leather apron.',extra:'leather coat'},
 {word:'שַׁרְגִּיגָא',kr:'KRU19454',jr:'U01930',k:'easily enticed',j:'one easily enticed, simple'},
 {word:'שָׁתַת II',kr:'KRU19540',jr:'U02141',k:'to lay the foundation',j:'to lay the foundation of, start'},
 {word:'תּוֹסְפָאָה',kr:'KRU19659',jr:'V00245',k:'one who writes plene',j:'one who uses the vowel letters freely, who writes plene'},
 {word:'אַכְסָרָה',kr:'KRU01153',jr:'A01744',k:'in the lump',j:'in a lump, on measuring by sight.'}
];
for(const [n,item] of reviewedAlternativeFixtures.entries()){
 const groups=U.merge([
  {id:500+n*2,entry:{h:item.word,r:item.kr,source:'krupnik'},meanings:[{text:item.k,label:''}]},
  {id:501+n*2,entry:{h:item.word,r:item.jr},meanings:[{text:item.j,label:''}]}
 ],item.word);
 const matched=groups.find(group=>group.sources.some(source=>source.entry.r===item.kr)&&group.sources.some(source=>source.entry.r===item.jr));
 assert(matched,'reviewed source alternative should consolidate: '+item.jr+' / '+item.kr);
 assert.equal(matched.sources.length,2,'both source records must remain attached: '+item.jr+' / '+item.kr);
 if(item.extra)assert(groups.some(group=>group.text===item.extra&&group.sources.length===1),'an unmatched distinct semicolon sense must remain separate: '+item.jr);
}

const alternativeScoped=U.merge([
 {id:301,entry:{h:'גָּנַח',r:'KRU04451',source:'krupnik'},meanings:[{text:'to sigh heavily under an attack of angina pectoris, to expectorate',label:''}]},
 {id:302,entry:{h:'גָּנַח',r:'C01128'},meanings:[
  {text:'to sigh heavily under an attack of angina pectoris',label:''},
  {text:'to cough and spit blood',label:''}
 ]}
],'גָּנַח');
assert.equal(alternativeScoped.length,2,'comma-listed gloss alternatives must stay within their semicolon-delimited sense');
const matchedSigh=alternativeScoped.find(group=>group.text.includes('to sigh heavily under an attack of angina pectoris'));
const jastrowOtherSense=alternativeScoped.find(group=>group.text==='to cough and spit blood');
assert.equal(matchedSigh.sources.length,2,'the matched sense must retain both dictionary sources');
assert(matchedSigh.text.includes('to expectorate'),'the rest of the original comma-listed Krupnik gloss must remain with its sense');
assert.equal(jastrowOtherSense.sources.length,1,'the second Jastrow sense must remain separate');
assert.equal(matchedSigh.sources.find(source=>source.entry.r==='KRU04451').meaning.text,'to sigh heavily under an attack of angina pectoris, to expectorate','More detail must retain the full original Krupnik gloss');

// Semicolons mark distinct senses; comma-listed alternatives within each
// sense stay together and are consolidated against their matching source gloss.
const semicolonSenses=U.merge([
 {id:311,entry:{h:'גְּזוּרְתָּא',r:'KRU03954',source:'krupnik'},meanings:[
  {text:'circumcision, feast of circumcision',label:''},
  {text:'the circumcised membrum',label:''}
 ]},
 {id:312,entry:{h:'גְּזוּרְתָּא',r:'C00536'},meanings:[
  {text:'circumcision, feast of circumcision; the circumcised membrum',label:''}
 ]}
],'גְּזוּרְתָּא');
assert.equal(semicolonSenses.length,2,'semicolon-separated meanings must remain distinct');
assert.equal(semicolonSenses.find(group=>group.text.includes('circumcision')).sources.length,2,'the first comma-listed sense must consolidate');
assert.equal(semicolonSenses.find(group=>group.text==='the circumcised membrum').sources.length,2,'the second semicolon-separated sense must consolidate separately');



// Exact gloss-list equivalence is normalized for punctuation, ordering,
// articles, and coordinated infinitive markers without using word overlap.
const formatOnly=U.merge([
 {id:205,entry:{h:'גדע',r:'KRU-FMT-1'},meanings:[{text:'to cut, chop, lop off',label:''}]},
 {id:206,entry:{h:'גדע',r:'FMT-1'},meanings:[{text:'to cut; to chop; to lop off.',label:''}]}
],'גדע');
assert.equal(formatOnly.length,1,'punctuation and coordinated infinitive formatting must not create duplicate meanings');
assert.equal(formatOnly[0].sources.length,2,'format-only consolidation must preserve both source records');
assert.equal(U.canonicalGlossKey('to cut, chop, lop off'),U.canonicalGlossKey('to cut; to chop; to lop off.'));
assert.equal(U.canonicalGlossKey('bank, alluvial ground'),U.canonicalGlossKey('alluvial ground; bank'));
assert.equal(U.canonicalGlossKey('to plane, make thin, weaken'),U.canonicalGlossKey('to make thin, to weaken, to plane'),'the order of equivalent alternatives and repeated infinitive markers must not create duplicate meanings');
assert.notEqual(U.canonicalGlossKey('to be cut'),U.canonicalGlossKey('to cut'),'passive and active infinitives must remain distinct');
assert.equal(U.canonicalGlossKey('to be rolled up, folded'),U.canonicalGlossKey('to be rolled up, to be folded'),'coordinated passive infinitives may omit the repeated auxiliary');

assert.notEqual(U.canonicalGlossKey('to lament'),U.canonicalGlossKey('lament'),'a single infinitive must remain distinct from a noun/adjective');
assert.notEqual(U.canonicalGlossKey('father’s brother'),U.canonicalGlossKey('brother’s father'),'word order inside a meaning must remain significant');
assert.notEqual(U.canonicalGlossKey('charge, fee'),U.canonicalGlossKey('charge, accusation'),'a shared word must not equate different gloss lists');

// Similar words outside the curated synonym list must not be enough.
const unreviewedPartOverlap=U.merge([
 {id:203,entry:{h:'קם'},meanings:[{text:'charge, fee',label:''}]},
 {id:204,entry:{h:'קם'},meanings:[{text:'charge, accusation',label:''}]}
],'קם');
assert.equal(unreviewedPartOverlap.length,2,'an arbitrary shared word must not merge distinct senses');




// Third manually reviewed tranche: forty equivalent gloss pairs from the regenerated inventory.
const thirdReviewedEquivalences=[["KRU04498","C01187","roaring, crying","roaring, crying in agony"],["KRU04774","D00108","to put up a flag","to put up a flag, to signalize"],["KRU04953","D00363","present, gift","present, honorary gift"],["KRU05244","D00741","removal of ashes","removal of ashes, cleaning"],["KRU05314","D00833","sparsely planted","thin, sparsely planted"],["KRU05517","D01078","to scatter, to winnow","to scatter, strew; to winnow"],["KRU06195","F00083","rose-colored wool","rose-colored, red wool"],["KRU06284","G00145","to remove, to shake","to move, shake; to remove."],["KRU08318","I00849","worker in copper","worker in copper, bronze"],["KRU08375","J00013","right, nice","fitting, right, nice"],["KRU08593","J00287","single, lonely","singular, single, lonely"],["KRU08889","J00681","inhabited land","settlement, inhabited land"],["KRU09098","K00243","to scald, to cauterize","to sear, cauterize; to scald"],["KRU09573","K00860","to grow smaller","to grow smaller, to contract"],["KRU09573","K00860","to form a recess in a wall","to form a recess"],["KRU09602","K00906","with a deformed hip","an animal with a deformed hip"],["KRU09762","K01117","priestly division","band, priestly division"],["KRU09827","K01227","a fenced in plantation","a plantation fenced in from all sides"],["KRU09881","K01325","to grow better","to grow better, improve"],["KRU09896","K01347","Biblical verse","Biblical verse, passage"],["KRU09989","L00061","edge, rim","vertical rim, edge"],["KRU09985","L00411","fanning a flame","blowing, fanning a flame"],["KRU10294","L00548","to mix, to beat","to mix thoroughly, to beat"],["KRU10423","L00690","harvesting, picking","picking, collecting, harvesting."],["KRU10429","L00696","a small coin","a very small copper coin"],["KRU10473","M00015","opening, window","light-hole, opening, window."],["KRU10565","M00113","to dissolve, to steep","to soften, dissolve, steep"],["KRU10781","M00442","leaves of onions","leaves of onions, leek"],["KRU10791","M00461","the right conduct","the better, the right conduct"],["KRU10822","M00505","stuffed meat","stuffing, stuffed meat"],["KRU10875","M00582","hot spring","the hot spring of Tiberias"],["KRU11058","M00877","blotting out","rubbing, blotting out"],["KRU11169","M01058","capital, metropolis","metropolis, capital; city"],["KRU11240","M01149","reduction to poverty","decline, reduction to poverty"],["KRU11800","M02148","handle of the plough","handle of the plough; coulter"],["KRU12296","M03105","firm solution","a firm, decided solution"],["KRU12324","N00056","mean person","mean person, scamp."],["KRU12403","N00219","dowry, a bride’s outfit","a bride’s outfit"],["KRU12425","N00261","granted, admitted","let it be, granted, admitted"],["KRU12466","N00341","to be laid down","to be laid down, placed"]];
for(const [kr,jr,kg,jg] of thirdReviewedEquivalences){
 const ids=[kr,jr].sort().join('|');
 const glosses=[normalizeReviewed(kg),normalizeReviewed(jg)].sort().join(' | ');
 assert(U.reviewedSourceGlossPairs.has(ids+'::'+glosses),'third-tranche mapping missing: '+jr+' / '+kr);
}








// Tenth reviewed tranche: twenty-five same-sense lexical and grammatical variants.
const tenthReviewedEquivalences=[["KRU04566","C01270","fringe","that which is combed, fringe"],["KRU04578","C01320","to incite, to stir up","to incite"],["KRU04694","D00017","to flow","to flow"],["KRU04712","D00027","a species of doves","doves"],["KRU04721","D00037","to overflow","to drip, overflow"],["KRU04733","D00052","bee-hive","bee-swarm, bee-hive"],["KRU04747","D00073","to glue","to paste, glue"],["KRU04747","D00073","to be attached to","to be attached, join"],["KRU04748","D00074","glue","glue, paste"],["KRU04755","D00082","field","pasture, field"],["KRU04815","D00164","two","two, double"],["KRU04818","D00168","mail-carrier","mail-carrier, despatch-bearer"],["KRU05023","D00170","to flow","to flow, drip"],["KRU04830","D00184","to be troubled","to be anxious, troubled"],["KRU04835","D00190","simile","simile, illustration"],["KRU05061","D00236","grief","grief, affliction"],["KRU04867","D00235","sad","sad, depressed"],["KRU04927","D00326","exactness","exactness, minuteness"],["KRU04941","D00341","to dwell","to reside, dwell"],["KRU04945","D00350","load","burden, load"],["KRU04987","D00408","suspension","postponement, suspension"],["KRU04994","D00411","to frighten","to frighten, scare"],["KRU04999","D00426","God-fearing","God-fearing, conscientious"],["KRU05016","D00450","edict","edict, ordinance"],["KRU05024","D00462","gonorrhoea","flux, gonorrhoea"]];
for(const [kr,jr,kg,jg] of tenthReviewedEquivalences){
 const ids=[kr,jr].sort().join('|');
 const glosses=[normalizeReviewed(kg),normalizeReviewed(jg)].sort().join(' | ');
 assert(U.reviewedSourceGlossPairs.has(ids+'::'+glosses),'tenth-tranche mapping missing: '+jr+' / '+kr);
}

// Ninth reviewed tranche: twenty-five straightforward lexical and explanatory variants.
const ninthReviewedEquivalences=[["KRU01183","A01787","deity","Deity, divinity"],["KRU01222","A01866","strength","strength, force"],["KRU01201","A01923","in Greek","Hellenic, in Greek"],["KRU01286","A01961","womb","womb, mouth of the womb"],["KRU01352","A02058","middle","central, middle"],["KRU01408","A02139","lighting","lighting, illumination"],["KRU01527","A02316","wife","woman, wife"],["KRU01542","A02346","station","resting station"],["KRU01551","A02376","garment","robe, garment"],["KRU01588","A02428","physician","physician, surgeon;"],["KRU01590","A02432","recovery","cure, recovery"],["KRU01598","A02444","gathering","gathering, assembly"],["KRU01607","A02457","consent","consent, agreement"],["KRU01608","A02458","croup","choking, croup"],["KRU01614","A02466","support","support, reliance"],["KRU01617","A02468","granary","store-house, granary."],["KRU01618","A02469","thorn-bush","thorn-bush, bramble"],["KRU01664","A02555","officer","Roman officer"],["KRU01666","A02558","road, way","road"],["KRU01702","A02620","Apulia in Italy","Apulia"],["KRU01748","A02687","even, even if","even if, although, even"],["KRU01780","A02728","to turn, reverse","to turn"],["KRU01889","A02883","prosperity","success, prosperity"],["KRU00554","A03057","hammock","cradle, hammock"],["KRU02160","A03321","setting","fitting, setting"]];
for(const [kr,jr,kg,jg] of ninthReviewedEquivalences){
 const ids=[kr,jr].sort().join('|');
 const glosses=[normalizeReviewed(kg),normalizeReviewed(jg)].sort().join(' | ');
 assert(U.reviewedSourceGlossPairs.has(ids+'::'+glosses),'ninth-tranche mapping missing: '+jr+' / '+kr);
}

// Eighth reviewed tranche: twenty-nine source-scoped equivalents from the next inventory page.
const eighthReviewedEquivalences=[["KRU02353","B00211","mat","a mat of reeds"],["KRU02511","B00495","receptacles","column-like receptacles"],["KRU03264","B01166","intimate","intimate, familiar"],["KRU03295","B01205","cover","wrapper, cover"],["KRU03562","C00096","the camel's hump","hump."],["KRU03915","C00491","a trap or cage","a trap"],["KRU04005","C00594","imper. burn them","burn them"],["KRU04624","C01357","document","bond, document"],["KRU04631","C01369","gramma, scrupulum","gramma"],["KRU04905","D00293","measure","keg, measure"],["KRU06732","H00275","a species of thistles","thistles"],["KRU07817","I00186","shade","shade, shadow"],["KRU08197","I00678","a heated tile","tile;"],["KRU08270","I00772","inflammation","an eruption, inflammation"],["KRU08896","J00690","ballast-stones","anchor, ballast-stones"],["KRU09221","K00405","embroidery","embroidery, design"],["KRU09873","K01304","to prosper","to do well, prosper"],["KRU10755","M00400","pivot","pivot, hinge"],["KRU11876","M02288","wrangler","wrangler, hair-plucker"],["KRU15129","Q00313","quarry","stone-breaking, quarry"],["KRU16363","R00276","thirsty","parched, thirsty."],["KRU19559","V00045","Thebaic","Thebaic cubit"],["KRU00082","A00120","want","want, distress"],["KRU00538","A00842","evening","twilight, evening"],["KRU00835","A01302","the land Elam","Elam"],["KRU00787","A01316","hind","hind, roe"],["KRU00863","A01342","day","day time"],["KRU00875","A01364","yes","yes, indeed"],["KRU00900","A01406","prohibition","prohibition, interdict;"]];
for(const [kr,jr,kg,jg] of eighthReviewedEquivalences){
 const ids=[kr,jr].sort().join('|');
 const glosses=[normalizeReviewed(kg),normalizeReviewed(jg)].sort().join(' | ');
 assert(U.reviewedSourceGlossPairs.has(ids+'::'+glosses),'eighth-tranche mapping missing: '+jr+' / '+kr);
}

// Seventh reviewed tranche: fifteen additional equivalent explanatory gloss variants.
const seventhReviewedEquivalences=[["KRU20038","V00892","to remove obstacles","to remove obstacles, clear"],["KRU20048","V00912","joists, ceiling","roofing, ceiling, joists"],["KRU20107","V01008","fall, ruin","sinking, fall, ruin"],["KRU03924","C00503","lump, clod, ball","something substantial, lump, clod, ball"],["KRU04563","C01266","a certain reddish clay (also used as medicine)","a certain reddish clay"],["KRU08853","J00633","going down, fall","going down, fall, decline, degradation."],["KRU13401","O00535","common meal, picnic","sending provisions for a common meal, picnic"],["KRU16140","Q02072","plain, a matter of course","plain, self-evident truth; is it not a matter of course?"],["KRU17675","S01941","persons called up to read from the Torah","persons called up to read from the Scriptures"],["KRU10850","M00548","Musaf, additional offering and prayer on Sabbath and festive days","Musaf, additional offering, additional prayer"],["KRU15903","Q01646","a declaration that the law of limitation by the entrance of the Sabbatical year shall not apply to the loans to be transacted","prosbul, a declaration made in court, before the execution of a loan, to the effect that the law of limitation by the entrance of the Sabbatical year shall not apply to the loan to be transacted"],["KRU03757","C00312","thumb, great toe Daumen, grosse Zehe","thumb, great toe"],["KRU03767","C00322","a subterranean thunder, earthquake","an abrupt sound, a subterranean thunder, earthquake, rumbling"],["KRU11781","M02117","a paste made of flour","a paste made of flour on which boiling water is poured"],["KRU14332","P00470","to put on an upper garment","to wrap one’s self up, to put on an upper garment"]];
for(const [kr,jr,kg,jg] of seventhReviewedEquivalences){
 const ids=[kr,jr].sort().join('|');
 const glosses=[normalizeReviewed(kg),normalizeReviewed(jg)].sort().join(' | ');
 assert(U.reviewedSourceGlossPairs.has(ids+'::'+glosses),'seventh-tranche mapping missing: '+jr+' / '+kr);
}

// Sixth reviewed tranche: twenty-nine additional source-verified equivalent glosses.
const sixthReviewedEquivalences=[["KRU12540","N00459","to damage, to injure","to hurt, injure, damage"],["KRU12623","N00596","illicit intercourse","lewdness, illicit intercourse"],["KRU12780","N00871","loss of courage","melting, loss of courage"],["KRU12821","N00934","test, temptation","trial, test; temptation"],["KRU12884","N01064","to squirt into the mouth","to blow, squirt into the mouth"],["KRU12915","N01105","uninterrupted flow of a liquid","uninterrupted flow"],["KRU13057","N01338","to move, to slip","to slip, glide, move"],["KRU13299","O00364","evil habit, practice","evil habit"],["KRU13379","O00502","to strike, to slap","to strike sideways, slap"],["KRU13445","O00604","signet ring","seal, signet ring"],["KRU13467","O00642","hope, prospect","what is looked for, prospect, hope"],["KRU13573","O00831","drawing lines","drawing lines, ruling"],["KRU13868","O01349","to scrape together","to scrape together, collect"],["KRU13969","O01531","to draw lines","to rule, draw lines"],["KRU14026","O01659","Seraphim, angels","Seraphim, ministering angels"],["KRU14046","O01698","closure, cover","closing, closure, cover"],["KRU14204","P00204","greater importance","greater importance, gravity"],["KRU14478","P00680","mixture, conjunction","interweaving, mixture, conjunction"],["KRU14726","P01114","to be hard, sapless","to be hard, dry; sapless"],["KRU15229","Q00486","to hollow out","to hollow out, dig"],["KRU15253","Q00517","stout, fattened","fat, fattened, stout"],["KRU15821","Q01496","to open forcibly","to tear open, open forcibly"],["KRU15988","Q01801","flying off","flight, flying off"],["KRU15994","Q01810","rending of garments","tearing, rending of garments"],["KRU16113","Q02021","to be kept away","to be separated, kept away"],["KRU16117","Q02033","branching off","separation, branching off"],["KRU16426","R00403","flake of wool","flake of wool, hatchelled wool"],["KRU16621","R00800","refining pot","refining pot, crucible"],["KRU16084","Q01976","face, visage","face, visage, front"]];
for(const [kr,jr,kg,jg] of sixthReviewedEquivalences){
 const ids=[kr,jr].sort().join('|');
 const glosses=[normalizeReviewed(kg),normalizeReviewed(jg)].sort().join(' | ');
 assert(U.reviewedSourceGlossPairs.has(ids+'::'+glosses),'sixth-tranche mapping missing: '+jr+' / '+kr);
}

// Fifth reviewed tranche: twenty-two additional conservative equivalences from the refreshed queue.
const fifthReviewedEquivalences=[["KRU09193","K00352","of Cyprus","Cyprus"],["KRU11185","M01077","a woman’s protest against a marriage contracted during her minority","a woman’s protest against a marriage contracted during her minority, annulment of marriage"],["KRU04347","C00977","to dig out, to engrave, to shape","to dig out, engrave; to shape, form"],["KRU09167","K00309","the lower part of the winnowing shovel","receiver, the lower part of the winnowing shovel"],["KRU03211","B01123","cleaving, cleft, log","cleaving, cleft; that which is cloven, a log."],["KRU03320","B01236","to recover, to get strong","to get well, recover; to be strong"],["KRU03732","C00283","border of the field, ridge","border of the field, balk, ridge."],["KRU13305","O00377","a garment made of goat-skin","a garment made of goat-skin with the hair on"],["KRU15271","Q00547","to give leave, to let go","to dismiss, give leave, let go"],["KRU15536","Q00997","to vomit, to give out","to discharge, vomit, give out"],["KRU19376","U01786","to discharge, to pour out","to pour out, run, discharge"],["KRU03647","C00205","heaped (measure)","liberal, heaped measure"],["KRU16876","S00439","powdered lime","powdered lime, plaster"],["KRU01348","A02054","Roman Emperor","commander, Roman Emperor"],["KRU02106","A03232","A perforated vessel, clepsydra","a perforated vessel"],["KRU03082","B01035","habitual kicker","habitual kicker, butting"],["KRU03083","B01037","to pray, to ask for mercy","to ask, pray"],["KRU03641","C00198","incision in the flesh","incision in the flesh, wounding"],["KRU03852","C00423","glowing coal","burning, glowing coal"],["KRU03882","C00455","to bung, to cork","to squeeze, cork, bung"],["KRU04381","C01022","full draught","quaffing, full draught"],["KRU09492","K00771","fine cloaks for women","fine cloaks"]];
for(const [kr,jr,kg,jg] of fifthReviewedEquivalences){
 const ids=[kr,jr].sort().join('|');
 const glosses=[normalizeReviewed(kg),normalizeReviewed(jg)].sort().join(' | ');
 assert(U.reviewedSourceGlossPairs.has(ids+'::'+glosses),'fifth-tranche mapping missing: '+jr+' / '+kr);
}

// Fourth reviewed tranche: the letter name is a spelling/transliteration variant.
const fourthReviewedEquivalences=[["KRU14410","P00548","the letter Ayin","the letter ʿAyin"]];
for(const [kr,jr,kg,jg] of fourthReviewedEquivalences){
 const ids=[kr,jr].sort().join('|');
 const glosses=[normalizeReviewed(kg),normalizeReviewed(jg)].sort().join(' | ');
 assert(U.reviewedSourceGlossPairs.has(ids+'::'+glosses),'fourth-tranche mapping missing: '+jr+' / '+kr);
}

// Second manually reviewed candidate tranche: equivalent source senses only.
const secondReviewedEquivalences=[["KRU03864","C00435","spiral form, writing in spiral form","spiral form"],["KRU09831","K01231","a row of vines","a row of vines in a vineyard"],["KRU17752","S02086","a covered vehicle","a covered arched vehicle"],["KRU00419","A00635","air, space","empty space, air"],["KRU01195","A01811","born in month of Elul","born in Elul."],["KRU01468","A02237","of cast metal","made of cast metal"],["KRU01580","A02415","military commander","military commander, general"],["KRU01594","A02437","uncoined metal","uncoined metal, bulion"],["KRU02386","B00269","ravenous hunger","ravenous hunger, bulimy"],["KRU03035","B01003","to be sweet, pleasant","to be sweet, pleasant, pleasing"],["KRU03035","B01003","to grow better","to grow better, improve"],["KRU03331","B01252","rebellion, defiance","rebellion, defiance of the law"],["KRU03376","B01317","euph: white cataract","white cataract"],["KRU03416","B01349","delicate food","delicate food, dainty."],["KRU03526","C00053","high, exalted","high, exalted, elevated"],["KRU03656","C00217","heaped (measure)","heaped, liberal measure"],["KRU03670","C00231","to be cut off","to be cut off, lopped"],["KRU03830","C00398","a shapeless mass","a rolled up, shapeless mass"],["KRU04203","C00807","direct consequence of an act","direct consequence"],["KRU04312","C00931","country of the Gauls","Gaul, country of the Gauls"],["KRU04336","C00962","untrimmed stone","untrimmed stone, cobble"],["KRU04342","C00970","euphem. a menstruous woman","a menstruous woman"],["KRU04377","C01022","full draught","quaffing, full draught"],["KRU04579","C01287","seed of St. John’s bread","John’s bread"],["KRU04875","D00246","dux, chief, commander","dux, commander"],["KRU04874","D00250","teacher’s platform","teacher’s platform, pulpit"],["KRU04950","D00357","sediment, lees","sediment, lees, dregs"],["KRU05181","D00656","letter, document","official document, letter"],["KRU05472","D01078","to winnow, to scatter","to scatter, strew; to winnow"],["KRU06437","G00452","privilege, benefit","advantage, privilege, benefit"],["KRU06543","G00649","to be accounted, to be converted into a loan","to be converted into a loan"],["KRU06557","G00671","coat of mail","coat of mail, armour"],["KRU06828","H00444","to make evident, to prove","to make evident"],["KRU07362","H01336","to be put to shame","to be reviled, put to shame"],["KRU07455","H01516","to pick one’s teeth","to pick the teeth"],["KRU07731","I00078","to mention explicitly","to specify, mention explicitly"],["KRU07798","I00156","roasted meat","roast, roasted meat."],["KRU07816","I00183","secret place","secret, hiding place"],["KRU08187","I00662","of secondary import","attachment, of secondary import"],["KRU08257","I00759","a head cover","t’ratin, a head cover."],["KRU08366","J00013","nice, right","fitting, right, nice"],["KRU08802","J00557","to set on fire","to set on fire, burn"],["KRU09184","K00337","a small stove","a small stove, brazier"],["KRU09242","K00438","a vessel for pressing of olives","a vessel for olives"],["KRU09347","K00583","shame, putting to shame","putting to shame; disgrace, shame"],["KRU09488","K00760","rule, principle","general rule, principle"]];
for(const [kr,jr,kg,jg] of secondReviewedEquivalences){
 const ids=[kr,jr].sort().join('|');
 const glosses=[normalizeReviewed(kg),normalizeReviewed(jg)].sort().join(' | ');
 assert(U.reviewedSourceGlossPairs.has(ids+'::'+glosses),'second-tranche mapping missing: '+jr+' / '+kr);
}

// 28 additional reviewed source-scoped Jastrow/Krupnik equivalences.
const addedEquivalences=[["KRU08934","J00748","a person having an additional limb","additional, a person having an additional limb"],["KRU09509","K00789","how! how many! how much!","how much?, how many?"],["KRU09509","K00789","how! how many! how much!","how!, how many!, how much!"],["KRU16068","Q01943","to collect payment","to collect payment from"],["KRU17577","S01744","mimic intimation","mimic intimation of"],["KRU07227","H01112","to be divided","to be divided up"],["KRU09272","K00475","as, like","like"],["KRU09272","K00475","so, thus","thus"],["KRU12833","N00958","to be offered","to be offered up"],["KRU14105","P00071","In Hebrew","Hebrew"],["KRU14624","P00882","standing","standing, standing up"],["KRU18252","T00809","to lift","to lift up"],["KRU19228","U01473","one eighth","eighth; one eighth"],["KRU04364","C00998","to stammer, to hesitate (to speak with an expression of uncertainty or of scruple)","to hesitate, stammer, to speak with an expression of uncertainty"],["KRU16736","S00192","to wash hands and feet to a sacred act","to wash hands and feet prior to a sacred act"],["KRU03201","B01112","to search, to investigate, to find out","to search, investigate, examine, find out"],["KRU08263","I00762","to cut out edges","to cut out edges, to pink."],["KRU03599","C00144","heap, pile, mound","heap of stones, pile, mound"],["KRU03657","C00220","leader of a blind man","staff, leader of a blind man"],["KRU03920","C00498","circle, meeting court","circle, meeting, court-room, court"],["KRU04328","C00953","stillness of wind and wave","calm, stillness of wind and wave"],["KRU05603","E00046","payment for a thing included in the bargain (and not mentioned)","payment for a thing included in the bargain"],["KRU11056","M00873","divided off space","divided off space, compartment"],["KRU11447","M01511","place for drawing water","place for drawing water, well"],["KRU13313","O00393","metal spike of the spear","metal spike at the butt-end of the spear"],["KRU15157","Q00363","large baking oven","a stationary, large baking oven"],["KRU19917","V00683","pillars of the framework of a lantern","the pillars supporting the framework of a lantern"],["KRU08356","I00909","a sale on time at a price higher than the seller would take if he sold for cash","deaf or silent usury, tarsha, a sale on time at a price higher than the seller would take if he sold for cash"],["KRU19309","U01649","the seven letters which require crownlets in the Pentateuch scrolls","the seven letters which require crownlets"]];
function normalizeReviewed(value){return String(value).normalize('NFKC').toLowerCase().replace(/[’‘]/g,"'").replace(/[‐‑–—]/g,'-').replace(/[.\s]+$/,'').trim().replace(/\s+/g,' ');}
for(const [kr,jr,kg,jg] of addedEquivalences){
 const ids=[kr,jr].sort().join('|');
 const glosses=[normalizeReviewed(kg),normalizeReviewed(jg)].sort().join(' | ');
 assert(U.reviewedSourceGlossPairs.has(ids+'::'+glosses),'reviewed mapping missing: '+jr+' / '+kr);
}


const consolidatedTalkVerbs=U.merge([
 {id:401,entry:{h:'לִמְלֵם',r:'KRU10334',source:'krupnik'},meanings:[{text:'to murmur, to talk against',label:''}]},
 {id:402,entry:{h:'לִמְלֵם',r:'L00577',source:'jastrow'},meanings:[{text:'to talk against, murmur, sneer',label:''}]}
],'למלם');
assert.equal(consolidatedTalkVerbs.length,1,'both individually reviewed talk-verb alternatives should consolidate as one sense');
assert.equal(consolidatedTalkVerbs[0].sources.length,2,'the consolidated talk-verb sense must retain both dictionary sources');
assert(consolidatedTalkVerbs[0].text.includes('sneer'),'unmatched synonyms from the original comma-listed sense must remain visible');

const twoLaazSenses=U.merge([
 {id:403,entry:{h:'לַעַז',r:'KRU10364',source:'krupnik'},meanings:[{text:'foreign tongue, Greek',label:'1'},{text:'evil talk',label:'2'}]},
 {id:404,entry:{h:'לַעַז',r:'L00604',source:'jastrow'},meanings:[{text:'foreign tongue',label:''},{text:'evil talk, disrepute',label:''}]}
],'לעז');
assert.equal(twoLaazSenses.length,2,'two distinct senses in one headword must remain separate');
assert(twoLaazSenses.every(group=>group.sources.length===2),'each separately consolidated sense must retain both source records');


const movingAndExile=U.merge([
 {id:411,entry:{h:'נִדְנוּד',r:'KRU12413',source:'krupnik'},meanings:[{text:'moving about',label:'1'}]},
 {id:412,entry:{h:'נִדְנוּד',r:'N00235',source:'jastrow'},meanings:[{text:'moving about, exile',label:''}]}
],'נדנוד');
assert.equal(movingAndExile.length,1,'the exact moving-about alternative should consolidate across dictionaries');
assert.equal(movingAndExile[0].sources.length,2,'the consolidated movement sense must retain both source records');
assert(movingAndExile[0].text.includes('exile'),'the unmatched explanatory alternative must remain visible in its original sense');

const pledgeSense=U.merge([
 {id:413,entry:{h:'מִשְׁכֵּן',r:'KRU12188',source:'krupnik'},meanings:[{text:'to take a pledge',label:''}]},
 {id:414,entry:{h:'מִשְׁכֵּן',r:'M02905',source:'jastrow'},meanings:[{text:'to take a pledge; to seize, levy',label:''}]}
],'משכן');
assert.equal(pledgeSense.length,2,'a separately delimited seize/levy sense must not be absorbed by the pledge match');


const parentheticalShake=U.merge([
 {id:421,entry:{h:'נוּד ²',r:'KRU12449',source:'krupnik'},meanings:[{text:'to shake (the head)',label:''}]},
 {id:422,entry:{h:'נוּד ²',r:'N00308',source:'jastrow'},meanings:[{text:'to shake the head, sympathize',label:''}]}
],'נוד');
assert.equal(parentheticalShake.length,1,'parenthetical clarification must not block an otherwise exact reviewed phrase');
assert.equal(parentheticalShake[0].sources.length,2,'parenthetical normalization must preserve both source records');
assert(parentheticalShake[0].text.includes('sympathize'),'the unmatched synonym in the original sense must remain visible');

const parentheticalCeiling=U.merge([
 {id:423,entry:{h:'סְכָךְ',r:'KRU13620',source:'krupnik'},meanings:[{text:'cover, ceiling (of twigs)',label:''}]},
 {id:424,entry:{h:'סְכָךְ',r:'O00906',source:'jastrow'},meanings:[{text:'ceiling of twigs',label:''}]}
],'סכך');
assert.equal(parentheticalCeiling.length,1,'parenthetical wording should normalize for the reviewed ceiling sense');
assert.equal(parentheticalCeiling[0].sources.length,2,'the ceiling sense must retain both source entries');
assert(parentheticalCeiling[0].text.includes('cover'),'the other original gloss alternative must remain visible');

const pressAndWring=U.merge([
 {id:425,entry:{h:'סָחַט',r:'KRU13347',source:'krupnik'},meanings:[{text:'to press out, to wring',label:''}]},
 {id:426,entry:{h:'סָחַט',r:'O00452',source:'jastrow'},meanings:[{text:'to press out, wring, cause to flow',label:''}]}
],'סחט');
assert.equal(pressAndWring.length,1,'two reviewed alternatives from the same source sense should consolidate together');
assert.equal(pressAndWring[0].sources.length,2,'the press/wring result must preserve both source entries');
assert(pressAndWring[0].text.includes('cause to flow'),'unmatched alternatives in the same sense must remain visible');

const oldAgeAndGreyHead=U.merge([
 {id:427,entry:{h:'סֵיבוּ',r:'KRU13399',source:'krupnik'},meanings:[{text:'old age',label:''}]},
 {id:428,entry:{h:'סֵיבוּ',r:'KRU13404',source:'krupnik'},meanings:[{text:'gray head',label:''}]},
 {id:429,entry:{h:'סֵיבוּ',r:'O00530',source:'jastrow'},meanings:[{text:'gray head, old age',label:''}]}
],'סיבו');
assert.equal(oldAgeAndGreyHead.length,1,'the two source-attested alternatives in one Jastrow sense should consolidate together');
assert.equal(oldAgeAndGreyHead[0].sources.length,3,'both Krupnik entries and the Jastrow entry must remain cited');


const parentheticalCovering=U.merge([
 {id:431,entry:{h:'עִיטּוּף',r:'KRU14375',source:'krupnik'},meanings:[{text:'covering (the head)',label:''}]},
 {id:432,entry:{h:'עִיטּוּף',r:'P00532',source:'jastrow'},meanings:[{text:'putting a cloak on, covering the head',label:''}]}
],'עיטוף');
assert.equal(parentheticalCovering.length,1,'parenthetical object clarification should match its unparenthesized form');
assert.equal(parentheticalCovering[0].sources.length,2,'the covering sense should retain both dictionary sources');
assert(parentheticalCovering[0].text.includes('putting a cloak on'),'the additional original gloss alternative should remain visible');

const turbidSenseBoundaries=U.merge([
 {id:433,entry:{h:'עָכַר',r:'KRU14534',source:'krupnik'},meanings:[{text:'to make turbid',label:''}]},
 {id:434,entry:{h:'עָכַר',r:'P00749',source:'jastrow'},meanings:[{text:'to stir up, disturb; to trouble, make turbid; to sadden',label:''}]}
],'עכר');
assert.equal(turbidSenseBoundaries.length,3,'the exact turbid sense must merge without absorbing either semicolon-separated sense');
const turbid=turbidSenseBoundaries.find(group=>group.sources.length===2);
assert(turbid&&turbid.text.includes('to trouble'),'the matched semicolon-delimited sense should retain its other alternative');
assert.equal(turbidSenseBoundaries.filter(group=>group.sources.length===1).length,2,'the other two senses must remain separate');


const twoArarSenses=U.merge([
 {id:441,entry:{h:'עִרְעֵר',r:'KRU14890',source:'krupnik'},meanings:[{text:'to excite to lamentation',label:''},{text:'to lay bare',label:''}]},
 {id:442,entry:{h:'עִרְעֵר',r:'P01417',source:'jastrow'},meanings:[{text:'to stir up, excite to lamentation',label:''}]},
 {id:443,entry:{h:'עִרְעֵר II',r:'P01418',source:'jastrow'},meanings:[{text:'to lay bare, strip, denude; to make lonely',label:''}]}
],'ערער');
assert.equal(twoArarSenses.length,3,'two matched senses and the unmatched semicolon-separated Jastrow sense must remain distinct');
assert.equal(twoArarSenses.filter(group=>group.sources.length===2).length,2,'each matched arar sense should consolidate only with its corresponding source gloss');
assert(twoArarSenses.some(group=>group.sources.length===1&&group.text.includes('to make lonely')),'the unmatched Jastrow sense must remain available separately');

const twoAtakSenses=U.merge([
 {id:444,entry:{h:'עֲתַק',r:'KRU14959',source:'krupnik'},meanings:[{text:'to be worn out',label:''},{text:'to remain long',label:''}]},
 {id:445,entry:{h:'עֲתַק',r:'P01545',source:'jastrow'},meanings:[{text:'to be old, worn out',label:''},{text:'to remain long, be settled permanently',label:'Ithpa. אִתְעַתַּק'}]}
],'עתק');
assert.equal(twoAtakSenses.length,2,'the worn-out and remain-long senses must not collapse into one');
assert(twoAtakSenses.every(group=>group.sources.length===2),'each atak sense should preserve both dictionary sources');

const pigeonAndBerry=U.merge([
 {id:446,entry:{h:'פְּרִידָה',r:'KRU15983',source:'krupnik'},meanings:[{text:'single pigeon',label:'1'},{text:'a single berry',label:'2'}]},
 {id:447,entry:{h:'פְּרִידָה',r:'Q01791',source:'jastrow'},meanings:[{text:'one of a pair of pigeons, single pigeon',label:''},{text:'a single berry; a slice',label:''}]}
],'פרידה');
assert.equal(pigeonAndBerry.length,3,'the pigeon, berry, and separate slice senses must remain distinct');
assert.equal(pigeonAndBerry.filter(group=>group.sources.length===2).length,2,'the pigeon and berry senses should consolidate with their corresponding source records');
assert(pigeonAndBerry.some(group=>group.sources.length===1&&group.text==='a slice'),'the additional semicolon-separated slice sense must remain separate');

const pairedNumericalGloss=U.merge([
 {id:448,entry:{h:'פְּרוֹטְרוֹט',r:'KRU15920',source:'krupnik'},meanings:[{text:'detail number, odd sum',label:''}]},
 {id:449,entry:{h:'פְּרוֹטְרוֹט',r:'Q01677',source:'jastrow'},meanings:[{text:'units, odd sum, detail number',label:''}]}
],'פרוטרוט');
assert.equal(pairedNumericalGloss.length,1,'both exact alternatives from the same numerical sense should consolidate into one result');
assert.equal(pairedNumericalGloss[0].sources.length,2,'the numerical gloss should preserve both source entries');
assert(pairedNumericalGloss[0].text.includes('units'),'the additional Jastrow alternative should remain visible');

console.log('PASS: real alternate-headword vowel matches, partial pointing, cantillation, conservative synonym consolidation, complete source references, and distinct stem/qualified senses.');
assert.equal(U.merge([{id:1,entry:{h:'חוב'},meanings:[{text:'charge',label:''}]},{id:2,entry:{h:'חוב'},meanings:[{text:'charge, accusation',label:''}]}],'חוב').length,2,'a one-word overlap must not erase a distinct qualified sense');
assert.equal(U.merge([{id:1,entry:{h:'אָמַר'},meanings:[{text:'to say',label:''}]},{id:2,entry:{h:'אָמַר'},meanings:[{text:'to say',label:''}]}],'אמר').length,1,'identical glosses should still consolidate');
assert.equal(U.merge([{id:1,entry:{h:'אַרְעָא'},meanings:[{text:'land',label:''}]},{id:2,entry:{h:'אִרְעָא'},meanings:[{text:'land',label:''}]}],'אַרְעָא').length,2,'a pointed lookup must keep conflicting vowel readings separate even when glosses match');
assert.equal(U.merge([{id:1,entry:{h:'אַרְעָא'},meanings:[{text:'land',label:''}]},{id:2,entry:{h:'ארעא'},meanings:[{text:'land',label:''}]}],'ארעא').length,1,'an unpointed source spelling remains compatible with a pointed spelling');


assert.equal(U.merge([{id:33936,entry:{h:'אִרְעָא',r:'KRU02095'},meanings:[{text:'in accident',label:'1'}]},{id:3220,entry:{h:'אִרְעָא',r:'A03220'},meanings:[{text:'accident, occurrence',label:''}]}],'ארעא').length,1);

const despairConsolidation=U.merge([
 {id:8370,entry:{h:'יֵאוּשׁ',r:'KRU08370',source:'krupnik'},meanings:[{text:'desparing of recovering a lost object',label:''}]},
 {id:9009,entry:{h:'יֵאוּשׁ',r:'J00009'},meanings:[{text:'despairing of recovering a lost object, resignation',label:''}]}
],'יאוש');
assert.equal(despairConsolidation.length,1,'the matching Jastrow and Krupnik definitions should consolidate despite Krupnik’s source typo');
assert.equal(despairConsolidation[0].sources.length,2,'the consolidated definition must retain both original dictionary records');
assert.equal(despairConsolidation[0].text,'despairing of recovering a lost object, resignation','the display should correct the obvious source typo without repeating the same definition');

const ownerlessConsolidation=U.merge([
 {id:15837,entry:{h:'פָּקַר',r:'KRU15837',source:'krupnik'},meanings:[{text:'to declare ownerless',label:''}]},
 {id:1517,entry:{h:'פָּקַר',r:'Q01517'},meanings:[{text:'to declare free, to renounce ownership, declare a property ownerless',label:'Hif.'}]}
],'פקר');
assert.equal(ownerlessConsolidation.length,1,'the same ownerless-property sense should consolidate across both dictionaries');
assert.equal(ownerlessConsolidation[0].sources.length,2,'both source records should remain available');
assert.equal(ownerlessConsolidation[0].text,'declare a property ownerless, to declare free, to renounce ownership','the more informative wording should be displayed without repeating the same ownerless definition');

const eruvConsolidation=U.merge([
 {id:14478,entry:{h:'עֵירוּב',r:'KRU14478',source:'krupnik'},meanings:[{text:'a symbolical act by which the legal fiction of community or continuity is established',label:'2'}]},
 {id:680,entry:{h:'עֵירוּב',r:'P00680'},meanings:[
  {text:'‘Erub, a symbolical act by which the legal fiction of community',label:''}
 ]}
],'עירוב');
assert.equal(eruvConsolidation.length,1,'the split reader phrases together describe one Erub sense');
assert.equal(eruvConsolidation[0].sources.length,2,'the consolidated Erub sense must retain the actual reader phrase and the Krupnik source');
assert.equal(eruvConsolidation[0].text,'a symbolical act by which the legal fiction of community or continuity is established','the complete source definition should display once, not as three overlapping fragments');

const zealConsolidation=U.merge([
 {id:9880,entry:{h:'כָּשֵׁר',r:'KRU09880',source:'krupnik'},meanings:[{text:'to work with zeal',label:''}]},
 {id:1324,entry:{h:'כָּשֵׁר I',r:'K01324'},meanings:[{text:'to adapt one’s self, to work with zeal and conscientiousness',label:'Hithpa. הִתְכַּשֵּׁר'}]}
],'כשר');
assert.equal(zealConsolidation.length,1,'the matching Hithpa zeal sense should consolidate');
assert.equal(zealConsolidation[0].sources.length,2,'the zeal sense must retain both source records');
assert.equal(zealConsolidation[0].text,'to adapt one’s self, to work with zeal and conscientiousness','the fuller Hithpa wording should display once');

const fingerConsolidation=U.merge([
 {id:16236,entry:{h:'צָבַע',r:'KRU16236',source:'krupnik'},meanings:[{text:'to raise the fingers as a signal',label:''}]},
 {id:53,entry:{h:'צָבַע I',r:'R00053'},meanings:[{text:'to raise one or more fingers',label:'Hif. הִצְבִּיעַ'}]}
],'צבע');
assert.equal(fingerConsolidation.length,1,'the same finger-raising Hifil sense should consolidate');
assert.equal(fingerConsolidation[0].sources.length,2,'both dictionary sources should remain available');
assert.equal(fingerConsolidation[0].text,'to raise the fingers as a signal','the shared finger-raising definition should display once');

const troughConsolidation=U.merge([
 {id:14845,entry:{h:'עֲרֵיבָה',r:'KRU14845',source:'krupnik'},meanings:[{text:'trough for kneading etc.',label:''}]},
 {id:1349,entry:{h:'עֲרֵיבָה',r:'P01349'},meanings:[
  {text:'trough, tub, kneading trough',label:'1)'},
  {text:'boat, skiff',label:'2)'}
 ]}
],'עריבה');
assert.equal(troughConsolidation.length,2,'the separate boat sense must not merge with the kneading-trough sense');
assert.equal(troughConsolidation.find(g=>g.sources.length===2)?.text,'trough, tub, kneading trough','the shared kneading-trough sense should consolidate');
assert(troughConsolidation.some(g=>g.text==='boat, skiff'&&g.sources.length===1),'the unrelated boat sense must remain separate');

const refugeRoadConsolidation=U.merge([
 {id:5871,entry:{h:'הָכֵן²',r:'KRU05871',alt:['הֲכָנָה'],source:'krupnik'},meanings:[{text:'marking out the road to the city of refuge',label:'2'}]},
 {id:517,entry:{h:'הֲכָנָה',r:'E00517'},meanings:[{text:'marking out the road',label:'—2)'}]}
],'הכנה');
assert.equal(refugeRoadConsolidation.length,1,'the road-preparation sense for the city of refuge should consolidate');
assert.equal(refugeRoadConsolidation[0].sources.length,2,'both dictionary source records should remain available');
assert.equal(refugeRoadConsolidation[0].text,'marking out the road to the city of refuge','the complete legal meaning should display once');

const eyePainConsolidation=U.merge([
 {id:5204,entry:{h:'דִּיצָא II',r:'KRU05204',source:'krupnik'},meanings:[{text:'pricking pain in the eye',label:''}]},
 {id:689,entry:{h:'דִּיצָא II',r:'D00689'},meanings:[{text:'pricking pain',label:''}]}
],'דיצא');
assert.equal(eyePainConsolidation.length,1,'the pricking pain in the eye sense should consolidate');
assert.equal(eyePainConsolidation[0].sources.length,2,'both source entries should remain available');
assert.equal(eyePainConsolidation[0].text,'pricking pain in the eye','the full eye-pain definition should display once');

const hearthConsolidation=U.merge([
 {id:5265,entry:{h:'דָּכוֹן',r:'KRU05265',source:'krupnik'},meanings:[{text:'an elevated spot on the hearth',label:''}]},
 {id:765,entry:{h:'דָּכוֹן',r:'D00765'},meanings:[{text:'an elevated spot',label:''}]}
],'דכון');
assert.equal(hearthConsolidation.length,1,'the elevated hearth-stand sense should consolidate');
assert.equal(hearthConsolidation[0].sources.length,2,'the elevated-spot sources should both remain available');
assert.equal(hearthConsolidation[0].text,'an elevated spot on the hearth','the more specific source definition should display once');

const bedsideConsolidation=U.merge([
 {id:1971,entry:{h:'אֲרוּכָה',r:'KRU01971',source:'krupnik'},meanings:[
  {text:'long bedside',label:'1'},
  {text:'respite',label:'2'}
 ]},
 {id:3028,entry:{h:'אֲרוּכָה I',r:'A03028'},meanings:[{text:'long board, longside of bedstead, bedside',label:'—2)'}]}
],'ארוכה');
assert.equal(bedsideConsolidation.length,2,'the separate respite sense must remain distinct from the bedside sense');
assert.equal(bedsideConsolidation.find(g=>g.sources.length===2)?.text,'long board, longside of bedstead, bedside','the complete bedside definition should display once');
assert(bedsideConsolidation.some(g=>g.text==='respite'&&g.sources.length===1),'the unrelated respite sense must remain separate');

const diagonalConsolidation=U.merge([
 {id:1236,entry:{h:'אֲלַכְסוֹן',r:'KRU01236',source:'krupnik'},meanings:[{text:'diagonal',label:''}]},
 {id:1891,entry:{h:'אֲלַכְסוֹן',r:'A01891'},meanings:[{text:'diagonal line, diameter',label:'—2)'}]}
],'אלכסון');
assert.equal(diagonalConsolidation.length,1,'the geometric diagonal sense should consolidate');
assert.equal(diagonalConsolidation[0].sources.length,2,'the geometric diagonal should retain both sources');
assert.equal(diagonalConsolidation[0].text,'diagonal line, diameter','the fuller geometric definition should display once');

const artificialFootConsolidation=U.merge([
 {id:16649,entry:{h:'קַב',r:'KRU16649',source:'krupnik'},meanings:[{text:'artificial foot',label:''}]},
 {id:25,entry:{h:'קַב',r:'S00025'},meanings:[
  {text:'Kab, a measure of capacity, one sixth of a S’ah',label:'1)'},
  {text:'a piece of wood hollowed out for the stump of a leg, a sort of artificial foot',label:'—2)'}
 ]}
],'קב');
assert.equal(artificialFootConsolidation.length,2,'the Kab measure and artificial-foot senses must remain separate');
assert.equal(artificialFootConsolidation.find(g=>g.sources.length===2)?.text,'a piece of wood hollowed out for the stump of a leg, a sort of artificial foot','the artificial-foot definition should consolidate with the fuller Jastrow description');
assert(artificialFootConsolidation.some(g=>g.text.startsWith('Kab, a measure')&&g.sources.length===1),'the unrelated capacity measure must remain separate');

const sedimentCrustConsolidation=U.merge([
 {id:17729,entry:{h:'קָרִיד',r:'KRU17729',source:'krupnik'},meanings:[{text:'covered with a crust of sediments',label:''}]},
 {id:2038,entry:{h:'קָרִיד',r:'S02038'},meanings:[{text:'covered with a crust',label:''}]}
],'קריד');
assert.equal(sedimentCrustConsolidation.length,1,'the crusted-pot sense should consolidate');
assert.equal(sedimentCrustConsolidation[0].sources.length,2,'both crusted-pot sources should remain available');
assert.equal(sedimentCrustConsolidation[0].text,'covered with a crust of sediments','the specific sediment wording should display once');

const lightCrustConsolidation=U.merge([
 {id:17738,entry:{h:'קְרִימָה',r:'KRU17738',source:'krupnik'},meanings:[{text:'formation of a crust',label:''}]},
 {id:2061,entry:{h:'קְרִימָה',r:'S02061'},meanings:[{text:'formation of a light crust',label:''}]}
],'קרימה');
assert.equal(lightCrustConsolidation.length,1,'the crust-formation sense should consolidate');
assert.equal(lightCrustConsolidation[0].sources.length,2,'both crust-formation sources should remain available');
assert.equal(lightCrustConsolidation[0].text,'formation of a light crust','the fuller baking definition should display once');

const vanguardConsolidation=U.merge([
 {id:1645,entry:{h:'אִסְפַּרְוָוא',r:'KRU01645',source:'krupnik'},meanings:[{text:'van-guard',label:''}]},
 {id:2519,entry:{h:'אִסְפַּרְוָוא',r:'A02519'},meanings:[{text:'forerunner, the commander’s van-guard',label:''}]}
],'אספרווא');
assert.equal(vanguardConsolidation.length,1,'the forerunner/van-guard sense should consolidate');
assert.equal(vanguardConsolidation[0].sources.length,2,'both van-guard sources should remain available');
assert.equal(vanguardConsolidation[0].text,'forerunner, the commander’s van-guard','the fuller military definition should display once');

const antiochianConsolidation=U.merge([
 {id:1430,entry:{h:'אַנְטוּכִי',r:'KRU01430',source:'krupnik'},meanings:[{text:'of Antiochia',label:''}]},
 {id:2164,entry:{h:'אַנְטוּכִי',r:'A02164'},meanings:[{text:'Antiochian, native of Antiochia, resident of A',label:''}]}
],'אנטוכי');
assert.equal(antiochianConsolidation.length,1,'the Antiochian demonym sense should consolidate');
assert.equal(antiochianConsolidation[0].sources.length,2,'both Antiochia source records should remain available');
assert.equal(antiochianConsolidation[0].text,'of Antiochia','the complete city-origin meaning should display without the reader fragment');

const shaggyGoatConsolidation=U.merge([
 {id:16409,entry:{h:'צִימֵּחַ',r:'KRU16409',source:'krupnik'},meanings:[{text:'with lang dependent ears',label:''}]},
 {id:377,entry:{h:'צִימֵּחַ',r:'R00377'},meanings:[{text:'a goat with long hair lumps and long, dependent ears',label:'—2)'}]}
],'צימח');
assert.equal(shaggyGoatConsolidation.length,1,'the shaggy-goat definition should consolidate');
assert.equal(shaggyGoatConsolidation[0].sources.length,2,'both zoological source records should remain available');
assert.equal(shaggyGoatConsolidation[0].text,'a goat with long hair lumps and long, dependent ears','the fuller animal description should display once');

const heirShareConsolidation=U.merge([
 {id:16142,entry:{h:'פְּשִׁיטוּת',r:'KRU16142',source:'krupnik'},meanings:[{text:'single share of the heir, opp. to the double share of the first-born son',label:''}]},
 {id:2074,entry:{h:'פְּשִׁיטוּת',r:'Q02074'},meanings:[{text:'the plain heir’s right, single share',label:''}]}
],'פשיטות');
assert.equal(heirShareConsolidation.length,1,'the plain-heir single-share sense should consolidate');
assert.equal(heirShareConsolidation[0].sources.length,2,'both inheritance-definition sources should remain available');
assert.equal(heirShareConsolidation[0].text,'single share of the heir, opp. to the double share of the first-born son','the complete legal distinction should display once');

const charosetConsolidation=U.merge([
 {id:7518,entry:{h:'חֲרוֹסֶת',r:'KRU07518',source:'krupnik'},meanings:[{text:'a pap made of fruits and spices with wine (used as sauce on the Passover-night)',label:''}]},
 {id:1630,entry:{h:'חֲרוֹסֶת',r:'H01630'},meanings:[{text:'a pap made of fruits and spices with wine or vinegar',label:''}]}
],'חרוסת');
assert.equal(charosetConsolidation.length,1,'the two descriptions of charoset should consolidate');
assert.equal(charosetConsolidation[0].sources.length,2,'both charoset source records should remain available');
assert.equal(charosetConsolidation[0].text,'a pap made of fruits and spices with wine or vinegar','the fuller ingredient definition should display once');

const kutahConsolidation=U.merge([
 {id:9233,entry:{h:'כּוּתָּח',r:'KRU09233',source:'krupnik'},meanings:[{text:'a dish consisting of sour milk, bread and salt',label:''}]},
 {id:422,entry:{h:'כּוּתָּח',r:'K00422'},meanings:[{text:'a preserve consisting of sour milk, bread-crusts and salt',label:''}]}
],'כותח');
assert.equal(kutahConsolidation.length,1,'the two definitions of Kutah should consolidate');
assert.equal(kutahConsolidation[0].sources.length,2,'both Kutah source records should remain available');
assert.equal(kutahConsolidation[0].text,'a preserve consisting of sour milk, bread-crusts and salt','the fuller traditional-food description should display once');










const nifka=U.merge([{id:42393,entry:{h:'נִפְקָא',r:'KRU12894'},meanings:[{text:'excrements',label:'1'},{text:'outlet',label:'2'}]},{id:20165,entry:{h:'נִפִקָא',r:'N01077'},meanings:[{text:'excrements',label:''},{text:'outlet, opening',label:''}]}],'נפקא');
assert.equal(nifka.length,2);assert(nifka.every(g=>g.sources.length===2));
assert.equal(U.merge([{id:1,entry:{h:'אִרְעָא'},meanings:[{text:'land',label:''}]},{id:2,entry:{h:'אַרְעָא'},meanings:[{text:'land',label:''}]}],'אַרְעָא')[0].spelling,'אַרְעָא');

const labelBridge=U.merge([
 {id:10,entry:{h:'אָמַר',r:'A00001',source:'jastrow'},meanings:[{text:'to say',label:'Ithpe.'}]},
 {id:11,entry:{h:'אָמַר',r:'KRU00001',source:'krupnik'},meanings:[{text:'to say',label:'1'}]}
],'אמר');
assert.equal(labelBridge.length,1,'an unlabelled Krupnik sense should not be split from the same explicit Jastrow gloss');
assert.equal(labelBridge[0].sources.length,2,'both source records must remain available');
assert.equal(labelBridge[0].form,'ithpe','retain the normalized explicit grammatical label when the other source omits one');

const exactAlternativeBridge=U.merge([
 {id:110,entry:{h:'בְּרִי I',r:'KRU03319',source:'krupnik'},meanings:[{text:'to get well',label:''}]},
 {id:111,entry:{h:'בְּרִי I',r:'B01236',source:'jastrow'},meanings:[{text:'to get well, recover',label:'Hif.'},{text:'to be strong',label:'Hif.'}]}
],'ברי');
assert.equal(exactAlternativeBridge.length,2,'an unambiguous exact alternative should merge without absorbing a separate semicolon-delimited sense');
const exactAlternativeShared=exactAlternativeBridge.find(group=>group.sources.length===2);
assert(exactAlternativeShared,'the exact shared alternative should consolidate its two source records');
assert.equal(exactAlternativeShared.text,'to get well, recover','the fuller comma-list context should be preserved');
assert(exactAlternativeBridge.some(group=>group.text==='to be strong'&&group.sources.length===1),'an unrelated semicolon-delimited sense must remain separate');

const infinitiveMarkerMustMatch=U.merge([
 {id:116,entry:{h:'אָמַר',r:'KRU00032',source:'krupnik'},meanings:[{text:'speak',label:''}]},
 {id:117,entry:{h:'אָמַר',r:'A00032',source:'jastrow'},meanings:[{text:'to speak',label:''}]}
],'אמר');
assert.equal(infinitiveMarkerMustMatch.length,2,'the runtime exact-alternative rule must not strip infinitive markers or merge a noun-like gloss with a verb');


const ambiguousExactAlternative=U.merge([
 {id:112,entry:{h:'סָרַח III',r:'KRU13990',source:'krupnik'},meanings:[{text:'to smell badly',label:''}]},
 {id:113,entry:{h:'סָרַח III',r:'O01573',source:'jastrow'},meanings:[
  {text:'to decay; to smell badly',label:''},
  {text:'to become putrid; to smell badly',label:'Hif.'}
 ]}
],'סרח');
assert.equal(ambiguousExactAlternative.length,3,'one exact gloss shared by multiple distinct source senses must not bridge those senses');

const oneToManyExactAlternatives=U.merge([
 {id:114,entry:{h:'אָמַר',r:'KRU00031',source:'krupnik'},meanings:[
  {text:'to say',label:''},{text:'to speak',label:''}
 ]},
 {id:115,entry:{h:'אָמַר',r:'A00031',source:'jastrow'},meanings:[{text:'to say, to speak',label:''}]}
],'אמר');
assert.equal(oneToManyExactAlternatives.length,3,'a single source sense must not bridge two separately listed counterpart senses');

const labelConflict=U.merge([
 {id:12,entry:{h:'אָמַר',r:'A00002'},meanings:[{text:'to say',label:'Ithpe.'}]},
 {id:13,entry:{h:'אָמַר',r:'KRU00002'},meanings:[{text:'to say',label:'Pa.'}]}
],'אמר');
assert.equal(labelConflict.length,2,'explicitly conflicting grammatical labels must remain separate');

const numberedLabelBridge=U.merge([
 {id:14,entry:{h:'אָמַר',r:'A00003'},meanings:[{text:'to say',label:'Ithpe.'}]},
 {id:15,entry:{h:'אָמַר',r:'KRU00003'},meanings:[{text:'to say',label:'Ithpe 1'}]}
],'אמר');
assert.equal(numberedLabelBridge.length,1,'Krupnik sense numbering must not make an otherwise identical grammatical label look different');
assert.equal(numberedLabelBridge[0].form,'ithpe');

const synonymBridge=U.merge([
 {id:16,entry:{h:'אַבָּא I',r:'A00017',source:'jastrow'},meanings:[{text:'my father',label:''}]},
 {id:17,entry:{h:'אַבָּא',r:'KRU00021',source:'krupnik'},meanings:[{text:'father, my father',label:'1'}]}
],'אבא');
assert.equal(synonymBridge.length,1,'reviewed synonym variants for the same headword should consolidate');
assert.equal(synonymBridge[0].sources.length,2,'synonym consolidation must retain both original dictionary records');
assert.equal(synonymBridge[0].text,'my father, father','the consolidated display should retain distinct synonym alternatives from both sources');

const qualifiedSynonym=U.merge([
 {id:18,entry:{h:'אֲבַק',r:'A00190'},meanings:[{text:'to be attached',label:''}]},
 {id:19,entry:{h:'אֲבַק',r:'KRU00120'},meanings:[{text:'to be attached to, cling to',label:''}]}
],'אבק');
assert.equal(qualifiedSynonym.length,1,'a reviewed multiword synonym should join the fuller gloss');
assert.equal(qualifiedSynonym[0].text,'to be attached, to be attached to, cling to');

const scopedSynonym=U.merge([
 {id:20,entry:{h:'אַבָּא',r:'A00017'},meanings:[{text:'my father',label:''}]},
 {id:21,entry:{h:'אַבָּהוּ',r:'KRU00021'},meanings:[{text:'father, my father',label:''}]}
],'אבא');
assert.equal(scopedSynonym.length,2,'a reviewed gloss pair must not merge different headwords');

const grammarProtectedSynonym=U.merge([
 {id:22,entry:{h:'גָּעַל',r:'A1'},meanings:[{text:'to be attached',label:'Ithpa.'}]},
 {id:23,entry:{h:'גָּעַל',r:'K1'},meanings:[{text:'to be attached to, cling to',label:'Pa.'}]}
],'געל');
assert.equal(grammarProtectedSynonym.length,2,'synonym review must not override conflicting grammatical labels');

const corpusReviewedPair=U.merge([
 {id:24,entry:{h:'גִּבְנָא',r:'KRU03578',source:'krupnik'},meanings:[{text:'hump, height',label:''}]},
 {id:25,entry:{h:'גִּבְנָא',r:'C00617',source:'jastrow'},meanings:[{text:'hump',label:''}]}
],'גבנא');
assert.equal(corpusReviewedPair.length,1,'a reviewed source-record pair from the corpus audit should consolidate');
assert.equal(corpusReviewedPair[0].sources.length,2,'both cited source records must remain visible');
const sourcePairWrongGloss=U.merge([
 {id:26,entry:{h:'גִּבְנָא',r:'KRU03578'},meanings:[{text:'height',label:''}]},
 {id:27,entry:{h:'גִּבְנָא',r:'C00617'},meanings:[{text:'hump',label:''}]}
],'גבנא');
assert.equal(sourcePairWrongGloss.length,2,'a reviewed record pair must not merge unrelated glosses from those records');

const crossHeadwordSourcePair=U.merge([
 {id:24,entry:{h:'דָּבַר',r:'KRU04099'},meanings:[{text:'to attack, to fight',label:''}]},
 {id:25,entry:{h:'אָב',r:'C00690'},meanings:[{text:'to attack, fight',label:''}]}
],'דבר');
assert.equal(crossHeadwordSourcePair.length,2,'source-ID synonym pairs must not merge when headword spellings differ');

const auditedCorpusPair=U.merge([
 {id:26,entry:{h:'מַסְמָסָה',r:'KRU11703'},meanings:[{text:'softening',label:''}]},
 {id:27,entry:{h:'מַסְמָסָה',r:'E00635'},meanings:[{text:'melting, softening',label:''}]}
],'מסמסה');
assert.equal(auditedCorpusPair.length,1,'audited same-headword dictionary synonyms should consolidate');
assert.equal(auditedCorpusPair[0].sources.length,2,'the original sources remain available after consolidation');


// Two different senses in the same source records must be consolidated only
// with their corresponding reviewed gloss, never with each other.
const sameRecordDistinctSenses=U.merge([
 {id:28,entry:{h:'כָּלָא',r:'KRU04200',source:'krupnik'},meanings:[
  {text:'lime',label:''},{text:'froth',label:''}
 ]},
 {id:29,entry:{h:'כָּלָא',r:'C00805',source:'jastrow'},meanings:[
  {text:'lime, plaster.',label:''}
 ]}
],'כלא');
assert.equal(sameRecordDistinctSenses.length,2,'the shared lime meaning should merge without absorbing the distinct froth sense');
assert.equal(sameRecordDistinctSenses[0].sources.length,2,'the shared lime meaning should retain both citations');
assert.equal(sameRecordDistinctSenses[1].sources.length,1,'the distinct froth meaning must remain attached only to its own source');

// A reviewed gloss pair must never override explicit grammatical differences.
// This exact audited pair contrasts active and passive English glosses.
const reviewedPairWithVoiceConflict=U.merge([
 {id:30,entry:{h:'פְּטַר',r:'KRU07593',source:'krupnik'},meanings:[{text:'to set free',label:'Pa.'}]},
 {id:31,entry:{h:'פְּטַר',r:'H01767',source:'jastrow'},meanings:[{text:'to be set free',label:'Ithpe.'}]}
],'פטר');
assert.equal(reviewedPairWithVoiceConflict.length,2,'a reviewed lexical gloss pair must not collapse explicitly different grammatical voices');

const unpointedSameConsonantsDifferentVowels=U.merge([
 {id:34,entry:{h:'נִפְקָא',r:'A00030'},meanings:[{text:'outlet',label:''}]},
 {id:35,entry:{h:'נִפִקָא',r:'KRU00030'},meanings:[{text:'outlet',label:''}]}
],'נפקא');
assert.equal(unpointedSameConsonantsDifferentVowels.length,1,'unpointed lookup may consolidate same consonants across source vowel readings');
const unvowelledDifferentHeadword=U.merge([
 {id:32,entry:{h:'אַבָּא',r:'A00017'},meanings:[{text:'father',label:''}]},
 {id:33,entry:{h:'אַבְּבָא',r:'KRU00021'},meanings:[{text:'father',label:''}]}
],'אבא');
assert.equal(unvowelledDifferentHeadword.length,2,'unvowelled lookup must not merge distinct consonantal headwords even when their glosses are identical');

const newlyReviewedGlosses=U.merge([
 {id:70,entry:{h:'אֲבַק',r:'KRU00120',source:'krupnik'},meanings:[{text:'to twist',label:''},{text:'to be attached',label:''}]},
 {id:71,entry:{h:'אֲבַק',r:'A00190',source:'jastrow'},meanings:[{text:'to entangle, twist, twine',label:''},{text:'to be attached to, cling to',label:''}]}
],'אבק');
assert.equal(newlyReviewedGlosses.length,2,'newly reviewed same-headword synonyms should consolidate sense-by-sense');
assert(newlyReviewedGlosses.every(g=>g.sources.length===2),'newly consolidated meanings must retain both original source records');
const unreviewedRelatedSense=U.merge([
 {id:72,entry:{h:'אוֹנָאָה',r:'KRU00471',source:'krupnik'},meanings:[{text:'overreaching',label:''}]},
 {id:73,entry:{h:'אוֹנָאָה',r:'A00722',source:'jastrow'},meanings:[{text:'redress in case of overreaching',label:''}]}
],'אונאה');
assert.equal(unreviewedRelatedSense.length,2,'a related but distinct legal sense must not merge merely because it shares wording');

const reviewedBinyanAndSensePair=U.merge([
 {id:80,entry:{h:'בִּלְבֵּל',r:'KRU02846',source:'krupnik'},meanings:[{text:'to disarrange, to mix up',label:''},{text:'to be disturbed',label:''}]},
 {id:81,entry:{h:'בִּלְבֵּל',r:'B00814',source:'jastrow'},meanings:[{text:'to mix up; to disarrange, upset, disturb',label:''}]},
 {id:82,entry:{h:'בִּלְבֵּל',r:'B00815',source:'jastrow'},meanings:[{text:'to be disturbed, mixed up',label:''}]}
],'בלבל');
assert.equal(reviewedBinyanAndSensePair.length,2,'active and passive meanings must consolidate only with their corresponding source sense');
assert(reviewedBinyanAndSensePair.every(g=>g.sources.length===2),'both source citations should remain attached to each matching sense');

const multiSenseSourcePair=U.merge([
 {id:90,entry:{h:'הוֹצָאָה',r:'KRU05716',source:'krupnik'},meanings:[
  {text:'carrying out',label:''},{text:'sprouting',label:''},{text:'expenditure, outlay',label:''}
 ]},
 {id:91,entry:{h:'הוֹצָאָה',r:'E00266',source:'jastrow'},meanings:[
  {text:'carrying out',label:''},{text:'bringing forth, sprouting',label:''},{text:'expenditure, outlay, cost; marketing',label:''}
 ]}
],'הוצאה');
assert.equal(multiSenseSourcePair.length,3,'each of three meanings must consolidate only with its own reviewed counterpart');
assert(multiSenseSourcePair.every(g=>g.sources.length===2),'all three consolidated meanings must retain both source citations');

const flourPulp=U.merge([
 {id:301,entry:sourceByRef.get('KRU17905'),meanings:[{text:'pulp of flour mixed with hot oil',label:''}]},
 {id:302,entry:sourceByRef.get('T00094'),meanings:[{text:'a pulp of flour mixed with hot water and oil',label:'',section:'noun'}]}
],'רביכה');
assert.equal(flourPulp.length,1,'the two source-attested flour-pulp definitions should consolidate');
assert.equal(flourPulp[0].sources.length,2,'the flour-pulp consolidation must retain both source records');
assert.match(flourPulp[0].text,/hot oil/,'the original Krupnik wording must remain visible');
assert.match(flourPulp[0].text,/hot water and oil/,'the original Jastrow wording must remain visible');

const sonOf=U.merge([
 {id:305,entry:sourceByRef.get('KRU02534'),meanings:[
  {text:'son',label:'1'},{text:'house',label:'2'},{text:'place',label:'3'},{text:'between',label:'4'}
 ]},
 {id:306,entry:sourceByRef.get('B00536'),meanings:[{text:'son of;',label:'',section:'noun'}]}
],'בי');
assert.equal(sonOf.length,4,'only the matching "son of" sense should merge; house/place/between stay distinct');
assert.equal(sonOf.filter(g=>g.sources.length===2).length,1,'the son sense alone should carry both dictionary sources');

const musafOnly=U.merge([
 {id:303,entry:sourceByRef.get('KRU20035'),meanings:[
  {text:'the New Year’s day',label:'1'},
  {text:'a section of the Musaf of the New Year’s Day',label:'2'}
 ]},
 {id:304,entry:sourceByRef.get('V00886'),meanings:[{text:'the prayers on the New Year interspersed with blowing the Shofar, the Musaf of the New Year’s Day',label:''}]}
],'תקיעתא');
assert.equal(musafOnly.length,2,'the Musaf prayer meaning must consolidate without absorbing the separate New Year’s day sense');
assert.equal(musafOnly.filter(g=>g.sources.length===2).length,1,'only the source-attested Musaf sense should join across dictionaries');

const learningK=sourceByRef.get('KRU04223'),learningJ=sourceByRef.get('C01376');
const learningLookup=S.normalize(learningK.h);
const learningPairKey=['KRU04223','C01376'].sort().join('|')+'::'+[
 'acquired learning, tradition, study by heart','acquired learning, study of tradition'
].map(cleanGloss).sort().join(' | ');
assert(U.reviewedSourceGlossPairs.has(learningPairKey),'the reviewed learning pair must be present in the runtime map: '+learningPairKey);
assert.equal(U.compatible(S.displayHeadword(learningK,learningLookup),S.displayHeadword(learningJ,learningLookup),learningLookup),true,
 'the source headword variants must be compatible for unpointed lookup: '+JSON.stringify({k:S.displayHeadword(learningK,learningLookup),j:S.displayHeadword(learningJ,learningLookup),lookup:learningLookup}));

const reviewedSourcePairs=[
 ['KRU04223','C01376','acquired learning, tradition, study by heart','acquired learning, study of tradition',1,2],
 ['KRU04725','D00045','dripping grapes','lumps of dripping grapes',1,1],
 ['KRU04974','D00392','fat, fat ground','fat pasture ground',1,1],
 ['KRU05975','E00697','the transfer of property','the transfer of landed property from one tribe to another',1,1],
 ['KRU06140','E00959','sounding the alarm','sounding the alarm on public fast-days',1,1],
 ['KRU06285','G00147','a silver coin (one fourth of a Shekel)','a silver coin',2,2],
 ['KRU17350','S01302','to rise in a column (fire)','to rise in a column',1,1],
 ['KRU19505','U02081','one that is silent when reproached with spurious decent','silenced, one that is silent when reproached with spurious descent',1,1],
 ['KRU19720','V00350','a shoot for inoculation','a shoot used for inoculation.',1,1]
];
for(const [kRef,jRef,kGloss,jGloss,kCount,jCount] of reviewedSourcePairs){
 const k=sourceByRef.get(kRef),j=sourceByRef.get(jRef);
 assert(k&&j,'both source entries must exist for '+kRef+'/'+jRef);
 const merged=U.merge([
  {id:401,entry:k,meanings:[{text:kGloss,label:''}]},
  {id:402,entry:j,meanings:[{text:jGloss,label:'',section:'noun'}]}
 ],S.normalize(k.h));
 assert.equal(merged.length,1,'reviewed source pair should consolidate for the shared consonantal lookup: '+kRef+'/'+jRef);
 assert.equal(merged[0].sources.length,2,'both source citations should remain: '+kRef+'/'+jRef);
}
const stampedIn=U.merge([
 {id:419,entry:sourceByRef.get('KRU02531'),meanings:[
  {text:'to kick',label:''},{text:'to be stamped',label:''}
 ]},
 {id:420,entry:sourceByRef.get('B00534'),meanings:[
  {text:'to be stamped in, mixed up',label:'',section:'verb'}
 ]}
 ],'בטש');
assert.equal(stampedIn.length,2,'the stamped sense should consolidate while the separate kicking sense remains');
assert.equal(stampedIn.filter(g=>g.sources.length===2).length,1,'only the Targum Yonatan stamped sense should join across sources');

const hardSeaFloor=U.merge([
 {id:413,entry:sourceByRef.get('KRU14926'),meanings:[{text:'hard ground',label:''}]},
 {id:414,entry:sourceByRef.get('P01470'),meanings:[{text:'hard and level ground',label:'',section:'noun'}]}
 ],S.normalize(sourceByRef.get('KRU14926').h));
assert.equal(hardSeaFloor.length,1,'the Mekhilta hard-ground definition should consolidate');
assert.equal(hardSeaFloor[0].sources.length,2,'both source records for the hard sea floor should remain');

const animalLyingDown=U.merge([
 {id:415,entry:sourceByRef.get('KRU17914'),meanings:[{text:'lying down of animals',label:''}]},
 {id:416,entry:sourceByRef.get('T00110'),meanings:[{text:'lying down',label:'',section:'noun'}]}
 ],S.normalize(sourceByRef.get('KRU17914').h));
assert.equal(animalLyingDown.length,1,'the Bava Kamma animal-lying-down definition should consolidate');
assert.equal(animalLyingDown[0].sources.length,2,'both dictionary sources should remain attached');

const barrelExpert=U.merge([
 {id:407,entry:sourceByRef.get('KRU19531'),meanings:[{text:'skilled in boring',label:''}]},
 {id:408,entry:sourceByRef.get('U02126'),meanings:[{text:'one known to be skilled in boring',label:'',section:'noun'}]}
],'שתם');
assert.equal(barrelExpert.length,1,'the Tosefta barrel-boring definition should consolidate');
assert.equal(barrelExpert[0].sources.length,2,'both sources for the barrel-boring term must remain attached');

const rebellious=U.merge([
 {id:409,entry:sourceByRef.get('KRU20125'),meanings:[{text:'to make rebellious',label:''}]},
 {id:410,entry:sourceByRef.get('V01040'),meanings:[{text:'to make discontented, rebellious',label:'',section:'verb'}]}
],'תרעם');
assert.equal(rebellious.length,1,'the Pesikta Rabbati meaning should consolidate despite Jastrow giving the fuller gloss');
assert.equal(rebellious[0].sources.length,2,'both source citations should remain on the rebellious meaning');

const learning=U.merge([
 {id:403,entry:sourceByRef.get('KRU04223'),meanings:[{text:'acquired learning, tradition, study by heart',label:''}]},
 {id:404,entry:sourceByRef.get('C01376'),meanings:[
  {text:'acquired learning, study of tradition',label:'1',section:'noun'},
  {text:'version',label:'2',section:'noun'}
 ]}
],'גירסא');
assert.equal(learning.length,2,'the separate editorial sense "version" must remain distinct');
assert.equal(learning.filter(g=>g.sources.length===2).length,1,'only the acquired-learning sense should consolidate');

const coinAndWeight=U.merge([
 {id:405,entry:sourceByRef.get('KRU06285'),meanings:[
  {text:'a silver coin (one fourth of a Shekel)',label:'1'},
  {text:'a weight',label:'2'}
 ]},
 {id:406,entry:sourceByRef.get('G00147'),meanings:[
  {text:'a silver coin',label:'1',section:'noun'},
  {text:'a weight',label:'2',section:'noun'}
 ]}
],'זוז');
assert.equal(coinAndWeight.length,2,'coin and weight must remain separate senses');
assert(coinAndWeight.every(g=>g.sources.length===2),'both matching coin and weight senses should preserve both sources');

const muktzehToolAndSacrifice=U.merge([
 {id:417,entry:sourceByRef.get('KRU10885'),meanings:[
  {text:'a tool specially intended for cutting figs',label:'3'},
  {text:'an animal set aside for a sacrifice',label:'4'},
  {text:'that which is not counted on for use on the Sabbath or Holy Day',label:'5'}
 ]},
 {id:418,entry:sourceByRef.get('M00596'),meanings:[
  {text:'the tool specially intended',label:'3',section:'noun'},
  {text:'an animal set aside',label:'4',section:'noun'}
 ]}
],'מוקצה');
assert.equal(muktzehToolAndSacrifice.length,3,'the two matched Muktzeh senses must consolidate while the Sabbath-use sense stays separate');
assert.equal(muktzehToolAndSacrifice.filter(g=>g.sources.length===2).length,2,'both the fig-cutting tool and sacrifice-animal senses should retain both sources');
assert(muktzehToolAndSacrifice.some(g=>g.sources.length===1&&g.text==='that which is not counted on for use on the Sabbath or Holy Day'),'the unrelated Sabbath-use sense must remain independent');

const cutAndCutInto=U.merge([
 {id:411,entry:sourceByRef.get('KRU07668'),meanings:[
  {text:'to cut',label:''},{text:'to decide',label:''},{text:'to be cut',label:''}
 ]},
 {id:412,entry:sourceByRef.get('H01896'),meanings:[
  {text:'to be cut off, severed; to be cut into',label:'',section:'verb'}
 ]}
],'חתך');
assert.equal(cutAndCutInto.length,4,'the reviewed Niphal sense must merge without absorbing adjacent cut-off, active-cut, or decide senses');
assert.equal(cutAndCutInto.filter(g=>g.sources.length===2).length,1,'only the source-attested "to be cut into" sense should join');
assert(cutAndCutInto.some(g=>g.text==='to be cut off, severed'&&g.sources.length===1),'the distinct cut-off sense must remain independent');

const movementSenses=U.merge([
 {id:100,entry:{h:'טִלְטוּל',r:'KRU08043',source:'krupnik'},meanings:[{text:'moving',label:''},{text:'migration',label:''}]},
 {id:101,entry:{h:'טִלְטוּל',r:'I00486',source:'jastrow'},meanings:[{text:'moving, handling',label:''},{text:'migration, exile',label:''}]}
],'טלטול');
assert.equal(movementSenses.length,2,'separate movement and migration senses should map one-to-one');
assert(movementSenses.every(g=>g.sources.length===2),'each movement sense must retain both dictionary citations');

const countedAndAppointed=U.merge([
 {id:110,entry:{h:'מַנֵּי',r:'KRU11599',source:'krupnik'},meanings:[{text:'to be counted',label:''},{text:'to be appointed',label:''},{text:'to appoint, to ordain',label:''}]},
 {id:111,entry:{h:'מַנֵּי',r:'M01772',source:'jastrow'},meanings:[{text:'to be counted',label:''},{text:'to be appointed, designated as deputy, to be ordained',label:''}]},
 {id:112,entry:{h:'מַנֵּי',r:'M01773',source:'jastrow'},meanings:[{text:'to appoint, ordain',label:''},{text:'to be numbered, counted; to vote',label:''}]}
],'מני');
assert.equal(countedAndAppointed.length,3,'counting and appointment senses must remain distinct while their matching source glosses consolidate');
assert(countedAndAppointed.every(g=>g.sources.length>=2),'each matching sense should retain its source references');

const afflictionSenses=U.merge([
 {id:120,entry:{h:'סָגַף',r:'KRU13173',source:'krupnik'},meanings:[{text:'to plague, to afflict',label:''},{text:'to suffer',label:''}]},
 {id:121,entry:{h:'סָגַף',r:'O00163',source:'jastrow'},meanings:[{text:'to plague, afflict',label:''},{text:'to feel privation; to suffer',label:''}]}
],'סגף');
assert.equal(afflictionSenses.length,2,'the active afflicting sense and the suffering sense must remain separate');
assert(afflictionSenses.every(g=>g.sources.length===2),'both sources should be preserved on each matched affliction sense');

const decreeAndRemember=U.merge([
 {id:130,entry:{h:'פָּקַד',r:'KRU15801',source:'krupnik'},meanings:[{text:'to give in charge, to deposit',label:''},{text:'to be remembered',label:''},{text:'to be commanded',label:''}]},
 {id:131,entry:{h:'פָּקַד',r:'Q01449',source:'jastrow'},meanings:[{text:'to give in charge, entrust, deposit',label:''},{text:'to be visited, remembered, decreed upon',label:''},{text:'to be commanded, commissioned',label:''}]}
],'פקד');
assert.equal(decreeAndRemember.length,3,'the different senses of the same verb must consolidate one-to-one');
assert(decreeAndRemember.every(g=>g.sources.length===2),'each verb sense must keep both original dictionary references');

const pressedAndSqueezed=U.merge([
 {id:140,entry:{h:'רָצַף',r:'KRU18343',source:'krupnik'},meanings:[{text:'to press, to crush',label:''},{text:'to be squeezed',label:''}]},
 {id:141,entry:{h:'רָצַף',r:'T00995',source:'jastrow'},meanings:[{text:'to press, crush',label:''},{text:'to be squeezed, crushed',label:''}]}
],'רצף');
assert.equal(pressedAndSqueezed.length,2,'the active and passive meanings of the same root must stay distinct');
assert(pressedAndSqueezed.every(g=>g.sources.length===2),'both source records should be preserved for each active/passive sense');

const accidentConsolidation=U.merge([
 {id:2095,entry:sourceByRef.get('KRU02095'),meanings:[
  {text:'in accident',label:'1'},
  {text:'trouble',label:'2'}
 ]},
 {id:3220,entry:sourceByRef.get('A03220'),meanings:[{text:'accident, occurrence',label:''}]}
],S.normalize(sourceByRef.get('KRU02095').h));
assert.equal(accidentConsolidation.length,2,'the accident sense should merge without absorbing the separate trouble sense');
assert.equal(accidentConsolidation.find(g=>g.sources.length===2)?.text,'accident, occurrence','the source-specific accident wording should display once');
assert(accidentConsolidation.some(g=>g.text==='trouble'&&g.sources.length===1),'the separate trouble sense must remain independent');

const squeezeIntoConsolidation=U.merge([
 {id:7529,entry:sourceByRef.get('KRU07529'),meanings:[
  {text:'to string',label:'1'},
  {text:'to squeeze',label:'2'},
  {text:'to explain',label:'3'}
 ]},
 {id:1646,entry:sourceByRef.get('H01646'),meanings:[{text:'to squeeze into',label:''}]}
],S.normalize(sourceByRef.get('KRU07529').h));
assert.equal(squeezeIntoConsolidation.length,3,'the squeeze sense should consolidate without absorbing stringing or explaining');
assert.equal(squeezeIntoConsolidation.find(g=>g.sources.length===2)?.text,'to squeeze into','the more specific squeeze wording should display once');
assert(squeezeIntoConsolidation.some(g=>g.text==='to string'&&g.sources.length===1),'the stringing sense must remain independent');
assert(squeezeIntoConsolidation.some(g=>g.text==='to explain'&&g.sources.length===1),'the explaining sense must remain independent');

const howConsolidation=U.merge([
 {id:9370,entry:sourceByRef.get('KRU09370'),meanings:[{text:'in what manner? how?',label:''}]},
 {id:616,entry:sourceByRef.get('K00616'),meanings:[{text:'how?, in what manner?, in what respect?',label:''}]}
],S.normalize(sourceByRef.get('KRU09370').h));
assert.equal(howConsolidation.length,1,'the equivalent interrogative glosses should consolidate');
assert.equal(howConsolidation[0].sources.length,2,'both interrogative source entries should remain available');
assert.equal(howConsolidation[0].text,'how?, in what manner?, in what respect?','the fuller definition should display once');

const cleanDecision=value=>String(value).normalize('NFKC').toLowerCase().replace(/[’‘]/g,"'").replace(/[‐‑–—]/g,'-').replace(/[.\s]+$/,'').trim().replace(/\s+/g,' ');
const decisionKey=(a,b,x,y)=>[a,b].sort().join('|')+'::'+[cleanDecision(x),cleanDecision(y)].sort().join(' | ');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU02911','B00899',"to recieve blows","to receive blows")),'source-verified mapping should be registered for KRU02911/B00899');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU18262','T00833',"to set (jewels)","to set, enchase")),'source-verified mapping should be registered for KRU18262/T00833');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU18742','U00547',"permitted (thing)","permission; it is permitted")),'source-verified mapping should be registered for KRU18742/U00547');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU07872','I00261',"sufferer from hemorrhoids","sufferer from piles")),'source-verified mapping should be registered for KRU07872/I00261');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU11045','M00855',"embroidered cover","embroidered horse-covers")),'source-verified mapping should be registered for KRU11045/M00855');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU03356','B01289',"a kneeshaped pole","a knee-shaped pole")),'source-verified mapping should be registered for KRU03356/B01289');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU03574','C00109',"a roll of dough","a lump of dough")),'source-verified mapping should be registered for KRU03574/C00109');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU04825','D00176',"one afflicted with gonorrhoea","one afflicted with gonorrhœa")),'source-verified mapping should be registered for KRU04825/D00176');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU05535','D01109',"Damascene plum","Damascene plums")),'source-verified mapping should be registered for KRU05535/D01109');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU05707','E00251',"inhabitant of Hagra","inhabitants of Hagra")),'source-verified mapping should be registered for KRU05707/E00251');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU06049','E00800',"debt for merchandise","debts for merchandise")),'source-verified mapping should be registered for KRU06049/E00800');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU07416','H01448',"cleaning the head","cleansing the head")),'source-verified mapping should be registered for KRU07416/H01448');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU09259','K00463',"to paint the eye-lids","to paint the eyelids")),'source-verified mapping should be registered for KRU09259/K00463');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU09616','K00934',"leather thong","leather thongs")),'source-verified mapping should be registered for KRU09616/K00934');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU09849','K01262',"a kind of beans","white beans")),'source-verified mapping should be registered for KRU09849/K01262');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU10895','M00614',"watering time","watering times")),'source-verified mapping should be registered for KRU10895/M00614');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU10895','M00614',"layer of stones","layers, piles of hewn stones")),'source-verified mapping should be registered for KRU10895/M00614');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU10907','M00641',"threshing sledge","threshing ledge")),'source-verified mapping should be registered for KRU10907/M00641');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU11008','M00804',"woman in childbed","travailing woman")),'source-verified mapping should be registered for KRU11008/M00804');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU12738','N00791',"a Neronian coin","aNeronian coin")),'source-verified mapping should be registered for KRU12738/N00791');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU12869','N01035',"dealer in naphta","dealer in naphtha")),'source-verified mapping should be registered for KRU12869/N01035');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU13480','O00666',"silk-weavers trade","silk-weaver’s trade")),'source-verified mapping should be registered for KRU13480/O00666');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU13990','O01573',"to make stink","to make offensive")),'source-verified mapping should be registered for KRU13990/O01573');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU14047','O01700',"an unnamed Tannai","an unnamed authority")),'source-verified mapping should be registered for KRU14047/O01700');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU04680','C01432',"woman engaged in the wine-press","woman engaged in the wine press, wine treader")),'source-verified mapping should be registered for KRU04680/C01432');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU13073','N01375',"the status of the N’thinim (Josh. IX. 27)","the legal status of the Nathin; the class of N’thinim")),'source-verified mapping should be registered for KRU13073/N01375');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU05607','E00048',"destruction","removal, destruction")),'source-verified mapping should be registered for KRU05607/E00048');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU08552','J00234',"weight, heaviness","weight")),'source-verified mapping should be registered for KRU08552/J00234');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU08816','J00581',"to be dear","to be dear, precious")),'source-verified mapping should be registered for KRU08816/J00581');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU08816','J00581',"to be heavy","to be heavy")),'source-verified mapping should be registered for KRU08816/J00581');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU13241','O00258',"to plaster with lime","to plaster, whitewash")),'source-verified mapping should be registered for KRU13241/O00258');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU06499','G00560',"voluptuous man","adulterer; voluptuous")),'source-verified mapping should be registered for KRU06499/G00560');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU06852','H00496',"wrapper, envelope","wrapper of reed-matting")),'source-verified mapping should be registered for KRU06852/H00496');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU07458','H01522',"adze, pick-axe","carpenter’s adze")),'source-verified mapping should be registered for KRU07458/H01522');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU07512','H01611',"carob-tree and–pod","carob-pod; carob-tree")),'source-verified mapping should be registered for KRU07512/H01611');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU08782','J00533',"wing of a building","extension, wing")),'source-verified mapping should be registered for KRU08782/J00533');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU13534','O00760',"basket","basket made of twigs.")),'source-verified mapping should be registered for KRU13534/O00760');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU14185','P00174',"ramification","the full ramification of a tree")),'source-verified mapping should be registered for KRU14185/P00174');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU14197','P00191',"cavity dug around a tree","cavity")),'source-verified mapping should be registered for KRU14197/P00191');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU14770','P01185',"cutting","cutting fruit by the stalk")),'source-verified mapping should be registered for KRU14770/P01185');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU14857','P01358',"arrangement of the speech or of prayer","arrangement")),'source-verified mapping should be registered for KRU14857/P01358');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU15093','Q00250',"seam","the seam between a garment and its border")),'source-verified mapping should be registered for KRU15093/Q00250');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU15386','Q00743',"lump","lump of brittle stone")),'source-verified mapping should be registered for KRU15386/Q00743');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU15821','Q01497',"to paint","to paint the face with rouge")),'source-verified mapping should be registered for KRU15821/Q01497');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU15821','Q01497',"to curl","to make small curls pasted on the forehead")),'source-verified mapping should be registered for KRU15821/Q01497');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU09798','K01181',"divorce","divorce by means of a deed")),'source-verified mapping should be registered for KRU09798/K01181');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU19564','V00058',"shawl fastened on the shoulder","cloaks or shawls fastened on the shoulder")),'source-verified mapping should be registered for KRU19564/V00058');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU09110','K00226',"pitcher","wine pitcher, jug")),'source-verified mapping should be registered for KRU09110/K00226');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU09554','K00842',"brazier","stand, a portable brazier")),'source-verified mapping should be registered for KRU09554/K00842');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU13751','O01132',"a jewel","red jewel, carnelian")),'source-verified mapping should be registered for KRU13751/O01132');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU15513','Q00957',"a cloak","Brundisian cloak, travelling cloak")),'source-verified mapping should be registered for KRU15513/Q00957');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU16327','R00213',"dish","banqueting dish, plate.")),'source-verified mapping should be registered for KRU16327/R00213');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU16979','S00624',"hammer","mallet; smith’s hammer")),'source-verified mapping should be registered for KRU16979/S00624');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU18521','U00170',"shoot","isolated, single shoot.")),'source-verified mapping should be registered for KRU18521/U00170');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU05047','D00493',"guards","relays, guards at stations")),'source-verified mapping should be registered for KRU05047/D00493');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU16245','R00074',"tongs","a pair of tongs")),'source-verified mapping should be registered for KRU16245/R00074');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU18411','T01140',"chariot","chariot with horses")),'source-verified mapping should be registered for KRU18411/T01140');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU18746','U00553',"a sort of shoe","shoe")),'source-verified mapping should be registered for KRU18746/U00553');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU18760','U00571',"a cloak","a coarse cloak")),'source-verified mapping should be registered for KRU18760/U00571');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU18840','U00755',"rinsing with water","rinsing")),'source-verified mapping should be registered for KRU18840/U00755');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU19665','V00260',"a sort of pastry","pastry")),'source-verified mapping should be registered for KRU19665/V00260');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU09644','K00981',"spoon","pan, spoon")),'source-verified mapping should be registered for KRU09644/K00981');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU09775','K01137',"a species of locusts","locusts")),'source-verified mapping should be registered for KRU09775/K01137');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU09772','K01132',"a species of bats","bats")),'source-verified mapping should be registered for KRU09772/K01132');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU09776','K01139',"a species of locusts","locusts")),'source-verified mapping should be registered for KRU09776/K01139');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU09842','K01255',"a species of locusts","locusts")),'source-verified mapping should be registered for KRU09842/K01255');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU10810','M00481',"a species of figs","figs")),'source-verified mapping should be registered for KRU10810/M00481');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU10897','M00621',"a species of locusts","locusts")),'source-verified mapping should be registered for KRU10897/M00621');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU13428','O00579',"ration","the daily ration")),'source-verified mapping should be registered for KRU13428/O00579');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU13489','O00677',"chip","kindling chip")),'source-verified mapping should be registered for KRU13489/O00677');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU15100','Q00260',"a coin (Dupondium)","Dupondium")),'source-verified mapping should be registered for KRU15100/Q00260');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU15358','Q00688',"Pelusium in Egypt","Pelusium")),'source-verified mapping should be registered for KRU15358/Q00688');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU15604','Q01117',"grain of pepper","pepper")),'source-verified mapping should be registered for KRU15604/Q01117');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU03803','C00364','rough untrimmed stone, cobble','a rolling stone, rough untrimmed stone, cobble')),'source-verified mapping should be registered for the Bava Batra rough-stone sense');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU03169','B01075','to bubble forth, to burst forth','to break through, bubble forth, burst forth')),'source-verified mapping should be registered for the bubble/burst-forth sense');

assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU17489','S01587','symbolical form of making an agreement binding','affirmation, making sure; symbolical form of making an agreement binding')),'source-verified mapping should be registered for the legal kinyan sense');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU11696','M01949','to make poor','to make poor, make contemptible')),'source-verified mapping should be registered for the active make-poor sense');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU09446','K00711','a species of figs','figs')),'source-verified mapping should be registered for the specific fig variety');

const kinyan=U.merge([
 {id:17489,entry:{h:'קִנְיָן',r:'KRU17489',source:'krupnik'},meanings:[{text:'symbolical form of making an agreement binding',label:''}]},
 {id:1587,entry:{h:'קִנְיָן',r:'S01587'},meanings:[{text:'affirmation, making sure; symbolical form of making an agreement binding',label:'—3)'}]}
],'קִנְיָן');
assert.equal(kinyan.length,1,'the Bava Batra agreement-acquisition sense should consolidate');
assert.equal(kinyan[0].sources.length,2,'both legal-source records should remain available');

const makePoor=U.merge([
 {id:11696,entry:{h:'מִסְכֵּן',r:'KRU11696',source:'krupnik'},meanings:[
  {text:'to make poor',label:''},
  {text:'to become poor',label:'Nithpa.'}
 ]},
 {id:1949,entry:{h:'מִסְכֵּן',r:'M01949'},meanings:[
  {text:'to make poor, make contemptible',label:''},
  {text:'to become poor',label:'Nithpa.'}
 ]}
],'מִסְכֵּן');
assert.equal(makePoor.length,2,'the active and intransitive poor-making senses must remain separate');
assert(makePoor.some(group=>group.sources.length===2&&group.text.includes('to make poor')),'the active transitive sense should consolidate');
assert(makePoor.some(group=>group.sources.length===2&&group.text==='to become poor'),'the separate intransitive sense should also remain independently aligned');


const batSpecies=U.merge([
 {id:9772,entry:{h:'כְּרוּשְׁתֵּינָא',r:'KRU09772',source:'krupnik'},meanings:[{text:'a species of bats'}]},
 {id:1132,entry:{h:'כְּרוּשְׁתֵּינָא',r:'K01132'},meanings:[{text:'bats'}]}
],'כְּרוּשְׁתֵּינָא');
assert.equal(batSpecies.length,1,'the same Shabbat bat species should consolidate');
assert.equal(batSpecies[0].sources.length,2,'both Shabbat 78a source records should remain available');

const locustSpeciesA=U.merge([
 {id:9776,entry:{h:'כַּרְזְבָא',r:'KRU09776',source:'krupnik'},meanings:[{text:'a species of locusts'}]},
 {id:1139,entry:{h:'כַּרְזְבָא',r:'K01139'},meanings:[{text:'locusts'}]}
],'כַּרְזְבָא');
assert.equal(locustSpeciesA.length,1,'the Targum locust species should consolidate');
assert.equal(locustSpeciesA[0].sources.length,2,'both Targum citations should remain available');

const locustSpeciesB=U.merge([
 {id:9842,entry:{h:'כַּרְסֶפֶת',r:'KRU09842',source:'krupnik'},meanings:[{text:'a species of locusts'}]},
 {id:1255,entry:{h:'כַּרְסֶפֶת',r:'K01255'},meanings:[{text:'locusts'}]}
],'כַּרְסֶפֶת');
assert.equal(locustSpeciesB.length,1,'the Hullin locust species should consolidate');
assert.equal(locustSpeciesB[0].sources.length,2,'both Hullin 65b source records should remain available');

const figSpecies=U.merge([
 {id:10810,entry:{h:'מוֹכְסָסִים',r:'KRU10810',source:'krupnik'},meanings:[{text:'a species of figs'}]},
 {id:481,entry:{h:'מוֹכְסָסִים',r:'M00481'},meanings:[{text:'figs'}]}
],'מוֹכְסָסִים');
assert.equal(figSpecies.length,1,'the Bekhorot fig variety should consolidate');
assert.equal(figSpecies[0].sources.length,2,'both Bekhorot 8a records should remain available');

const locustSpeciesC=U.merge([
 {id:10897,entry:{h:'מוֹרָד',r:'KRU10897',source:'krupnik'},meanings:[{text:'a species of locusts'}]},
 {id:621,entry:{h:'מוֹרָד',r:'M00621'},meanings:[{text:'locusts'}]}
],'מוֹרָד');
assert.equal(locustSpeciesC.length,1,'the Tosefta locust species should consolidate');
assert.equal(locustSpeciesC[0].sources.length,2,'both Tosefta Hullin III:25 records should remain available');

const dailyRation=U.merge([
 {id:13428,entry:{h:'סִידּוּר',r:'KRU13428',source:'krupnik'},meanings:[{text:'ration',label:'3'}]},
 {id:579,entry:{h:'סִידּוּר',r:'O00579'},meanings:[{text:'the daily ration',label:'—4)'}]}
],'סִידּוּר');
assert.equal(dailyRation.length,1,'the Lev. Rabbah ration sense should consolidate');
assert.equal(dailyRation[0].sources.length,2,'both ration sense records should remain available');

const kindlingChip=U.merge([
 {id:13489,entry:{h:'סִילְתָּא',r:'KRU13489',source:'krupnik'},meanings:[{text:'chip'}]},
 {id:677,entry:{h:'סִילְתָּא',r:'O00677'},meanings:[
  {text:'kindling chip',label:'1'},
  {text:'log',label:'2'}
 ]}
],'סִילְתָּא');
assert.equal(kindlingChip.length,2,'the kindling-chip sense should consolidate without absorbing the separate log sense');
assert(kindlingChip.some(group=>group.sources.length===2&&group.text.includes('chip')),'both Bava Kamma kindling-chip records should consolidate');
assert(kindlingChip.some(group=>group.sources.length===1&&group.text==='log'),'the separate log sense must remain independent');

const dupondium=U.merge([
 {id:15100,entry:{h:'פּוּנְדְּיוֹן',r:'KRU15100',source:'krupnik'},meanings:[{text:'a coin (Dupondium)'}]},
 {id:260,entry:{h:'פּוּנְדְּיוֹן',r:'Q00260'},meanings:[{text:'Dupondium'}]}
],'פּוּנְדְּיוֹן');
assert.equal(dupondium.length,1,'the Roman Dupondium coin definitions should consolidate');
assert.equal(dupondium[0].sources.length,2,'both monetary source records should remain available');

const pelusium=U.merge([
 {id:15358,entry:{h:'פִּילוּסִין',r:'KRU15358',source:'krupnik'},meanings:[
  {text:'Pelusium in Egypt',label:'1'},
  {text:'Pelusian linen',label:'2'}
 ]},
 {id:688,entry:{h:'פִּילוּסִין',r:'Q00688'},meanings:[{text:'Pelusium',label:'1'}]}
],'פִּילוּסִין');
assert.equal(pelusium.length,2,'Pelusium should consolidate without absorbing the separate linen sense');
assert(pelusium.some(group=>group.sources.length===2&&group.text.includes('Pelusium')),'the Targum place-name sense should consolidate');
assert(pelusium.some(group=>group.sources.length===1&&group.text==='Pelusian linen'),'the separate linen sense must remain independent');


const tongs=U.merge([
 {id:16245,entry:{h:'צְבָת',r:'KRU16245',source:'krupnik'},meanings:[{text:'tongs'}]},
 {id:74,entry:{h:'צְבָת',r:'R00074'},meanings:[{text:'a pair of tongs'}]}
],'צְבָת');
assert.equal(tongs.length,1,'the Avot tongs definitions should consolidate');
assert.equal(tongs[0].sources.length,2,'both Avot V:6 source records should remain available');

const chariot=U.merge([
 {id:18411,entry:{h:'רְתִכָּא',r:'KRU18411',source:'krupnik'},meanings:[{text:'chariot'}]},
 {id:1140,entry:{h:'רְתִכָּא',r:'T01140'},meanings:[{text:'chariot with horses'}]}
],'רְתִכָּא');
assert.equal(chariot.length,1,'the Targum chariot definitions should consolidate');
assert.equal(chariot[0].sources.length,2,'both Genesis 41:43 source records should remain available');

const shoe=U.merge([
 {id:18746,entry:{h:'שׁוּרְצִיפָא',r:'KRU18746',source:'krupnik'},meanings:[{text:'a sort of shoe'}]},
 {id:553,entry:{h:'שׁוּרְצִיפָא',r:'U00553'},meanings:[{text:'shoe'}]}
],'שׁוּרְצִיפָא');
assert.equal(shoe.length,1,'the Yerushalmi shoe definitions should consolidate');
assert.equal(shoe[0].sources.length,2,'both Yevamot XII:12 source records should remain available');

const cloak=U.merge([
 {id:18760,entry:{h:'שׁוֹשִׁיפָא',r:'KRU18760',source:'krupnik'},meanings:[{text:'a cloak'}]},
 {id:571,entry:{h:'שׁוֹשִׁיפָא',r:'U00571'},meanings:[{text:'a coarse cloak'}]}
],'שׁוֹשִׁיפָא');
assert.equal(cloak.length,1,'the Targum cloak definitions should consolidate');
assert.equal(cloak[0].sources.length,2,'both Isaiah 3:22 source records should remain available');

const rinsing=U.merge([
 {id:18840,entry:{h:'שְׁטִיפָה',r:'KRU18840',source:'krupnik'},meanings:[{text:'rinsing with water'}]},
 {id:755,entry:{h:'שְׁטִיפָה',r:'U00755'},meanings:[{text:'rinsing'}]}
],'שְׁטִיפָה');
assert.equal(rinsing.length,1,'the cold-water rinsing definitions should consolidate');
assert.equal(rinsing[0].sources.length,2,'both purification source records should remain available');

const pastry=U.merge([
 {id:19665,entry:{h:'תּוּפְנָה',r:'KRU19665',source:'krupnik'},meanings:[{text:'a sort of pastry'}]},
 {id:260,entry:{h:'תּוּפְנָה',r:'V00260'},meanings:[{text:'pastry'}]}
],'תּוּפְנָה');
assert.equal(pastry.length,1,'the pastry definitions should consolidate');
assert.equal(pastry[0].sources.length,2,'both pastry source records should remain available');

const spoon=U.merge([
 {id:9644,entry:{h:'כַּף',r:'KRU09644',source:'krupnik'},meanings:[{text:'spoon',label:'1'}]},
 {id:981,entry:{h:'כַּף',r:'K00981'},meanings:[
  {text:'pan, spoon',label:'—5)'},
  {text:'top branch',label:'—4)'}
 ]}
],'כַּף');
assert.equal(spoon.length,2,'the spoon sense should consolidate without absorbing the separate palm-branch sense');
assert(spoon.some(group=>group.sources.length===2&&group.text.includes('spoon')),'both Kelim spoon definitions should consolidate');
assert(spoon.some(group=>group.sources.length===1&&group.text==='top branch'),'the separate palm-branch sense must remain independent');


const shoulderWrap=U.merge([
 {id:19564,entry:{h:'תבלטירים',r:'KRU19564',source:'krupnik'},meanings:[{text:'shawl fastened on the shoulder'}]},
 {id:58,entry:{h:'תבלטירים',r:'V00058'},meanings:[{text:'cloaks or shawls fastened on the shoulder'}]}
],'תבלטירים');
assert.equal(shoulderWrap.length,1,'the Sifrei shoulder-wrap definitions should consolidate');
assert.equal(shoulderWrap[0].sources.length,2,'both Sifrei Deuteronomy 234 source records should remain available');

const winePitcher=U.merge([
 {id:9110,entry:{h:'כּוּזָא',r:'KRU09110',source:'krupnik'},meanings:[{text:'pitcher'}]},
 {id:226,entry:{h:'כּוּזָא',r:'K00226'},meanings:[{text:'wine pitcher, jug'}]}
],'כּוּזָא');
assert.equal(winePitcher.length,1,'the Shabbat wine-pitcher definitions should consolidate');
assert.equal(winePitcher[0].sources.length,2,'both pitcher source records should remain available');

const brazier=U.merge([
 {id:9554,entry:{h:'כָּנוֹנָא',r:'KRU09554',source:'krupnik'},meanings:[{text:'brazier'}]},
 {id:842,entry:{h:'כָּנוֹנָא',r:'K00842'},meanings:[{text:'stand, a portable brazier'}]}
],'כָּנוֹנָא');
assert.equal(brazier.length,1,'the Beitzah portable-brazier definitions should consolidate');
assert.equal(brazier[0].sources.length,2,'both Beitzah 21b source records should remain available');

const carnelian=U.merge([
 {id:13751,entry:{h:'סָמְקָן',r:'KRU13751',source:'krupnik'},meanings:[{text:'a jewel'}]},
 {id:1132,entry:{h:'סָמְקָן',r:'O01132'},meanings:[{text:'red jewel, carnelian'}]}
],'סָמְקָן');
assert.equal(carnelian.length,1,'the Targum carnelian definitions should consolidate');
assert.equal(carnelian[0].sources.length,2,'both Exodus 28:17 source records should remain available');

const travellingCloak=U.merge([
 {id:15513,entry:{h:'פַּלְדֵּיס',r:'KRU15513',source:'krupnik'},meanings:[{text:'a cloak'}]},
 {id:957,entry:{h:'פַּלְדֵּיס',r:'Q00957'},meanings:[{text:'Brundisian cloak, travelling cloak'}]}
],'פַּלְדֵּיס');
assert.equal(travellingCloak.length,1,'the Tosefta travelling-cloak definitions should consolidate');
assert.equal(travellingCloak[0].sources.length,2,'both Megillah IV:30 source records should remain available');

const banquetDish=U.merge([
 {id:16327,entry:{h:'צוּעָה',r:'KRU16327',source:'krupnik'},meanings:[{text:'dish'}]},
 {id:213,entry:{h:'צוּעָה',r:'R00213'},meanings:[{text:'banqueting dish, plate.'}]}
],'צוּעָה');
assert.equal(banquetDish.length,1,'the Yerushalmi banqueting-dish definitions should consolidate');
assert.equal(banquetDish[0].sources.length,2,'both Ketubot X:33d source records should remain available');

const smithHammer=U.merge([
 {id:16979,entry:{h:'קוּרְנָס',r:'KRU16979',source:'krupnik'},meanings:[{text:'hammer'}]},
 {id:624,entry:{h:'קוּרְנָס',r:'S00624'},meanings:[{text:'mallet; smith’s hammer'}]}
],'קוּרְנָס');
assert.equal(smithHammer.length,1,'the Sabbath mallet/hammer definitions should consolidate');
assert.equal(smithHammer[0].sources.length,2,'both Sabbath hammer source records should remain available');

const vineShoot=U.merge([
 {id:18521,entry:{h:'שִׁבְקָא',r:'KRU18521',source:'krupnik'},meanings:[{text:'shoot'}]},
 {id:170,entry:{h:'שִׁבְקָא',r:'U00170'},meanings:[
  {text:'undressed vine',label:'1'},
  {text:'isolated, single shoot.',label:'—2)'}
 ]}
],'שִׁבְקָא');
assert.equal(vineShoot.length,2,'the single-shoot sense should consolidate without absorbing the separate undressed-vine sense');
assert(vineShoot.some(group=>group.sources.length===2&&group.text.includes('shoot')),'both Ezekiel 17:6 shoot definitions should consolidate');
assert(vineShoot.some(group=>group.sources.length===1&&group.text==='undressed vine'),'the separate undressed-vine sense must remain independent');


const twigBasket=U.merge([
 {id:13534,entry:{h:'סִיסָנָא',r:'KRU13534',source:'krupnik'},meanings:[
  {text:'twig',label:'1'},
  {text:'basket',label:'2'}
 ]},
 {id:760,entry:{h:'סִיסָנָא',r:'O00760'},meanings:[
  {text:'thorn, twig',label:'1'},
  {text:'basket made of twigs.',label:'—2)'}
 ]}
],'סִיסָנָא');
assert.equal(twigBasket.length,2,'the basket sense should consolidate while preserving the separate twig sense');
assert(twigBasket.some(group=>group.sources.length===2&&group.text.includes('basket')),'both Bava Metzia basket definitions should consolidate');
assert(twigBasket.some(group=>group.sources.length===2&&group.text.includes('twig')),'both Gittin twig definitions should remain available');

const ramification=U.merge([
 {id:14185,entry:{h:'עוּבָּא',r:'KRU14185',source:'krupnik'},meanings:[{text:'ramification',label:'2'}]},
 {id:174,entry:{h:'עוּבָּא',r:'P00174'},meanings:[{text:'the full ramification of a tree',label:'—2)'}]}
],'עוּבָּא');
assert.equal(ramification.length,1,'the Job 15:32 tree-ramification definitions should consolidate');
assert.equal(ramification[0].sources.length,2,'both tree-ramification source records should remain available');

const treeCavity=U.merge([
 {id:14197,entry:{h:'עוּגָּא',r:'KRU14197',source:'krupnik'},meanings:[{text:'cavity dug around a tree'}]},
 {id:191,entry:{h:'עוּגָּא',r:'P00191'},meanings:[
  {text:'cake',label:'1'},
  {text:'cavity',label:'—2)'}
 ]}
],'עוּגָּא');
assert.equal(treeCavity.length,2,'the tree-cavity sense should consolidate without absorbing the separate cake sense');
assert(treeCavity.some(group=>group.sources.length===2&&group.text.includes('cavity')),'both tree-cavity records should consolidate');
assert(treeCavity.some(group=>group.sources.length===1&&group.text==='cake'),'the separate cake sense must remain independent');

const fruitCutting=U.merge([
 {id:14770,entry:{h:'עֲקִיצָה',r:'KRU14770',source:'krupnik'},meanings:[
  {text:'sting',label:'1'},
  {text:'cutting',label:'2'}
 ]},
 {id:1185,entry:{h:'עֲקִיצָה',r:'P01185'},meanings:[
  {text:'sting',label:'1'},
  {text:'cutting fruit by the stalk',label:'—2)'}
 ]}
],'עֲקִיצָה');
assert.equal(fruitCutting.length,2,'the fruit-cutting sense should consolidate while sting remains separate');
assert(fruitCutting.some(group=>group.sources.length===2&&group.text.includes('cutting')),'both Maaser Sheni fruit-cutting records should consolidate');
assert(fruitCutting.some(group=>group.sources.length===2&&group.text==='sting'),'the separate sting sense should remain aligned independently');

const prayerArrangement=U.merge([
 {id:14857,entry:{h:'עֲרִיכוּת',r:'KRU14857',source:'krupnik'},meanings:[{text:'arrangement of the speech or of prayer'}]},
 {id:1358,entry:{h:'עֲרִיכוּת',r:'P01358'},meanings:[{text:'arrangement'}]}
],'עֲרִיכוּת');
assert.equal(prayerArrangement.length,1,'the Genesis Rabbah prayer-arrangement definitions should consolidate');
assert.equal(prayerArrangement[0].sources.length,2,'both Genesis Rabbah 49 source records should remain available');

const garmentSeam=U.merge([
 {id:15093,entry:{h:'פּוּמְבְּיָינֵי',r:'KRU15093',source:'krupnik'},meanings:[{text:'seam'}]},
 {id:250,entry:{h:'פּוּמְבְּיָינֵי',r:'Q00250'},meanings:[{text:'the seam between a garment and its border'}]}
],'פּוּמְבְּיָינֵי');
assert.equal(garmentSeam.length,1,'the Kiddushin seam definitions should consolidate');
assert.equal(garmentSeam[0].sources.length,2,'both Kiddushin 32a source records should remain available');

assert(U.reviewedSourceGlossPairs.has('KRU15386|Q00743::lump | lump of brittle stone'),'the stone-lump mapping key must be present');
const stoneLump=U.merge([
 {id:15386,entry:{h:'פִּיסָא',r:'KRU15386',source:'krupnik'},meanings:[
  {text:'lot',label:'1'},
  {text:'lump',label:'2'},
  {text:'bread',label:'3'}
 ]},
 {id:743,entry:{h:'פִּיסָא',r:'Q00743'},meanings:[
  {text:'lump of brittle stone',label:'1'}
 ]}
],'פִּיסָא');
assert.equal(stoneLump.length,3,'the stone-lump sense should consolidate without absorbing the lot or bread senses');
assert(stoneLump.some(group=>group.sources.length===2&&group.text.includes('lump')),'both Sanhedrin 64a lump definitions should consolidate');
assert(stoneLump.some(group=>group.sources.length===1&&group.text==='lot'),'the separate lot sense must remain independent');
assert(stoneLump.some(group=>group.sources.length===1&&group.text==='bread'),'the separate bread sense must remain independent');

const rougeAndCurls=U.merge([
 {id:15821,entry:{h:'פָּקַס',r:'KRU15821',source:'krupnik'},meanings:[
  {text:'open forcibly',label:'1'},
  {text:'to paint',label:'2'},
  {text:'to curl',label:'3'}
 ]},
 {id:1497,entry:{h:'פָּקַס',r:'Q01497'},meanings:[
  {text:'to paint the face with rouge',label:'1'},
  {text:'to make small curls pasted on the forehead',label:'—2)'}
 ]}
],'פָּקַס');
assert.equal(rougeAndCurls.length,3,'the two Shabbat grooming senses should consolidate separately from opening forcibly');
assert(rougeAndCurls.filter(group=>group.sources.length===2).length===2,'rouging and hair-curling should each consolidate as their own sense');
assert(rougeAndCurls.some(group=>group.sources.length===1&&group.text==='open forcibly'),'the separate animal-mouth opening sense must remain independent');


const wineTreader=U.merge([
 {id:4680,entry:{h:'גִּתִּית',r:'KRU04680',source:'krupnik'},meanings:[{text:'woman engaged in the wine-press'}]},
 {id:1432,entry:{h:'גִּתִּית',r:'C01432'},meanings:[{text:'woman engaged in the wine press, wine treader'}]}
],'גִּתִּית');
assert.equal(wineTreader.length,1,'the wine-treader definitions should consolidate');
assert.equal(wineTreader[0].sources.length,2,'both Genesis Rabbah and Esther Rabbah source records should remain available');

const nethinimStatus=U.merge([
 {id:13073,entry:{h:'נְתִינוּת',r:'KRU13073',source:'krupnik'},meanings:[{text:'the status of the N’thinim (Josh. IX. 27)'}]},
 {id:1375,entry:{h:'נְתִינוּת',r:'N01375'},meanings:[{text:'the legal status of the Nathin; the class of N’thinim'}]}
],'נְתִינוּת');
assert.equal(nethinimStatus.length,1,'the legal status of the Nethinim should consolidate');
assert.equal(nethinimStatus[0].sources.length,2,'both Tosefta Kiddushin V:4 records should remain available');

const destructionSense=U.merge([
 {id:5607,entry:{h:'הַבְעָרָה',r:'KRU05607',source:'krupnik'},meanings:[
  {text:'the kindling of fire',label:'1'},
  {text:'destruction',label:'2'}
 ]},
 {id:48,entry:{h:'הַבְעָרָה',r:'E00048'},meanings:[
  {text:'the law forbidding the kindling of fire on the Sabbath',label:'1'},
  {text:'removal, destruction',label:'—2)'},
  {text:'heating, fire',label:'—3)'}
 ]}
],'הַבְעָרָה');
assert.equal(destructionSense.length,4,'the destruction sense should consolidate while the distinct law, kindling, and altar-fire glosses stay separate');
assert(destructionSense.some(group=>group.sources.length===2&&group.text.includes('destruction')),'both Yerushalmi Sanhedrin destruction definitions should consolidate');
assert(destructionSense.some(group=>group.sources.length===1&&group.text.includes('law')),'the separate Sabbath-law sense must remain independent');
assert(destructionSense.some(group=>group.sources.length===1&&group.text.includes('kindling')),'the separate kindling-of-fire sense must remain independent');
assert(destructionSense.some(group=>group.sources.length===1&&group.text==='heating, fire'),'the separate altar-fire sense must remain independent');

const weightSense=U.merge([
 {id:8552,entry:{h:'יוֹקְרָא',r:'KRU08552',source:'krupnik'},meanings:[
  {text:'respect',label:'1'},
  {text:'weight, heaviness',label:'2'}
 ]},
 {id:234,entry:{h:'יוֹקְרָא',r:'J00234'},meanings:[
  {text:'high price',label:'1'},
  {text:'weight',label:'—2)'},
  {text:'feeling of heaviness',label:'—3)'}
 ]}
],'יוֹקְרָא');
assert.equal(weightSense.length,4,'the weight sense should consolidate while respect, high price, and asthma/heaviness stay separate');
assert(weightSense.some(group=>group.sources.length===2&&group.text.includes('weight')),'both Menachot 94b weight definitions should consolidate');
assert(weightSense.some(group=>group.sources.length===1&&group.text==='respect'),'the separate respect sense must remain independent');
assert(weightSense.some(group=>group.sources.length===1&&group.text==='high price'),'the separate high-price sense must remain independent');
assert(weightSense.some(group=>group.sources.length===1&&group.text==='feeling of heaviness'),'the separate asthma/heaviness sense must remain independent');

const dearAndHeavy=U.merge([
 {id:8816,entry:{h:'יְקַר',r:'KRU08816',source:'krupnik'},meanings:[
  {text:'to be heavy',label:'1'},
  {text:'to be dear',label:'2'}
 ]},
 {id:581,entry:{h:'יְקַר',r:'J00581'},meanings:[
  {text:'to be heavy',label:'1'},
  {text:'to be dear, precious',label:'—2)'}
 ]}
],'יְקַר');
assert.equal(dearAndHeavy.length,2,'heavy and dear meanings must consolidate as two separate senses');
assert(dearAndHeavy.every(group=>group.sources.length===2),'both heavy and dear source senses should be represented independently');

const plasterSense=U.merge([
 {id:13241,entry:{h:'סוּד',r:'KRU13241',source:'krupnik'},meanings:[{text:'to plaster with lime',label:'1'}]},
 {id:258,entry:{h:'סוּד',r:'O00258'},meanings:[{text:'to plaster, whitewash',label:'1'}]}
],'סוּד');
assert.equal(plasterSense.length,1,'the explicit plaster/whitewash sense should consolidate');
assert.equal(plasterSense[0].sources.length,2,'both Sotah VII:5 plastering source records should remain available');

const voluptuousMan=U.merge([
 {id:6499,entry:{h:'זַנַּאי',r:'KRU06499',source:'krupnik'},meanings:[{text:'voluptuous man'}]},
 {id:560,entry:{h:'זַנַּאי',r:'G00560'},meanings:[{text:'adulterer; voluptuous'}]}
],'זַנַּאי');
assert.equal(voluptuousMan.length,1,'the Shabbat voluptuous/adulterer definition should consolidate');
assert.equal(voluptuousMan[0].sources.length,2,'both Shabbat 156a source records should remain available');

const reedWrapper=U.merge([
 {id:6852,entry:{h:'חוֹתָל',r:'KRU06852',source:'krupnik'},meanings:[{text:'wrapper, envelope'}]},
 {id:496,entry:{h:'חוֹתָל',r:'H00496'},meanings:[{text:'wrapper of reed-matting'}]}
],'חוֹתָל');
assert.equal(reedWrapper.length,1,'the Kelim wrapper/bale definitions should consolidate');
assert.equal(reedWrapper[0].sources.length,2,'both Kelim XVI:5 source records should remain available');

const carpenterAdze=U.merge([
 {id:7458,entry:{h:'חֲצִינָא',r:'KRU07458',source:'krupnik'},meanings:[{text:'adze, pick-axe'}]},
 {id:1522,entry:{h:'חֲצִינָא',r:'H01522'},meanings:[{text:'carpenter’s adze'}]}
],'חֲצִינָא');
assert.equal(carpenterAdze.length,1,'the carpenter’s adze definitions should consolidate');
assert.equal(carpenterAdze[0].sources.length,2,'both tool source records should remain available');

const carobSense=U.merge([
 {id:7512,entry:{h:'חֲרוּב',r:'KRU07512',source:'krupnik'},meanings:[
  {text:'carob-tree and–pod',label:'1'},
  {text:'name of places in Palestine',label:'2'}
 ]},
 {id:1611,entry:{h:'חֲרוּב',r:'H01611'},meanings:[
  {text:'carob-pod; carob-tree',label:'1'},
  {text:'a variety of beans',label:'—2)'}
 ]}
],'חֲרוּב');
assert.equal(carobSense.length,3,'the carob sense should consolidate without absorbing the separate bean-variety and place-name senses');
assert(carobSense.some(group=>group.sources.length===2&&group.text.includes('carob')),'both carob-tree/pod source senses should consolidate');
assert(carobSense.some(group=>group.sources.length===1&&group.text.includes('beans')),'the separate bean-variety sense must remain independent');
assert(carobSense.some(group=>group.sources.length===1&&group.text.includes('places')),'the separate place-name sense must remain independent');


const receivedBlows=U.merge([
 {id:2911,entry:{h:'בְּלַע',r:'KRU02911',source:'krupnik'},meanings:[
  {text:'to absorb, to swallow',label:'1'},
  {text:'to recieve blows',label:'2'}
 ]},
 {id:899,entry:{h:'בְּלַע',r:'B00899'},meanings:[{text:'to receive blows',label:'transf.'}]}
],'בְּלַע');
assert.equal(receivedBlows.length,2,'the receiving-blows sense should consolidate without absorbing the separate swallow sense');
assert(receivedBlows.some(group=>group.sources.length===2&&group.text.includes('blows')),'both Menachot 7a receiving-blows senses should consolidate');
assert(receivedBlows.some(group=>group.sources.length===1&&group.text.includes('swallow')),'the separate swallowing sense must remain independent');

const jewelSetting=U.merge([
 {id:18262,entry:{h:'רְמַץ',r:'KRU18262',source:'krupnik'},meanings:[{text:'to set (jewels)',label:'2'}]},
 {id:833,entry:{h:'רְמַץ',r:'T00833'},meanings:[
  {text:'to weave in checkers, to variegate',label:'1'},
  {text:'to set, enchase',label:'—2)'}
 ]}
],'רְמַץ');
assert.equal(jewelSetting.length,2,'jewel-setting should consolidate without absorbing the separate weaving/variegating sense');
assert(jewelSetting.some(group=>group.sources.length===2&&group.text.includes('set')),'both Exodus 28:20 jewel-setting definitions should consolidate');
assert(jewelSetting.some(group=>group.sources.length===1&&group.text.includes('weave')),'the separate weaving sense must remain independent');

const permittedUse=U.merge([
 {id:18742,entry:{h:'שׁוּרַיי',r:'KRU18742',source:'krupnik'},meanings:[{text:'permitted (thing)'}]},
 {id:547,entry:{h:'שׁוּרַיי',r:'U00547'},meanings:[{text:'permission; it is permitted'}]}
],'שׁוּרַיי');
assert.equal(permittedUse.length,1,'the Yerushalmi permission definitions should consolidate');
assert.equal(permittedUse[0].sources.length,2,'both Demai II:22c source records should remain available');

const hemorrhoidSufferer=U.merge([
 {id:7872,entry:{h:'טָחוֹר',r:'KRU07872',source:'krupnik'},meanings:[{text:'sufferer from hemorrhoids'}]},
 {id:261,entry:{h:'טָחוֹר',r:'I00261'},meanings:[{text:'sufferer from piles'}]}
],'טָחוֹר');
assert.equal(hemorrhoidSufferer.length,1,'the Midrash Samuel hemorrhoid-sufferer definitions should consolidate');
assert.equal(hemorrhoidSufferer[0].sources.length,2,'both Midrash Samuel X source records should remain available');

const embroideredCover=U.merge([
 {id:11045,entry:{h:'מְחַטְפָא',r:'KRU11045',source:'krupnik'},meanings:[{text:'embroidered cover'}]},
 {id:855,entry:{h:'מְחַטְפָא',r:'M00855'},meanings:[{text:'embroidered horse-covers'}]}
],'מְחַטְפָא');
assert.equal(embroideredCover.length,1,'the Targum Esther embroidered-cover definitions should consolidate');
assert.equal(embroideredCover[0].sources.length,2,'both Esther VI:11 source records should remain available');

const ploughPole=U.merge([
 {id:3356,entry:{h:'בֶּרֶךְ',r:'KRU03356',source:'krupnik'},meanings:[{text:'a kneeshaped pole'}]},
 {id:1289,entry:{h:'בֶּרֶךְ',r:'B01289'},meanings:[
  {text:'knee',label:'1'},
  {text:'a knee-shaped pole',label:'—2)'}
 ]}
],'בֶּרֶךְ');
assert.equal(ploughPole.length,2,'the knee-shaped pole should consolidate while the anatomical knee remains separate');
assert(ploughPole.some(group=>group.sources.length===2&&group.text.includes('pole')),'both Taanit 25b plough-pole definitions should consolidate');
assert(ploughPole.some(group=>group.sources.length===1&&group.text==='knee'),'the anatomical knee sense must remain independent');

const doughRoll=U.merge([
 {id:3574,entry:{h:'גַּבְלוּל',r:'KRU03574',source:'krupnik'},meanings:[{text:'a roll of dough'}]},
 {id:109,entry:{h:'גַּבְלוּל',r:'C00109'},meanings:[{text:'a lump of dough'}]}
],'גַּבְלוּל');
assert.equal(doughRoll.length,1,'the Yerushalmi Challah dough-roll definitions should consolidate');
assert.equal(doughRoll[0].sources.length,2,'both Challah II:59a source records should remain available');

const gonorrhoeaSufferer=U.merge([
 {id:4825,entry:{h:'דּוֹבָנָא',r:'KRU04825',source:'krupnik'},meanings:[{text:'one afflicted with gonorrhoea'}]},
 {id:176,entry:{h:'דּוֹבָנָא',r:'D00176'},meanings:[{text:'one afflicted with gonorrhœa'}]}
],'דּוֹבָנָא');
assert.equal(gonorrhoeaSufferer.length,1,'the Targum Leviticus sufferer definitions should consolidate');
assert.equal(gonorrhoeaSufferer[0].sources.length,2,'both Leviticus XV:4 source records should remain available');

const damascenePlum=U.merge([
 {id:5535,entry:{h:'דַּרְמַסְקִינָא',r:'KRU05535',source:'krupnik'},meanings:[{text:'Damascene plum'}]},
 {id:1109,entry:{h:'דַּרְמַסְקִינָא',r:'D01109'},meanings:[{text:'Damascene plums'}]}
],'דַּרְמַסְקִינָא');
assert.equal(damascenePlum.length,1,'the Damascene-plum definitions should consolidate');
assert.equal(damascenePlum[0].sources.length,2,'both Tosefta Terumot VII:13 source records should remain available');

const hagrite=U.merge([
 {id:5707,entry:{h:'הוּנְגְּרָאָה',r:'KRU05707',source:'krupnik'},meanings:[{text:'inhabitant of Hagra'}]},
 {id:251,entry:{h:'הוּנְגְּרָאָה',r:'E00251'},meanings:[{text:'inhabitants of Hagra'}]}
],'הוּנְגְּרָאָה');
assert.equal(hagrite.length,1,'the Targum Psalms Hagra-inhabitant definitions should consolidate');
assert.equal(hagrite[0].sources.length,2,'both Psalms 83:7 source records should remain available');

const merchandiseDebt=U.merge([
 {id:6049,entry:{h:'הַקָּפָה',r:'KRU06049',source:'krupnik'},meanings:[{text:'debt for merchandise',label:'4'}]},
 {id:800,entry:{h:'הַקָּפָה',r:'E00800'},meanings:[{text:'debts for merchandise',label:'—4)'}]}
],'הַקָּפָה');
assert.equal(merchandiseDebt.length,1,'the Sheviit merchandise-debt definitions should consolidate');
assert.equal(merchandiseDebt[0].sources.length,2,'both Sheviit X:1 source records should remain available');

const headCleansing=U.merge([
 {id:7416,entry:{h:'חֲפִיפָה',r:'KRU07416',source:'krupnik'},meanings:[
  {text:'covering',label:'1'},
  {text:'sacred place',label:'2'},
  {text:'cleaning the head',label:'3'}
 ]},
 {id:1448,entry:{h:'חֲפִיפָה',r:'H01448'},meanings:[{text:'cleansing the head'}]}
],'חֲפִיפָה');
assert.equal(headCleansing.length,3,'head-cleansing should consolidate while covering and sacred-place senses remain separate');
assert(headCleansing.some(group=>group.sources.length===2&&group.text.includes('head')),'both Niddah 66b head-cleansing definitions should consolidate');
assert(headCleansing.some(group=>group.sources.length===1&&group.text==='covering'),'the covering sense must remain independent');
assert(headCleansing.some(group=>group.sources.length===1&&group.text==='sacred place'),'the sacred-place sense must remain independent');

const eyelidPainting=U.merge([
 {id:9259,entry:{h:'כָּחַל',r:'KRU09259',source:'krupnik'},meanings:[{text:'to paint the eye-lids'}]},
 {id:463,entry:{h:'כָּחַל',r:'K00463'},meanings:[{text:'to paint the eyelids'}]}
],'כָּחַל');
assert.equal(eyelidPainting.length,1,'the Shabbat eyelid-painting definitions should consolidate');
assert.equal(eyelidPainting[0].sources.length,2,'both Shabbat VIII:3/X:6 source records should remain available');

const leatherThong=U.merge([
 {id:9616,entry:{h:'כֶּסֶךְ',r:'KRU09616',source:'krupnik'},meanings:[{text:'leather thong'}]},
 {id:934,entry:{h:'כֶּסֶךְ',r:'K00934'},meanings:[{text:'leather thongs'}]}
],'כֶּסֶךְ');
assert.equal(leatherThong.length,1,'the Shabbat leather-thong definitions should consolidate');
assert.equal(leatherThong[0].sources.length,2,'both Shabbat 139b source records should remain available');

const whiteBeans=U.merge([
 {id:9849,entry:{h:'כְּרְפוֹנָה',r:'KRU09849',source:'krupnik'},meanings:[{text:'a kind of beans'}]},
 {id:1262,entry:{h:'כְּרְפוֹנָה',r:'K01262'},meanings:[{text:'white beans'}]}
],'כְּרְפוֹנָה');
assert.equal(whiteBeans.length,1,'the Yerushalmi white-bean definitions should consolidate');
assert.equal(whiteBeans[0].sources.length,2,'both Kilayim I:27a source records should remain available');

const wateringAndStones=U.merge([
 {id:10895,entry:{h:'מוּרְבִּית',r:'KRU10895',source:'krupnik'},meanings:[
  {text:'branch',label:'1'},
  {text:'watering time',label:'2'},
  {text:'layer of stones',label:'3'}
 ]},
 {id:614,entry:{h:'מוּרְבִּית',r:'M00614'},meanings:[
  {text:'watering times',label:'1'},
  {text:'layers, piles of hewn stones',label:'—2)'}
 ]}
],'מוּרְבִּית');
assert.equal(wateringAndStones.length,3,'watering and stone-layer senses should consolidate independently while the branch sense stays separate');
assert(wateringAndStones.filter(group=>group.sources.length===2).length===2,'watering times and stone layers should each consolidate separately');
assert(wateringAndStones.some(group=>group.sources.length===1&&group.text==='branch'),'the separate branch sense must remain independent');

const threshingSledge=U.merge([
 {id:10907,entry:{h:'מוֹרִיגָא',r:'KRU10907',source:'krupnik'},meanings:[
  {text:'threshing sledge',label:'1'},
  {text:'palate',label:'2'}
 ]},
 {id:641,entry:{h:'מוֹרִיגָא',r:'M00641'},meanings:[
  {text:'threshing ledge',label:'1'},
  {text:'palate',label:'—2)'}
 ]}
],'מוֹרִיגָא');
assert.equal(threshingSledge.length,2,'the threshing sledge and palate senses should remain separate');
assert(threshingSledge.every(group=>group.sources.length===2),'both Targum threshing-sledge and palate senses should align independently');

const womanInChildbed=U.merge([
 {id:11008,entry:{h:'מְחַבַּלְתָּא',r:'KRU11008',source:'krupnik'},meanings:[{text:'woman in childbed'}]},
 {id:804,entry:{h:'מְחַבַּלְתָּא',r:'M00804'},meanings:[{text:'travailing woman'}]}
],'מְחַבַּלְתָּא');
assert.equal(womanInChildbed.length,1,'the Genesis Rabbah woman-in-childbed definitions should consolidate');
assert.equal(womanInChildbed[0].sources.length,2,'both Genesis Rabbah 60 source records should remain available');

const neronianCoin=U.merge([
 {id:12738,entry:{h:'נִירוֹנִית',r:'KRU12738',source:'krupnik'},meanings:[{text:'a Neronian coin'}]},
 {id:791,entry:{h:'נִירוֹנִית',r:'N00791'},meanings:[{text:'aNeronian coin'}]}
],'נִירוֹנִית');
assert.equal(neronianCoin.length,1,'the Neronian-coin definitions should consolidate');
assert.equal(neronianCoin[0].sources.length,2,'both Bava Metzia 25b source records should remain available');

const naphthaDealer=U.merge([
 {id:12869,entry:{h:'נַפְטוֹיָא',r:'KRU12869',source:'krupnik'},meanings:[{text:'dealer in naphta'}]},
 {id:1035,entry:{h:'נַפְטוֹיָא',r:'N01035'},meanings:[{text:'dealer in naphtha'}]}
],'נַפְטוֹיָא');
assert.equal(naphthaDealer.length,1,'the Nedarim naphtha-dealer definitions should consolidate');
assert.equal(naphthaDealer[0].sources.length,2,'both Nedarim 91b source records should remain available');

const silkWeaversTrade=U.merge([
 {id:13480,entry:{h:'סִילִיקְרָאוּת',r:'KRU13480',source:'krupnik'},meanings:[{text:'silk-weavers trade'}]},
 {id:666,entry:{h:'סִילִיקְרָאוּת',r:'O00666'},meanings:[{text:'silk-weaver’s trade'}]}
],'סִילִיקְרָאוּת');
assert.equal(silkWeaversTrade.length,1,'the Pesikta silk-weaver-trade definitions should consolidate');
assert.equal(silkWeaversTrade[0].sources.length,2,'both Pesikta Rabbati 25 source records should remain available');

const makeStink=U.merge([
 {id:13990,entry:{h:'סָרַח',r:'KRU13990',source:'krupnik'},meanings:[
  {text:'to smell badly',label:'1'},
  {text:'to make stink',label:'2'}
 ]},
 {id:1573,entry:{h:'סָרַח',r:'O01573'},meanings:[
  {text:'to make offensive',label:'Hif. 1'},
  {text:'to become vapid, putrid; to smell badly',label:'Hif. 2'}
 ]}
],'סָרַח');
assert.equal(makeStink.length,3,'the Hifil make-stink sense should consolidate without absorbing the separate smell-badly senses');
assert(makeStink.some(group=>group.sources.length===2&&group.text.includes('offensive')),'both Hifil make-stink definitions should consolidate');
assert(makeStink.filter(group=>group.sources.length===1).length===1,'the separate intransitive vapid/putrid meaning must remain distinct');
assert(makeStink.some(group=>group.sources.length===1&&group.text.includes('vapid')),'the separate intransitive vapid/putrid sense must remain independent');

const unnamedTannai=U.merge([
 {id:14047,entry:{h:'סְתִימְתָּאָה',r:'KRU14047',source:'krupnik'},meanings:[{text:'an unnamed Tannai'}]},
 {id:1700,entry:{h:'סְתִימְתָּאָה',r:'O01700'},meanings:[{text:'an unnamed authority'}]}
],'סְתִימְתָּאָה');
assert.equal(unnamedTannai.length,1,'the Bekhorot unnamed-Tannai definitions should consolidate');
assert.equal(unnamedTannai[0].sources.length,2,'both Bekhorot 30a source records should remain available');

const buildingWing=U.merge([
 {id:8782,entry:{h:'יָצִיעַ',r:'KRU08782',source:'krupnik'},meanings:[{text:'wing of a building'}]},
 {id:533,entry:{h:'יָצִיעַ',r:'J00533'},meanings:[{text:'extension, wing'}]}
],'יָצִיעַ');
assert.equal(buildingWing.length,1,'the Bava Batra building-wing definitions should consolidate');
assert.equal(buildingWing[0].sources.length,2,'both Bava Batra IV:1 source records should remain available');

const divorceByDocument=U.merge([
 {id:9798,entry:{h:'כְּרִיתָה',r:'KRU09798',source:'krupnik'},meanings:[
  {text:'cutting',label:'1'},
  {text:'divorce',label:'4'}
 ]},
 {id:1181,entry:{h:'כְּרִיתָה',r:'K01181'},meanings:[
  {text:'cutting of genitals, mutilation',label:'1'},
  {text:'divorce by means of a deed',label:'—2)'}
 ]}
],'כְּרִיתָה');
assert(divorceByDocument.some(group=>group.sources.length===2&&group.text.includes('divorce')),'the Gittin 10b divorce sense should consolidate');
assert(divorceByDocument.some(group=>group.sources.length===1&&group.text.includes('cutting of genitals')),'the separate mutilation sense must remain distinct');

const stationGuards=U.merge([
 {id:5047,entry:{h:'דִּידְכֵי',r:'KRU05047',source:'krupnik'},meanings:[
  {text:'guards',label:'1'},
  {text:'messengers',label:'2'}
 ]},
 {id:493,entry:{h:'דִּידְכֵי',r:'D00493'},meanings:[{text:'relays, guards at stations'}]}
],'דִּידְכֵי');
assert.equal(stationGuards.length,2,'the station-guard sense should consolidate without absorbing the separate messenger sense');
assert(stationGuards.some(group=>group.sources.length===2&&group.text.includes('guards')),'both Yoma station-guard definitions should consolidate');
assert(stationGuards.some(group=>group.sources.length===1&&group.text==='messengers'),'the separate messenger sense must remain independent');

const locustSpeciesD=U.merge([
 {id:9775,entry:{h:'כְּרָזָא',r:'KRU09775',source:'krupnik'},meanings:[{text:'a species of locusts'}]},
 {id:1137,entry:{h:'כְּרָזָא',r:'K01137'},meanings:[{text:'locusts'}]}
],'כְּרָזָא');
assert.equal(locustSpeciesD.length,1,'the Hullin 62b locust definitions should consolidate');
assert.equal(locustSpeciesD[0].sources.length,2,'both Hullin 62b source records should remain available');

const pepperGrain=U.merge([
 {id:15604,entry:{h:'פִּלְפָּל',r:'KRU15604',source:'krupnik'},meanings:[{text:'grain of pepper'}]},
 {id:1117,entry:{h:'פִּלְפָּל',r:'Q01117'},meanings:[{text:'pepper'}]}
],'פִּלְפָּל');
assert.equal(pepperGrain.length,1,'the Shabbat grain-of-pepper definitions should consolidate');
assert.equal(pepperGrain[0].sources.length,2,'both Shabbat pepper source records should remain available');

const figVariety=U.merge([
 {id:9446,entry:{h:'כְּלוּפְסִין',r:'KRU09446',source:'krupnik'},meanings:[{text:'a species of figs',label:''}]},
 {id:711,entry:{h:'כְּלוּפְסִין',r:'K00711'},meanings:[
  {text:'figs',label:'1'},
  {text:'a species of table-olives',label:'2'}
 ]}
],'כְּלוּפְסִין');
assert.equal(figVariety.length,2,'the fig variety should consolidate without absorbing the separate table-olive sense');
assert(figVariety.some(group=>group.sources.length===2&&group.text.includes('figs')),'both Nedarim fig-variety records should consolidate');
assert(figVariety.some(group=>group.sources.length===1&&group.text.includes('olives')),'the separate table-olive sense must remain distinct');

assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU04044','C00632',"earth embankment, steep banks","a steep")),'source-verified whole-gloss mapping must be registered: C00632 / KRU04044');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU14780','P01211',"to cut (fruits) by the stalks","to cut fruit by the stalks.")),'source-verified whole-gloss mapping must be registered: P01211 / KRU14780');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU15901','Q01641',"resident of an open place","one residing in an open place")),'source-verified whole-gloss mapping must be registered: Q01641 / KRU15901');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU02398','B00982',"negligence","indifference, willful negligence")),'source-verified whole-gloss mapping must be registered: B00982 / KRU02398');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU01212','A01838',"according to","according to the opinion, in the sense of")),'source-verified whole-gloss mapping must be registered: A01838 / KRU01212');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU01341','A02041',"faith, trust","faith in Providence")),'source-verified whole-gloss mapping must be registered: A02041 / KRU01341');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU01578','A02408',"road, way","paved way, public road")),'source-verified whole-gloss mapping must be registered: A02408 / KRU01578');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU03401','B01342',"cypress or pine-tree","cypress")),'source-verified whole-gloss mapping must be registered: B01342 / KRU03401');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU07984','I00408',"a stand for a stove","receptacle of overflow, a stand for a portable stove")),'source-verified mapping must be registered: I00408 / KRU07984');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU19457','U01938',"dry soil","hot and dry soil")),'source-verified mapping must be registered: U01938 / KRU19457');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU03526','C00053',"an abnormally tall person","an abnormally tall and slim person with shaking gait")),'source-verified mapping must be registered: C00053 / KRU03526');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU03298','B00711',"exact account","exact account of wine measures")),'source-verified mapping must be registered: B00711 / KRU03298');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU03519','C00044',"small stubble used as fuel","rakings, small stubble, straw")),'source-verified mapping must be registered: C00044 / KRU03519');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU05768','E00343',"upturning, scratching (of chickens)","damage done by scratching chickens")),'source-verified mapping must be registered: E00343 / KRU05768');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU14213','P00224',"shrunk reed","shrunk")),'source-verified mapping must be registered: P00224 / KRU14213');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU01926','A02946',"a species of fish","fish")),'source-verified mapping must be registered: A02946 / KRU01926');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU15991','Q01805',"carriers of the litter","carriers of the")),'source-verified mapping must be registered: Q01805 / KRU15991');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU01200','A01818',"linen sheet","wrapping cloth, sheet, bathing clothes")),'source-verified mapping must be registered: A01818 / KRU01200');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU02266','B00055',"image, shadow","reflected image")),'source-verified mapping must be registered: B00055 / KRU02266');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU02652','B00656',"hair","thread, a single hair")),'source-verified mapping must be registered: B00656 / KRU02652');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU02633','B00615',"mixture","thorough mixture, even distribution of mixed objects")),'source-verified mapping must be registered: B00615 / KRU02633');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU03814','C00377',"Roman) shoes, which leave the toes uncovered","shoes")),'source-verified mapping must be registered: C00377 / KRU03814');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU04215','C00824',"deduction from the price","deduction")),'source-verified mapping must be registered: C00824 / KRU04215');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU04594','C01305',"grist-maker or dealer","grist-maker")),'source-verified mapping must be registered: C01305 / KRU04594');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU04675','C01425',"to wrestle","to wrestle, fight")),'source-verified mapping must be registered: C01425 / KRU04675');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU04973','D00390',"to tread","to tread upon, trample")),'source-verified mapping must be registered: D00390 / KRU04973');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU03320','B01237',"to recover, to get strong","to become strong")),'source-verified mapping must be registered: B01237 / KRU03320');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU03518','C00041',"rakings heap","rakings")),'source-verified mapping must be registered: C00041 / KRU03518');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU04203','C00806',"shoot (of a plant)","shoot")),'source-verified mapping must be registered: C00806 / KRU04203');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU04556','C01259',"wheel-works of a well","wheel-works")),'source-verified mapping must be registered: C01259 / KRU04556');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU18037','T00354',"soft date","soft, green date")),'source-verified mapping must be registered: T00354 / KRU18037');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU09533','K00817',"to lay a net","to lay a trap, net")),'source-verified mapping must be registered: K00817 / KRU09533');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU09533','K00817',"to lay a net","to lay a trap")),'source-verified mapping must be registered: K00817 / KRU09533');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU05539','D01113',"to stamp","to tread, stamp")),'source-verified mapping must be registered: D01113 / KRU05539');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU05539','D01113',"to press (the knife)","to press")),'source-verified mapping must be registered: D01113 / KRU05539');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU05539','D01113',"to stuff","to stuff food into the camel’s mouth")),'source-verified mapping must be registered: D01113 / KRU05539');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU03800','C00362',"creature","inner body, creature")),'source-verified mapping must be registered: C00362 / KRU03800');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU06435','G00440',"entitled","entitled to possession")),'source-verified mapping must be registered: G00440 / KRU06435');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU02813','B00781',"a species of pears","pears")),'source-verified mapping must be registered: B00781 / KRU02813');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU03037','B01005',"dealer in spices","dealer in")),'source-verified mapping must be registered: B01005 / KRU03037');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU06628','H00082',"a sort of cakes","cakes")),'source-verified mapping must be registered: H00082 / KRU06628');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU06642','H00112',"Parsee priest","Parsee")),'source-verified mapping must be registered: H00112 / KRU06642');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU06720','H00248',"cheese","soft cheese")),'source-verified mapping must be registered: H00248 / KRU06720');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU06775','H00358',"knife","slaughtering knife")),'source-verified mapping must be registered: H00358 / KRU06775');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU07276','H01186',"leavened (bread)","leavened")),'source-verified mapping must be registered: H01186 / KRU07276');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU03500','C00016',"to grow","to grow high")),'source-verified mapping must be registered: C00016 / KRU03500');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU03500','C00016',"to be elated, to be exalted","to be exalted; to be proud")),'source-verified mapping must be registered: C00016 / KRU03500');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU03320','B01237',"to recover, to get strong","to get well, strong")),'source-verified mapping must be registered: B01237 / KRU03320');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU02166','A03336',"skin","dressed skin")),'source-verified mapping must be registered: A03336 / KRU02166');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU04385','C01038',"to do one good or evil","to do one good")),'source-verified mapping must be registered: C01038 / KRU04385');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU04979','D00406',"to remove","to remove hurriedly")),'source-verified mapping must be registered: D00406 / KRU04979');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU09387','K00643',"beating (of flax)","beating")),'source-verified mapping must be registered: K00643 / KRU09387');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU09415','K00673',"guard-house","guard-house at the gate")),'source-verified mapping must be registered: K00673 / KRU09415');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU09459','K00723',"calyx of flowers","calyx")),'source-verified mapping must be registered: K00723 / KRU09459');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU09473','K00741',"a mantle","a fine mantle")),'source-verified mapping must be registered: K00741 / KRU09473');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU17797','K01225',"bell","the shepherd’s bell")),'source-verified mapping must be registered: K01225 / KRU17797');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU10160','L00353',"hissing (of the serpent)","hissing")),'source-verified mapping must be registered: L00353 / KRU10160');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU10695','M00327',"whip","chastising whip")),'source-verified mapping must be registered: M00327 / KRU10695');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU10985','M00759',"channel","irrigating channel")),'source-verified mapping must be registered: M00759 / KRU10985');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU11012','M00857',"to protest","to protest against")),'source-verified mapping must be registered: M00857 / KRU11012');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU11063','M00885',"to remit (a debt)","to remit")),'source-verified mapping must be registered: M00885 / KRU11063');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU11381','M01370',"a kind of boat","boat")),'source-verified mapping must be registered: M01370 / KRU11381');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU11815','M02185',"cave","burial cave")),'source-verified mapping must be registered: M02185 / KRU11815');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU11881','M02294',"mouthpiece","overlaid mouthpiece")),'source-verified mapping must be registered: M02294 / KRU11881');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU11886','M02309',"to wring out","to wring")),'source-verified mapping must be registered: M02309 / KRU11886');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU11964','M02459',"teacher","primary teacher")),'source-verified mapping must be registered: M02459 / KRU11964');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU12686','N00704',"libation","the act of libation")),'source-verified mapping must be registered: N00704 / KRU12686');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU12707','N00737',"the constellation of Orion","Orion")),'source-verified mapping must be registered: N00737 / KRU12707');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU12741','N00795',"marriage","taking in marriage")),'source-verified mapping must be registered: N00795 / KRU12741');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU12768','N00854',"wooden) lid","lid")),'source-verified mapping must be registered: N00854 / KRU12768');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU12837','N00969',"tank of the press","tank")),'source-verified mapping must be registered: N00969 / KRU12837');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU13548','O00788',"clapping of the hands","clapping")),'source-verified mapping must be registered: O00788 / KRU13548');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU14428','P00605',"clapper","clapper of a bell.")),'source-verified mapping must be registered: P00605 / KRU14428');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU14762','P01174',"tying the sacrifice","tying")),'source-verified mapping must be registered: P01174 / KRU14762');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU15143','Q00341',"the festival of Purim","Purim")),'source-verified mapping must be registered: Q00341 / KRU15143');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU15254','Q00520',"jar","wine jar")),'source-verified mapping must be registered: Q00520 / KRU15254');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU15525','Q00979',"chest, box","money chest, jewelry box")),'source-verified mapping must be registered: Q00979 / KRU15525');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU16416','R00391',"bundle","tight bundle")),'source-verified mapping must be registered: R00391 / KRU16416');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU16742','S00205',"bluntness","bluntness of teeth")),'source-verified mapping must be registered: S00205 / KRU16742');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU16888','S00457',"cup","a rough-edged cup.")),'source-verified mapping must be registered: S00457 / KRU16888');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU16913','S00506',"handle","the handle of a hoe")),'source-verified mapping must be registered: S00506 / KRU16913');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU16985','S00631',"a kind of cups","cups")),'source-verified mapping must be registered: S00631 / KRU16985');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU16991','S00645',"croaking (raven)","croaking")),'source-verified mapping must be registered: S00645 / KRU16991');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU17095','S00855',"cluster of dates","cluster")),'source-verified mapping must be registered: S00855 / KRU17095');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU17103','S00870',"bowing","bowing to the ground")),'source-verified mapping must be registered: S00870 / KRU17103');
assert(U.reviewedSourceGlossPairs.has(decisionKey('KRU17187','S01017',"song","rhythmic song.")),'source-verified mapping must be registered: S01017 / KRU17187');
assert(U.reviewedSourceAlternativePairs.has(decisionKey('KRU03954','C00536',"circumcision","circumcision")),'source-verified alternative mapping must be registered: C00536 / KRU03954');
assert(U.reviewedSourceAlternativePairs.has(decisionKey('KRU03954','C00536',"feast of circumcision","feast of circumcision")),'source-verified alternative mapping must be registered: C00536 / KRU03954');
assert(U.reviewedSourceAlternativePairs.has(decisionKey('KRU03954','C00536',"the circumcised membrum","the circumcised membrum")),'source-verified alternative mapping must be registered: C00536 / KRU03954');
assert(U.reviewedSourceAlternativePairs.has(decisionKey('KRU04385','C01038',"to be bestowed","to be bestowed")),'source-verified alternative mapping must be registered: C01038 / KRU04385');
assert(U.reviewedSourceAlternativePairs.has(decisionKey('KRU04979','D00406',"to be suspended","to be pushed aside")),'source-verified alternative mapping must be registered: D00406 / KRU04979');
assert(U.reviewedSourceAlternativePairs.has(decisionKey('KRU04979','D00406',"to be suspended","suspended")),'source-verified alternative mapping must be registered: D00406 / KRU04979');
assert(U.rejectedSourceGlossPairs.has(decisionKey('KRU06547','G00654','dealer in leather bags','maker of and dealer in leather bags')),'known occupational false positives must be recorded as rejected');
assert(U.rejectedSourceGlossPairs.has(decisionKey('KRU10278','L00533','there is','there is (was) not')),'negative-particle distinctions must be recorded as rejected');
assert(U.rejectedSourceGlossPairs.has(decisionKey('KRU03526','C00053','The Most High','high, exalted, elevated')),'divine titles must not be merged with ordinary adjectives');
assert(U.rejectedSourceGlossPairs.has(decisionKey('KRU04694','D00017',"to flow out","to flow")),'reviewed decision must remain rejected: D00017 / KRU04694');
assert(U.rejectedSourceGlossPairs.has(decisionKey('KRU03682','C00244',"to cut, esp: to harvest dates","to cut into")),'reviewed false positive must remain rejected: C00244 / KRU03682');
assert(U.rejectedSourceGlossPairs.has(decisionKey('KRU03956','C00538',"to cut, to shear","to cut into, interrupt")),'reviewed false positive must remain rejected: C00538 / KRU03956');
assert(U.rejectedSourceGlossPairs.has(decisionKey('KRU04094','C00577',"cut, wound","what is to be cut")),'reviewed false positive must remain rejected: C00577 / KRU04094');
assert(U.rejectedSourceGlossPairs.has(decisionKey('KRU12418','N00250',"to conduct o. s.","to lead, conduct")),'reviewed candidate must remain rejected: N00250 / KRU12418');
assert(U.rejectedSourceGlossPairs.has(decisionKey('KRU15603','Q01116',"to roll onself","to roll in, cover with")),'reviewed candidate must remain rejected: Q01116 / KRU15603');
assert(U.rejectedSourceGlossPairs.has(decisionKey('KRU18682','U00438',"in the name of","name")),'reviewed candidate must remain rejected: U00438 / KRU18682');
assert(U.rejectedSourceGlossPairs.has(decisionKey('KRU18682','U00437',"in the name of","name, title;")),'reviewed candidate must remain rejected: U00437 / KRU18682');
assert(U.rejectedSourceGlossPairs.has(decisionKey('KRU20035','V00886',"the New Year’s day","the prayers on the New Year interspersed with blowing the Shofar, the Musaf of the New Year’s Day")),'reviewed candidate must remain rejected: V00886 / KRU20035');
assert(U.rejectedSourceGlossPairs.has(decisionKey('KRU03023','B00986',"royal seat, palace","of the palace")),'reviewed false positive must remain rejected: B00986 / KRU03023');
assert(U.rejectedSourceGlossPairs.has(decisionKey('KRU03220','B01135',"valley","Valley of")),'reviewed false positive must remain rejected: B01135 / KRU03220');
assert(U.rejectedSourceGlossPairs.has(decisionKey('KRU05415','D00950',"with the knowledge of, with the consent of","knowledge, mind; temperament, physical disposition, constitution")),'reviewed false positive must remain rejected: D00950 / KRU05415');
assert(U.rejectedSourceGlossPairs.has(decisionKey('KRU17926','T00128',"to lie","to lie with, copulate with, cover")),'reviewed false positive must remain rejected: T00128 / KRU17926');
assert(U.rejectedSourceGlossPairs.has(decisionKey('KRU18302','T00918',"to be broken in","to be broken")),'reviewed false positive must remain rejected: T00918 / KRU18302');
assert(U.rejectedSourceGlossPairs.has(decisionKey('KRU20168','V01113',"from below","below")),'reviewed false positive must remain rejected: V01113 / KRU20168');
assert(U.rejectedSourceGlossPairs.has(decisionKey('KRU16710','S00123',"holiness","his holiness")),'reviewed false positive must remain rejected: S00123 / KRU16710');
assert(U.deferredSourceGlossPairs.has(decisionKey('KRU06494','G00538','at times','times')),'ambiguous time/times candidates must remain deferred');
assert(U.deferredSourceGlossPairs.has(decisionKey('KRU14780','P01211',"to sting","to sting, prick")),'reviewed decision must remain deferred: P01211 / KRU14780');
assert(U.deferredSourceGlossPairs.has(decisionKey('KRU14780','P01211',"to prick, to taunt","to sting, prick")),'reviewed decision must remain deferred: P01211 / KRU14780');
assert(U.deferredSourceGlossPairs.has(decisionKey('KRU03808','C00369','clapper of a bell','clapper')),'cross-reference-only clapper candidate must remain deferred');
assert(U.deferredSourceGlossPairs.has(decisionKey('KRU06441','G00462',"claim","possession, taking possession, claim")),'one-to-many or source-uncertain candidate must remain deferred: G00462 / KRU06441');
assert(U.deferredSourceGlossPairs.has(decisionKey('KRU06441','G00462',"taking possession","possession, taking possession, claim")),'one-to-many or source-uncertain candidate must remain deferred: G00462 / KRU06441');
assert(U.deferredSourceGlossPairs.has(decisionKey('KRU19048','U01132',"apartment","dwelling, tent; apartment.")),'one-to-many or source-uncertain candidate must remain deferred: U01132 / KRU19048');
assert(U.deferredSourceGlossPairs.has(decisionKey('KRU19048','U01132',"tent dwelling","dwelling, tent; apartment.")),'one-to-many or source-uncertain candidate must remain deferred: U01132 / KRU19048');
assert(U.deferredSourceGlossPairs.has(decisionKey('KRU03320','B01237',"to hollow out, to perforate","to permeate, perforate")),'one-to-many or source-uncertain candidate must remain deferred: B01237 / KRU03320');
assert(U.deferredSourceGlossPairs.has(decisionKey('KRU07233','H01124','to be fine','to be smooth and fine')),'the potentially different smooth-edge sense must remain deferred');
assert(U.deferredSourceGlossPairs.has(decisionKey('KRU06406','G00388','trembling','trembling commotion')),'source-context-dependent trembling candidate must remain deferred');
assert(U.deferredSourceGlossPairs.has(decisionKey('KRU09361','K00605',"extremely tall","an extremely tall and unshapely person")),'source-uncertain candidate must remain deferred: K00605 / KRU09361');
assert(U.deferredSourceGlossPairs.has(decisionKey('KRU04979','D00406',"to push, to hurry","to push away, thrust")),'source-uncertain candidate must remain deferred: D00406 / KRU04979');
assert(U.deferredSourceGlossPairs.has(decisionKey('KRU10160','L00353',"whisper","whisper; spell, charm")),'multi-sense or grammatical-direction candidate must remain deferred: L00353 / KRU10160');
assert(U.deferredSourceGlossPairs.has(decisionKey('KRU10170','L00372',"to whisper","to whisper, hiss")),'multi-sense or grammatical-direction candidate must remain deferred: L00372 / KRU10170');
assert(U.deferredSourceGlossPairs.has(decisionKey('KRU10170','L00372',"to whisper a charm","to whisper")),'multi-sense or grammatical-direction candidate must remain deferred: L00372 / KRU10170');
assert(U.deferredSourceGlossPairs.has(decisionKey('KRU10170','L00372',"to whisper a charm","to whisper, hiss")),'multi-sense or grammatical-direction candidate must remain deferred: L00372 / KRU10170');
assert(U.deferredSourceGlossPairs.has(decisionKey('KRU11063','M00885',"to be forgiven, to be pardoned","to be cancelled; to be forgiven, pardoned")),'multi-sense or grammatical-direction candidate must remain deferred: M00885 / KRU11063');
assert(U.deferredSourceGlossPairs.has(decisionKey('KRU11063','M00885',"to be cancelled","to be cancelled; to be forgiven, pardoned")),'multi-sense or grammatical-direction candidate must remain deferred: M00885 / KRU11063');
assert(U.deferredSourceGlossPairs.has(decisionKey('KRU11886','M02309',"to suck","to give suck")),'multi-sense or grammatical-direction candidate must remain deferred: M02309 / KRU11886');
assert(U.deferredSourceGlossPairs.has(decisionKey('KRU12863','N01026',"to blow (fire)","to blow")),'stem or combined-sense candidate must remain deferred: N01026 / KRU12863');
assert(U.deferredSourceGlossPairs.has(decisionKey('KRU14001','O01596',"to smell badly, to be spoiled","to decay, be spoiled; to smell offensively")),'stem or combined-sense candidate must remain deferred: O01596 / KRU14001');
assert(U.deferredSourceGlossPairs.has(decisionKey('KRU14001','O01596',"to corrupt","to make offensive, unsavory; to corrupt")),'stem or combined-sense candidate must remain deferred: O01596 / KRU14001');
assert(U.deferredSourceGlossPairs.has(decisionKey('KRU14001','O01596',"to make unsavory","to make offensive, unsavory; to corrupt")),'stem or combined-sense candidate must remain deferred: O01596 / KRU14001');
assert(U.deferredSourceGlossPairs.has(decisionKey('KRU17477','S01557','court','large court')),'the large-centenaria/courtyard candidate must remain deferred');
assert(U.deferredSourceGlossPairs.has(decisionKey('KRU03613','C00166',"to cut off, to level","to cut, cut off.")),'morphology/one-to-many candidate must remain deferred: C00166 / KRU03613');
assert(U.deferredSourceGlossPairs.has(decisionKey('KRU03613','C00166',"to cut, to cut off","to cut off, level")),'morphology/one-to-many candidate must remain deferred: C00166 / KRU03613');
assert(U.deferredSourceGlossPairs.has(decisionKey('KRU18284','T00889',"to lead to pasture","to lead, pasture, feed")),'morphology/one-to-many candidate must remain deferred: T00889 / KRU18284');
assert(U.deferredSourceGlossPairs.has(decisionKey('KRU18292','T00889',"to lead to pasture","to lead, pasture, feed")),'morphology/one-to-many candidate must remain deferred: T00889 / KRU18292');
assert(U.deferredSourceGlossPairs.has(decisionKey('KRU15318','Q00616',"compounding ingredients","compounding, manufacturing; ingredients")),'morphology/one-to-many candidate must remain deferred: Q00616 / KRU15318');
assert(U.deferredSourceGlossPairs.has(decisionKey('KRU19012','U01042',"covering","sinking, covering up")),'reviewed ambiguous candidate must remain deferred: U01042 / KRU19012');
assert(U.deferredSourceGlossPairs.has(decisionKey('KRU01114','A01696',"to be burnt","to be consumed, burnt up, digested")),'reviewed candidate must remain deferred: A01696 / KRU01114');
assert(U.deferredSourceGlossPairs.has(decisionKey('KRU06564','G00686',"to arm o. s.","to tie around, gird, arm; to harness, saddle")),'reviewed candidate must remain deferred: G00686 / KRU06564');
assert(U.deferredSourceGlossPairs.has(decisionKey('KRU09659','K01007',"to bend","to bend over, invert, turn upside down")),'reviewed candidate must remain deferred: K01007 / KRU09659');
assert(U.deferredSourceGlossPairs.has(decisionKey('KRU11079','M00922',"half to half; at an equal distance from each","division, half.")),'reviewed candidate must remain deferred: M00922 / KRU11079');
assert(U.deferredSourceGlossPairs.has(decisionKey('KRU12418','N00250',"to apply, to be wont to","to lead, conduct; to demean one’s self; to be guided by, be wont to; to apply, be practiced")),'reviewed candidate must remain deferred: N00250 / KRU12418');
assert(U.deferredSourceGlossPairs.has(decisionKey('KRU12418','N00250',"to conduct o. s.","to lead, conduct; to demean one’s self; to be guided by, be wont to; to apply, be practiced")),'reviewed candidate must remain deferred: N00250 / KRU12418');
assert(U.deferredSourceGlossPairs.has(decisionKey('KRU15633','Q01188',"to turn","to turn around, go away")),'reviewed candidate must remain deferred: Q01188 / KRU15633');
assert(U.deferredSourceGlossPairs.has(decisionKey('KRU15633','Q01188',"to turn","to turn aside, go out")),'reviewed candidate must remain deferred: Q01188 / KRU15633');
assert(U.deferredSourceGlossPairs.has(decisionKey('KRU15633','Q01188',"to ease nature","to ease one’s self")),'reviewed candidate must remain deferred: Q01188 / KRU15633');
assert(U.deferredSourceGlossPairs.has(decisionKey('KRU15633','Q01188',"to be removed","to be removed, to die")),'reviewed candidate must remain deferred: Q01188 / KRU15633');
assert(U.deferredSourceGlossPairs.has(decisionKey('KRU15633','Q01188',"to be removed","to be vacated, cleared, removed")),'reviewed candidate must remain deferred: Q01188 / KRU15633');
assert(U.deferredSourceGlossPairs.has(decisionKey('KRU17819','S02236',"to be hard","to be hard on, press heavily")),'reviewed candidate must remain deferred: S02236 / KRU17819');
assert(U.deferredSourceGlossPairs.has(decisionKey('KRU12466','N00341',"to put down","to rest, put down; to leave alone")),'reviewed ambiguous candidate must remain deferred: N00341 / KRU12466');
assert(U.deferredSourceGlossPairs.has(decisionKey('KRU12466','N00341',"to rest","to rest, put down; to leave alone")),'reviewed ambiguous candidate must remain deferred: N00341 / KRU12466');
assert(U.deferredSourceGlossPairs.has(decisionKey('KRU13990','O01573',"to smell badly","to evaporate, be decomposed; to decay; to smell badly")),'reviewed ambiguous candidate must remain deferred: O01573 / KRU13990');
assert(U.deferredSourceGlossPairs.has(decisionKey('KRU13990','O01573',"to smell badly","to become vapid, putrid; to smell badly")),'reviewed ambiguous candidate must remain deferred: O01573 / KRU13990');
assert(U.deferredSourceGlossPairs.has(decisionKey('KRU16803','S00315',"light matter), lenient practice","light matter.")),'reviewed ambiguous candidate must remain deferred: S00315 / KRU16803');
assert(U.deferredSourceGlossPairs.has(decisionKey('KRU16803','S00315',"light matter), lenient practice","lenient practice")),'reviewed ambiguous candidate must remain deferred: S00315 / KRU16803');
assert(U.deferredSourceGlossPairs.has(decisionKey('KRU01042','A01574',"pressure","squeezing, pressure")),'reviewed ambiguous candidate must remain deferred: A01574 / KRU01042');
assert(U.deferredSourceGlossPairs.has(decisionKey('KRU01043','A01574',"squeezing","squeezing, pressure")),'reviewed ambiguous candidate must remain deferred: A01574 / KRU01043');
assert(U.deferredSourceGlossPairs.has(decisionKey('KRU01145','A01737',"stranger","stranger, guest, lodger;")),'reviewed ambiguous candidate must remain deferred: A01737 / KRU01145');
assert(U.deferredSourceGlossPairs.has(decisionKey('KRU01145','A01737',"guest","stranger, guest, lodger;")),'reviewed ambiguous candidate must remain deferred: A01737 / KRU01145');
assert(U.deferredSourceGlossPairs.has(decisionKey('KRU01172','A01772',"rather, but","if not, except, but, only")),'reviewed ambiguous candidate must remain deferred: A01772 / KRU01172');
assert(U.deferredSourceGlossPairs.has(decisionKey('KRU01172','A01772',"rather, but","but")),'reviewed ambiguous candidate must remain deferred: A01772 / KRU01172');
assert(U.deferredSourceGlossPairs.has(decisionKey('KRU15729','Q01325',"to disqualify, to declare unfit, to reject","to disqualify, to be the cause of disqualification of; to declare unfit")),'reviewed ambiguous candidate must remain deferred: Q01325 / KRU15729');
const makerAndDealerRemainDistinct=U.merge([
 {id:6547,entry:sourceByRef.get('KRU06547'),meanings:[{text:'dealer in leather bags',label:''}]},
 {id:6546,entry:sourceByRef.get('G00654'),meanings:[{text:'maker of and dealer in leather bags',label:''}]}
],S.normalize(sourceByRef.get('KRU06547').h));
assert.equal(makerAndDealerRemainDistinct.length,2,'maker and dealer are not equivalent occupational definitions and must not merge');

const slantingCutConsolidation=U.merge([
 {id:5633,entry:sourceByRef.get('KRU05633'),meanings:[{text:'cutting the animal’s throat in a slanting direction (letting the knife slide beyond the space ritually designated for cutting)',label:''}]},
 {id:92,entry:sourceByRef.get('E00092'),meanings:[{text:'cutting the animal’s throat in a slanting direction',label:''}]}
],S.normalize(sourceByRef.get('KRU05633').h));
assert.equal(slantingCutConsolidation.length,1,'the two source definitions of the slanting slaughter cut should consolidate');
assert.equal(slantingCutConsolidation[0].sources.length,2,'both legal source records should remain available');
assert.equal(slantingCutConsolidation[0].text,'cutting the animal’s throat in a slanting direction (letting the knife slide beyond the space ritually designated for cutting)','the fuller legal definition should display once');

const legalPossessionSegments=U.merge([
 {id:6888,entry:sourceByRef.get('KRU06888'),meanings:[{text:'claim based on undisturbed possession during a legally fixed period',label:'2'}]},
 {id:556,entry:sourceByRef.get('H00556'),meanings:[{text:'taking possession, possession, usucaption; claim based on undisturbed possession',label:'2'}]}
],S.normalize(sourceByRef.get('KRU06888').h));
assert.equal(legalPossessionSegments.length,2,'only the shared legal-possession claim should merge; taking possession remains a separate sense');
const legalPossessionClaim=legalPossessionSegments.find(group=>group.sources.length===2);
assert(legalPossessionClaim,'the undisturbed-possession claim should consolidate across both sources');
assert.equal(legalPossessionClaim.text,'claim based on undisturbed possession during a legally fixed period','the fuller legal definition should display once');
assert(legalPossessionSegments.some(group=>group.text==='taking possession, possession, usucaption'&&group.sources.length===1),'the separate taking-possession sense must remain independent');

const customaryMeasure=U.merge([
 {id:6183,entry:sourceByRef.get('KRU06183'),meanings:[{text:'relinquishment, addition to exact measure',label:''}]},
 {id:50,entry:sourceByRef.get('F00050'),meanings:[{text:'the retailer’s customary addition to exact measure',label:''}]}
],S.normalize(sourceByRef.get('KRU06183').h));
assert.equal(customaryMeasure.length,1,'the retailer’s customary extra measure should consolidate across both dictionaries');
assert.equal(customaryMeasure[0].sources.length,2,'both Nedarim source records should remain available');
assert.equal(customaryMeasure[0].text,'the retailer’s customary addition to exact measure','the precise commercial meaning should display once');

const breadAndOlives=U.merge([
 {id:4289,entry:sourceByRef.get('KRU04289'),meanings:[
  {text:'a white and delicate bread',label:'1'},
  {text:'a superior sort of olives',label:'2'}
 ]},
 {id:907,entry:sourceByRef.get('C00907'),meanings:[
  {text:'a white and delicate bread',label:''},
  {text:'a superior sort of olives already pressed when appearing in the market',label:''}
 ]}
],S.normalize(sourceByRef.get('KRU04289').h));
assert.equal(breadAndOlives.length,2,'the bread and olive meanings of this headword must remain separate');
assert(breadAndOlives.every(group=>group.sources.length===2),'each independently matching food sense should retain both sources');
assert.equal(breadAndOlives.find(group=>group.text.includes('olives'))?.text,'a superior sort of olives already pressed when appearing in the market','the fuller olive definition should display once');

const sabbathCampSenses=U.merge([
 {id:18541,entry:sourceByRef.get('KRU18541'),meanings:[
  {text:'to stay over the Sabbath',label:'1'},
  {text:'to appoint a Sabbath camp as the center for Sabbath movement',label:'2'}
 ]},
 {id:198,entry:sourceByRef.get('U00198'),meanings:[
  {text:'to stay over the Sabbath',label:'2'},
  {text:'to appoint a Sabbath camp',label:'3'}
 ]}
],S.normalize(sourceByRef.get('KRU18541').h));
assert.equal(sabbathCampSenses.length,2,'staying over the Sabbath and appointing a Sabbath camp are distinct senses');
assert(sabbathCampSenses.every(group=>group.sources.length===2),'each corresponding Sabbath sense should retain both dictionary sources');
assert.equal(sabbathCampSenses.find(group=>group.text.includes('appoint'))?.text,'to appoint a Sabbath camp as the center for Sabbath movement','the fuller legal explanation should display once');

const comparativeLike=U.merge([
 {id:9504,entry:sourceByRef.get('KRU09504'),meanings:[
  {text:'like',label:'1'},
  {text:'how!',label:'2'}
 ]},
 {id:786,entry:sourceByRef.get('K00786'),meanings:[
  {text:'like that which',label:'1'},
  {text:'how! how many!, how much!, how long!',label:'2'}
 ]}
],S.normalize(sourceByRef.get('KRU09504').h));
const likeGroup=comparativeLike.find(group=>group.sources.some(source=>source.entry.r==='KRU09504')&&group.sources.some(source=>source.entry.r==='K00786'));
assert(likeGroup,'the comparative "like that which" sense should consolidate');
assert.equal(likeGroup.text,'like that which','the more precise prepositional definition should display once');
assert(comparativeLike.some(group=>group.text.toLowerCase().includes('how!')),'the separate interrogative sense must remain visible');
assert(comparativeLike.length>=2,'the comparative and interrogative senses must not collapse into one result');

const siegeEngines=U.merge([
 {id:3174,entry:sourceByRef.get('KRU03174'),meanings:[{text:'engines of siege or defence',label:''}]},
 {id:1081,entry:sourceByRef.get('B01081'),meanings:[{text:'engines of siege',label:''}]}
],S.normalize(sourceByRef.get('KRU03174').h));
assert.equal(siegeEngines.length,1,'the two siege-engine definitions should consolidate');
assert.equal(siegeEngines[0].sources.length,2,'both Pesikta source records should remain available');
assert.equal(siegeEngines[0].text,'engines of siege or defence','the fuller definition should display once');

const priestlyDescent=U.merge([
 {id:9073,entry:sourceByRef.get('KRU09073'),meanings:[{text:'of priestly descent',label:''}]},
 {id:168,entry:sourceByRef.get('K00168'),meanings:[{text:'one proving priestly descent, belonging to the priestly caste',label:''}]}
],S.normalize(sourceByRef.get('KRU09073').h));
assert.equal(priestlyDescent.length,1,'the priestly-descent definitions should consolidate');
assert.equal(priestlyDescent[0].sources.length,2,'both Kiddushin source records should remain available');
assert.equal(priestlyDescent[0].text,'one proving priestly descent, belonging to the priestly caste','the fuller definition should display once');

const ashCoveringSenses=U.merge([
 {id:17059,entry:sourceByRef.get('KRU17059'),meanings:[
  {text:'to cut, to clip',label:'1'},
  {text:'to cover embers with ashes',label:'2'},
  {text:'to be broken off',label:'3'}
 ]},
 {id:787,entry:sourceByRef.get('S00787'),meanings:[{text:'to cover with ashes',label:''}]}
],S.normalize(sourceByRef.get('KRU17059').h));
assert.equal(ashCoveringSenses.length,3,'the ash-covering sense should merge without absorbing cutting or breaking off');
assert.equal(ashCoveringSenses.find(group=>group.sources.length===2)?.text,'to cover embers with ashes','the specific Sabbath use should display once');
assert(ashCoveringSenses.some(group=>group.text==='to cut, to clip'&&group.sources.length===1),'the cutting sense must remain separate');
assert(ashCoveringSenses.some(group=>group.text==='to be broken off'&&group.sources.length===1),'the broken-off sense must remain separate');

const clayDamLayer=U.merge([
 {id:8204,entry:sourceByRef.get('KRU08204'),meanings:[{text:'second layer of a clay dam',label:''}]},
 {id:688,entry:sourceByRef.get('I00688'),meanings:[{text:'additional, second layer',label:''}]}
],S.normalize(sourceByRef.get('KRU08204').h));
assert.equal(clayDamLayer.length,1,'the additional clay-dam layer should consolidate');
assert.equal(clayDamLayer[0].sources.length,2,'both Bava Metzia source records should remain available');
assert.equal(clayDamLayer[0].text,'additional, second layer of a clay dam','the combined technical definition should display once');

const priceAndSpreading=U.merge([
 {id:15393,entry:sourceByRef.get('KRU15393'),meanings:[
  {text:'setting a price',label:'2'},
  {text:'spreading, straddling',label:'3'}
 ]},
 {id:751,entry:sourceByRef.get('Q00751'),meanings:[
  {text:'the division of words into clauses in accordance with the sense, punctuation',label:'2'},
  {text:'setting a price on fruits before they are harvested',label:'3'},
  {text:'spreading the feet',label:'4'}
 ]}
],S.normalize(sourceByRef.get('KRU15393').h));
assert.equal(priceAndSpreading.length,3,'price-setting and spreading are separate senses; punctuation remains independent');
assert.equal(priceAndSpreading.filter(group=>group.sources.length===2).length,2,'both source-attested price and spreading senses should consolidate');
assert(priceAndSpreading.some(group=>group.text.includes('setting a price on fruits before they are harvested')&&group.sources.length===2),'the specific fruit-price sense should display once');
assert(priceAndSpreading.some(group=>group.text==='spreading the feet'&&group.sources.length===2),'the physical spreading sense should display once');
assert(priceAndSpreading.some(group=>group.text.includes('punctuation')&&group.sources.length===1),'the punctuation sense must remain independent');

const dyePlantJuice=U.merge([
 {id:10283,entry:sourceByRef.get('KRU10283'),meanings:[{text:'juice of a plant used for dyeing',label:''}]},
 {id:537,entry:sourceByRef.get('L00537'),meanings:[{text:'juice of a plant',label:''}]}
],S.normalize(sourceByRef.get('KRU10283').h));
assert.equal(dyePlantJuice.length,1,'the dye-producing plant juice should consolidate');
assert.equal(dyePlantJuice[0].sources.length,2,'both Hullin source records should remain available');
assert.equal(dyePlantJuice[0].text,'juice of a plant used for dyeing','the full technical definition should display once');

const sycamoreSpecies=U.merge([
 {id:4824,entry:sourceByRef.get('KRU04824'),meanings:[
  {text:'a species of sycamore',label:'1'},
  {text:'unripe fig',label:'2'}
 ]},
 {id:175,entry:sourceByRef.get('D00175'),meanings:[{text:'a species of figs or sycamore',label:''}]}
],S.normalize(sourceByRef.get('KRU04824').h));
assert.equal(sycamoreSpecies.length,2,'the sycamore sense should merge while the unripe-fig sense stays distinct');
assert.equal(sycamoreSpecies.find(group=>group.sources.length===2)?.text,'a species of sycamore','the more specific botanical identification should display once');
assert(sycamoreSpecies.some(group=>group.text==='unripe fig'&&group.sources.length===1),'the separate unripe-fig meaning must remain independent');

const upperGarment=U.merge([
 {id:11938,entry:sourceByRef.get('KRU11938'),meanings:[{text:'an upper garment',label:''}]},
 {id:2411,entry:sourceByRef.get('M02411'),meanings:[{text:'the upper garment with the girdle, walking cloak',label:''}]}
],S.normalize(sourceByRef.get('KRU11938').h));
assert.equal(upperGarment.length,1,'the upper-garment definitions should consolidate');
assert.equal(upperGarment[0].sources.length,2,'both Yerushalmi source records should remain available');
assert.equal(upperGarment[0].text,'the upper garment with the girdle, walking cloak','the more precise garment definition should display once');

const caprificationBranch=U.merge([
 {id:4375,entry:sourceByRef.get('KRU04375'),meanings:[{text:'a branch used for caprification',label:'1'}]},
 {id:1017,entry:sourceByRef.get('C01017'),meanings:[
  {text:'branches used for caprification',label:'1'},
  {text:'fruits ripened through caprification',label:'2'}
 ]}
],S.normalize(sourceByRef.get('KRU04375').h));
assert.equal(caprificationBranch.length,2,'the caprification branch and the fruit produced by caprification are distinct');
assert.equal(caprificationBranch.find(group=>group.sources.length===2)?.text,'branches used for caprification','the branch definition should consolidate once');
assert(caprificationBranch.some(group=>group.text==='fruits ripened through caprification'&&group.sources.length===1),'the separate fruit sense must remain independent');

const sacredObjectRemoval=U.merge([
 {id:4462,entry:sourceByRef.get('KRU04462'),meanings:[{text:'removal of sacred object',label:''}]},
 {id:1140,entry:sourceByRef.get('C01140'),meanings:[{text:'removal of sacred objects',label:''}]}
],S.normalize(sourceByRef.get('KRU04462').h));
assert.equal(sacredObjectRemoval.length,1,'the sacred-object removal definitions should consolidate');
assert.equal(sacredObjectRemoval[0].sources.length,2,'both Shabbat source records should remain available');
assert.equal(sacredObjectRemoval[0].text,'removal of sacred objects','the normalized plural wording should display once');

const quinceRoseMarmalade=U.merge([
 {id:5533,entry:sourceByRef.get('KRU05533'),meanings:[{text:'a marmalade of quinces and roses',label:''}]},
 {id:1107,entry:sourceByRef.get('D01107'),meanings:[{text:'a marmelade of quinces and roses',label:''}]}
],S.normalize(sourceByRef.get('KRU05533').h));
assert.equal(quinceRoseMarmalade.length,1,'the quince-and-rose marmalade definitions should consolidate');
assert.equal(quinceRoseMarmalade[0].sources.length,2,'both Yerushalmi Sheviit source records should remain available');
assert.equal(quinceRoseMarmalade[0].text,'a marmalade of quinces and roses','the corrected spelling should display once');

const ownerlessPropertyWatching=U.merge([
 {id:5597,entry:sourceByRef.get('KRU05597'),meanings:[{text:'watching ownerless objects',label:'2'}]},
 {id:33,entry:sourceByRef.get('E00033'),meanings:[{text:'superintendence, watching owner-less objects',label:'2'}]}
],S.normalize(sourceByRef.get('KRU05597').h));
assert.equal(ownerlessPropertyWatching.length,1,'the legal watching of ownerless property should consolidate');
assert.equal(ownerlessPropertyWatching[0].sources.length,2,'both Bava Metzia source records should remain available');
assert.equal(ownerlessPropertyWatching[0].text,'superintendence, watching ownerless objects','the fuller legal definition should display once');

const gapStopper=U.merge([
 {id:6956,entry:sourceByRef.get('KRU06956'),meanings:[{text:'stopper, insertion (to fill a gap)',label:''}]},
 {id:665,entry:sourceByRef.get('H00665'),meanings:[{text:'that which is sqeezed in to fill a gap, repair, insertion',label:''}]}
],S.normalize(sourceByRef.get('KRU06956').h));
assert.equal(gapStopper.length,1,'the gap-stopper definitions should consolidate');
assert.equal(gapStopper[0].sources.length,2,'both Hullin source records should remain available');
assert.equal(gapStopper[0].text,'stopper, insertion (to fill a gap)','the concise technical definition should display once');

const oliveShrivelling=U.merge([
 {id:4552,entry:sourceByRef.get('KRU04552'),meanings:[{text:'to let the olives shrivel',label:'3'}]},
 {id:1255,entry:sourceByRef.get('C01255'),meanings:[{text:'to let the olive shrivel',label:'3'}]}
],S.normalize(sourceByRef.get('KRU04552').h));
assert.equal(oliveShrivelling.length,1,'the olive-shrivelling definitions should consolidate');
assert.equal(oliveShrivelling[0].sources.length,2,'both Menachot source records should remain available');
assert.equal(oliveShrivelling[0].text,'to let the olive shrivel','the normalized olive-shrivelling wording should display once');

const birdCraw=U.merge([
 {id:16989,entry:sourceByRef.get('KRU16989'),meanings:[
  {text:'stomach of birds',label:'1'},
  {text:'stomach of man',label:'2'}
 ]},
 {id:640,entry:sourceByRef.get('S00640'),meanings:[{text:'the thick muscular stomach of birds, craw',label:''}]}
],S.normalize(sourceByRef.get('KRU16989').h));
assert.equal(birdCraw.length,2,'the bird-craw sense should merge without absorbing the human-stomach sense');
assert.equal(birdCraw.find(group=>group.sources.length===2)?.text,'the thick muscular stomach of birds, craw','the precise bird anatomy definition should display once');
assert(birdCraw.some(group=>group.text==='stomach of man'&&group.sources.length===1),'the human-stomach sense must remain separate');

const templeAppearance=U.merge([
 {id:17864,entry:sourceByRef.get('KRU17864'),meanings:[
  {text:'seeing',label:'1'},
  {text:'attack of pollution, menstruation',label:'2'},
  {text:'appearance in the Temple (on the three festivals)',label:'3'}
 ]},
 {id:15,entry:sourceByRef.get('T00015'),meanings:[{text:'appearance in the Temple, pilgrimage',label:''}]}
],S.normalize(sourceByRef.get('KRU17864').h));
assert.equal(templeAppearance.length,3,'the Temple-appearance sense should merge while unrelated senses remain distinct');
assert.equal(templeAppearance.find(group=>group.sources.length===2)?.text,'appearance in the Temple (on the three festivals)','the festival obligation should display with its precise scope');
assert(templeAppearance.some(group=>group.text==='seeing'&&group.sources.length===1),'the seeing sense must not be absorbed');
assert(templeAppearance.some(group=>group.text==='attack of pollution, menstruation'&&group.sources.length===1),'the separate medical sense must not be absorbed');

const firstRipeningSense=U.merge([
 {id:2827,entry:sourceByRef.get('KRU02827'),meanings:[
  {text:'to bear for the first time',label:'1'},
  {text:'to bear first fruits',label:'2'},
  {text:'to be first in ripening',label:'3'}
 ]},
 {id:794,entry:sourceByRef.get('B00794'),meanings:[
  {text:'to bear for the first time',label:'1'},
  {text:'to be early, produce first fruits',label:'3'}
 ]}
],S.normalize(sourceByRef.get('KRU02827').h));
const firstRipeningGroup=firstRipeningSense.find(group=>group.sources.length===2&&group.text==='to be first in ripening');
assert(firstRipeningGroup,'the first-ripening definitions should consolidate');
assert(firstRipeningSense.some(group=>group.text==='to bear first fruits'&&group.sources.length===1),'the separate first-fruits sense must remain independent');
assert(!firstRipeningSense.some(group=>group.text.includes('to bear first fruits')&&group.sources.length===2),'the first-fruits sense must not be absorbed into the first-ripening match');

const animalAfflictedWithDisease=U.merge([
 {id:8294,entry:sourceByRef.get('KRU08294'),meanings:[{text:'an animal afflicted with an organic disease',label:'1'}]},
 {id:811,entry:sourceByRef.get('I00811'),meanings:[
  {text:'an animal afflicted with a',label:'2'},
  {text:'organic disease',label:'3'}
 ]}
],S.normalize(sourceByRef.get('KRU08294').h));
assert.equal(animalAfflictedWithDisease.length,2,'the animal-disease sense should merge without absorbing the separate disease definition');
assert.equal(animalAfflictedWithDisease.find(group=>group.sources.length===2)?.text,'an animal afflicted with an organic disease','the complete animal-disease definition should display once');
assert(animalAfflictedWithDisease.some(group=>group.text==='organic disease'&&group.sources.length===1),'the separate organic-disease sense must remain independent');

const fecalMassAndUrine=U.merge([
 {id:14617,entry:sourceByRef.get('KRU14617'),meanings:[{text:'fecal mass; jet of urine',label:'4'}]},
 {id:866,entry:sourceByRef.get('P00866'),meanings:[{text:'the fecal mass in the rectum;',label:''}]}
],S.normalize(sourceByRef.get('KRU14617').h));
assert.equal(fecalMassAndUrine.length,2,'the fecal-mass and urine-jet senses must remain separate');
assert.equal(fecalMassAndUrine.find(group=>group.sources.length===2)?.text,'the fecal mass in the rectum','only the fecal-mass segment should consolidate');
assert(fecalMassAndUrine.some(group=>group.text==='jet of urine'&&group.sources.length===1),'the separate urine-jet sense must remain independent');

const centralOnionStalk=U.merge([
 {id:14617,entry:sourceByRef.get('KRU14617'),meanings:[{text:'stalk',label:'3'}]},
 {id:866,entry:sourceByRef.get('P00866'),meanings:[{text:'the central stalk of onions',label:''}]}
],S.normalize(sourceByRef.get('KRU14617').h));
assert.equal(centralOnionStalk.length,1,'the botanical central-stalk definitions should consolidate');
assert.equal(centralOnionStalk[0].sources.length,2,'both botanical source records should remain available');
assert.equal(centralOnionStalk[0].text,'the central stalk of onions','the precise botanical definition should display once');

const newMoonProclamation=U.merge([
 {id:17105,entry:sourceByRef.get('KRU17105'),meanings:[
  {text:'sanctification',label:'1'},
  {text:'the Kiddusch, (proclamation of the sanctity of Sabbath or Holy Day)',label:'2'},
  {text:'washing hands and feet prior to a priestly function in the Temple',label:'3'},
  {text:'proclamation of the New Moon or the New Year',label:'4'}
 ]},
 {id:873,entry:sourceByRef.get('S00873'),meanings:[{text:'of the New Moon, seasons',label:''}]}
],S.normalize(sourceByRef.get('KRU17105').h));
assert.equal(newMoonProclamation.length,4,'the New-Moon proclamation should merge without absorbing other Kiddush senses');
assert.equal(newMoonProclamation.find(group=>group.sources.length===2)?.text,'proclamation of the New Moon or the New Year','the complete New-Moon definition should display once');
assert.equal(newMoonProclamation.filter(group=>group.sources.length===1).length,3,'sanctification, Kiddush, and priestly washing remain separate');

const olivePressBale=U.merge([
 {id:14773,entry:sourceByRef.get('KRU14773'),meanings:[{text:'a bale containing the olives to be pressed',label:'1'}]},
 {id:1192,entry:sourceByRef.get('P01192'),meanings:[
  {text:'a bale of loose texture containing the olive pulp to be pressed',label:'1'},
  {text:'a mass of iron used for ballast',label:'2'}
 ]}
],S.normalize(sourceByRef.get('KRU14773').h));
assert.equal(olivePressBale.length,2,'the olive-press bale should merge while the iron-ballast sense remains distinct');
assert.equal(olivePressBale.find(group=>group.sources.length===2)?.text,'a bale of loose texture containing the olive pulp to be pressed','the precise olive-press definition should display once');
assert(olivePressBale.some(group=>group.text==='a mass of iron used for ballast'&&group.sources.length===1),'the unrelated ballast sense must remain independent');

const myrrhBecomesBitter=U.merge([
 {id:12105,entry:sourceByRef.get('KRU12105'),meanings:[{text:'to become bitter',label:'Hithpa.'}]},
 {id:2773,entry:sourceByRef.get('M02773'),meanings:[
  {text:'to make bitter',label:'Piel'},
  {text:'to become sticky and bitter',label:'Hithpa.'}
 ]}
],S.normalize(sourceByRef.get('KRU12105').h));
assert.equal(myrrhBecomesBitter.length,2,'the intransitive myrrh sense should merge without absorbing the active causative sense');
assert.equal(myrrhBecomesBitter.find(group=>group.sources.length===2)?.text,'to become sticky and bitter','the fuller myrrh-handling definition should display once');
assert(myrrhBecomesBitter.some(group=>group.text==='to make bitter'&&group.sources.length===1),'the active "to make bitter" sense must remain independent');

const fixedRentAndTenant=U.merge([
 {id:7111,entry:sourceByRef.get('KRU07111'),meanings:[
  {text:'tenant on a fixed rent payable in kind',label:'1'},
  {text:'rent',label:'2'}
 ]},
 {id:931,entry:sourceByRef.get('H00931'),meanings:[
  {text:'tenant',label:'1'},
  {text:'the fixed annual rent in kind',label:'2'}
 ]}
],S.normalize(sourceByRef.get('KRU07111').h));
assert.equal(fixedRentAndTenant.length,2,'tenant and rent must be two separate dictionary senses');
assert.equal(fixedRentAndTenant.filter(group=>group.sources.length===2).length,2,'each tenant/rent sense should match its own Krupnik record');
assert(fixedRentAndTenant.some(group=>group.text==='tenant on a fixed rent payable in kind'&&group.sources.length===2),'the tenant definition should consolidate independently');
assert(fixedRentAndTenant.some(group=>group.text==='the fixed annual rent in kind'&&group.sources.length===2),'the annual-rent definition should consolidate independently');

const rearingOfChildren=U.merge([
 {id:4045,entry:sourceByRef.get('KRU04045'),meanings:[{text:'rearing (of children)',label:''}]},
 {id:635,entry:sourceByRef.get('C00635'),meanings:[
  {text:'rearing',label:''},
  {text:'growth',label:''},
  {text:'raising to dignity, elevation',label:''}
 ]}
],S.normalize(sourceByRef.get('KRU04045').h));
assert.equal(rearingOfChildren.find(group=>group.sources.length===2)?.text,'rearing (of children)','the child-rearing qualifier should display once');
assert(rearingOfChildren.some(group=>group.text==='growth'&&group.sources.length===1),'the separate growth sense remains independent');
assert(rearingOfChildren.some(group=>group.text==='raising to dignity, elevation'&&group.sources.length===1),'the separate elevation sense remains independent');

const peatAndTurf=U.merge([
 {id:4194,entry:sourceByRef.get('KRU04194'),meanings:[{text:'turf or peat',label:''}]},
 {id:799,entry:sourceByRef.get('C00799'),meanings:[{text:'peat',label:''}]}
],S.normalize(sourceByRef.get('KRU04194').h));
assert.equal(peatAndTurf.length,1,'the two definitions of the peat/turf material should consolidate');
assert.equal(peatAndTurf[0].text,'turf or peat','the fuller source wording should display once');

const gnawingByMice=U.merge([
 {id:3897,entry:sourceByRef.get('KRU03897'),meanings:[{text:'to gnaw (of mice)',label:''}]},
 {id:469,entry:sourceByRef.get('C00469'),meanings:[{text:'to gnaw',label:''}]}
],S.normalize(sourceByRef.get('KRU03897').h));
assert.equal(gnawingByMice.length,1,'the definitions of gnawing by mice should consolidate');
assert.equal(gnawingByMice[0].text,'to gnaw (of mice)','the zoological qualifier should be retained');

const lowingOxen=U.merge([
 {id:4099,entry:sourceByRef.get('KRU04099'),meanings:[
  {text:'to break forth',label:''},
  {text:'to low (of oxen)',label:''}
 ]},
 {id:690,entry:sourceByRef.get('C00690'),meanings:[
  {text:'to break forth, stir up',label:''},
  {text:'to low',label:''}
 ]}
],S.normalize(sourceByRef.get('KRU04099').h));
assert(lowingOxen.some(group=>group.sources.length===2&&group.text==='to low (of oxen)'),'both sources should support the lowing sense');
assert(lowingOxen.some(group=>group.sources.length===2&&group.text.includes('to break forth')),'the separate breaking-forth sense should remain independently mapped');

const mortalHuman=U.merge([
 {id:3441,entry:sourceByRef.get('KRU03441'),meanings:[
  {text:'flesh, meat, body',label:'1'},
  {text:'mortal man',label:'2'}
 ]},
 {id:1372,entry:sourceByRef.get('B01372'),meanings:[
  {text:'body, flesh, meat',label:'1'},
  {text:'mortal',label:'2'}
 ]}
],S.normalize(sourceByRef.get('KRU03441').h));
assert(mortalHuman.some(group=>group.sources.length===2&&group.text==='mortal man'),'both sources should support the mortal-human sense');
assert(mortalHuman.some(group=>group.sources.length===2&&['body','flesh','meat'].every(term=>group.text.includes(term))),'the separate body/flesh sense should remain independently mapped');

const shapingOfWriting=U.merge([
 {id:4329,entry:sourceByRef.get('KRU04329'),meanings:[{text:'shaping (of writing), impress',label:''}]},
 {id:954,entry:sourceByRef.get('C00954'),meanings:[{text:'shaping',label:''}]}
],S.normalize(sourceByRef.get('KRU04329').h));
assert.equal(shapingOfWriting.length,1,'the two source descriptions of shaping/impress/poetry belong to one cited sense');
assert.equal(shapingOfWriting[0].sources.length,2,'both Psalms source entries must remain available');
assert.equal(shapingOfWriting[0].text,'shaping (of writing), impress, poetry','the fuller Jastrow alternative list should be retained in the consolidated display');

const spatialFarMeaning=U.merge([
 {id:5585,entry:sourceByRef.get('KRU05585'),meanings:[{text:'farther off (of space)',label:''}]},
 {id:16,entry:sourceByRef.get('E00016'),meanings:[
  {text:'farther off, far',label:''},
  {text:'onward',label:''}
 ]}
],S.normalize(sourceByRef.get('KRU05585').h));
assert.equal(spatialFarMeaning.length,2,'the shared spatial meaning should consolidate while the temporal sense remains separate');
const spatialFarGroup=spatialFarMeaning.find(group=>group.sources.length===2);
assert(spatialFarGroup,'both sources citing Targum Jonathan Genesis 32:25 must remain available');
assert.equal(spatialFarGroup.text,'farther off, far (of space)','the spatial qualifier should be retained without duplicate wording');
assert(spatialFarMeaning.some(group=>group.text==='onward'&&group.sources.length===1),'Jastrow’s separate temporal sense must remain independent');

const selfConductMeaning=U.merge([
 {id:12418,entry:sourceByRef.get('KRU12418'),meanings:[{text:'to conduct o. s.',label:''}]},
 {id:250,entry:sourceByRef.get('N00250'),meanings:[{text:'to conduct one’s self',label:'Hithpa. מִתְנַהֵג'}]}
],S.normalize(sourceByRef.get('KRU12418').h));
assert.equal(selfConductMeaning.length,1,'the two source definitions of the Hithpael self-conduct sense should consolidate');
assert.equal(selfConductMeaning[0].sources.length,2,'both Sifré Deut. 323 source entries should remain available');
assert.equal(selfConductMeaning[0].text,'to conduct oneself','the abbreviated Krupnik wording should display once in a clear normalized form');

const forkfulMeasure=U.merge([
 {id:16546,entry:sourceByRef.get('KRU16546'),meanings:[{text:'a piece as large as can be taken up with a fork',label:''}]},
 {id:617,entry:sourceByRef.get('R00617'),meanings:[{text:'a piece as large as can be taken up with a hook',label:''}]}
],S.normalize(sourceByRef.get('KRU16546').h));
assert.equal(forkfulMeasure.length,1,'the hook/fork measurement definitions should consolidate');
assert.equal(forkfulMeasure[0].sources.length,2,'both Pesikta Rabbati source records should remain available');
assert.equal(forkfulMeasure[0].text,'a piece as large as can be taken up with a fork','the source-confirmed fork wording should display once');

const familySeveringCeremony=U.merge([
 {id:17632,entry:sourceByRef.get('KRU17632'),meanings:[{text:'timber; a ceremony of severing family connections with a man who married beneath his social rank',label:''}]},
 {id:1839,entry:sourceByRef.get('S01839'),meanings:[{text:'cutting off, severing family connections; ḳ’tsatsah, a ceremony attending the sale of an heirloom to an outsider, and the marriage of a man beneath his social rank',label:''}]}
],S.normalize(sourceByRef.get('KRU17632').h));
assert.equal(familySeveringCeremony.length,3,'the ceremony segment should merge while the general severing gloss and timber sense remain separate');
const ceremonyGroup=familySeveringCeremony.find(group=>group.sources.length===2);
assert(ceremonyGroup&&ceremonyGroup.text.includes('ḳ’tsatsah'),'the specific family-severing ceremony should consolidate');
assert(familySeveringCeremony.some(group=>group.text==='timber'&&group.sources.length===1),'the unrelated timber sense must remain independent');
assert(familySeveringCeremony.some(group=>group.text==='cutting off, severing family connections'&&group.sources.length===1),'the general severing gloss must remain independent');

