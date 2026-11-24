// Build a review-only Hebrew synonym candidate queue from original Krupnik/Silbermann data.
// English glosses are used only as a cross-check; Hebrew source wording remains authoritative.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const context={};context.window=context;vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname,'plugin/data.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(__dirname,'plugin/lookup.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(__dirname,'plugin/meaning-consolidation.js'),'utf8'),context);
const dictionary=context.HEBREW_DICTIONARY,normalize=context.HebrewLookup.normalize;
const label=value=>normalize(String(value||'').replace(/\b\d+\b/g,'').trim());
const pointed=value=>{
 const out=[];
 for(const ch of String(value||'').normalize('NFD')){
  if(/[א-ת]/.test(ch))out.push({letter:ch,marks:[]});
  else if(/[\u05b0-\u05bc\u05c1\u05c2\u05c7]/.test(ch)&&out.length)out[out.length-1].marks.push(ch);
 }
 return out;
};
const vowelCompatible=(a,b)=>{
 const A=pointed(a),B=pointed(b);
 if(A.map(x=>x.letter).join('')!==B.map(x=>x.letter).join(''))return false;
 for(let i=0;i<A.length;i++)if(A[i].marks.length&&B[i].marks.length){
  if(A[i].marks.slice().sort().join('')!==B[i].marks.slice().sort().join(''))return false;
 }
 return true;
};
const homonymNumber=value=>{
 const text=String(value||'').trim(),sup=text.match(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+$/);
 if(sup)return Number([...sup[0]].map(ch=>'⁰¹²³⁴⁵⁶⁷⁸⁹'.indexOf(ch)).join(''));
 const arabic=text.match(/(?:^|\\s)(\\d+)$/);
 if(arabic)return Number(arabic[1]);
 const roman=text.match(/(?:^|\\s)(I{1,3}|IV|V|VI|VII|VIII|IX|X)$/i);
 if(roman)return ({I:1,II:2,III:3,IV:4,V:5,VI:6,VII:7,VIII:8,IX:9,X:10})[roman[1].toUpperCase()]||null;
 return null;
};
const homonymNumbersByForm=new Map();
for(const entry of dictionary.entries)for(const form of [entry.word,...(entry.alt||[])]){
 const key=normalize(form),number=homonymNumber(form);
 if(!key||number===null)continue;
 if(!homonymNumbersByForm.has(key))homonymNumbersByForm.set(key,new Set());
 homonymNumbersByForm.get(key).add(number);
}
const headwordCompatible=(a,b)=>[a.word,...(a.alt||[])].some(x=>[b.word,...(b.alt||[])].some(y=>{
 const key=normalize(x),nx=homonymNumber(x),ny=homonymNumber(y),known=homonymNumbersByForm.get(key)||new Set();
 if(key!==normalize(y)||!vowelCompatible(x,y))return false;
 if(nx!==null&&ny!==null&&nx!==ny)return false;
 if((nx===null||ny===null)&&known.size>1)return false;
 return true;
}));
if(headwordCompatible({word:'בְּרָא²'},{word:'בְּרָא³'}))throw new Error('Candidate inventory must reject explicitly different Hebrew homonyms');
if(headwordCompatible({word:'בְּרָא'},{word:'בְּרָא³'})&&homonymNumbersByForm.get(normalize('בְּרָא'))?.size>1)throw new Error('An unnumbered Hebrew headword must not be assigned arbitrarily among multiple numbered homonyms');
if(!headwordCompatible({word:'בדיקה³'},{word:'בדיקה'}))throw new Error('A numbered Hebrew headword may match an unnumbered counterpart when unambiguous');
if(vowelCompatible('כָּבַשׁ','כְּבַשׁ'))throw new Error('Candidate inventory must reject conflicting pointed Hebrew readings');
if(!vowelCompatible('כבש','כָּבַשׁ'))throw new Error('Unpointed headwords must remain eligible for review');
const clean=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/[’‘]/g,"'").replace(/[‐‑–—]/g,'-').replace(/[^a-z0-9' -]/g,' ').replace(/\s+/g,' ').trim();
const stop=new Set('a an the to of for in on with from by as and or is be are was were being been it this that these those one some any all which who what where when into unto over under without before after during through'.split(' '));
const tokens=value=>[...new Set(clean(value).split(' ').filter(t=>t.length>=3&&!stop.has(t)))];
const grammaticalCompatible=(a,b)=>{
 const va=/^to\s+/.test(clean(a)),vb=/^to\s+/.test(clean(b));
 if(va!==vb)return false;
 if(va){
  const pa=/^to\s+be\s+/.test(clean(a)),pb=/^to\s+be\s+/.test(clean(b));
  if(pa!==pb)return false;
 }
 return true;
};
if(grammaticalCompatible('to be lame','lame'))throw new Error('Candidate queue must preserve verb/adjective distinctions');
if(grammaticalCompatible('to be crushed','to crush, to be crushed'))throw new Error('Candidate queue must preserve active/passive distinctions');
if(!grammaticalCompatible('to plait','to braid'))throw new Error('Same-part-of-speech synonyms should remain reviewable');
const byWord=new Map();
for(const entry of dictionary.entries)for(const word of [entry.word,...(entry.alt||[])]){
 const key=normalize(word);if(!key)continue;
 if(!byWord.has(key))byWord.set(key,new Map());
 byWord.get(key).set(entry.rid,entry);
}
const englishEvidence=(a,b,overlap,jaccard)=>{
 const ea=clean(a),eb=clean(b);
 if(ea&&ea===eb)return {level:'exact-gloss',score:3};
 if(overlap.length)return {level:'shared-content-terms',score:2+jaccard};
 if(ea&&eb)return {level:'different-glosses',score:1};
 return {level:'missing-gloss',score:0};
};
const evidenceExamples=[
 englishEvidence('throat','throat',[],0).level==='exact-gloss',
 englishEvidence('throat','gullet',['throat'],0.5).level==='shared-content-terms',
 englishEvidence('throat','unrelated',[],0).level==='different-glosses',
 englishEvidence('','',[],0).level==='missing-gloss'
];
if(evidenceExamples.some(ok=>!ok))throw new Error('Hebrew candidate evidence ranking must distinguish exact, overlapping, unrelated, and missing English glosses');
const partialA=context.HebrewMeaningConsolidation.splitAlternatives('בתנאי');
const partialB=context.HebrewMeaningConsolidation.splitAlternatives('בתנאי, בכוונה');
if(!partialA.some(value=>partialB.map(normalize).includes(normalize(value))))throw new Error('Hebrew candidate ranking must detect exact shared alternatives in fuller glosses');
if(context.HebrewMeaningConsolidation.canonicalMeaningKey('בית, ביתו')!==context.HebrewMeaningConsolidation.canonicalMeaningKey('ביתו; בית'))throw new Error('Reordered Hebrew synonym lists must be treated as the same full meaning');
const candidates=new Map();
for(const [key,records] of byWord){
 const entries=[...records.values()];
 for(let i=0;i<entries.length;i++)for(let j=i+1;j<entries.length;j++){
  const a=entries[i],b=entries[j];
  if(!headwordCompatible(a,b))continue;
  for(const pa of a.parts||[])for(const pb of b.parts||[]){
   const ha=pa.meaning||pa.text||'',hb=pb.meaning||pb.text||'';
   if(!normalize(ha)||!normalize(hb)||context.HebrewMeaningConsolidation.canonicalMeaningKey(ha)===context.HebrewMeaningConsolidation.canonicalMeaningKey(hb))continue;
   if(label(pa.label)&&label(pb.label)&&label(pa.label)!==label(pb.label))continue;
   const itemA={e:a,p:pa},itemB={e:b,p:pb};
   if(context.HebrewMeaningConsolidation.reviewedSynonymPairs.has(context.HebrewMeaningConsolidation.pairKey(itemA,itemB)))continue;
   const ea=clean(pa.english),eb=clean(pb.english);
   if(ea&&eb&&!grammaticalCompatible(ea,eb))continue;
   const ta=tokens(ea),tb=tokens(eb);
   const overlap=ta.filter(t=>tb.includes(t)),jaccard=ta.length&&tb.length?overlap.length/new Set([...ta,...tb]).size:0;
   const evidence=englishEvidence(ea,eb,overlap,jaccard);
   const hebrewA=[...new Set(context.HebrewMeaningConsolidation.splitAlternatives(ha).map(normalize).filter(Boolean))];
   const hebrewB=[...new Set(context.HebrewMeaningConsolidation.splitAlternatives(hb).map(normalize).filter(Boolean))];
   const hebrewBSet=new Set(hebrewB);
   const sharedHebrewAlternatives=hebrewA.filter(value=>hebrewBSet.has(value));
   const partialHebrewOverlap=sharedHebrewAlternatives.length>0;
   const hebrewEvidenceScore=partialHebrewOverlap?4+sharedHebrewAlternatives.length:evidence.score;
   const refs=[a.rid,b.rid].sort();
   const glosses=[normalize(ha),normalize(hb)].sort();
   const keyId=[key,...refs,...glosses].join('::');
   candidates.set(keyId,{
    headword:a.word,normalizedHeadword:key,sharedHeadwordForm:key,
    sourceA:{rid:a.rid,headword:a.word,label:pa.label||'',hebrew:ha,fullHebrew:pa.text||'',english:pa.english||''},
    sourceB:{rid:b.rid,headword:b.word,label:pb.label||'',hebrew:hb,fullHebrew:pb.text||'',english:pb.english||''},
    sharedEnglishTerms:overlap,jaccard:Number(jaccard.toFixed(3)),englishGlossesIdentical:!!ea&&ea===eb,
    englishEvidence:evidence.level,englishEvidenceScore:Number(evidence.score.toFixed(3)),
    sharedHebrewAlternatives,partialHebrewOverlap,hebrewEvidenceScore,
    reviewStatus:'pending-human-review'
   });
  }
 }
}
const list=[...candidates.values()].sort((a,b)=>b.hebrewEvidenceScore-a.hebrewEvidenceScore||b.englishEvidenceScore-a.englishEvidenceScore||b.jaccard-a.jaccard||b.sharedEnglishTerms.length-a.sharedEnglishTerms.length||a.headword.localeCompare(b.headword));
const report={
 purpose:'Review queue only. No Hebrew definitions are automatically merged or rewritten.',
 method:{
  source:'Original Krupnik and Silbermann Hebrew definitions with their embedded original English gloss metadata',
  headwordMatching:'HebrewLookup.normalize across primary and alternate headwords, with conflicts between two explicitly pointed forms excluded',
  alignment:'Non-identical Hebrew meanings from repeated normalized headwords are queued; English gloss overlap ranks candidates, and obvious verb/non-verb or active/passive mismatches are excluded',
  safeguards:'Different explicit grammatical labels are excluded; identical Hebrew glosses are already handled by exact grouping; approved source-scoped synonym pairs are excluded from the queue',
  limitation:'English overlap is only an alignment clue. Reviewers must confirm the Hebrew definitions express the same sense before approving a merge.'
 },
  totals:{sourceRecords:dictionary.entries.length,uniqueHeadwordForms:byWord.size,repeatedHeadwordForms:[...byWord.values()].filter(group=>group.size>1).length,candidates:list.length,partialHebrewOverlap:list.filter(x=>x.partialHebrewOverlap).length,evidenceCounts:Object.fromEntries(['exact-gloss','shared-content-terms','different-glosses','missing-gloss'].map(level=>[level,list.filter(x=>x.englishEvidence===level).length]))},
 candidates:list
};
const output=path.join(__dirname,'meaning-consolidation-candidates.json');
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
const summary=[
 '## Hebrew dictionary meaning-consolidation candidates',
 '',
 '- Original Hebrew source records: '+dictionary.entries.length,
 '- Repeated headword forms: '+report.totals.repeatedHeadwordForms,
 '- Candidate pairs for manual Hebrew review: '+list.length,
 '',
 'Exact shared Hebrew alternatives are ranked first, so a shared synonym can be consolidated while extra senses remain separate. English glosses are a secondary alignment clue; no Hebrew meaning is automatically merged.',
 '',
 'Top examples:',
 ...list.slice(0,12).map(x=>'- '+x.headword+' ('+x.sourceA.rid+' / '+x.sourceB.rid+'): '+x.sourceA.hebrew+' ↔ '+x.sourceB.hebrew+' [English: '+x.sourceA.english+' / '+x.sourceB.english+']')
].join('\n');
if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,summary+'\n');
console.log(JSON.stringify(report.totals));
