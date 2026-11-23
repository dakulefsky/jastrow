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
const cases=[];
for(const pair of U.reviewedSourceGlossPairs){
 const [refs,glossText]=pair.split('::'),[a,b]=refs.split('|'),glosses=glossText.split(' | ');
 const krupnikRef=[a,b].find(x=>x.startsWith('KRU')),jastrowRef=[a,b].find(x=>!x.startsWith('KRU'));
 const krupnik=byRef.get(krupnikRef),jastrow=byRef.get(jastrowRef);
 assert(krupnik&&jastrow,'source records exist for '+pair);
 const kg=glosses.find(g=>(krupnik.glosses||[]).some(x=>clean(x.text)===g));
 const jg=glosses.find(g=>g!==kg);
 assert(kg&&jg,'pair contains source glosses for '+pair);
 cases.push({ref:jastrowRef,html:jastrow.html,expected:jg});
}
(async()=>{
 const browser=await chromium.launch({executablePath,args:['--no-sandbox']});
 try{
  const page=await browser.newPage();
  await page.addScriptTag({path:path.join(__dirname,'plugin/reading-view.js')});
  const results=await page.evaluate(cases=>cases.map(test=>{
   const body=document.createElement('div');body.innerHTML=test.html;
   const extracted=JastrowReadingView.phrases(body).map(p=>p.text.normalize('NFKC').toLowerCase().replace(/[’‘]/g,"'").replace(/[‐‑–—]/g,'-').replace(/[.\s]+$/,'').trim().replace(/\s+/g,' '));
   return {ref:test.ref,expected:test.expected,extracted,found:extracted.includes(test.expected)};
  }),cases);
  const misses=results.filter(x=>!x.found);
  assert.equal(misses.length,0,'Every reviewed Jastrow gloss must be emitted by the real phrase extractor. First misses: '+JSON.stringify(misses.slice(0,15)));
  console.log('PASS: all '+results.length+' reviewed Jastrow glosses are emitted by JastrowReadingView.phrases.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
