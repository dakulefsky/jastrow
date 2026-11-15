import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
async function settle() { for (let i=0;i<8;i++) await new Promise(resolve=>setTimeout(resolve,5)); }

async function english() {
  const events=new Map(), domEvents=new Map(), calls=[], votes=[], items=new Map();let failVote=false,failSave=false;
  const entries=[
    {h:'נפקא',source:'krupnik',r:'KRU0001'},
    {h:'נפקא',source:'jastrow',r:'A00001'},
    {h:'נפקא',source:'jastrow',r:'A00002'}
  ];
  const root={
    JASTROW_INDEX:{entries},
    JastrowContext:{selectionText:p=>p?.selection?.renderedSelectedText||p?.selectedText||''},
    JastrowSearch:{
      splitWords:w=>[w],normalize:w=>w,hasSelectionTranslations:()=>true,
      lookup:()=>({ids:[0,1,2],prefixMatches:[]}),matchingQuery:()=> 'נפקא'
    },
    JastrowReadingView:{records:async(_index,id)=>[{id,meanings:[{text:'English candidate meaning '+id}]}]},
    DictionaryCommunity:{enabled:true,ready:Promise.resolve(true),vote:async(word,entry,options)=>{votes.push({word,entry,options});if(failVote){root.dispatchEvent(new Event('dictionary-community-offline'));return {ok:true,queued:true,duplicate:false};}if(failSave)return {ok:false,reason:'storage'};return {ok:true,duplicate:false};}},
    Otzaria:{
      on:(name,fn)=>{if(!events.has(name))events.set(name,[]);events.get(name).push(fn);},
      call:async(method,args)=>{calls.push({method,args});if(method==='reader.addContextMenuItem')items.set(args.id,args);if(method==='reader.removeContextMenuItem')items.delete(args.id);return {success:true};}
    },
    addEventListener:(name,fn)=>{if(!domEvents.has(name))domEvents.set(name,[]);domEvents.get(name).push(fn);},
    dispatchEvent:event=>{for(const fn of domEvents.get(event.type)||[])fn(event);return true;}
  };
  const context={window:root,globalThis:root,Otzaria:root.Otzaria,JastrowContext:root.JastrowContext,JastrowSearch:root.JastrowSearch,JASTROW_INDEX:root.JASTROW_INDEX,HebrewLookup:root.HebrewLookup,console,Event};
  vm.runInNewContext(await read('plugin/availability.js'),context);
  vm.runInNewContext(await read('plugin/quick-lookup.js'),context);
  const selection={renderedSelectedText:'נפקא',sourceRange:{beforeText:{raw:'תניא רבי',normalized:'תניא רבי'},afterText:{raw:'הוא אמר',normalized:'הוא אמר'}}};
  for(const fn of events.get('reader.selection_changed')||[])fn({selection});
  await settle();
  assert(items.has('jastrow-community-vote-0')&&items.has('jastrow-community-vote-1')&&items.has('jastrow-community-vote-2'),'English right-click menu must expose candidate votes');
  assert.match(items.get('jastrow-community-vote-1').title,/Here · Vote 2 · נפקא \(Jastrow\)/,'English right-click choice should clearly identify the vote action, position, word, and source');assert.match(items.get('jastrow-community-vote-1').title,/English candidate meaning 1/,'English menu choices must retain a short distinguishing meaning');assert(items.get('jastrow-community-vote-1').title.length<=100,'English menu title should remain compact');
  for(const fn of events.get('reader.context_menu_item_clicked')||[])await fn({itemId:'jastrow-community-vote-1',selection});
  assert.equal(votes[0].word,'נפקא');assert.equal(votes[0].entry,entries[1],'English menu item must vote for its exact candidate');assert.equal(votes[0].options.scope,'context','English right-click must submit a contextual vote');assert.equal(votes[0].options.selection,selection,'English contextual vote must carry the reader anchor only to the local hashing step');
  assert.equal(calls.filter(x=>x.method==='ui.showMessage').length,1,'successful vote may be acknowledged');
  failVote=true;
  for(const fn of events.get('reader.context_menu_item_clicked')||[])await fn({itemId:'jastrow-community-vote-0',selection});
  assert.equal(calls.filter(x=>x.method==='ui.showMessage').length,2,'queued vote should be acknowledged accurately');
  assert.match(calls.filter(x=>x.method==='ui.showMessage').at(-1).args.message,/Saved on this device/);failVote=false;failSave=true;for(const fn of events.get('reader.context_menu_item_clicked')||[])await fn({itemId:'jastrow-community-vote-2',selection:{renderedSelectedText:'נפקא'}});assert.match(calls.filter(x=>x.method==='ui.showMessage').at(-1).args.message,/Could not save your vote/,'English right-click vote failure must be explained');
  assert.equal([...items.keys()].filter(id=>id.startsWith('jastrow-community-vote-')).length,3,'temporary service failure must leave English vote choices available');
  root.dispatchEvent(new Event('dictionary-community-disabled'));await settle();
  assert.equal([...items.keys()].filter(id=>id.startsWith('jastrow-community-vote-')).length,0,'actual permission denial must remove English vote choices');
  root.dispatchEvent(new Event('dictionary-community-permission-granted'));await settle();
  assert.equal([...items.keys()].filter(id=>id.startsWith('jastrow-community-vote-')).length,3,'restoring permission must restore English vote choices');
}

