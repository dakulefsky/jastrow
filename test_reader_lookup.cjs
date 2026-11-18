// Actual foreground/background scripts; native Otzaria submenu behavior is simulated at the host boundary.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium,executablePath}=require('./browser_support.cjs');
(async()=>{
 const manifest=JSON.parse(fs.readFileSync(__dirname+'/plugin/manifest.json'));
 const fallback=manifest.contributes?.startup?.contextMenuItems?.find(item=>item.id==='jastrow-lookup');
 assert(fallback?.children?.some(item=>item.id==='jastrow-meaning-fallback'&&item.openPlugin===true),'the manifest must provide a native fallback even when background JS activation is unavailable');
 const server=http.createServer((req,res)=>{try{const pathname=new URL(req.url,'http://localhost').pathname;if(pathname==='/community-config.js'){res.setHeader('Content-Type','text/javascript');res.end("window.DICTIONARY_COMMUNITY_API='';");return;}const f=path.join(__dirname,'plugin',pathname==='/'?'index.html':pathname);res.setHeader('Content-Type',f.endsWith('.js')?'text/javascript':f.endsWith('.css')?'text/css':f.endsWith('.png')?'image/png':'text/html');res.end(fs.readFileSync(f));}catch{res.statusCode=404;res.end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({executablePath,args:['--no-sandbox']});
  const context=await browser.newContext(),base='http://127.0.0.1:'+server.address().port;
  const reader=await context.newPage(),bg=await context.newPage(),errors=[];
  let selection={},foreground;
  for(const page of [reader,bg])page.on('pageerror',e=>errors.push(String(e)));
  await reader.setContent('<p id="word" dir="rtl"></p><div id="menu"></div>');
  function installHost(){window.events={};window.Otzaria={on:(e,f)=>(events[e]??=[]).push(f),call:(method,args)=>window.hostRpc({method,args})};}
  async function openChoice({word,itemId,param}){
   if(!foreground){
    foreground=await context.newPage();foreground.on('pageerror',e=>errors.push(String(e)));
    await foreground.exposeBinding('hostRpc',async(_,{method})=>method==='app.getGrantedPermissions'?{success:true,data:{permissions:manifest.permissions}}:{success:true});
    await foreground.addInitScript(installHost);await foreground.goto(base);
    await foreground.evaluate(()=>Promise.all(events['plugin.boot'].map(f=>f({theme:{}}))));
   }
   console.log('Opening quick-menu choice:',word,'entry',param?.entryId);
   await foreground.evaluate(({word,itemId,param,selection})=>Promise.all((events['reader.context_menu_item_clicked']||[]).map(f=>f({itemId,param,selectedText:word,selection,currentRef:selection.currentRef||null}))),{word,itemId,param,selection});
   try{
    await foreground.waitForFunction(()=>document.querySelector('.unified-meanings'),null,{timeout:10000});
    await foreground.locator('.unified-meanings').first().waitFor({timeout:10000});
   }catch(e){
    const status=await foreground.locator('#status').innerText().catch(()=>'<no status>');
    const entry=await foreground.locator('#entry').innerText().catch(()=>'<no entry>');
    throw Error('No dictionary result for '+word+' / '+param?.entryId+'; status='+status+'; entry='+entry+'; cause='+e.message);
   }
   assert.equal(await foreground.locator('#query').inputValue(),word);
   await reader.evaluate(word=>document.body.dataset.openedWord=word,word);
  }
  const items=new Map();
  await bg.exposeBinding('hostRpc',async(_,{method,args})=>{
   if(method==='reader.getSelection')return {success:true,data:selection};
   if(method==='reader.addContextMenuItem')items.set(args.id,args);
   else if(method==='reader.removeContextMenuItem')items.delete(args.id);
   else throw Error('Unexpected host call '+method);
   await reader.evaluate(({items,word})=>{window.menuItems=items;window.registeredWord=word;},{items:[...items.values()],word:selection.renderedSelectedText||selection.text||''});
   return {success:true};
  });
  await reader.exposeBinding('chooseItem',async(_,{id,word,param})=>openChoice({id,itemId:id,word,param}));
  await reader.evaluate(()=>{document.querySelector('#word').oncontextmenu=e=>{
   e.preventDefault();const word=getSelection().toString(),menu=document.querySelector('#menu');menu.replaceChildren();
   for(const item of window.menuItems||[]){
    if(item.showWhen?.selectionContainsAny&&!item.showWhen.selectionContainsAny.some(s=>word.includes(s)))continue;
    for(const child of item.children||[]){
     const button=document.createElement('button');button.textContent=child.title;button.dataset.itemId=child.id;
     button.onclick=()=>window.chooseItem({id:child.id,word,param:child.param});menu.append(button);
    }
   }
  };});
  await bg.addInitScript(installHost);await bg.goto(base+'/background.html');
  await bg.evaluate(()=>Promise.all(events['plugin.boot'].map(f=>f({app:{runMode:'background'}}))));
  await bg.evaluate(()=>{window.SefariaEvidence.compareTranslation=async(word,candidates,selection)=>word==='נפקא מינה'&&selection?.sourceRange?.ref?{matches:[{id:candidates[0].id,matchedPhrase:'the practical difference',matchType:'exact'}],scope:'paragraph'}:{matches:[],scope:null};});
  async function choose(display,source=display,known=true){
   selection={text:source,renderedSelectedText:display,currentRef:'ברכות, דף ב עמוד א:1',currentBook:'ברכות',sourceRange:{ref:'ברכות, דף ב עמוד א:1',beforeText:{raw:'לפני המילה '},afterText:{raw:' אחרי המילה'}}};
   await reader.evaluate(word=>{const n=document.querySelector('#word');n.textContent=word;const range=document.createRange();range.selectNodeContents(n);getSelection().removeAllRanges();getSelection().addRange(range);},display);
   await bg.evaluate(text=>events['reader.selection_changed'].forEach(f=>f({text,currentRef:'ברכות, דף ב עמוד א:1'})),source);
   await reader.waitForFunction(({word,count})=>window.registeredWord===word&&window.menuItems.length===count,{word:display,count:known?1:0});
   await reader.locator('#word').click({button:'right'});
  }
  await choose('לצפרא');
  const first=items.get('jastrow-lookup');
  assert.equal(first.type,'submenu','quick result must use Otzaria native submenu');
  assert(first.children.length>0,'the submenu should offer clickable meanings');
  assert(first.children.length<=4,'show no more than four total choices');
  const firstMeanings=first.children.filter(x=>x.id.startsWith('jastrow-meaning-')&&x.id!=='jastrow-meaning-more');
  assert(firstMeanings.length<=4,'show no more than four meanings');
  assert(firstMeanings.every(x=>x.openPlugin===true&&Number.isInteger(x.param.entryId)),'each meaning should open its dictionary source entry');
  const firstMore=first.children.find(x=>x.id==='jastrow-meaning-more');
  if(firstMore)assert.equal(firstMore.param.showAll,true,'overflow should open the full dictionary');
  for(const item of items.values())assert.deepEqual(item.contexts,['reader-selection','reader-page-shape-selection']);
  assert.equal(await reader.locator('#menu button').count(),first.children.length);
  const firstTitle=first.children[0].title;
  assert(firstTitle.includes('—'),'each option should pair its spelling with a short definition');
  await reader.locator('#menu button').first().click();
  await reader.waitForFunction(()=>document.body.dataset.openedWord==='לצפרא');
  assert.match(await foreground.locator('#entry').innerText(),/morning/);

  await choose('נפקא מינה');
  const contextual=items.get('jastrow-lookup');
  assert(contextual.children[0].title.startsWith('★ '),'the strongest translation match must carry the visible leading star marker');
  assert(!contextual.children[0].title.includes('Recommended'),'the clipped menu label should not rely on a trailing word');
  assert(contextual.children[0].title.length<70,'keep recommended label short enough to avoid host clipping');
  const choice=contextual.children[0];
  await reader.locator('#menu').evaluate(()=>document.querySelector('button').click());
  await reader.waitForFunction(()=>document.body.dataset.openedWord==='נפקא מינה');
  assert.equal(await foreground.locator('#query').inputValue(),'נפקא מינה');
  assert.match(await foreground.locator('#entry').innerText(),/the practical difference is/);

  for(const [display,source] of [['דמילתייכו','דמילתייכו'],['בֵּיתֵיהוֹן','ביתיהון'],['כתבינן','כתבינן']]){
   await choose(display,source);
   const menu=items.get('jastrow-lookup');assert(menu?.children?.length>0);
   assert(menu.children.every(x=>x.title.length<=100));
   await reader.locator('#menu button').first().click();
   await reader.waitForFunction(word=>document.body.dataset.openedWord===word,display);
   assert.equal(await foreground.locator('#query').inputValue(),display);
  }
  // Redirect-only entry: אבדתא → אברתא (hyssop) must still open the target entry.
  await choose('אבדתא');
  await reader.locator('#menu button').first().click();
  await reader.waitForFunction(()=>document.body.dataset.openedWord==='אבדתא');
  assert.match(await foreground.locator('#entry').innerText(),/hyssop/);
  assert((await foreground.locator('.meaning-source').allTextContents()).some(t=>t.includes('אַבְרָתָא')),'the redirect target must remain credited');
  await foreground.evaluate(()=>Promise.all((events['reader.context_menu_item_clicked']||[]).map(f=>f({itemId:'jastrow-meaning-fallback',selectedText:'לצפרא',selection:{selectedText:'לצפרא'}}))));
  await foreground.waitForFunction(()=>document.querySelector('#query').value==='לצפרא');
  await choose('אבגדהוזחטיכלמנסעפצקרשת','אבגדהוזחטיכלמנסעפצקרשת',false);
  assert.equal(await reader.locator('#menu button').count(),1,'unknown selections should retain the full-dictionary fallback');
  assert.equal(items.get('jastrow-lookup').children[0].id,'jastrow-meaning-fallback');
  assert.deepEqual(errors,[]);
  console.log('PASS reader selection → native submenu capped at four meanings → leading recommendation star → direct full dictionary entry; declarative fallback for inactive background runtime; offline, derived forms, redirect and unknown-word paths. Host-contract simulation, not a native Otzaria device test.');
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
