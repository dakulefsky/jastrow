const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium,executablePath}=require('./browser_support.cjs');
(async()=>{
 const server=http.createServer((req,res)=>{try{const pathname=new URL(req.url,'http://localhost').pathname;if(pathname==='/community-config.js'){const enabled=req.headers['x-community-test']==='1';res.setHeader('Content-Type','text/javascript');res.end("window.DICTIONARY_COMMUNITY_API='"+(enabled?'https://otzaria-dictionary-community.dakulefsky.workers.dev':'')+"';");return;}const p=path.join(__dirname,'plugin',pathname==='/'?'index.html':pathname);res.setHeader('Content-Type',p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':p.endsWith('.png')?'image/png':'text/html');res.end(fs.readFileSync(p));}catch{res.statusCode=404;res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({executablePath,args:['--no-sandbox']});const page=await browser.newPage(),base='http://127.0.0.1:'+server.address().port,errors=[],external=[];
  page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>{if(!r.url().startsWith(base))external.push(r.url());});await page.goto(base);
  const offlineEvidence=await page.evaluate(async()=>window.SefariaEvidence.compareTranslation('בדיקה',[{id:'offline',text:'beginning of tractate'}],{sourceRange:{ref:'ברכות, דף ב עמוד א:1'},currentBook:'ברכות'}));
  assert.equal(offlineEvidence.source,'offline');assert.equal(offlineEvidence.scope,'paragraph');assert.equal(offlineEvidence.matches[0].matchedPhrase,'beginning of tractate');
  const glossFraming=await page.evaluate(async()=>{
   const original=SefariaOfflineTranslation.getPassage;
   SefariaOfflineTranslation.getPassage=async()=>({text:'He said land was fertile.',scope:'paragraph'});
   try{
    const verb=await SefariaEvidence.compareTranslation('אָמַר',[{id:'verb',text:'to say'}],{sourceRange:{ref:'ברכות, דף ב עמוד א:2'},currentBook:'ברכות'});
    const noun=await SefariaEvidence.compareTranslation('אַרְעָא',[{id:'noun',text:'the land'}],{sourceRange:{ref:'ברכות, דף ב עמוד א:3'},currentBook:'ברכות'});
    return {verb,noun};
   }finally{SefariaOfflineTranslation.getPassage=original;}
  });
  assert.equal(glossFraming.verb.matches[0]?.matchedPhrase,'said','infinitive gloss should match an inflected translation verb');
  assert.equal(glossFraming.noun.matches[0]?.matchedPhrase,'land','leading article should not block a direct noun match');
  const glossVariant=await page.evaluate(async()=>{
   const original=SefariaOfflineTranslation.getPassage;
   SefariaOfflineTranslation.getPassage=async()=>({text:'The fertile land was green.',scope:'paragraph'});
   try{return await SefariaEvidence.compareTranslation('אַרְעָא',[{id:'variant',text:'land; fertile land'}],{sourceRange:{ref:'ברכות, דף ב עמוד א:4'},currentBook:'ברכות'});}
   finally{SefariaOfflineTranslation.getPassage=original;}
  });
  assert.equal(glossVariant.matches[0]?.candidatePhrase,'fertile land','choose the strongest matching alternative gloss, not the first matching variant');
  // Quick lookup should not lose its star merely because background prefetch
  // has not prepared this daf yet; it should fall back to the bundled passage.
  const prefetchFallback=await page.evaluate(async()=>{
   const original=SefariaEvidence.compareTranslation,calls=[];
   SefariaEvidence.compareTranslation=async(word,candidates,selection,options)=>{
    calls.push(options?.preparedOnly);
    if(options?.preparedOnly)return {matches:[],reason:'not_prepared'};
    return {matches:[{id:candidates[0].id,matchedPhrase:'supported phrase',candidatePhrase:candidates[0].text,matchType:'exact'}],source:'offline'};
   };
   try{
    const items=await DictionaryQuick.results('נפקא מינה',{sourceRange:{ref:'ברכות, דף ב עמוד א:1'},currentBook:'ברכות'});
    return {calls,items};
   }finally{SefariaEvidence.compareTranslation=original;}
  });
  assert.deepEqual(prefetchFallback.calls,[true,false],'unprepared daf should trigger one on-demand offline evidence check');
  assert.equal(prefetchFallback.items.some(item=>item.recommended===true),true,'unique evidence should still mark the quick-lookup recommendation');
  const lookup=async word=>{const before=await page.locator('#entry').innerHTML();await page.fill('#query',word);await page.locator('.lookup-button').click();await page.waitForFunction(before=>document.querySelector('#entry')?.innerHTML!==before,before);await page.locator('.unified-meanings').first().waitFor();assert.equal(await page.locator('.community-feedback').count(),0,'offline mode must not show community UI');};
  await lookup('אַרְעָא');let main=page.locator('.unified-meanings>ol>.meaning-card');assert.equal(await main.count(),1);assert.match(await main.first().innerText(),/land/);assert.equal(await main.first().locator('.meaning-text').evaluate(el=>getComputedStyle(el).fontWeight),'700','main English definitions should be bold');assert(!/accident|Jastrow|Krupnik/.test(await page.locator('#entry').innerText()));
  const land=main.first();assert.equal(await land.locator('.meaning-number').innerText(),'1');assert.equal(await land.locator('.meaning-references a').count(),2);
  await land.locator('.meaning-references a').last().click();assert.match(await land.innerText(),/Jastrow/);assert.match(await land.innerText(),/Krupnik/);assert.equal(await land.locator('.meaning-source').count(),2);assert.equal(await land.locator('.source-gloss').first().evaluate(el=>getComputedStyle(el).fontWeight),'700','original source glosses should be bold');
  await lookup('אַרְעָא');assert.equal(await page.locator('.scholarly-entry[open]').count(),0);const before=await page.locator('#entry').innerText();await page.reload();await page.locator('.unified-meanings').waitFor();assert.equal(await page.locator('#entry').innerText(),before);
  await page.locator('.other-readings>summary').click();assert.match(await page.locator('.other-readings').innerText(),/accident/);
  await lookup('אִרְעָא');assert.match(await page.locator('.unified-meanings>ol').innerText(),/accident/);assert.equal(await page.locator('.unified-meanings>ol>.meaning-card').filter({hasText:'accident, occurrence'}).count(),1);assert.equal(await page.locator('.unified-meanings>ol>.meaning-card').filter({hasText:'accident, occurrence'}).locator('.meaning-references a').count(),2);assert(!/land,/.test(await page.locator('.unified-meanings>ol').innerText()));
  await lookup('ארעא');assert.match(await page.locator('#entry').innerText(),/land/);assert.match(await page.locator('#entry').innerText(),/accident/);assert.equal(await page.locator('.other-readings').count(),0);assert.equal(await page.locator('.meaning-text').filter({hasText:'land'}).count(),1);
  // Phrase meanings and plain words use the same cards and source controls.
  await lookup('נפקא');assert.equal(await page.locator('.meaning-card').count(),2);assert.equal(await page.locator('.meaning-text').filter({hasText:'excrements'}).count(),1);assert.equal(await page.locator('.meaning-text').filter({hasText:'outlet'}).count(),1);for(const card of await page.locator('.meaning-card').all())assert.equal(await card.locator('.meaning-references a').count(),2);
  await lookup('נפקא מינה');assert.equal(await page.locator('#entry h2').count(),1);assert.equal(await page.locator('.translation-label').count(),0);assert(!/Expressions and words|Expression meaning/.test(await page.locator('#entry').innerText()));assert.match(await page.locator('#entry').innerText(),/the practical difference is/);assert(!/to bring out/.test(await page.locator('#entry').innerText()));assert.equal(await page.locator('.meaning-card>.meaning-number').count(),1);
  await lookup('צפרא ספרא');assert.equal(await page.locator('.phrase-word').count(),2);assert.match(await page.locator('#entry').innerText(),/morning/);assert.match(await page.locator('#entry').innerText(),/bird/);assert.match(await page.locator('#entry').innerText(),/book/);
  // A unique, direct offline translation match is visibly recommended in the full dictionary.
  await page.evaluate(()=>{
   activeReaderContext={word:'אַרְעָא',selection:{sourceRange:{ref:'ברכות, דף ב עמוד א:1'},currentBook:'ברכות'}};
   SefariaEvidence.compareTranslation=async(word,candidates)=>{
    const target=candidates.find(item=>item.text.includes('land'));
    return {matches:target?[{id:target.id,matchedPhrase:'land',matchType:'exact'}]:[],scope:'paragraph'};
   };
  });
  await lookup('אַרְעָא');
  assert.equal(await page.locator('.meaning-recommended').count(),1);
  assert.match(await page.locator('.context-recommended').innerText(),/land/);
  // A specific multi-word gloss outranks an incidental one-word collision.
  await page.evaluate(()=>{SefariaEvidence.compareTranslation=async(word,candidates)=>({matches:candidates.slice(0,2).map((item,i)=>({id:item.id,matchedPhrase:i?'fertile land':'land',candidatePhrase:i?'the fertile land':'land',matchType:i?'inflected_phrase':'exact'})),scope:'paragraph'});});
  await lookup('אַרְעָא');assert.equal(await page.locator('.meaning-recommended').count(),1);
  // Truly equal evidence remains ambiguous and receives no star.
  await page.evaluate(()=>{SefariaEvidence.compareTranslation=async(word,candidates)=>({matches:candidates.slice(0,2).map(item=>({id:item.id,matchedPhrase:'land',candidatePhrase:'land',matchType:'exact'})),scope:'paragraph'});});
  await lookup('אַרְעָא');assert.equal(await page.locator('.meaning-recommended').count(),0);
  await page.evaluate(()=>{activeReaderContext=null;});
  await page.evaluate(()=>{search('צפרא ספרא');search('אַרְעָא');});await page.waitForFunction(()=>document.querySelector('.unified-meanings>ol')?.innerText.includes('land'));assert.equal(await page.locator('.phrase-word').count(),0);
  await page.evaluate(()=>search('אבגדהוזחטיכלמנסעפצקרשת'));assert.match(await page.locator('#entry').innerText(),/No matching entry/);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  assert.equal(await page.locator('.community-feedback').count(),0,'voting remains disabled in the learner-facing interface');
  console.log('PASS: unified meanings, source controls, offline dictionary lookup, and no community voting UI.');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
