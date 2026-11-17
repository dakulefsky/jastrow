'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const ctx={};ctx.window=ctx;vm.createContext(ctx);
for(const file of ['data.js','lookup.js'])vm.runInContext(fs.readFileSync(__dirname+'/plugin/'+file,'utf8'),ctx);
const dictionary=ctx.HEBREW_DICTIONARY;
assert.equal(dictionary.entries.length,20177);
assert(dictionary.entries.every(entry=>/^KRU\d+$/.test(entry.rid)));
assert(!JSON.stringify(dictionary).includes('englishWithinHebrew'));
const results=ctx.HebrewLookup.lookup('נפקא מינה');
assert.equal(results.length,1);
assert.equal(results[0].parts[0].meaning,'היוצא לנו מזה למעשה');
assert(!results[0].parts[0].text.includes('the practical difference'));
assert(results[0].parts[0].text.includes('אפיקו ליה ריפתא'));
assert.equal(ctx.HebrewLookup.lookup('נַפְקָא מִינָהּ')[0].rid,results[0].rid);
assert.equal(ctx.HebrewLookup.lookup('zzzzz').length,0);
assert.equal(ctx.HebrewLookup.lookup('abc נפקא').length,0);
assert.equal(ctx.HebrewLookup.rank('נַפְקָא','נַפקא'),0);
assert.equal(ctx.HebrewLookup.rank('נִפְקָא','נַפקא'),1);

(async()=>{
 const {chromium,executablePath}=require('./browser_support.cjs');
 const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox']});
 try{
  const page=await browser.newPage();
  await page.addInitScript(()=>{
   window.__fetchCalls=0;
   window.fetch=async()=>{window.__fetchCalls++;throw new Error('offline browser test: runtime fetch is forbidden');};
  });
  await page.goto('file://'+__dirname+'/plugin/index.html');
  await page.locator('#query').fill('נפקא מינה');
  await page.locator('button[type=submit]').click();
  assert.equal(await page.locator('#results .meaning-card').count(),1);
  assert.equal(await page.locator('#results .meaning-card>p').textContent(),'היוצא לנו מזה למעשה');
  assert.equal(await page.locator('.community-vote').count(),0,'community voting stays disabled');
  assert.equal(await page.locator('html').getAttribute('dir'),'rtl');
  assert.equal(await page.locator('#results .meaning-card details').getAttribute('open'),null);
  await page.locator('#results .meaning-card summary').click();
  assert(await page.locator('#results .meaning-card details p').isVisible());
  await page.locator('#query').fill('מילהשאינהקיימת');
  await page.locator('button[type=submit]').click();
  assert.equal(await page.locator('#results .meaning-card').count(),0);
  await page.locator('#query').fill('נפקא מינה');
  await page.locator('button[type=submit]').click();

  const evidence=await page.evaluate(async()=>window.SefariaEvidence.compareTranslation('בדיקה',
   [{id:'offline',text:'beginning of tractate'}],
   {sourceRange:{ref:'ברכות, דף ב עמוד א:1'},currentBook:'ברכות'}));
  assert.equal(evidence.source,'offline');
  assert.equal(evidence.scope,'paragraph');
  assert.equal(evidence.matches[0].matchedPhrase,'beginning of tractate');
  assert.equal(await page.evaluate(()=>window.__fetchCalls),0,'the full Hebrew browser test must run without fetch/network access');
  assert.equal(await page.locator('.community-vote').count(),0);
  if(process.env.HEBREW_STORE_SCREENSHOT)await page.screenshot({path:process.env.HEBREW_STORE_SCREENSHOT,fullPage:true});
  console.log('PASS: 20,177 Hebrew source records, RTL lookup, source details, offline English-Shas clue, and no community voting.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