async function hebrew() {
  const events=new Map(), domEvents=new Map(), calls=[], votes=[], items=new Map();let failVote=false,failSave=false;
  const entries=[{word:'נפקא',rid:'KRU0001',parts:[{meaning:'משמעות ראשונה'}]},{word:'נפקא',rid:'KRU0002',parts:[{meaning:'משמעות שנייה'}]},{word:'נפקא',rid:'KRU0003',parts:[{meaning:'משמעות שלישית'}]}];
  const root={
    HebrewLookup:{selectionText:p=>p?.selection?.renderedSelectedText||p?.selectedText||'',lookup:()=>entries},
    DictionaryCommunity:{enabled:true,ready:Promise.resolve(true),vote:async(word,entry,options)=>{votes.push({word,entry,options});if(failVote){root.dispatchEvent(new Event('dictionary-community-offline'));return {ok:true,queued:true,duplicate:false};}if(failSave)return {ok:false,reason:'storage'};return {ok:true,duplicate:false};}},
    Otzaria:{
      on:(name,fn)=>{if(!events.has(name))events.set(name,[]);events.get(name).push(fn);},
      call:async(method,args)=>{calls.push({method,args});if(method==='reader.addContextMenuItem')items.set(args.id,args);if(method==='reader.removeContextMenuItem')items.delete(args.id);return {success:true};}
    },
    addEventListener:(name,fn)=>{if(!domEvents.has(name))domEvents.set(name,[]);domEvents.get(name).push(fn);},
    dispatchEvent:event=>{for(const fn of domEvents.get(event.type)||[])fn(event);return true;}
  };
  const context={window:root,globalThis:root,Otzaria:root.Otzaria,HebrewLookup:root.HebrewLookup,console,Event};
  vm.runInNewContext(await read('hebrew/plugin/availability.js'),context);
  vm.runInNewContext(await read('hebrew/plugin/quick-lookup.js'),context);
  const selection={renderedSelectedText:'נפקא',sourceRange:{beforeText:{raw:'תניא רבי',normalized:'תניא רבי'},afterText:{raw:'הוא אמר',normalized:'הוא אמר'}}};
  for(const fn of events.get('reader.selection_changed')||[])fn({selection});
  await settle();
  assert(items.has('aramaic-hebrew-community-vote-0')&&items.has('aramaic-hebrew-community-vote-1')&&items.has('aramaic-hebrew-community-vote-2'),'Hebrew right-click menu must expose candidate votes');
  assert.match(items.get('aramaic-hebrew-community-vote-1').title,/כאן · הצבעה 2 · נפקא/,'Hebrew right-click choice should clearly identify the vote action and position');assert.match(items.get('aramaic-hebrew-community-vote-1').title,/משמעות שנייה/,'Hebrew menu choices must retain a short distinguishing meaning');assert(items.get('aramaic-hebrew-community-vote-1').title.length<=100,'Hebrew menu title should remain compact');
  for(const fn of events.get('reader.context_menu_item_clicked')||[])await fn({itemId:'aramaic-hebrew-community-vote-1',selection});
  assert.equal(votes[0].word,'נפקא');assert.deepEqual({...votes[0].entry},{rid:'KRU0002'},'Hebrew menu item must vote for its exact Krupnik ID');assert.equal(votes[0].options.scope,'context','Hebrew right-click must submit a contextual vote');assert.equal(votes[0].options.selection,selection,'Hebrew contextual vote must preserve the local reader anchor');
  assert.equal(calls.filter(x=>x.method==='ui.showMessage').length,1,'successful vote may be acknowledged');
  failVote=true;
  for(const fn of events.get('reader.context_menu_item_clicked')||[])await fn({itemId:'aramaic-hebrew-community-vote-0',selection:{renderedSelectedText:'נפקא'}});
  assert.equal(calls.filter(x=>x.method==='ui.showMessage').length,2,'queued vote should be acknowledged accurately');
  assert.match(calls.filter(x=>x.method==='ui.showMessage').at(-1).args.message,/ההצבעה נשמרה במכשיר/);failVote=false;failSave=true;for(const fn of events.get('reader.context_menu_item_clicked')||[])await fn({itemId:'aramaic-hebrew-community-vote-2',selection:{renderedSelectedText:'נפקא'}});assert.match(calls.filter(x=>x.method==='ui.showMessage').at(-1).args.message,/לא ניתן לשמור את ההצבעה/,'Hebrew right-click vote failure must be explained');
  assert.equal([...items.keys()].filter(id=>id.startsWith('aramaic-hebrew-community-vote-')).length,3,'temporary service failure must leave Hebrew vote choices available');
  root.dispatchEvent(new Event('dictionary-community-disabled'));await settle();
  assert.equal([...items.keys()].filter(id=>id.startsWith('aramaic-hebrew-community-vote-')).length,0,'actual permission denial must remove Hebrew vote choices');
  root.dispatchEvent(new Event('dictionary-community-permission-granted'));await settle();
  assert.equal([...items.keys()].filter(id=>id.startsWith('aramaic-hebrew-community-vote-')).length,3,'restoring permission must restore Hebrew vote choices');
}

await english();
await hebrew();
console.log('PASS: both right-click menus expose candidates, vote for the selected entry, and fail silently.');
