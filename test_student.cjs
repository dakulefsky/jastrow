const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium,executablePath}=require('./browser_support.cjs');
(async()=>{const browser=await chromium.launch({executablePath,args:['--no-sandbox']});try{
 const context=await browser.newContext({viewport:{width:1440,height:1050}}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 const url=pathToFileURL(path.join(__dirname,'../Jastrow-Preview.html')).href;
 await page.goto(url);assert.equal(await page.locator('.examples-label, .examples, [data-query]').count(),0);await page.evaluate(()=>{localStorage.clear();});await page.reload();
 const lookup=async word=>{await page.fill('#query',word);await page.click('.lookup-button');};
 await lookup('דאמר');await page.locator('.result-meaning').first().waitFor();
 assert.equal(await page.locator('#entry h2').innerText(),'Choose a matching entry');
 assert((await page.locator('.result-meaning').allTextContents()).some(x=>/speak|say/.test(x)));
 // Every displayed preview must quote actual extracted phrases, not generated summaries.
 assert(await page.evaluate(()=>[...document.querySelectorAll('.result-meaning')].every(n=>{
  const id=Number(n.closest('.result').dataset.id),e=JASTROW_CHUNKS[index.entries[id].b][id],body=document.createElement('div');body.innerHTML=e.html;
  const phrases=JastrowReadingView.phrases(body);return (phrases.length?phrases.slice(0,2).map(p=>(p.label?p.label+': ':'')+p.text).join(' / '):'Open the original entry')===n.textContent;
 })));
 await page.locator('.result').filter({hasText:'אָמַר I'}).first().click();await page.locator('.entry-title').waitFor();
 assert.equal(await page.locator('.match-kind').textContent(),'Indexed word form');assert((await page.locator('.word-link').innerText()).includes('does not select'));
 assert.equal(await page.locator('.scholarly-entry').getAttribute('open'),null);
 await page.locator('.meaning-usage summary').first().click();
 assert((await page.locator('.usage-source').first().innerText()).includes('to join'));
 // Each card retains its complete corresponding source sense and parenthetical limits.
 assert(await page.evaluate(()=>{
  const body=document.querySelector('.scholarly-entry .definition'),ps=JastrowReadingView.phrases(body);
  return [...document.querySelectorAll('.usage-source')].every((n,i)=>{const c=body.querySelectorAll('i')[ps[i].sourceIndex].closest('.sense').cloneNode(true);c.querySelectorAll('.sense').forEach(x=>x.remove());return n.textContent===c.textContent;});
 }));
 await lookup('תניא');await page.locator('.form-attestation').waitFor();
 await page.locator('.word-passages summary').click();assert((await page.locator('.word-passages').innerText()).includes('Boraitha'));
 assert((await page.locator('.word-passages mark').allTextContents()).some(x=>x==='תניא'));
 // Exact token matching avoids presenting a different word containing the same letters.
 assert.deepEqual(await page.evaluate(()=>{const b=document.createElement('div');b.textContent='דאמר אמר אמרו אָמַר';return JastrowReadingView.wordPassages(b,'אמר').map(p=>p.word)}),['אמר']);
 if(await page.locator('.more-meanings').count()){
  assert.equal(await page.locator('.meaning-card:visible').count(),6);
  await page.locator('.more-meanings').click();assert.equal(await page.locator('.meaning-card:visible').count(),await page.locator('.meaning-card').count());
  await page.locator('.more-meanings').click();assert.equal(await page.locator('.meaning-card:visible').count(),6);
 }
 const oldTitle=await page.locator('.entry-title').innerText();
 await page.locator('#definition-history button').first().click();await page.waitForFunction(()=>document.querySelector('#query').value==='דאמר');
 assert.equal(await page.locator('.match-kind').textContent(),'Indexed word form');
 assert((await page.locator('.result').allTextContents()).some(x=>x.includes('אָמַר I')));
 await page.locator('#definition-history button').last().click();await page.waitForFunction(()=>document.querySelector('#query').value==='תניא');assert.equal(await page.locator('.entry-title').innerText(),oldTitle);
 for(let i=0;i<4;i++)await page.locator('#text-larger').click();assert.equal(await page.locator('#text-size').innerText(),'140%');assert(await page.locator('#text-larger').isDisabled());
 await page.reload();await page.locator('.entry-title').waitFor();assert.equal(await page.locator('#text-size').innerText(),'140%');assert(await page.locator('#recent-lookups').isVisible());
 await page.locator('#recent-lookups button').filter({hasText:'דאמר'}).click();await page.waitForFunction(()=>document.querySelector('#query').value==='דאמר');
 // Keyboard access from the reading view to the ambiguity list.
 await page.locator('.entry-title').click();await page.keyboard.press('/');assert(await page.locator('#query').evaluate(n=>n===document.activeElement));
 await page.keyboard.press('ArrowDown');assert(await page.locator('.result').first().evaluate(n=>n===document.activeElement));
 await page.keyboard.press('End');assert(await page.locator('.result').last().evaluate(n=>n===document.activeElement));
 await page.locator('.clear-recent').click();assert(await page.locator('#recent-lookups').isHidden());
 await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.locator('#clear-query').click();assert.equal(await page.locator('#query').inputValue(),'');assert.equal(await page.locator('.result').count(),0);assert.equal(await page.locator('.entry-title').count(),0);
 // Optional storage failure cannot block lookup or reading controls.
 const blocked=await context.newPage();await blocked.addInitScript(()=>{Storage.prototype.getItem=()=>{throw Error('denied')};Storage.prototype.setItem=()=>{throw Error('denied')};});await blocked.goto(url);await blocked.fill('#query','מיתיבי');await blocked.click('.lookup-button');await blocked.locator('.entry-title').waitFor();await blocked.locator('#text-larger').click();assert.equal(await blocked.locator('#text-size').innerText(),'110%');
 assert.deepEqual(errors,[]);console.log('PASS: source-exact match previews and sense passages, word-form explanation, selected-word excerpts, history query restoration, recent lookup, keyboard navigation, reading-size persistence, narrow layout and blocked storage.');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
