import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
async function settle() { for (let i=0;i<8;i++) await new Promise(resolve=>setTimeout(resolve,5)); }

async function english() {
  const events=new Map(), calls=[], votes=[], items=new Map();let failVote=false;
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
    DictionaryCommunity:{enabled:true,ready:Promise.resolve(true),vote:async(word,entry)=>{votes.push({word,entry});return failVote?{ok:false,duplicate:false}:{ok:true,duplicate:false};}},
    Otzaria:{
      on:(name,fn)=>{if(!events.has(name))events.set(name,[]);events.get(name).push(fn);},
      call:async(method,args)=>{calls.push({method,args});if(method==='reader.addContextMenuItem')items.set(args.id,args);if(method==='reader.removeContextMenuItem')items.delete(args.id);return {success:true};}
    },
    addEventListener:()=>{}
  };
  const context={window:root,globalThis:root,Otzaria:root.Otzaria,JastrowContext:root.JastrowContext,JastrowSearch:root.JastrowSearch,JASTROW_INDEX:root.JASTROW_INDEX,HebrewLookup:root.HebrewLookup,console};
  vm.runInNewContext(await read('plugin/availability.js'),context);
  vm.runInNewContext(await read('plugin/quick-lookup.js'),context);
  for(const fn of events.get('reader.selection_changed')||[])fn({selection:{renderedSelectedText:'נפקא'}});
  await settle();
  assert(items.has('jastrow-community-vote-0')&&items.has('jastrow-community-vote-1')&&items.has('jastrow-community-vote-2'),'English right-click menu must expose candidate votes');
  assert.match(items.get('jastrow-community-vote-1').title,/English candidate meaning 1/,'English menu choices must distinguish candidate meanings');
  for(const fn of events.get('reader.context_menu_item_clicked')||[])await fn({itemId:'jastrow-community-vote-1',selection:{renderedSelectedText:'נפקא'}});
  assert.equal(votes[0].word,'נפקא');assert.equal(votes[0].entry,entries[1],'English menu item must vote for its exact candidate');
  assert.equal(calls.filter(x=>x.method==='ui.showMessage').length,1,'successful vote may be acknowledged');
  failVote=true;
  for(const fn of events.get('reader.context_menu_item_clicked')||[])await fn({itemId:'jastrow-community-vote-0',selection:{renderedSelectedText:'נפקא'}});
  assert.equal(calls.filter(x=>x.method==='ui.showMessage').length,1,'network failure must not mention community voting');
}

async function hebrew() {
  const events=new Map(), calls=[], votes=[], items=new Map();let failVote=false;
  const entries=[{word:'נפקא',rid:'KRU0001',parts:[{meaning:'משמעות ראשונה'}]},{word:'נפקא',rid:'KRU0002',parts:[{meaning:'משמעות שנייה'}]},{word:'נפקא',rid:'KRU0003',parts:[{meaning:'משמעות שלישית'}]}];
  const root={
    HebrewLookup:{selectionText:p=>p?.selection?.renderedSelectedText||p?.selectedText||'',lookup:()=>entries},
    DictionaryCommunity:{enabled:true,ready:Promise.resolve(true),vote:async(word,entry)=>{votes.push({word,entry});return failVote?{ok:false,duplicate:false}:{ok:true,duplicate:false};}},
    Otzaria:{
      on:(name,fn)=>{if(!events.has(name))events.set(name,[]);events.get(name).push(fn);},
      call:async(method,args)=>{calls.push({method,args});if(method==='reader.addContextMenuItem')items.set(args.id,args);if(method==='reader.removeContextMenuItem')items.delete(args.id);return {success:true};}
    },
    addEventListener:()=>{}
  };
  const context={window:root,globalThis:root,console};
  vm.runInNewContext(await read('hebrew/plugin/availability.js'),context);
  vm.runInNewContext(await read('hebrew/plugin/quick-lookup.js'),context);
  for(const fn of events.get('reader.selection_changed')||[])fn({selection:{renderedSelectedText:'נפקא'}});
  await settle();
  assert(items.has('aramaic-hebrew-community-vote-0')&&items.has('aramaic-hebrew-community-vote-1')&&items.has('aramaic-hebrew-community-vote-2'),'Hebrew right-click menu must expose candidate votes');
  assert.match(items.get('aramaic-hebrew-community-vote-1').title,/משמעות שנייה/,'Hebrew menu choices must distinguish candidate meanings');
  for(const fn of events.get('reader.context_menu_item_clicked')||[])await fn({itemId:'aramaic-hebrew-community-vote-1',selection:{renderedSelectedText:'נפקא'}});
  assert.equal(votes[0].word,'נפקא');assert.deepEqual({...votes[0].entry},{rid:'KRU0002'},'Hebrew menu item must vote for its exact Krupnik ID');
  assert.equal(calls.filter(x=>x.method==='ui.showMessage').length,1,'successful vote may be acknowledged');
  failVote=true;
  for(const fn of events.get('reader.context_menu_item_clicked')||[])await fn({itemId:'aramaic-hebrew-community-vote-0',selection:{renderedSelectedText:'נפקא'}});
  assert.equal(calls.filter(x=>x.method==='ui.showMessage').length,1,'network failure must not mention community voting');
}

await english();
await hebrew();
console.log('PASS: both right-click menus expose candidates, vote for the selected entry, and fail silently.');
