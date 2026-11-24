// Build a review-only Hebrew synonym candidate queue from original Krupnik/Silbermann data.
// English glosses are used only as a cross-check; Hebrew source wording remains authoritative.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const context={};context.window=context;vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname,'plugin/data.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(__dirname,'plugin/lookup.js'),'utf8'),context);
const dictionary=context.HEBREW_DICTIONARY,normalize=context.HebrewLookup.normalize;
const label=value=>normalize(String(value||'').replace(/\b\d+\b/g,'').trim());
const clean=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/[’‘]/g,"'").replace(/[‐‑–—]/g,'-').replace(/[^a-z0-9' -]/g,' ').replace(/\s+/g,' ').trim();
const stop=new Set('a an the to of for in on with from by as and or is be are was were being been it this that these those one some any all which who what where when into unto over under without before after during through'.split(' '));
const tokens=value=>[...new Set(clean(value).split(' ').filter(t=>t.length>=3&&!stop.has(t)))];
const byWord=new Map();
for(const entry of dictionary.entries)for(const word of [entry.word,...(entry.alt||[])]){
 const key=normalize(word);if(!key)continue;
 if(!byWord.has(key))byWord.set(key,new Map());
 byWord.get(key).set(entry.rid,entry);
}
const candidates=new Map();
for(const [key,records] of byWord){
 const entries=[...records.values()];
 for(let i=0;i<entries.length;i++)for(let j=i+1;j<entries.length;j++){
  const a=entries[i],b=entries[j];
  for(const pa of a.parts||[])for(const pb of (i===j?a.parts||[]:b.parts||[])){
   if(a.rid===b.rid&&pa===pb)continue;
   const ha=pa.meaning||pa.text||'',hb=pb.meaning||pb.text||'';
   if(!normalize(ha)||!normalize(hb)||normalize(ha)===normalize(hb))continue;
   if(label(pa.label)&&label(pb.label)&&label(pa.label)!==label(pb.label))continue;
   const ea=clean(pa.english),eb=clean(pb.english);if(!ea||!eb||ea===eb)continue;
   const ta=tokens(ea),tb=tokens(eb);if(!ta.length||!tb.length)continue;
   const overlap=ta.filter(t=>tb.includes(t)),jaccard=overlap.length/new Set([...ta,...tb]).size;
   if(jaccard<0.75||overlap.length<2)continue;
   const refs=[a.rid,b.rid].sort();
   const glosses=[normalize(ha),normalize(hb)].sort();
   const keyId=[key,...refs,...glosses].join('::');
   candidates.set(keyId,{
    headword:a.word,normalizedHeadword:key,
    sourceA:{rid:a.rid,headword:a.word,label:pa.label||'',hebrew:ha,fullHebrew:pa.text||'',english:pa.english||''},
    sourceB:{rid:b.rid,headword:b.word,label:pb.label||'',hebrew:hb,fullHebrew:pb.text||'',english:pb.english||''},
    sharedEnglishTerms:overlap,jaccard:Number(jaccard.toFixed(3)),englishGlossesIdentical:!!ea&&ea===eb,
    reviewStatus:'pending-human-review'
   });
  }
 }
}
const list=[...candidates.values()].sort((a,b)=>b.jaccard-a.jaccard||a.headword.localeCompare(b.headword));
const report={
 purpose:'Review queue only. No Hebrew definitions are automatically merged or rewritten.',
 method:{
  source:'Original Krupnik and Silbermann Hebrew definitions with their embedded original English gloss metadata',
  headwordMatching:'HebrewLookup.normalize across primary and alternate headwords',
  alignment:'All non-identical Hebrew meaning pairs from repeated normalized headwords are queued; original English gloss overlap is shown as a ranking clue, not a hard filter',
  safeguards:'Different explicit grammatical labels are excluded; identical Hebrew glosses are already handled by exact grouping',
  limitation:'English overlap is only an alignment clue. Reviewers must confirm the Hebrew definitions express the same sense before approving a merge.'
 },
 totals:{sourceRecords:dictionary.entries.length,uniqueHeadwordForms:byWord.size,candidates:list.length},
 candidates:list
};
const output=path.join(__dirname,'meaning-consolidation-candidates.json');
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
const summary=[
 '## Hebrew dictionary meaning-consolidation candidates',
 '',
 '- Original Hebrew source records: '+dictionary.entries.length,
 '- Repeated headword forms: '+report.totals.repeatedHeadwordForms,\n '- Candidate pairs for manual Hebrew review: '+list.length,
 '',
 'English glosses are used only as an alignment clue; no Hebrew meaning is automatically merged.',
 '',
 'Top examples:',
 ...list.slice(0,12).map(x=>'- '+x.headword+' ('+x.sourceA.rid+' / '+x.sourceB.rid+'): '+x.sourceA.hebrew+' ↔ '+x.sourceB.hebrew+' [English: '+x.sourceA.english+' / '+x.sourceB.english+']')
].join('\n');
if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,summary+'\n');
console.log(JSON.stringify(report.totals));
