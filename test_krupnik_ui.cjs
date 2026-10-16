const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium,executablePath}=require('./browser_support.cjs');
(async()=>{
 const server=http.createServer((req,res)=>{try{const p=path.join(__dirname,'plugin',req.url==='/'?'index.html':req.url);res.setHeader('Content-Type',p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(p));}catch{res.statusCode=404;res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({executablePath,args:['--no-sandbox']});const page=await browser.newPage();const base='http://127.0.0.1:'+server.address().port;const errors=[],external=[];
  page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>{if(!r.url().startsWith(base))external.push(r.url());});
  await page.goto(base);assert.equal(await page.locator('#count').innerText(),'47,919 entries');
  await page.fill('#query','מא');await page.locator('.lookup-button').click();await page.locator('.result-meaning').first().waitFor();assert.match(await page.locator('.result').first().innerText(),/Krupnik & Silbermann/);
  await page.locator('.result').first().click();await page.locator('.krupnik-definitions').waitFor();assert.match(await page.locator('.krupnik-definitions').innerText(),/what\? how\?/);assert.match(await page.locator('.entry-meta').first().innerText(),/Krupnik/);
  assert.equal(await page.locator('.scholarly-entry').getAttribute('open'),null);await page.locator('.scholarly-entry summary').click();assert.match(await page.locator('.definition').innerText(),/was\? wie\?/);
  const kTitle=await page.locator('.entry-title').innerText();await page.locator('.result').filter({hasText:'Jastrow ·'}).first().click();await page.locator('.quick-meanings,.scholarly-entry').first().waitFor();assert.match(await page.locator('.entry-meta').first().innerText(),/Jastrow/);
  await page.getByRole('button',{name:'← Back',exact:true}).click();await page.locator('.krupnik-definitions').waitFor();assert.equal(await page.locator('.entry-title').innerText(),kTitle);
  // Use a direct Krupnik headword with several verbal stems; keep original labels.
  const id=await page.evaluate(()=>index.entries.findIndex(e=>e.source==='krupnik'&&e.h==='אוֹגַר'));assert(id>=32512);await page.evaluate(id=>showEntry(id,true,null,'אוגר'),id);assert.match(await page.locator('.krupnik-definitions').innerText(),/אפ׳/);assert.match(await page.locator('.krupnik-definitions').innerText(),/אתפ׳/);
  // A newly imported exact headword must precede every old linked form.
  assert(await page.evaluate(()=>{const r=JastrowSearch.lookup(index,'אוגר');let form=false;return r.ids.every(id=>{if(!(index.direct['אוגר']||[]).includes(id)){form=true;return true;}return !form;});}));
  await page.reload();await page.locator('.krupnik-definitions').waitFor();assert.match(await page.locator('.entry-meta').first().innerText(),/Krupnik/);
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log('PASS: offline concise previews, source attribution, English glosses, full multilingual dropdown, binyan labels, Jastrow coexistence, back navigation and reload.');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
