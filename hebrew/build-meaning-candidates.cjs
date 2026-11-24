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
const headwordCompatible=(a,b)=>[a.word,...(a.alt||[])].some(x=>[b.word,...(b.alt||[])].some(y=>normalize(x)===normalize(y)&&vowelCompatible(x,y)));
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
const candidates=new Map();
for(const [key,records] of byWord){
 const entries=[...records.values()];
 for(let i=0;i<entries.length;i++)for(let j=i+1;j<entries.length;j++){
  const a=entries[i],b=entries[j];
  if(!headwordCompatible(a,b))continue;
  for(const pa of a.parts||[])for(const pb of b.parts||[]){
   const ha=pa.meaning||pa.text||'',hb=pb.meaning||pb.text||'';
   if(!normalize(ha)||!normalize(hb)||normalize(ha)===normalize(hb))continue;
   if(label(pa.label)&&label(pb.label)&&label(pa.label)!==label(pb.label))continue;
   const itemA={e:a,p:pa},itemB={e:b,p:pb};
   if(context.HebrewMeaningConsolidation.reviewedSynonymPairs.has(context.HebrewMeaningConsolidation.pairKey(itemA,itemB)))continue;
   const ea=clean(pa.english),eb=clean(pb.english);
   if(ea&&eb&&!grammaticalCompatible(ea,eb))continue;
   const ta=tokens(ea),tb=tokens(eb);
   const overlap=ta.filter(t=>tb.includes(t)),jaccard=ta.length&&tb.length?overlap.length/new Set([...ta,...tb]).size:0;
   const evidence=englishEvidence(ea,eb,overlap,jaccard);
   const refs=[a.rid,b.rid].sort();
   const glosses=[normalize(ha),normalize(hb)].sort();
   const keyId=[key,...refs,...glosses].join('::');
   candidates.set(keyId,{
    headword:a.word,normalizedHeadword:key,sharedHeadwordForm:key,
    sourceA:{rid:a.rid,headword:a.word,label:pa.label||'',hebrew:ha,fullHebrew:pa.text||'',english:pa.english||''},
    sourceB:{rid:b.rid,headword:b.word,label:pb.label||'',hebrew:hb,fullHebrew:pb.text||'',english:pb.english||''},
    sharedEnglishTerms:overlap,jaccard:Number(jaccard.toFixed(3)),englishGlossesIdentical:!!ea&&ea===eb,
    englishEvidence:evidence.level,englishEvidenceScore:Number(evidence.score.toFixed(3)),
    reviewStatus:'pending-human-review'
   });
  }
 }
}
const list=[...candidates.values()].sort((a,b)=>b.englishEvidenceScore-a.englishEvidenceScore||b.jaccard-a.jaccard||b.sharedEnglishTerms.length-a.sharedEnglishTerms.length||a.headword.localeCompare(b.headword));
const report={
 purpose:'Review queue only. No Hebrew definitions are automatically merged or rewritten.',
 method:{
  source:'Original Krupnik and Silbermann Hebrew definitions with their embedded original English gloss metadata',
  headwordMatching:'HebrewLookup.normalize across primary and alternate headwords, with conflicts between two explicitly pointed forms excluded',
  alignment:'Non-identical Hebrew meanings from repeated normalized headwords are queued; English gloss overlap ranks candidates, and obvious verb/non-verb or active/passive mismatches are excluded',
  safeguards:'Different explicit grammatical labels are excluded; identical Hebrew glosses are already handled by exact grouping; approved source-scoped synonym pairs are excluded from the queue',
  limitation:'English overlap is only an alignment clue. Reviewers must confirm the Hebrew definitions express the same sense before approving a merge.'
 },
  totals:{sourceRecords:dictionary.entries.length,uniqueHeadwordForms:byWord.size,repeatedHeadwordForms:[...byWord.values()].filter(group=>group.size>1).length,candidates:list.length,evidenceCounts:Object.fromEntries(['exact-gloss','shared-content-terms','different-glosses','missing-gloss'].map(level=>[level,list.filter(x=>x.englishEvidence===level).length]))},
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
 'English glosses are used only as an alignment clue; exact and shared-content-term evidence is ranked first, unrelated or missing glosses are kept lower in the review queue; no Hebrew meaning is automatically merged.',
 '',
 'Top examples:',
 ...list.slice(0,12).map(x=>'- '+x.headword+' ('+x.sourceA.rid+' / '+x.sourceB.rid+'): '+x.sourceA.hebrew+' ↔ '+x.sourceB.hebrew+' [English: '+x.sourceA.english+' / '+x.sourceB.english+']')
].join('\n');
if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,summary+'\n');
console.log(JSON.stringify(report.totals));
