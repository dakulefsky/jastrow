const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium,executablePath}=require('./browser_support.cjs');
(async()=>{
 const server=http.createServer((req,res)=>{try{const p=path.join(__dirname,'plugin',new URL(req.url,'http://localhost').pathname==='/'?'index.html':new URL(req.url,'http://localhost').pathname);res.setHeader('Content-Type',p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':p.endsWith('.png')?'image/png':'text/html');res.end(fs.readFileSync(p));}catch{res.statusCode=404;res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({executablePath,args:['--no-sandbox']});const page=await browser.newPage(),base='http://127.0.0.1:'+server.address().port,errors=[],external=[];
  page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>{if(!r.url().startsWith(base))external.push(r.url());});
  await page.goto(base);
  // Old hidden preferences must not change the default answer order.
  await page.evaluate(()=>localStorage.setItem('jastrow-student-v1',JSON.stringify({matchOrder:'dictionary'})));await page.reload();
  const lookup=async word=>{await page.fill('#query',word);await page.locator('.lookup-button').click();await page.locator('.translation-group').first().waitFor();await page.waitForFunction(()=>document.querySelector('#entry').innerText.includes('fowl, bird'));};
  await lookup('צפרא');const first=await page.locator('#entry').innerText();assert.match(first,/morning/);assert.match(first,/fowl, bird/);assert(!/\b(?:III|IV)\b/.test(first));
  assert.equal(await page.locator('.scholarly-entry[open]').count(),0);
  assert((await page.locator('.translation-group').count())>=3);
  await lookup('צפרא');assert.equal(await page.locator('#entry').innerText(),first);
  await page.reload();await page.waitForFunction(()=>document.querySelector('#entry').innerText.includes('fowl, bird'));assert.equal(await page.locator('#entry').innerText(),first);
  await page.evaluate(()=>search('ספרא'));await page.waitForFunction(()=>document.querySelector('#entry').innerText.includes('scribe, copyist'));
  await page.locator('#recent-lookups button').filter({hasText:'צפרא'}).first().click();await page.waitForFunction(()=>document.querySelector('#entry').innerText.includes('fowl, bird'));assert.equal(await page.locator('#entry').innerText(),first);
  // A new query wins over old chunk and overview work.
  await page.evaluate(()=>{search('דאמר');search('צפרא');});await page.waitForFunction(()=>document.querySelector('#entry').innerText.includes('fowl, bird'));assert.equal(await page.locator('#entry').innerText(),first);
  await page.locator('.scholarly-entry summary').nth(2).click();assert.match(await page.locator('#entry').innerText(),/Dictionary headword:.*IV/);
  await page.evaluate(()=>search('נפקא מינה'));assert.equal(await page.locator('.phrase-word').count(),1);assert.equal(await page.locator('[data-match-kind=phrase]').count(),1);assert.match(await page.locator('#entry').innerText(),/the practical difference is/);assert(!/to bring out|to be brought forth/.test(await page.locator('#entry').innerText()));
  await page.locator('.scholarly-entry summary').click();assert.match(await page.locator('#entry').innerText(),/to bring out/);
  await page.reload();await page.waitForFunction(()=>document.querySelector('#entry').innerText.includes('the practical difference is'));assert.equal(await page.locator('.phrase-word').count(),1);assert.equal(await page.locator('.scholarly-entry[open]').count(),0);
  await page.evaluate(()=>search('מאי שנא'));assert.equal(await page.locator('.phrase-word').count(),1);assert.match(await page.locator('#entry').innerText(),/wherein lies the difference/);
  await page.evaluate(()=>search('נפקא מינה טבא'));assert.equal(await page.locator('.phrase-word').count(),2);assert.match(await page.locator('.phrase-word').first().innerText(),/the practical difference is/);
  await page.evaluate(()=>search('איכא דאמרי'));assert.match(await page.locator('#entry').innerText(),/some say/);assert(!/sagen/.test(await page.locator('#entry').innerText()));
  await page.evaluate(()=>search('צפרא ספרא'));assert.equal(await page.locator('.phrase-word').count(),2);assert.match(await page.locator('.phrase-word').first().innerText(),/morning/);assert.match(await page.locator('.phrase-word').first().innerText(),/fowl, bird/);assert.match(await page.locator('.phrase-word').nth(1).innerText(),/book/);
  const phrase=await page.locator('#entry').innerText();await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.phrase-word').length===2&&document.querySelector('#entry').innerText.includes('book'));assert.equal(await page.locator('#entry').innerText(),phrase);
  await page.evaluate(()=>search('צפרא אבגדהוזחטיכלמנסעפצקרשת'));assert.match(await page.locator('.phrase-word').nth(1).innerText(),/No indexed translation/);assert.match(await page.locator('.phrase-word').first().innerText(),/morning/);
  await page.evaluate(()=>{search('צפרא טבא');search('ספרא');});await page.waitForFunction(()=>document.querySelector('#entry').innerText.includes('scribe, copyist'));assert.equal(await page.locator('.phrase-word').count(),0);
  await page.evaluate(()=>search('אבגדהוזחטיכלמנסעפצקרשת'));await page.waitForFunction(()=>document.querySelector('#entry').innerText.includes('No matching entry'));
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log('PASS: complete separate meanings; stable typed/recent/reloaded/racing lookups; source numbering only in collapsed details; no network or browser errors.');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
