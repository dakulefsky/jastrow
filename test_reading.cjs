const assert=require('node:assert/strict'),{chromium,executablePath}=require('./browser_support.cjs');
const path=require('node:path'),{pathToFileURL}=require('node:url');
(async()=>{const browser=await chromium.launch({executablePath,args:['--no-sandbox']});try{
 const page=await browser.newPage();await page.addScriptTag({path:path.join(__dirname,'plugin/reading-view.js')});
 const result=await page.evaluate(()=>{
  const body=document.createElement('div');body.innerHTML='<div class="sense"><b>Af.</b><div class="sense"><i id="first-sense">to teach</i></div></div><div class="sense"><b>Pa.</b><div class="sense"><i id="second-sense">to teach</i></div></div>';
  const phrases=JastrowReadingView.phrases(body),host=document.createElement('div');host.append(JastrowReadingView.render(body));document.body.append(host);host.querySelector('.scholarly-entry').open=true;return{labels:phrases.map(p=>p.label),highlight:body.querySelector('.meaning-highlight')?.id,open:host.querySelector('.scholarly-entry').open};
 });assert.deepEqual(result.labels,['Af.','Pa.']);assert(result.open);console.log('PASS: repeated phrases retain their own verb-form context and exact original element.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
