// Generate a human-review queue for cross-dictionary synonym candidates.
// Discovery only: this script NEVER merges meanings or edits reviewed mappings.
// Jastrow phrases are taken from the same extractor used by the reading UI.
const fs=require('node:fs');
const assert=require('node:assert/strict');
const path=require('node:path');
const vm=require('node:vm');
const {chromium,executablePath}=require('../browser_support.cjs');
const S=require('../plugin/search.js');
const U=require('../plugin/unified-view.js');
const dataDir=path.join(__dirname,'../plugin/data');
const files=fs.readdirSync(dataDir).filter(n=>/^(?:chunk-\d+|krupnik-\d+)\.js$/.test(n)).sort();
const context={window:{JASTROW_CHUNKS:{}}};
vm.createContext(context);
for(const file of files)vm.runInContext(fs.readFileSync(path.join(dataDir,file),'utf8'),context);
const entries=Object.values(context.window.JASTROW_CHUNKS).flatMap(chunk=>Object.values(chunk)).filter(e=>e.r);
const jastrow=entries.filter(e=>e.source!=='krupnik'&&e.html);
const krupnik=entries.filter(e=>e.source==='krupnik'&&Array.isArray(e.glosses));
const clean=value=>String(value).normalize('NFKC').toLowerCase().replace(/[’‘]/g,"'").replace(/[‐‑–—]/g,'-').replace(/[.\s]+$/,'').trim().replace(/\s+/g,' ');
const stop=new Set(('a an the to of for in on with from by as and or is be are was were being been it its this that these those one some any all which could not have their them they he she his her we you your our who what where when why how into unto over under without before after during through around between while than then also only very more most less such same other another each every'.split(' ')));
const tokens=value=>[...new Set(clean(value).replace(/[^a-z0-9' -]/g,' ').split(/\s+/).filter(t=>t.length>=3&&!stop.has(t)))];
const alternatives=value=>{
 const out=[];let current='',depth=0;
 for(const ch of String(value||'')){
  if(ch==='(')depth++;else if(ch===')')depth=Math.max(0,depth-1);
  if((ch===','||ch===';')&&depth===0){if(clean(current))out.push(current.trim());current='';}
  else current+=ch;
 }
 if(clean(current))out.push(current.trim());
 return out;
};
const partEvidence=(a,b)=>{
 const left=tokens(a),right=tokens(b),shared=left.filter(t=>right.includes(t));
 if(!left.length||!right.length||!shared.length)return null;
 return {jastrow:a,krupnik:b,sharedTerms:shared,
  overlap:Number((shared.length/Math.min(left.length,right.length)).toFixed(3)),
  jaccard:Number((shared.length/new Set([...left,...right]).size).toFixed(3))};
};
const stem=label=>clean(String(label||'').replace(/^[—\s]*\d+[).]?\s*/,'').replace(/\s+\d+[).]?\s*$/,''));
const homonymNumber=value=>{
 const text=String(value||'').trim(),sup=text.match(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+$/);
 if(sup)return Number([...sup[0]].map(ch=>'⁰¹²³⁴⁵⁶⁷⁸⁹'.indexOf(ch)).join(''));
 const roman=text.match(/(?:^|\s)(I{1,3}|IV|V|VI|VII|VIII|IX|X)$/i);
 if(roman)return ({I:1,II:2,III:3,IV:4,V:5,VI:6,VII:7,VIII:8,IX:9,X:10})[roman[1].toUpperCase()]||null;
 const arabic=text.match(/(?:^|\s)(\d+)$/);
 return arabic?Number(arabic[1]):null;
};
const sameHomonym=(a,b)=>{const x=homonymNumber(a),y=homonymNumber(b);return x===null||y===null||x===y;};
const sharedForms=(a,b)=>{const left=[a.h,...(a.alt||[])],right=[b.h,...(b.alt||[])],forms=[];for(const x of left)for(const y of right)if(S.normalize(x)===S.normalize(y)&&sameHomonym(x,y)&&S.vowelRank({h:x},y)!==2)forms.push(S.normalize(x));return [...new Set(forms)];};
if(sharedForms({h:'בּוּר I'},{h:'בּוּר²'}).length)throw new Error('Candidate inventory must not pair explicitly different homonyms');
if(!sharedForms({h:'בּוּר I'},{h:'בּוּר'}).length)throw new Error('An unnumbered counterpart remains eligible for review');
const voice=value=>/^to\s+be\s+/i.test(clean(value))?'passive':'active';
const samePartOfSpeech=(a,b)=>/^to\s+/i.test(clean(a))===/^to\s+/i.test(clean(b));
const senseSegments=value=>{
 const out=[];let current='',depth=0;
 for(const ch of String(value||'')){
  if(ch==='(')depth++;else if(ch===')')depth=Math.max(0,depth-1);
  if(ch===';'&&depth===0){if(clean(current))out.push(current.trim());current='';}
  else current+=ch;
 }
 if(clean(current))out.push(current.trim());
 return out;
};
const segmentIds=(ref,text,label,section,alternative,side)=>{
 if(!alternatives(text).some(value=>clean(value)===clean(alternative)))return [];
 return [side==='j'?[ref,clean(text),stem(label),clean(section)].join('::'):[ref,clean(text),stem(label)].join('::')];
};
const annotateExactPairRisks=list=>{
 const pairs=new Map(),candidateFlags=new Map();
 const exactMatches=candidate=>candidate.exactAlternativeMatches|| (candidate.exactAlternativeMatch?[candidate.bestAlternativeMatch]:[]);
 for(const candidate of list)for(const matched of exactMatches(candidate)){
  const key=[candidate.jastrow.ref,candidate.krupnik.ref].sort().join('|')+'::'+[clean(matched.jastrow),clean(matched.krupnik)].sort().join(' | ');
  if(!pairs.has(key))pairs.set(key,{jSegments:new Set(),kSegments:new Set(),jLabels:new Set(),kLabels:new Set(),matches:[]});
  const group=pairs.get(key);
  const jIds=segmentIds(candidate.jastrow.ref,candidate.jastrow.text,candidate.jastrow.label,candidate.jastrow.section,matched.jastrow,'j');
  const kIds=segmentIds(candidate.krupnik.ref,candidate.krupnik.text,candidate.krupnik.label,'',matched.krupnik,'k');
  for(const id of jIds)group.jSegments.add(id);
  for(const id of kIds)group.kSegments.add(id);
  if(stem(candidate.jastrow.label))group.jLabels.add(stem(candidate.jastrow.label));
  if(stem(candidate.krupnik.label))group.kLabels.add(stem(candidate.krupnik.label));
  group.matches.push({candidate,jIds,kIds});
 }
 const jTargets=new Map(),kTargets=new Map();
 for(const group of pairs.values())for(const match of group.matches)for(const jId of match.jIds)for(const kId of match.kIds){
  if(!jTargets.has(jId))jTargets.set(jId,new Set());
  if(!kTargets.has(kId))kTargets.set(kId,new Set());
  jTargets.get(jId).add(kId);kTargets.get(kId).add(jId);
 }
 for(const group of pairs.values()){
  const flags=[];
  if(group.jSegments.size>1)flags.push('multiple-jastrow-senses-share-this-exact-alternative');
  if(group.kSegments.size>1)flags.push('multiple-krupnik-senses-share-this-exact-alternative');
  if(group.jLabels.size>1||group.kLabels.size>1)flags.push('conflicting-explicit-grammatical-labels');
  for(const match of group.matches){
   if(match.jIds.some(id=>jTargets.get(id)?.size>1))flags.push('one-jastrow-sense-matches-multiple-krupnik-senses');
   if(match.kIds.some(id=>kTargets.get(id)?.size>1))flags.push('one-krupnik-sense-matches-multiple-jastrow-senses');
  }
  for(const match of group.matches){
   if(!candidateFlags.has(match.candidate))candidateFlags.set(match.candidate,new Set());
   for(const flag of flags)candidateFlags.get(match.candidate).add(flag);
  }
 }
 for(const candidate of list){
  const matches=exactMatches(candidate),flags=[...(candidateFlags.get(candidate)||[])];
  candidate.reviewFlags=flags;
  candidate.reviewPriority=flags.length?'manual-ambiguity-review':matches.length?'handled-by-runtime-exact-alternative-rule':'semantic-review';
  candidate.reviewStatus=flags.length||!matches.length?'pending-human-review':'handled-by-runtime-rule';
 }
 return list;
};
const riskFixture=[
 {exactAlternativeMatch:true,bestAlternativeMatch:{jastrow:'to smell badly',krupnik:'to smell badly'},exactAlternativeMatches:[{jastrow:'to smell badly',krupnik:'to smell badly'}],jastrow:{ref:'J1',text:'to decay, to smell badly',label:'',section:'verb'},krupnik:{ref:'K1',text:'to smell badly',label:''}},
 {exactAlternativeMatch:true,bestAlternativeMatch:{jastrow:'to smell badly',krupnik:'to smell badly'},exactAlternativeMatches:[{jastrow:'to smell badly',krupnik:'to smell badly'}],jastrow:{ref:'J1',text:'to become putrid; to smell badly',label:'Hif.',section:'verb'},krupnik:{ref:'K1',text:'to smell badly',label:''}},
 {exactAlternativeMatch:true,bestAlternativeMatch:{jastrow:'to smell badly',krupnik:'to smell badly'},exactAlternativeMatches:[{jastrow:'to smell badly',krupnik:'to smell badly'}],jastrow:{ref:'J1',text:'to smell badly',label:'Pael.',section:'verb'},krupnik:{ref:'K1',text:'to smell badly',label:''}}
];
annotateExactPairRisks(riskFixture);
assert(riskFixture.every(item=>item.reviewFlags.includes('multiple-jastrow-senses-share-this-exact-alternative')),'repeated exact alternatives across distinct Jastrow senses must be flagged');
assert(riskFixture.every(item=>item.reviewFlags.includes('conflicting-explicit-grammatical-labels')),'conflicting explicit grammatical labels must be flagged');
const oneToManyFixture=[
 {exactAlternativeMatch:true,bestAlternativeMatch:{jastrow:'to say',krupnik:'to say'},exactAlternativeMatches:[{jastrow:'to say',krupnik:'to say'}],jastrow:{ref:'J2',text:'to say, to speak',label:'',section:'verb'},krupnik:{ref:'K2',text:'to say',label:''}},
 {exactAlternativeMatch:true,bestAlternativeMatch:{jastrow:'to speak',krupnik:'to speak'},exactAlternativeMatches:[{jastrow:'to speak',krupnik:'to speak'}],jastrow:{ref:'J2',text:'to say, to speak',label:'',section:'verb'},krupnik:{ref:'K2',text:'to speak',label:''}}
];
annotateExactPairRisks(oneToManyFixture);
assert(oneToManyFixture.every(item=>item.reviewFlags.includes('one-jastrow-sense-matches-multiple-krupnik-senses')),'one source phrase must not bridge two separate counterpart senses');

if(samePartOfSpeech('to lament','lament'))throw new Error('Candidate queue must preserve verb/noun distinctions');
if(!samePartOfSpeech('to lament','to mourn'))throw new Error('Same-part-of-speech synonyms should remain reviewable');
(async()=>{
 const browser=await chromium.launch({executablePath,args:['--no-sandbox']});
 let phrasesByRef=new Map();
 try{
  const page=await browser.newPage();
  await page.addScriptTag({path:path.join(__dirname,'../plugin/reading-view.js')});
  for(let start=0;start<jastrow.length;start+=250){
   const batch=jastrow.slice(start,start+250).map(e=>({r:e.r,html:e.html}));
   const extracted=await page.evaluate(batch=>batch.map(entry=>{
    const body=document.createElement('div');body.innerHTML=entry.html;
    return {r:entry.r,phrases:JastrowReadingView.phrases(body).map(p=>({text:p.text,label:p.label||'',section:p.section||''}))};
   }),batch);
   for(const item of extracted)phrasesByRef.set(item.r,item.phrases);
  }
 }finally{await browser.close();}
 const byForm=new Map();
 for(const entry of jastrow)for(const form of [entry.h,...(entry.alt||[])].map(S.normalize).filter(Boolean)){
  if(!byForm.has(form))byForm.set(form,[]);
  byForm.get(form).push(entry);
 }
 const candidates=new Map(),matchedRecordPairs=new Set();
 for(const k of krupnik){
  const matches=new Map();
  for(const form of [k.h,...(k.alt||[])].map(S.normalize).filter(Boolean))for(const j of byForm.get(form)||[]){const forms=sharedForms(j,k);if(forms.length)matches.set(j.r,{entry:j,forms});}
  for(const {entry:j,forms} of matches.values()){
   matchedRecordPairs.add(j.r+'|'+k.r);
   for(const jp of phrasesByRef.get(j.r)||[])for(const kg of k.glosses||[]){
    const jt=tokens(jp.text),kt=tokens(kg.text);
    if(!jt.length||!kt.length||clean(jp.text)===clean(kg.text)||U.canonicalGlossKey(jp.text)===U.canonicalGlossKey(kg.text))continue;
    if(stem(jp.label)&&stem(kg.label)&&stem(jp.label)!==stem(kg.label))continue;
    if(!samePartOfSpeech(jp.text,kg.text))continue;
    if(/^to\s+/i.test(clean(jp.text))&&/^to\s+/i.test(clean(kg.text))&&voice(jp.text)!==voice(kg.text))continue;
    const partPairs=[];
    for(const ja of alternatives(jp.text))for(const ka of alternatives(kg.text)){
     const evidence=partEvidence(ja,ka);
     if(evidence&&evidence.overlap>=0.5)partPairs.push(evidence);
    }
    partPairs.sort((a,b)=>(Number(clean(b.jastrow)===clean(b.krupnik))-Number(clean(a.jastrow)===clean(a.krupnik)))||b.jaccard-a.jaccard||b.overlap-a.overlap||b.sharedTerms.length-a.sharedTerms.length);
    if(!partPairs.length)continue;
    const overlap=jt.filter(t=>kt.includes(t));
    const wholeOverlap=overlap.length/Math.min(jt.length,kt.length);
    const wholeJaccard=overlap.length/new Set([...jt,...kt]).size;
    const ids=[j.r,k.r].sort().join('|');
    const glosses=[clean(jp.text),clean(kg.text)].sort().join(' | ');
    if(U.reviewedSourceGlossPairs.has(ids+'::'+glosses)||U.reviewedGlossPairs.has(glosses))continue;
    if(U.synonymKey(jp.text)===U.synonymKey(kg.text)||U.sharesReviewedSynonym(jp.text,kg.text))continue;
    const alternativeMatches=partPairs.filter(match=>{
     const key=ids+'::'+[clean(match.jastrow),clean(match.krupnik)].sort().join(' | ');
     return !U.reviewedSourceAlternativePairs?.has(key);
    });
    if(!alternativeMatches.length)continue;
    const best=alternativeMatches[0];
    const exactAlternativeMatch=clean(best.jastrow)===clean(best.krupnik);
    const tier=exactAlternativeMatch?'exact-alternative-match':best.jaccard>=0.75?'strong-alternative-overlap':best.jaccard>=0.5?'moderate-alternative-overlap':'weak-alternative-overlap';
    const key=[j.r,k.r,clean(jp.text),clean(kg.text),clean(jp.label),clean(kg.label)].join('::');
    candidates.set(key,{
     headword:j.h,
     sharedForms:forms,
     jastrow:{ref:j.r,headword:j.h,text:jp.text,label:jp.label,section:jp.section},
     krupnik:{ref:k.r,headword:k.h,text:kg.text,label:kg.label||''},
     sharedTerms:best.sharedTerms,
     overlap:best.overlap,
     jaccard:best.jaccard,
     wholeGlossOverlap:Number(wholeOverlap.toFixed(3)),
     wholeGlossJaccard:Number(wholeJaccard.toFixed(3)),
     bestAlternativeMatch:best,
     alternativeMatches:alternativeMatches.slice(0,10),
     exactAlternativeMatches:alternativeMatches.filter(match=>clean(match.jastrow)===clean(match.krupnik)),
     alternativePairCount:alternativeMatches.length,
     exactAlternativeMatch,
     candidateTier:tier,
     reviewStatus:'pending-human-review'
    });
   }
  }
 }
 const list=[...candidates.values()];
 // Exact alternative matches with colliding source senses are explicitly flagged.
 annotateExactPairRisks(list);
 list.sort((a,b)=>b.jaccard-a.jaccard||b.overlap-a.overlap||b.sharedTerms.length-a.sharedTerms.length||a.headword.localeCompare(b.headword));
 const report={
  generatedBy:'audit/build-meaning-candidates.cjs',
  purpose:'Discovery queue only; no candidate is approved for consolidation by this report.',
  method:{
   headwordMatching:'Jastrow Search.normalize across primary and alternate headword spellings',
   jastrowMeanings:'JastrowReadingView.phrases, the actual reader extractor',
   krupnikMeanings:'Original Krupnik gloss records',
   candidateRule:'Compare comma/semicolon-separated alternatives independently (respecting parenthetical commas); retain a candidate when any individual Jastrow/Krupnik alternative pair shares content terms with overlap coefficient >= 0.5; rank exact alternative matches first, then by best alternative-level Jaccard rather than whole-gloss overlap; exact complete gloss lists and individually reviewed source-alternative pairs are excluded; pointed-headword conflicts, explicit label conflicts, verb/noun mismatches, and active/passive infinitive mismatches are excluded; no fuzzy automatic merging',
   limitations:'Lexical overlap is only a review hint. Shared terms can represent distinct senses; grammatical labels and source context require manual review.',
   ambiguityFlags:'Exact alternative matches are flagged when the same source pair and exact alternative recur across multiple source senses or explicit grammatical labels. These are not auto-approved.'
  },
  totals:{sourceEntries:entries.length,jastrowEntries:jastrow.length,krupnikEntries:krupnik.length,jastrowEntriesWithReaderPhrases:[...phrasesByRef.values()].filter(x=>x.length).length,sharedHeadwordRecordPairs:matchedRecordPairs.size,jastrowHeadwordIndexAssociations:[...byForm.values()].reduce((n,a)=>n+a.length,0),candidates:list.length,exactAlternativeCandidates:list.filter(x=>(x.exactAlternativeMatches||[]).length).length,runtimeRuleHandledCandidates:list.filter(x=>x.reviewStatus==='handled-by-runtime-rule').length,ambiguityFlaggedExactCandidates:list.filter(x=>(x.exactAlternativeMatches||[]).length&&x.reviewFlags.length).length,nonExactSemanticCandidates:list.filter(x=>!(x.exactAlternativeMatches||[]).length).length},
  candidates:list
 };
 const output=path.join(__dirname,'meaning-consolidation-candidates.json');
 fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
 const summary=[
  '## Cross-dictionary synonym candidate inventory',
  '',
  '- Jastrow entries with reader-extracted meanings: '+report.totals.jastrowEntriesWithReaderPhrases,
  '- Krupnik entries: '+report.totals.krupnikEntries,
  '- Candidate gloss pairs requiring human review: '+list.length,
  '- Exact alternative candidates handled by the guarded runtime rule: '+report.totals.runtimeRuleHandledCandidates,
  '- Exact alternative candidates flagged for manual ambiguity review: '+report.totals.ambiguityFlaggedExactCandidates,
  '- Non-exact semantic candidates still requiring human review: '+report.totals.nonExactSemanticCandidates,
  '',
  'This is a discovery queue only. Nothing is automatically merged or approved.',
  '',
  'Top candidate examples:',
  ...list.slice(0,15).map(x=>'- '+x.headword+' ('+x.jastrow.ref+' / '+x.krupnik.ref+'): “'+x.jastrow.text+'” ↔ “'+x.krupnik.text+'” ['+x.sharedTerms.join(', ')+']')
 ].join('\n');
 if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,summary+'\n');
 console.log(JSON.stringify(report.totals));
 console.log('Wrote '+output);
})().catch(error=>{console.error(error);process.exitCode=1});
