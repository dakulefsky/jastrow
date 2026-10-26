const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium,executablePath}=require('./browser_support.cjs');
(async()=>{
 const server=http.createServer((req,res)=>{try{const file=path.join(__dirname,'plugin',new URL(req.url,'http://localhost').pathname);res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));}catch{res.statusCode=404;res.end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({executablePath,args:['--no-sandbox']});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto('http://127.0.0.1:'+server.address().port+'/index.html');
  const lookup=async q=>{await page.fill('#query',q);await page.click('.lookup-button');await page.locator('.unified-meanings').first().waitFor();};
  await lookup('לצפרא');assert.match(await page.locator('.prefix-analysis').innerText(),/ל \+ צפרא/);
  const texts=await page.locator('.meaning-text').allTextContents();assert(texts.some(t=>/morning/.test(t)));assert(texts.some(t=>/bird/.test(t)));
  await page.reload();await page.locator('.unified-meanings').waitFor();assert.match(await page.locator('.prefix-analysis').innerText(),/ל \+ צפרא/);assert.deepEqual(await page.locator('.meaning-text').allTextContents(),texts);
  // Entry links/history must retain the analysis as well as the selected spelling.
  await page.evaluate(()=>showEntry(JastrowSearch.lookup(index,'לצפרא').ids[0],true,null,'לצפרא'));await page.locator('.prefix-analysis').waitFor();
  await lookup('דְּלְאַרְעָא');assert.match(await page.locator('.unified-meanings>ol').innerText(),/land/);assert(!/accident/.test(await page.locator('.unified-meanings>ol').innerText()));
  await lookup('לצפרא טבא');assert.equal(await page.locator('.phrase-word').count(),2);assert.equal(await page.locator('.prefix-analysis').count(),1);
  const quick=await page.evaluate(async()=>({meanings:await DictionaryQuick.meanings('לצפרא'),message:DictionaryQuick.message('לצפרא',['morning'],true)}));assert(quick.meanings.some(t=>/morning/.test(t)));assert.match(quick.message,/possible prefixed form/);
  const messages=await page.evaluate(async()=>{const calls=[];window.Otzaria={call:async(method,args)=>{calls.push({method,args});return {success:true};}};try{await DictionaryQuick.show('לצפרא');await DictionaryQuick.show('לצפרא טבא');return calls;}finally{delete window.Otzaria;}});
  assert.equal(messages.length,2);for(const call of messages){assert.equal(call.method,'ui.showMessage');assert.match(call.args.message,/possible prefixed form/);assert.equal(call.args.tapOpenPlugin,true);}assert.equal(messages[0].args.tapPayload.dictionaryWord,'לצפרא');
  await lookup('צפרא');assert.equal(await page.locator('.prefix-analysis').count(),0);
  assert.deepEqual(errors,[]);console.log('PASS rendered prefix analysis, full ambiguous base meanings, vowel ranking, reload, direct entry, multiword and quick-lookup consistency.');
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
