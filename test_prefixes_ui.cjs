const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium,executablePath}=require('./browser_support.cjs');
(async()=>{
 const server=http.createServer((req,res)=>{try{const pathname=new URL(req.url,'http://localhost').pathname;if(pathname==='/community-config.js'){res.setHeader('Content-Type','text/javascript');res.end("window.DICTIONARY_COMMUNITY_API='';");return;}const file=path.join(__dirname,'plugin',pathname);res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));}catch{res.statusCode=404;res.end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({executablePath,args:['--no-sandbox']});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto('http://127.0.0.1:'+server.address().port+'/index.html');
  const lookup=async q=>{const before=await page.locator('#entry').innerHTML();await page.fill('#query',q);await page.click('.lookup-button');await page.waitForFunction(before=>document.querySelector('#entry')?.innerHTML!==before,before);await page.locator('.unified-meanings').first().waitFor();};
  await lookup('לצפרא');assert.match(await page.locator('.prefix-analysis').innerText(),/ל \+ צפרא/);
  const texts=await page.locator('.meaning-text').allTextContents();assert(texts.some(t=>/morning/.test(t)));assert(texts.some(t=>/bird/.test(t)));
  await page.reload();await page.locator('.unified-meanings').waitFor();assert.match(await page.locator('.prefix-analysis').innerText(),/ל \+ צפרא/);assert.deepEqual(await page.locator('.meaning-text').allTextContents(),texts);
  // Entry links/history must retain the analysis as well as the selected spelling.
  await page.evaluate(()=>showEntry(JastrowSearch.lookup(index,'לצפרא').ids[0],true,null,'לצפרא'));await page.locator('.prefix-analysis').waitFor();
  await lookup('דְּלְאַרְעָא');assert.match(await page.locator('.unified-meanings>ol').innerText(),/land/);assert(!/accident/.test(await page.locator('.unified-meanings>ol').innerText()));
  await lookup('לצפרא טבא');assert.equal(await page.locator('.phrase-word').count(),2);assert.equal(await page.locator('.prefix-analysis').count(),1);
  const quick=await page.evaluate(async()=>({
   meanings:await DictionaryQuick.meanings('לצפרא'),
   prefixed:await DictionaryQuick.results('לצפרא',null,{maxCandidates:16}),
   phrase:await DictionaryQuick.results('לצפרא טבא',null,{maxCandidates:16}),
   inflected:await DictionaryQuick.results('ביתיהון',null,{maxCandidates:16})
  }));
  assert(quick.meanings.some(t=>/morning/.test(t)));
  assert(quick.prefixed.some(item=>/morning/.test(item.text)&&Number.isInteger(item.entryId)));
  assert(quick.phrase.some(item=>item.selectedWord),'multiword quick lookup should retain the source word for each result');
  assert(quick.inflected.some(item=>Number.isInteger(item.entryId)),'inflected quick results must retain their source dictionary entry');
  assert(quick.prefixed.every(item=>!item.text.includes('possible prefixed form')),'technical form labels stay out of quick-result glosses');
  await lookup('צפרא');assert.equal(await page.locator('.prefix-analysis').count(),0);
  await lookup('מילתיהון');assert.match(await page.locator('.prefix-analysis').innerText(),/possible noun ending/);assert.match(await page.locator('#entry').innerText(),/word|thing|affair/);
  await page.reload();await page.locator('.unified-meanings').waitFor();assert.equal(await page.locator('#query').inputValue(),'מילתיהון');assert.match(await page.locator('.prefix-analysis').innerText(),/noun ending/);
  await lookup('דמילתייכו טבא');assert.equal(await page.locator('.phrase-word').count(),2);assert.match(await page.locator('.prefix-analysis').innerText(),/noun ending/);

  assert.deepEqual(errors,[]);console.log('PASS rendered prefix analysis, full ambiguous base meanings, vowel ranking, reload, direct entry, multiword and native quick-menu candidate consistency.');
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
