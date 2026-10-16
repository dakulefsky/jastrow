const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium,executablePath}=require('./browser_support.cjs');
(async()=>{
 const server=http.createServer((req,res)=>{try{const p=path.join(__dirname,'plugin',req.url==='/'?'index.html':req.url);res.setHeader('Content-Type',p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(p));}catch{res.statusCode=404;res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({executablePath,args:['--no-sandbox']});const page=await browser.newPage();const base='http://127.0.0.1:'+server.address().port,errors=[],external=[];
  page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>{if(!r.url().startsWith(base))external.push(r.url());});await page.goto(base);
  const lookup=async word=>{await page.fill('#query',word);await page.locator('.lookup-button').click();};
  await lookup('מא');await page.locator('.krupnik-definitions').waitFor();assert.match(await page.locator('.krupnik-definitions').innerText(),/what\? how\?/);
  assert(await page.locator('.matches-panel').isHidden());assert.equal(await page.locator('.compare-source,.word-link,.entry-nav').count(),0);
  assert(!/Jastrow|Krupnik|Silbermann/.test(await page.locator('#entry').innerText()));
  await page.locator('.scholarly-entry summary').click();assert.match(await page.locator('#entry').innerText(),/Krupnik/);assert(!/was\? wie\?/.test(await page.locator('#entry').innerText()));
  await lookup('דאמר');await page.locator('.translation-group').first().waitFor();assert.match(await page.locator('#entry').innerText(),/Possible meanings/);assert((await page.locator('.translation-group').count())>1);assert.match(await page.locator('#entry').innerText(),/say|speak/);assert(await page.locator('.matches-panel').isHidden());
  assert(!/Jastrow|Krupnik|Silbermann|Choose a matching entry/.test(await page.locator('#entry').innerText()));
  const cards=await page.locator('.meaning-text').count();assert(cards>0);await page.locator('.scholarly-entry summary').first().click();assert.match(await page.locator('#entry').innerText(),/Jastrow/);
  // A new query wins over any previous asynchronous group loading.
  await page.evaluate(()=>{search('דאמר');search('מא');});await page.locator('.krupnik-definitions').waitFor();assert.equal(await page.locator('.translation-group').count(),0);
  await lookup('אבגדהוזחטיכלמנסעפצקרשת');assert.match(await page.locator('#entry').innerText(),/No matching entry/);
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log('PASS: one offline answer flow; concise default, inline ambiguous meanings, credits only in details, no dictionary choices, no German, stale-query protection and unknown words.');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
