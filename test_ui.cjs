const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium,executablePath}=require('./browser_support.cjs');
(async()=>{
 const server=http.createServer((req,res)=>{const requestPath=decodeURIComponent(req.url.split('?')[0]);const file=path.join(__dirname,'plugin',requestPath==='/'?'index.html':requestPath);try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));}catch{res.statusCode=404;res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1440,height:1000}});const page=await context.newPage();const errors=[],external=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>{if(!r.url().startsWith(base+'/'))external.push(r.url());});
 await page.addInitScript(()=>{window.testEvents={};window.calls=[];window.Otzaria={on:(e,f)=>{(testEvents[e]??=[]).push(f)},call:async(m,p)=>{calls.push(m);return {success:true,data:{text:'מיתיבי'}}}};});
 await page.goto(base+'/',{waitUntil:'networkidle'});
 await page.evaluate("testEvents['plugin.boot'].forEach(f=>f({theme:{colorScheme:{primary:'#315e50',surface:'#f4f5f1',onSurface:'#23342d',surfaceContainerHigh:'#e8eee8',outline:'#d6dfd8',onSurfaceVariant:'#68776f'}}}))");
 assert.equal(await page.locator('#count').innerText(),'32,512 entries');
 await page.screenshot({path:path.join(__dirname,'preview-home.png'),fullPage:true});
 await page.fill('#query','מיתיבי');await page.click('.lookup-button');await page.locator('.entry-title').waitFor();assert((await page.locator('.quick-meanings').innerText()).length>10);assert(await page.locator('.scholarly-entry summary').isVisible());
 await page.locator('.meaning-context').first().click();assert(await page.locator('.scholarly-entry').getAttribute('open')!==null);assert.equal(await page.locator('.meaning-highlight').count(),1);await page.locator('.scholarly-entry summary').click();
 await page.fill('#query','דאמר');await page.click('.lookup-button');assert.equal(await page.locator('#entry h2').innerText(),'Choose a matching entry');
 await page.locator('.result').filter({hasText:'אָמַר I'}).first().click();await page.locator('.scholarly-entry summary').click();assert.match((await page.locator('.definition').innerText()).toLowerCase(),/say/);
 await page.evaluate("testEvents['reader.context_menu_item_clicked'].forEach(f=>f({itemId:'jastrow-lookup',selectedText:'רחמנא'}))");await page.waitForFunction(()=>document.querySelector('.entry-title')?.textContent.includes('רַחֲמָן'));assert((await page.locator('.quick-meanings').innerText()).length>10);await page.screenshot({path:path.join(__dirname,'preview-definition.png'),fullPage:true});
 await page.evaluate("testEvents['theme.changed'].forEach(f=>f({colorScheme:{primary:'#235242',surface:'#202020',onSurface:'#ffffff',surfaceContainerHigh:'#333333',outline:'#777777',onSurfaceVariant:'#dddddd'}}))");assert.equal(await page.evaluate('getComputedStyle(document.body).backgroundColor'),'rgb(32, 32, 32)');
 await page.evaluate("testEvents['theme.changed'].forEach(f=>f({colorScheme:{primary:'#315e50',surface:'#f4f5f1',onSurface:'#23342d',surfaceContainerHigh:'#e8eee8',outline:'#d6dfd8',onSurfaceVariant:'#68776f'}}))");
 await page.fill('#query','א');await page.click('.lookup-button');await page.locator('.result').first().click();await page.locator('.scholarly-entry summary').click();await page.locator('.scholarly-entry a[data-headword]').first().waitFor();const title=await page.locator('.entry-title').innerText();await page.locator('.scholarly-entry a[data-headword]').first().click();await page.waitForTimeout(200);assert.notEqual(await page.locator('.entry-title').innerText(),title);
 await page.screenshot({path:path.join(__dirname,'preview-cross-reference.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});assert(await page.evaluate('document.documentElement.scrollWidth<=innerWidth'));await page.screenshot({path:path.join(__dirname,'preview-mobile.png'),fullPage:true});
 const preview=await context.newPage(),previewErrors=[];preview.on('pageerror',e=>previewErrors.push(String(e)));preview.on('console',m=>{if(m.type()==='error')previewErrors.push(m.text())});
 await preview.goto(require('node:url').pathToFileURL(path.join(__dirname,'..','Jastrow-Preview.html')).href,{waitUntil:'load'});assert.equal(await preview.locator('.welcome').count(),1);await preview.fill('#query','רחמנא');await preview.click('.lookup-button');await preview.locator('.entry-title').waitFor({timeout:15000});assert((await preview.locator('.quick-meanings').innerText()).includes('Merciful'));assert.equal(await preview.locator('#query').inputValue(),'רחמנא');await preview.screenshot({path:path.join(__dirname,'preview-standalone.png'),fullPage:true});assert.deepEqual(previewErrors,[]);
 await preview.fill('#query','תניא');await preview.click('.lookup-button');await preview.locator('.form-attestation').waitFor();assert((await preview.locator('.form-attestation').innerText()).includes('תניא to Boraitha'));assert.equal(await preview.locator('.scholarly-entry').getAttribute('open'),null);
 // Definition history and deep links preserve the chosen sense.

 const first=await preview.locator('.entry-title').innerText();await preview.locator('.entry-nav button').last().click();await preview.waitForFunction(t=>document.querySelector('.entry-title').textContent!==t,first);const second=await preview.locator('.entry-title').innerText();
 await preview.locator('#definition-history button').first().click();await preview.waitForFunction(t=>document.querySelector('.entry-title').textContent===t,first);await preview.locator('#definition-history button').last().click();await preview.waitForFunction(t=>document.querySelector('.entry-title').textContent===t,second);
 await preview.reload();await preview.locator('.entry-title').waitFor();assert.equal(await preview.locator('.entry-title').innerText(),second);
 await preview.evaluate(()=>location.hash='entry=100&word=בדיקה');await preview.waitForFunction(()=>document.querySelector('.entry-title').textContent===index.entries[100].h);assert.equal(await preview.locator('#query').inputValue(),'בדיקה');
 await page.fill('#query','אמרabc');await page.click('.lookup-button');assert.equal(await page.locator('.result').count(),0);assert((await page.locator('#status').innerText()).includes('without English'));
 // A successfully loaded script with missing data must remain retryable.
 const target=10000,bucket=await page.evaluate(id=>index.entries[id].b,target);let attempts=0;
 await page.route('**/data/chunk-'+bucket+'.js',async route=>{attempts++;if(attempts===1)await route.fulfill({contentType:'text/javascript',body:'// incomplete chunk'});else await route.continue();});
 await page.evaluate(id=>{delete window.JASTROW_CHUNKS[index.entries[id].b];chunkPromises.delete(index.entries[id].b);},target);
 await page.evaluate(id=>showEntry(id),target);assert((await page.locator('#status').innerText()).includes('Unable to open'));
 await page.evaluate(id=>showEntry(id),target);assert.equal(await page.locator('.entry-title').innerText(),await page.evaluate(id=>index.entries[id].h,target));assert.equal(attempts,2);
 await page.evaluate(()=>{Otzaria.call=async()=>{throw Error('denied')};});await page.locator('#selection').click();assert((await page.locator('#status').innerText()).includes('type it'));
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);await browser.close();await new Promise(r=>server.close(r));console.log('PASS: search, ambiguous matches, right-click event, theme updates, cross-references, mobile layout, and standalone preview all work without console or CSP errors');
})().catch(e=>{console.error(e);process.exitCode=1;});
