const assert=require('node:assert/strict'),S=require('./plugin/search.js'),U=require('./plugin/unified-view.js'),fs=require('node:fs'),vm=require('node:vm');
const c={window:{}};vm.createContext(c);for(const n of ['index','attested-forms','ranking','krupnik-index','phrases'])vm.runInContext(fs.readFileSync(__dirname+'/plugin/data/'+n+'.js','utf8'),c);
const index=c.window.JASTROW_INDEX;
assert.equal(U.reviewedSourceGlossPairCount,1249,'every reviewed source gloss pair must be loaded; malformed adjacent array entries must not be silently dropped');

const dataDir=__dirname+'/plugin/data';
c.window.JASTROW_CHUNKS={};
for(const file of fs.readdirSync(dataDir).filter(n=>/^(?:chunk-\d+|krupnik-\d+)\.js$/.test(n)).sort()){
 vm.runInContext(fs.readFileSync(dataDir+'/'+file,'utf8'),c);
}
const sourceEntries=Object.values(c.window.JASTROW_CHUNKS).flatMap(chunk=>Object.values(chunk));
const sourceByRef=new Map(sourceEntries.filter(entry=>entry.r).map(entry=>[entry.r,entry]));
const cleanGloss=value=>String(value).normalize('NFKC').toLowerCase().replace(/[’‘]/g,"'").replace(/[‐‑–—]/g,'-').replace(/[.\s]+$/,'').trim().replace(/\s+/g,' ');
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
 ['heap','pile'],['pile','mound'],['present','gift'],['sediment','dregs'],
 ['to frighten','to scare'],['to dwell','to reside'],['edge','rim'],
 ['capital','metropolis'],['gathering','assembly'],['deity','divinity'],
 ['strength','force'],['to glue','to paste'],['glue','paste'],
 ['to grow better','to improve'],['to set on fire','to burn']
];
for(const [a,b] of sourceAttestedSynonyms)assert.equal(U.sharesReviewedSynonym(a,b),true,'reviewed synonym group should consolidate: '+a+' / '+b);
assert.equal(U.sharesReviewedSynonym('to frighten','to scare, to threaten'),false,'an unrelated extra sense must prevent synonym-group consolidation');
assert.equal(U.sharesReviewedSynonym('heap','pile, accusation'),false,'a synonym must not absorb an unrelated alternative');
assert.equal(U.sharesReviewedSynonym('to frighten','to frighten, scare'),true,'coordinated infinitives may omit the repeated "to"');
assert.equal(U.sharesReviewedSynonym('to dwell','to dwell, reside'),true,'the omitted infinitive marker should be restored for matching');
assert.equal(U.sharesReviewedSynonym('to set on fire','to set on fire, burn'),true,'a coordinated bare verb should match its infinitive synonym');
assert.equal(U.sharesReviewedSynonym('burn','to burn'),false,'noun and infinitive readings must not be conflated');



// Alternative-level review: match only the shared sense, keeping the
// unrelated alternative in the Krupnik gloss and Jastrow's second sense apart.
assert.equal(U.reviewedSourceAlternativePairs.size,1);
const alternativeScoped=U.merge([
 {id:301,entry:{h:'גָּנַח',r:'KRU04451',source:'krupnik'},meanings:[{text:'to sigh heavily under an attack of angina pectoris, to expectorate',label:''}]},
 {id:302,entry:{h:'גָּנַח',r:'C01128'},meanings:[
  {text:'to sigh heavily under an attack of angina pectoris',label:''},
  {text:'to cough and spit blood',label:''}
 ]}
],'גָּנַח');
assert.equal(alternativeScoped.length,3,'only the explicitly matched alternative should consolidate');
const matchedSigh=alternativeScoped.find(group=>group.text==='to sigh heavily under an attack of angina pectoris');
const krupnikRemainder=alternativeScoped.find(group=>group.text==='to expectorate');
const jastrowOtherSense=alternativeScoped.find(group=>group.text==='to cough and spit blood');
assert.equal(matchedSigh.sources.length,2,'the matched alternative must retain both dictionary sources');
assert.equal(krupnikRemainder.sources.length,1,'the unmatched Krupnik alternative must remain separate');
assert.equal(jastrowOtherSense.sources.length,1,'the second Jastrow sense must remain separate');
assert.equal(matchedSigh.sources.find(source=>source.entry.r==='KRU04451').meaning.text,'to sigh heavily under an attack of angina pectoris, to expectorate','More detail must retain the full original Krupnik gloss');


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

console.log('PASS: real alternate-headword vowel matches, partial pointing, cantillation, conservative synonym consolidation, complete source references, and distinct stem/qualified senses.');
assert.equal(U.merge([{id:1,entry:{h:'חוב'},meanings:[{text:'charge',label:''}]},{id:2,entry:{h:'חוב'},meanings:[{text:'charge, accusation',label:''}]}],'חוב').length,2,'a one-word overlap must not erase a distinct qualified sense');
assert.equal(U.merge([{id:1,entry:{h:'אָמַר'},meanings:[{text:'to say',label:''}]},{id:2,entry:{h:'אָמַר'},meanings:[{text:'to say',label:''}]}],'אמר').length,1,'identical glosses should still consolidate');
assert.equal(U.merge([{id:1,entry:{h:'אַרְעָא'},meanings:[{text:'land',label:''}]},{id:2,entry:{h:'אִרְעָא'},meanings:[{text:'land',label:''}]}],'אַרְעָא').length,2,'a pointed lookup must keep conflicting vowel readings separate even when glosses match');
assert.equal(U.merge([{id:1,entry:{h:'אַרְעָא'},meanings:[{text:'land',label:''}]},{id:2,entry:{h:'ארעא'},meanings:[{text:'land',label:''}]}],'ארעא').length,1,'an unpointed source spelling remains compatible with a pointed spelling');


assert.equal(U.merge([{id:33936,entry:{h:'אִרְעָא',r:'KRU02095'},meanings:[{text:'in accident',label:'1'}]},{id:3220,entry:{h:'אִרְעָא',r:'A03220'},meanings:[{text:'accident, occurrence',label:''}]}],'ארעא').length,1);

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
