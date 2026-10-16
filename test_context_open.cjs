// Host-contract regression: declarative menu works before any plugin engine has
// started. This emulates the host delivery path; it is not an Otzaria device test.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium,executablePath}=require('./browser_support.cjs');
(async()=>{const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'plugin/manifest.json'))),item=manifest.contributes.startup.contextMenuItems[0];
 const server=http.createServer((req,res)=>{try{const f=path.join(__dirname,'plugin',req.url==='/'?'index.html':req.url);res.setHeader('Content-Type',f.endsWith('.js')?'text/javascript':f.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(f));}catch{res.statusCode=404;res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath,args:['--no-sandbox']});try{
 const context=await browser.newContext(),reader=await context.newPage();let plugin=null,opens=0;const errors=[],calls=[];
 await reader.exposeBinding('openPlugin',async(_,{word,canonical})=>{
  if(!plugin){plugin=await context.newPage();plugin.on('pageerror',e=>errors.push(String(e)));await plugin.addInitScript(()=>{window.hostEvents={};window.hostCalls=[];window.Otzaria={on:(e,f)=>(hostEvents[e]??=[]).push(f),call:async(m,p)=>{hostCalls.push(m);if(m==='reader.getSelection')return {success:true,data:{renderedSelectedText:'רחמנא'}};throw Error('Unexpected host call: '+m);}};});await plugin.goto('http://127.0.0.1:'+server.address().port);await plugin.evaluate(()=>hostEvents['plugin.boot'].forEach(f=>f({theme:{}})));opens++;}
  await plugin.evaluate(({word,canonical})=>hostEvents['reader.context_menu_item_clicked'].forEach(f=>f(canonical?{itemId:'jastrow-lookup',selection:{renderedSelectedText:word},selectedText:''}:{itemId:'jastrow-lookup',selectedText:word})),{word,canonical});
 });
 await reader.setContent('<p id="word" dir="rtl">מיתיבי</p><div id="menu"></div>');
 await reader.evaluate(item=>{window.menuItem=item;window.canonical=false;document.querySelector('#word').oncontextmenu=e=>{e.preventDefault();const word=getSelection().toString(),menu=document.querySelector('#menu');menu.replaceChildren();if(!word)return;const b=document.createElement('button');b.textContent=item.title;b.onclick=async()=>{await openPlugin({word,canonical:window.canonical});document.body.dataset.openedWord=word;};menu.append(b);};},item);
 async function clickWord(word,canonical=false){await reader.evaluate(({word,canonical})=>{window.canonical=canonical;const n=document.querySelector('#word');n.textContent=word;const r=document.createRange();r.selectNodeContents(n);getSelection().removeAllRanges();getSelection().addRange(r);},{word,canonical});await reader.locator('#word').click({button:'right'});await reader.getByRole('button',{name:item.title}).click();await reader.waitForFunction(word=>document.body.dataset.openedWord===word,word);}
 assert.equal(opens,0);await clickWord('מיתיבי');await plugin.locator('.entry-title').waitFor();assert.equal(await plugin.locator('#query').inputValue(),'מיתיבי');assert.equal(opens,1);
 await clickWord('רַחְמָנָא',true);await plugin.waitForFunction(()=>document.querySelector('#query').value==='רַחְמָנָא'&&document.querySelector('.entry-title'));assert((await plugin.locator('.quick-meanings').innerText()).includes('Merciful'));assert.equal(opens,1);
 await clickWord('אבגדהוזחטיכלמנסעפצקרשת',true);await plugin.waitForFunction(()=>document.querySelector('#entry h2')?.textContent==='No matching entry');
 await clickWord('אמר דבר');assert((await plugin.locator('#status').innerText()).includes('one Hebrew or Aramaic word'));
 await plugin.locator('#selection').click();await plugin.waitForFunction(()=>document.querySelector('#query').value==='רחמנא'&&document.querySelector('.entry-title'));assert.deepEqual(await plugin.evaluate(()=>hostCalls),['reader.getSelection']);
 assert.deepEqual(errors,[]);console.log('PASS: right-click from a cold reader opens real lookup without background or selection events; legacy/canonical payloads, nekudos, reused page, no-match, multiword guidance and canonical manual selection.');
 }finally{await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1});
