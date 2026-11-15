import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../plugin/community.js', import.meta.url), 'utf8');

async function load({ health = true, voteStatus = 200, permission = true, online = true } = {}) {
  const events = [], calls = [], values = new Map();
  const root = {
    DICTIONARY_COMMUNITY_API: 'https://community.example',
    navigator: { onLine: online },
    dispatchEvent: event => events.push(event.type),
    addEventListener: () => {},
    Otzaria: {
      call: async method => {
        if (method === 'app.getGrantedPermissions') return { success: true, data: { permissions: permission ? ['network.access'] : [] } };
        if (method === 'app.getConnectivity') return { success: true, data: { isOfflineMode: false, isOnline: root.navigator.onLine } };
        throw new Error('Unexpected host API: ' + method);
      },
      on: () => {}
    }
  };
  const context = {
    window: root, globalThis: root, URL, Event, AbortSignal, TextEncoder,
    localStorage: {
      getItem: key => values.get(key) || null,
      setItem: (key, value) => values.set(key, value)
    },
    crypto: { randomUUID: () => '12345678-1234-1234-1234-123456789012' },
    fetch: async (input, init = {}) => {
      const url = String(input); calls.push({ url, method: init.method || 'GET' });
      if (url.endsWith('/health')) return new Response(JSON.stringify({ ok: health }), { status: 200 });
      if (url.endsWith('/v1/vote')) return new Response(
        JSON.stringify(voteStatus === 200 ? { accepted: true, votes: 1 } : { error: 'unavailable' }),
        { status: voteStatus }
      );
      throw new Error('Unexpected community request: ' + url);
    }
  };
  vm.runInNewContext(source, context);
  await root.DictionaryCommunity.ready;
  return { api: root.DictionaryCommunity, events, calls, root };
}

const denied = await load({ permission: false });
assert.equal(denied.api.enabled, false);
assert.equal((await denied.api.vote('נפקא', 'krupnik:KRU1')).reason, 'permission');
assert.equal(denied.calls.length, 0, 'without explicit host permission the Worker must never be contacted');
assert.deepEqual(denied.events, []);

const unavailable = await load({ health: false });
assert.equal(unavailable.api.enabled, true, 'permission remains granted when the service is unavailable');
assert.equal((await unavailable.api.vote('נפקא', 'krupnik:KRU1')).queued, true);
assert.equal(unavailable.api.pending, 1);
assert(!unavailable.events.includes('dictionary-community-disabled'),'service outage must not revoke permission');
assert.equal(unavailable.calls.length, 1, 'only the health check is attempted when the service is unavailable');

const failing = await load({ health: true, voteStatus: 503 });
assert.equal(failing.api.enabled, true);
assert.equal(failing.api.idFor({ source: 'jastrow', r: 'A03220' }), 'jastrow:A03220');
assert.equal(failing.api.idFor({ source: 'krupnik', r: 'KRU02095' }), 'krupnik:KRU02095');
assert.equal(failing.api.idFor({ rid: 'KRU02095' }), 'krupnik:KRU02095');
const failedVote = await failing.api.vote('נפקא', { rid: 'KRU02095' });
assert.equal(failedVote.ok, true, 'a failed network submission should be retained locally');
assert.equal(failedVote.queued, true);
assert.equal(failing.api.pending, 1);
assert(failing.events.includes('dictionary-community-offline'),'temporary vote failure should be reported as offline, not permission denial');
assert(!failing.events.includes('dictionary-community-disabled'),'temporary vote failure must not disable community controls');
assert.equal(failing.api.enabled, true, "temporary network failures do not revoke the user's permission");
const before = failing.calls.length;
await failing.api.rank('נפקא', [{ rid: 'KRU02095' }]);
assert.equal(failing.calls.length, before, 'after failure the client must remain offline and silent');

async function offlineQueueRoundTrip(){
 const events=new Map(),values=new Map(),calls=[];
 const root={
  DICTIONARY_COMMUNITY_API:'https://community.example',
  navigator:{onLine:false},
  dispatchEvent:event=>{for(const fn of events.get(event.type)||[])fn(event);},
  addEventListener:(type,fn)=>{if(!events.has(type))events.set(type,[]);events.get(type).push(fn);},
  Otzaria:{
   call:async method=>{
    if(method==='app.getGrantedPermissions')return {success:true,data:{permissions:['network.access']}};
    if(method==='app.getConnectivity')return {success:true,data:{isOfflineMode:false,isOnline:root.navigator.onLine}};
    throw new Error('Unexpected host API '+method);
   },
   on:()=>{}
  }
 };
 let sent=[];
 const context={
  window:root,globalThis:root,URL,Event,AbortSignal,TextEncoder,
  localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)},
  crypto:{randomUUID:()=> '12345678-1234-1234-1234-123456789012'},
  fetch:async(input,init={})=>{
   const url=String(input);calls.push({url,method:init.method||'GET'});
   if(url.endsWith('/health'))return new Response(JSON.stringify({ok:true}),{status:200});
   if(url.endsWith('/v1/vote')){sent.push(JSON.parse(init.body));return new Response(JSON.stringify({accepted:true,votes:1}),{status:200});}
   throw new Error('Unexpected URL '+url);
  }
 };
 vm.runInNewContext(source,context);
 await root.DictionaryCommunity.ready;
 assert.equal(root.DictionaryCommunity.enabled,true,'users who granted network access can vote offline');
 const queued=await root.DictionaryCommunity.vote('נפקא','krupnik:KRU02095');
 assert.equal(queued.queued,true);
 assert.equal(root.DictionaryCommunity.pending,1);
 assert.equal(calls.some(x=>x.url.endsWith('/v1/vote')),false,'offline vote must not attempt network');
 root.navigator.onLine=true;
 for(const fn of events.get('online')||[])await fn();
 assert.equal(root.DictionaryCommunity.pending,0,'confirmed submission must be removed from queue');
 assert.equal(sent.length,1);
 assert.equal(sent[0].entryId,'krupnik:KRU02095');
 const again=await root.DictionaryCommunity.flushQueue();
 assert.equal(again.pending,0,'retries must not re-submit an acknowledged vote');
}
await offlineQueueRoundTrip();

console.log('PASS: explicit host permission, no requests when denied, offline queue, reconnect sync, retry safety, and permission persistence.');
