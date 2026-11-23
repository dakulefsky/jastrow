const assert=require('node:assert/strict'),S=require('./plugin/search.js'),U=require('./plugin/unified-view.js'),fs=require('node:fs'),vm=require('node:vm');
const c={window:{}};vm.createContext(c);for(const n of ['index','attested-forms','ranking','krupnik-index','phrases'])vm.runInContext(fs.readFileSync(__dirname+'/plugin/data/'+n+'.js','utf8'),c);
const index=c.window.JASTROW_INDEX;
assert.equal(U.reviewedSourceGlossPairCount,592,'every reviewed source gloss pair must be loaded; malformed adjacent array entries must not be silently dropped');

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
 const krupnikGloss=glosses.find(gloss=>(krupnik.glosses||[]).some(item=>cleanGloss(item.text)===gloss));
 assert(krupnikGloss,'Krupnik gloss must match source wording for '+krupnikRef+': '+glosses.join(' / '));
 const italicGlosses=[...jastrow.html.matchAll(/<i\b[^>]*>([\s\S]*?)<\/i>/gi)].map(match=>cleanGloss(decodeHtml(match[1].replace(/<[^>]*>/g,' '))));
 const jastrowGloss=glosses.find(gloss=>gloss!==krupnikGloss&&italicGlosses.includes(gloss));
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
const merged=U.merge(records,'אַרְעָא');assert.equal(merged.length,2);assert.equal(merged[0].sources.length,2);assert.equal(merged[0].text,'land, earth, ground, field');assert.equal(merged[0].rank,0);assert.equal(merged[1].rank,2);
assert.equal(U.merge([{id:1,entry:{h:'אָמַר'},meanings:[{text:'to say',label:'Af.'}]},{id:2,entry:{h:'אָמַר'},meanings:[{text:'to say',label:'Pa.'}]}],'אמר').length,2);
assert.equal(U.merge([{id:1,entry:{h:'אָמַר'},meanings:[{text:'charge, fee',label:''}]},{id:2,entry:{h:'אָמַר'},meanings:[{text:'charge, accusation',label:''}]}],'אמר').length,2);
assert.equal(U.merge([{id:1,entry:{h:'אַרְעָא'},meanings:[{text:'land',label:'1'}]},{id:2,entry:{h:'אַרְעָא'},meanings:[{text:'land.',label:'2)'}]}],'ארעא').length,1);
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
assert.equal(synonymBridge[0].text,'father, my father','the consolidated display should retain the fuller source gloss');

const qualifiedSynonym=U.merge([
 {id:18,entry:{h:'אֲבַק',r:'A00190'},meanings:[{text:'to be attached',label:''}]},
 {id:19,entry:{h:'אֲבַק',r:'KRU00120'},meanings:[{text:'to be attached to, cling to',label:''}]}
],'אבק');
assert.equal(qualifiedSynonym.length,1,'a reviewed multiword synonym should join the fuller gloss');
assert.equal(qualifiedSynonym[0].text,'to be attached to, cling to');

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
  {text:'lime, plaster.',label:''},{text:'froth, foam.',label:''}
 ]}
],'כלא');
assert.equal(sameRecordDistinctSenses.length,2,'two distinct meanings in the same pair of source records must stay separate');
assert(sameRecordDistinctSenses.every(group=>group.sources.length===2),'each of the two senses should retain both corresponding source citations');

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
  {text:'carrying out of the house',label:''},{text:'bringing forth, sprouting',label:''},{text:'expenditure, outlay, cost; marketing',label:''}
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
 {id:111,entry:{h:'מַנֵּי',r:'M01772',source:'jastrow'},meanings:[{text:'counted',label:''},{text:'to be appointed, designated as deputy, to be ordained',label:''}]},
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
