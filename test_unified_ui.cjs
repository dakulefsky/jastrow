const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium,executablePath}=require('./browser_support.cjs');
(async()=>{
 const server=http.createServer((req,res)=>{try{const p=path.join(__dirname,'plugin',new URL(req.url,'http://localhost').pathname==='/'?'index.html':new URL(req.url,'http://localhost').pathname);res.setHeader('Content-Type',p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':p.endsWith('.png')?'image/png':'text/html');res.end(fs.readFileSync(p));}catch{res.statusCode=404;res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({executablePath,args:['--no-sandbox']});const page=await browser.newPage(),base='http://127.0.0.1:'+server.address().port,errors=[],external=[];
  page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>{if(!r.url().startsWith(base))external.push(r.url());});await page.goto(base);
  const lookup=async word=>{await page.fill('#query',word);await page.locator('.lookup-button').click();await page.locator('.unified-meanings').first().waitFor();};
  await lookup('אַרְעָא');let main=page.locator('.unified-meanings>ol>.meaning-card');assert.equal(await main.count(),1);assert.match(await main.first().innerText(),/land/);assert(!/accident|Jastrow|Krupnik/.test(await page.locator('#entry').innerText()));
  const land=main.first();assert.equal(await land.locator('.meaning-number').innerText(),'1');assert.equal(await land.locator('.meaning-references a').count(),2);
  await land.locator('.meaning-references a').last().click();assert.match(await land.innerText(),/Jastrow/);assert.match(await land.innerText(),/Krupnik/);assert.equal(await land.locator('.meaning-source').count(),2);
  await lookup('אַרְעָא');assert.equal(await page.locator('.scholarly-entry[open]').count(),0);const before=await page.locator('#entry').innerText();await page.reload();await page.locator('.unified-meanings').waitFor();assert.equal(await page.locator('#entry').innerText(),before);
  await page.locator('.other-readings>summary').click();assert.match(await page.locator('.other-readings').innerText(),/accident/);
  await lookup('אִרְעָא');assert.match(await page.locator('.unified-meanings>ol').innerText(),/accident/);assert(!/land,/.test(await page.locator('.unified-meanings>ol').innerText()));
  await lookup('ארעא');assert.match(await page.locator('#entry').innerText(),/land/);assert.match(await page.locator('#entry').innerText(),/accident/);assert.equal(await page.locator('.other-readings').count(),0);assert.equal(await page.locator('.meaning-text').filter({hasText:'land'}).count(),1);
  // Phrase meanings and plain words use the same cards and source controls.
  await lookup('נפקא מינה');assert.match(await page.locator('#entry').innerText(),/the practical difference is/);assert(!/to bring out/.test(await page.locator('#entry').innerText()));assert.equal(await page.locator('.meaning-card>.meaning-number').count(),1);
  await lookup('צפרא ספרא');assert.equal(await page.locator('.phrase-word').count(),2);assert.match(await page.locator('#entry').innerText(),/morning/);assert.match(await page.locator('#entry').innerText(),/bird/);assert.match(await page.locator('#entry').innerText(),/book/);
  await page.evaluate(()=>{search('צפרא ספרא');search('אַרְעָא');});await page.waitForFunction(()=>document.querySelector('.unified-meanings>ol')?.innerText.includes('land'));assert.equal(await page.locator('.phrase-word').count(),0);
  await page.evaluate(()=>search('אבגדהוזחטיכלמנסעפצקרשת'));assert.match(await page.locator('#entry').innerText(),/No matching entry/);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log('PASS: identical cards, one land meaning with both source footnotes, alternate vowel readings, phrase preservation, reload and race consistency, offline operation.');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
