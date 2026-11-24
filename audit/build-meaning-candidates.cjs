// Generate a human-review queue for cross-dictionary synonym candidates.
// Discovery only: this script NEVER merges meanings or edits reviewed mappings.
// Jastrow phrases are taken from the same extractor used by the reading UI.
const fs=require('node:fs');
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
const stem=label=>clean(String(label||'').replace(/^[—\s]*\d+[).]?\s*/,'').replace(/\s+\d+[).]?\s*$/,''));
const sharedForms=(a,b)=>{const left=[a.h,...(a.alt||[])],right=[b.h,...(b.alt||[])],forms=[];for(const x of left)for(const y of right)if(S.normalize(x)===S.normalize(y)&&S.vowelRank({h:x},y)!==2)forms.push(S.normalize(x));return [...new Set(forms)];};
const voice=value=>/^to\s+be\s+/i.test(clean(value))?'passive':'active';
const samePartOfSpeech=(a,b)=>/^to\s+/i.test(clean(a))===/^to\s+/i.test(clean(b));
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
    if(!jt.length||!kt.length||clean(jp.text)===clean(kg.text))continue;
    if(stem(jp.label)&&stem(kg.label)&&stem(jp.label)!==stem(kg.label))continue;
    if(!samePartOfSpeech(jp.text,kg.text))continue;
    if(/^to\s+/i.test(clean(jp.text))&&/^to\s+/i.test(clean(kg.text))&&voice(jp.text)!==voice(kg.text))continue;
    const overlap=jt.filter(t=>kt.includes(t));
    if(!overlap.length)continue;
    const score=overlap.length/Math.min(jt.length,kt.length);
    if(score<0.5)continue;
    const ids=[j.r,k.r].sort().join('|');
    const glosses=[clean(jp.text),clean(kg.text)].sort().join(' | ');
    if(U.reviewedSourceGlossPairs.has(ids+'::'+glosses)||U.reviewedGlossPairs.has(glosses))continue;
    if(U.synonymKey(jp.text)===U.synonymKey(kg.text)||U.sharesReviewedSynonym(jp.text,kg.text))continue;
    const jaccard=overlap.length/new Set([...jt,...kt]).size;
    const key=[j.r,k.r,clean(jp.text),clean(kg.text),clean(jp.label),clean(kg.label)].join('::');
    candidates.set(key,{
     headword:j.h,
     sharedForms:forms,
     jastrow:{ref:j.r,headword:j.h,text:jp.text,label:jp.label,section:jp.section},
     krupnik:{ref:k.r,headword:k.h,text:kg.text,label:kg.label||''},
     sharedTerms:overlap,
     overlap:Number(score.toFixed(3)),
     jaccard:Number(jaccard.toFixed(3)),
     reviewStatus:'pending-human-review'
    });
   }
  }
 }
 const list=[...candidates.values()].sort((a,b)=>b.jaccard-a.jaccard||b.overlap-a.overlap||b.sharedTerms.length-a.sharedTerms.length||a.headword.localeCompare(b.headword));
 const report={
  generatedBy:'audit/build-meaning-candidates.cjs',
  purpose:'Discovery queue only; no candidate is approved for consolidation by this report.',
  method:{
   headwordMatching:'Jastrow Search.normalize across primary and alternate headword spellings',
   jastrowMeanings:'JastrowReadingView.phrases, the actual reader extractor',
   krupnikMeanings:'Original Krupnik gloss records',
   candidateRule:'At least one shared content token and overlap coefficient >= 0.5; pointed-headword conflicts, explicit label conflicts, verb/noun mismatches, and active/passive infinitive mismatches are excluded; already-reviewed pairs are excluded; no automatic merging',
   limitations:'Lexical overlap is only a review hint. Shared terms can represent distinct senses; grammatical labels and source context require manual review.'
  },
  totals:{sourceEntries:entries.length,jastrowEntries:jastrow.length,krupnikEntries:krupnik.length,jastrowEntriesWithReaderPhrases:[...phrasesByRef.values()].filter(x=>x.length).length,sharedHeadwordRecordPairs:matchedRecordPairs.size,jastrowHeadwordIndexAssociations:[...byForm.values()].reduce((n,a)=>n+a.length,0),candidates:list.length},
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
