const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {chromium,executablePath}=require('./browser_support.cjs');
const U=require('./plugin/unified-view.js');
const S=require('./plugin/search.js');
const dataDir=path.join(__dirname,'plugin/data');
const context={window:{JASTROW_CHUNKS:{}}};vm.createContext(context);
for(const file of fs.readdirSync(dataDir).filter(n=>/^(?:chunk-\d+|krupnik-\d+)\.js$/.test(n)).sort()){
 vm.runInContext(fs.readFileSync(path.join(dataDir,file),'utf8'),context);
}
const byRef=new Map(Object.values(context.window.JASTROW_CHUNKS).flatMap(chunk=>Object.values(chunk)).filter(e=>e.r).map(e=>[e.r,e]));
const clean=value=>String(value).normalize('NFKC').toLowerCase().replace(/[’‘]/g,"'").replace(/[‐‑–—]/g,'-').replace(/[.\s]+$/,'').trim().replace(/\s+/g,' ');
const alternativeKey=value=>clean(value).replace(/^(?:a|an|the)\s+/,'');
const cases=[];
const splitAlternatives=value=>{
 const out=[];let current='',depth=0;
 for(const ch of String(value||'')){
  if(ch==='(')depth++;else if(ch===')')depth=Math.max(0,depth-1);
  if((ch===','||ch===';')&&depth===0){if(clean(current))out.push(clean(current));current='';}
  else current+=ch;
 }
 if(clean(current))out.push(clean(current));
 return out;
};
for(const pair of U.reviewedSourceGlossPairs){
 const [refs,glossText]=pair.split('::'),[a,b]=refs.split('|'),glosses=glossText.split(' | ');
 const krupnikRef=[a,b].find(x=>x.startsWith('KRU')),jastrowRef=[a,b].find(x=>!x.startsWith('KRU'));
 const krupnik=byRef.get(krupnikRef),jastrow=byRef.get(jastrowRef);
 assert(krupnik&&jastrow,'source records exist for '+pair);
 const kg=glosses.find(g=>(krupnik.glosses||[]).some(x=>clean(x.text)===g));
 const jg=glosses.find(g=>g!==kg)||kg;
 assert(kg&&jg,'pair contains source glosses for '+pair);
 cases.push({ref:jastrowRef,html:jastrow.html,expected:jg,kind:'whole-gloss'});
}
for(const pair of U.reviewedSourceAlternativePairs){
 const [refs,glossText]=pair.split('::'),[a,b]=refs.split('|'),alternatives=glossText.split(' | ');
 const krupnikRef=[a,b].find(x=>x.startsWith('KRU')),jastrowRef=[a,b].find(x=>!x.startsWith('KRU'));
 const krupnik=byRef.get(krupnikRef),jastrow=byRef.get(jastrowRef);
 assert(krupnik&&jastrow,'alternative source records exist for '+pair);
 assert((krupnik.glosses||[]).some(g=>splitAlternatives(g.text).some(value=>alternatives.some(expected=>alternativeKey(expected)===alternativeKey(value)))),
  'reviewed Krupnik alternative must occur inside its original gloss for '+pair);
 assert(alternatives.length===2&&alternatives.every(Boolean),'reviewed alternative pair must contain two source phrases');
 cases.push({ref:jastrowRef,html:jastrow.html,expected:alternatives,kind:'alternative'});
}
(async()=>{
 const browser=await chromium.launch({executablePath,args:['--no-sandbox']});
 try{
  const page=await browser.newPage();
  await page.addScriptTag({path:path.join(__dirname,'plugin/reading-view.js')});
  const results=await page.evaluate(cases=>cases.map(test=>{
   const body=document.createElement('div');body.innerHTML=test.html;
   const cleanText=value=>String(value).normalize('NFKC').toLowerCase().replace(/[’‘]/g,"'").replace(/[‐‑–—]/g,'-').replace(/[.\s]+$/,'').trim().replace(/\s+/g,' ');
   const extracted=JastrowReadingView.phrases(body).map(p=>cleanText(p.text));
   const expected=Array.isArray(test.expected)?test.expected:[test.expected];
   const splitPhrase=value=>{
    const out=[];let current='',depth=0;
    for(const ch of String(value||'')){
     if(ch==='(')depth++;else if(ch===')')depth=Math.max(0,depth-1);
     if((ch===','||ch===';')&&depth===0){if(cleanText(current))out.push(cleanText(current));current='';}
     else current+=ch;
    }
    if(cleanText(current))out.push(cleanText(current));
    return out;
   };
   const alternativeKey=value=>cleanText(value).replace(/^(?:a|an|the)\s+/,'');
   const found=test.kind==='alternative'
    ? expected.some(value=>extracted.some(phrase=>splitPhrase(phrase).some(part=>alternativeKey(part)===alternativeKey(value))))
    : expected.some(value=>extracted.includes(value));
   return {ref:test.ref,expected,extracted,found};
  }),cases);
  const misses=results.filter(x=>!x.found);
  if(misses.length)console.error('UNMATCHED_REVIEWED_PAIRS='+JSON.stringify(misses));
  assert.equal(misses.length,0,'Every reviewed Jastrow gloss or embedded alternative must be emitted by the real phrase extractor. First misses: '+JSON.stringify(misses.slice(0,15)));
  console.log('PASS: all '+results.length+' reviewed whole-gloss and alternative-level Jastrow phrases are emitted by JastrowReadingView.phrases.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
