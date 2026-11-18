const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium,executablePath}=require('./browser_support.cjs');
(async()=>{
 const manifest=JSON.parse(fs.readFileSync(__dirname+'/plugin/manifest.json'));
 const server=http.createServer((req,res)=>{try{const f=path.join(__dirname,'plugin',req.url==='/'?'index.html':req.url);res.setHeader('Content-Type',f.endsWith('.js')?'text/javascript':f.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(f));}catch{res.statusCode=404;res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath,args:['--no-sandbox']});
 try{
  const context=await b.newContext(),reader=await context.newPage(),bg=await context.newPage(),errors=[];
  let selection={},plugin=null;reader.on('pageerror',e=>errors.push(String(e)));bg.on('pageerror',e=>errors.push(String(e)));
  await reader.setContent('<p id="word" dir="rtl"></p><div id="menu"></div>');
  await bg.exposeBinding('hostRpc',async(_,{method,args})=>{
   if(method==='reader.getSelection')return{success:true,data:selection};
   if(method==='reader.addContextMenuItem'){
    await reader.evaluate(({args,selection})=>{if(args.id==='jastrow-lookup')window.item=args;window.registeredWord=selection.renderedSelectedText||selection.text||'';},{args,selection});
    return{success:true};
   }
   if(method==='reader.removeContextMenuItem'){
    if(args.id==='jastrow-lookup')await reader.evaluate(({selection})=>{window.item=null;window.registeredWord=selection.renderedSelectedText||selection.text||'';},{selection});
    return{success:true};
   }
   throw Error(method);
  });
  await bg.addInitScript(()=>{window.events={};window.Otzaria={on:(e,f)=>(events[e]??=[]).push(f),call:(method,args)=>hostRpc({method,args})};});
  await bg.goto(base+'/background.html');await bg.evaluate(()=>Promise.all(events['plugin.boot'].map(f=>f({app:{runMode:'background'}}))));
  await reader.exposeBinding('openChoice',async(_,{word,itemId,param})=>{
   if(!plugin){
    plugin=await context.newPage();plugin.on('pageerror',e=>errors.push(String(e)));
    await plugin.exposeBinding('hostRpc',async(_,{method})=>method==='app.getGrantedPermissions'?{success:true,data:{permissions:manifest.permissions}}:{success:true});
    await plugin.addInitScript(()=>{window.events={};window.Otzaria={on:(e,f)=>(events[e]??=[]).push(f),call:(method,args)=>hostRpc({method,args})};});
    await plugin.goto(base);await plugin.evaluate(()=>Promise.all(events['plugin.boot'].map(f=>f({theme:{}}))));
   }
   await plugin.evaluate(({word,itemId,param,selection})=>Promise.all(events['reader.context_menu_item_clicked'].map(f=>f({itemId,param,selectedText:word,selection,currentRef:selection.currentRef||null}))),{word,itemId,param,selection});
   await plugin.waitForFunction(()=>document.querySelector('.unified-meanings'));
   assert.equal(await plugin.locator('#query').inputValue(),word);
   await reader.evaluate(word=>document.body.dataset.openedWord=word,word);
  });
  await reader.evaluate(()=>{document.querySelector('#word').oncontextmenu=e=>{
   e.preventDefault();const word=getSelection().toString(),menu=document.querySelector('#menu');menu.replaceChildren();
   const item=window.item;if(!item||!item.showWhen?.selectionContainsAny?.some(s=>word.includes(s)))return;
   for(const child of item.children||[]){const button=document.createElement('button');button.textContent=child.title;button.onclick=()=>window.openChoice({word,itemId:child.id,param:child.param});menu.append(button);}
  };});
  async function choose(display,source=display,known=true){
   selection={text:source,renderedSelectedText:display,currentRef:'ברכות, דף ב עמוד א:1',currentBook:'ברכות'};
   await reader.evaluate(word=>{const n=document.querySelector('#word');n.textContent=word;const r=document.createRange();r.selectNodeContents(n);getSelection().removeAllRanges();getSelection().addRange(r);},display);
   await bg.evaluate(text=>events['reader.selection_changed'].forEach(f=>f({text})),source);
   await reader.waitForFunction(({word,known})=>window.registeredWord===word&&Boolean(window.item)===known,{word:display,known});
   await reader.locator('#word').click({button:'right'});
  }
  await choose('מיתיבי');const item=await reader.evaluate(()=>window.item);
  assert.equal(item.type,'submenu');assert(item.children.length>0);
  assert(item.children.every(x=>x.openPlugin===true&&x.param.dictionaryWord==='מיתיבי'));
  await reader.locator('#menu button').first().click();
  await reader.waitForFunction(()=>document.body.dataset.openedWord==='מיתיבי');
  await plugin.locator('.unified-meanings').first().waitFor();
  assert.equal(await plugin.locator('#query').inputValue(),'מיתיבי');
  await choose('אבגדהוזחטיכלמנסעפצקרשת','אבגדהוזחטיכלמנסעפצקרשת',false);
  assert.equal(await reader.locator('#menu button').count(),0);
  assert.deepEqual(errors,[]);
  console.log('PASS: cold-start native submenu registration, selection-specific filtering, and direct plugin dictionary entry navigation. Host-contract simulation, not a native Otzaria device test.');
 }finally{await b.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
