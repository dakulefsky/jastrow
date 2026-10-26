// Actual foreground/background scripts; the reader menu and host RPC are simulated.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium,executablePath}=require('./browser_support.cjs');
(async()=>{
 const manifest=JSON.parse(fs.readFileSync(__dirname+'/plugin/manifest.json'));
 const server=http.createServer((req,res)=>{try{const f=path.join(__dirname,'plugin',new URL(req.url,'http://localhost').pathname==='/'?'index.html':new URL(req.url,'http://localhost').pathname);res.setHeader('Content-Type',f.endsWith('.js')?'text/javascript':f.endsWith('.css')?'text/css':f.endsWith('.png')?'image/png':'text/html');res.end(fs.readFileSync(f));}catch{res.statusCode=404;res.end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({executablePath,args:['--no-sandbox']});const context=await browser.newContext(),base='http://127.0.0.1:'+server.address().port;
  const reader=await context.newPage(),bg=await context.newPage(),errors=[];let selection={},foreground;
  for(const page of [reader,bg])page.on('pageerror',e=>errors.push(String(e)));
  await reader.setContent('<p id="word" dir="rtl"></p><div id="menu"></div><div id="message"></div>');
  function installHost(){window.events={};window.Otzaria={on:(e,f)=>(events[e]??=[]).push(f),call:(method,args)=>window.hostRpc({method,args})};}
  async function open(word,kind){
   if(!foreground){foreground=await context.newPage();foreground.on('pageerror',e=>errors.push(String(e)));await foreground.exposeBinding('hostRpc',async(_,{method})=>method==='app.getGrantedPermissions'?{success:true,data:{permissions:manifest.permissions}}:{success:true});await foreground.addInitScript(installHost);await foreground.goto(base);await foreground.evaluate(()=>Promise.all(events['plugin.boot'].map(f=>f({theme:{}}))));}
   await foreground.evaluate(({word,kind})=>Promise.all(events[kind].map(f=>f(kind==='ui.messageClicked'?{payload:{dictionaryWord:word}}:{itemId:'jastrow-open',selection:{renderedSelectedText:word}}))),{word,kind});
  }
  const items=new Map(),messages=[];
  await bg.exposeBinding('hostRpc',async(_,{method,args})=>{
   if(method==='reader.getSelection')return {success:true,data:selection};
   if(method==='reader.addContextMenuItem')items.set(args.id,args);
   else if(method==='reader.removeContextMenuItem')items.delete(args.id);
   else if(method==='ui.showMessage'){
    messages.push(args);await reader.evaluate(args=>{const button=document.createElement('button');button.textContent=args.message;button.onclick=()=>window.openMessage(args);document.querySelector('#message').replaceChildren(button);},args);return {success:true};
   }else throw Error('Unexpected host call '+method);
   await reader.evaluate(({items,word})=>{window.menuItems=items;window.registeredWord=word;},{items:[...items.values()],word:selection.renderedSelectedText||selection.text||''});return {success:true};
  });
  await reader.exposeBinding('openMessage',async(_,args)=>{assert.equal(args.tapOpenPlugin,true);await open(args.tapPayload.dictionaryWord,'ui.messageClicked');await reader.evaluate(word=>document.body.dataset.openedWord=word,args.tapPayload.dictionaryWord);});
  await reader.exposeBinding('chooseItem',async(_,{id,word})=>{
   if(id==='jastrow-open'){await open(word,'reader.context_menu_item_clicked');await reader.evaluate(word=>document.body.dataset.openedWord=word,word);}
   else await bg.evaluate(word=>Promise.all(events['reader.context_menu_item_clicked'].map(f=>f({itemId:'jastrow-lookup',selection:{renderedSelectedText:word}}))),word);
  });
  await reader.evaluate(()=>{document.querySelector('#word').oncontextmenu=e=>{e.preventDefault();const word=getSelection().toString(),menu=document.querySelector('#menu');menu.replaceChildren();for(const item of window.menuItems||[]){if(!item.showWhen.selectionContainsAny.some(s=>word.includes(s)))continue;const button=document.createElement('button');button.textContent=item.title;button.onclick=()=>window.chooseItem({id:item.id,word});menu.append(button);}};});
  await bg.addInitScript(installHost);await bg.goto(base+'/background.html');await bg.evaluate(()=>Promise.all(events['plugin.boot'].map(f=>f({app:{runMode:'background'}}))));
  async function choose(display,source=display,known=true){
   selection={text:source,renderedSelectedText:display};
   await reader.evaluate(word=>{const n=document.querySelector('#word');n.textContent=word;const range=document.createRange();range.selectNodeContents(n);getSelection().removeAllRanges();getSelection().addRange(range);document.querySelector('#message').replaceChildren();},display);
   await bg.evaluate(text=>events['reader.selection_changed'].forEach(f=>f({selection:{text}})),source);
   await reader.waitForFunction(({word,count})=>window.registeredWord===word&&window.menuItems.length===count,{word:display,count:known?2:0});
   await reader.locator('#word').click({button:'right'});
  }
  await choose('לצפרא');assert.equal(await reader.locator('#menu button').count(),2);
  for(const item of items.values())assert.deepEqual(item.contexts,['reader-selection','reader-page-shape-selection']);
  await reader.getByRole('button',{name:'Aramaic → Eng.',exact:true}).click();await reader.locator('#message button').waitFor();
  assert.match(messages.at(-1).message,/possible prefixed form/);assert.equal(messages.at(-1).tapPayload.dictionaryWord,'לצפרא');
  await reader.locator('#message button').click();await reader.waitForFunction(()=>document.body.dataset.openedWord==='לצפרא');await foreground.locator('.unified-meanings').waitFor();assert.equal(await foreground.locator('#query').inputValue(),'לצפרא');assert.match(await foreground.locator('#entry').innerText(),/morning/);
  for(const [display,source] of [['דמילתייכו','דמילתייכו'],['בֵּיתֵיהוֹן','ביתיהון'],['כתבינן','כתבינן']]){
   await choose(display,source);await reader.getByRole('button',{name:'Aramaic → Eng.',exact:true}).click();await reader.locator('#message button').waitFor();assert.match(messages.at(-1).message,/possible inflected form/);assert.equal(messages.at(-1).tapPayload.dictionaryWord,display);
   await reader.getByRole('button',{name:'Open dictionary',exact:true}).click();await reader.waitForFunction(word=>document.body.dataset.openedWord===word,display);await foreground.locator('.unified-meanings').waitFor();assert.equal(await foreground.locator('#query').inputValue(),display);assert.match(await foreground.locator('.prefix-analysis').innerText(),/Possible base forms/);
  }
  // Real redirect-only entry: אבדתא → אברתא (hyssop). Previously the
  // registered quick action returned without showing anything.
  await choose('אבדתא');await reader.getByRole('button',{name:'Aramaic → Eng.',exact:true}).click();await reader.locator('#message button').waitFor();assert.match(messages.at(-1).message,/hyssop/);assert.equal(messages.at(-1).tapPayload.dictionaryWord,'אבדתא');
  await reader.locator('#message button').click();await reader.waitForFunction(()=>document.body.dataset.openedWord==='אבדתא');await foreground.locator('.unified-meanings').waitFor();assert.equal(await foreground.locator('#query').inputValue(),'אבדתא');assert.match(await foreground.locator('#entry').innerText(),/hyssop/);
  assert((await foreground.locator('.meaning-source').allTextContents()).some(t=>t.includes('אַבְרָתָא')),'meaning must credit the target entry');
  await choose('אבגדהוזחטיכלמנסעפצקרשת','אבגדהוזחטיכלמנסעפצקרשת',false);assert.equal(await reader.locator('#menu button').count(),0);
  assert.deepEqual(errors,[]);console.log('PASS reader right-click → actual background prefix/suffix lookup → quick-message payload → cold-open/full dictionary; direct-open, marked text, both reader context registrations, unknown exclusion. Host-contract simulation, not native Otzaria.');
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
