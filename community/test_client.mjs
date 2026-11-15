import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../plugin/community.js', import.meta.url), 'utf8');

async function load({ health = true, voteStatus = 200, permission = true, online = true } = {}) {
  const events = [], calls = [], values = new Map();
  const root = {
    DICTIONARY_COMMUNITY_API: 'https://otzaria-dictionary-community.dakulefsky.workers.dev',
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

async function bootPermissionSnapshot(){
 const listeners=new Map(),values=new Map(),calls=[];
 const root={
  DICTIONARY_COMMUNITY_API:'https://otzaria-dictionary-community.dakulefsky.workers.dev',navigator:{onLine:true},
  dispatchEvent:event=>{},addEventListener:()=>{},
  Otzaria:{
   call:async method=>{if(method==='app.getGrantedPermissions')return {success:true,data:{permissions:[]}};if(method==='app.getConnectivity')return {success:true,data:{isOfflineMode:false,isOnline:true}};throw new Error(method);},
   on:(name,fn)=>{if(!listeners.has(name))listeners.set(name,[]);listeners.get(name).push(fn);}
  }
 };
 const context={window:root,globalThis:root,URL,Event,AbortSignal,TextEncoder,localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)},crypto:{randomUUID:()=> '12345678-1234-1234-1234-123456789012'},fetch:async input=>{calls.push(String(input));return new Response(JSON.stringify({ok:true}),{status:200});}};
 vm.runInNewContext(source,context);await root.DictionaryCommunity.ready;
 assert.equal(root.DictionaryCommunity.enabled,false,'pre-boot empty permission response must not be treated as granted');
 for(const fn of listeners.get('plugin.boot')||[])await fn({permissions:['network.access']});
 assert.equal(root.DictionaryCommunity.enabled,true,'the documented boot permission snapshot must activate community features');
 assert(calls.some(url=>url.endsWith('/health')),'boot permission grant should initialize the service health check');
}
await bootPermissionSnapshot();

async function offlineQueueRoundTrip(){
 const events=new Map(),values=new Map(),calls=[];
 const root={
  DICTIONARY_COMMUNITY_API:'https://otzaria-dictionary-community.dakulefsky.workers.dev',
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


async function preservesNewChoiceDuringSync(){
 const events=new Map(),values=new Map(),sent=[];let nextId=0,releaseFirst,firstStarted;
 const started=new Promise(resolve=>firstStarted=resolve);
 const root={
  DICTIONARY_COMMUNITY_API:'https://otzaria-dictionary-community.dakulefsky.workers.dev',navigator:{onLine:false},
  dispatchEvent:event=>{for(const fn of events.get(event.type)||[])fn(event);},
  addEventListener:(type,fn)=>{if(!events.has(type))events.set(type,[]);events.get(type).push(fn);},
  Otzaria:{call:async method=>{if(method==='app.getGrantedPermissions')return {success:true,data:{permissions:['network.access']}};if(method==='app.getConnectivity')return {success:true,data:{isOfflineMode:false,isOnline:root.navigator.onLine}};throw Error(method);},on:()=>{}}
 };
 const context={
  window:root,globalThis:root,URL,Event,AbortSignal,TextEncoder,
  localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)},
  crypto:{randomUUID:()=>String(++nextId).padStart(8,'0')+'-1234-1234-1234-123456789012'},
  fetch:async(input,init={})=>{
   const url=String(input);
   if(url.endsWith('/health'))return new Response(JSON.stringify({ok:true}),{status:200});
   if(url.endsWith('/v1/vote')){const body=JSON.parse(init.body);sent.push(body);if(sent.length===1){firstStarted();return await new Promise(resolve=>releaseFirst=()=>resolve(new Response(JSON.stringify({accepted:true,votes:1}),{status:200})));}return new Response(JSON.stringify({accepted:true,votes:2}),{status:200});}
   throw Error('Unexpected request '+url);
  }
 };
 vm.runInNewContext(source,context);const api=root.DictionaryCommunity;await api.ready;
 assert.equal((await api.vote('נפקא','krupnik:KRU1')).queued,true,'first offline choice is queued');
 root.navigator.onLine=true;
 const sync=api.refreshPermissions();
 await started;
 root.navigator.onLine=false;
 assert.equal((await api.vote('נפקא','krupnik:KRU2')).queued,true,'newer choice is queued while the older choice is in flight');
 root.navigator.onLine=true;releaseFirst();await sync;
 assert.equal(api.pending,1,'finishing the older request must not erase the newer queued choice');
 await api.refreshPermissions();
 assert.equal(api.pending,0,'the newer choice should sync on the next pass');
 assert.deepEqual(sent.map(x=>x.entryId),['krupnik:KRU1','krupnik:KRU2'],'the newest candidate must be the final server-side choice');
}
await preservesNewChoiceDuringSync();

async function permissionReadFailureDoesNotRevokeGrant(){
 let failRead=false;const values=new Map(),events=[];
 const root={DICTIONARY_COMMUNITY_API:'https://otzaria-dictionary-community.dakulefsky.workers.dev',navigator:{onLine:true},dispatchEvent:e=>events.push(e.type),addEventListener:()=>{},Otzaria:{call:async method=>{if(method==='app.getGrantedPermissions')return failRead?{success:false}:{success:true,data:{permissions:['network.access']}};if(method==='app.getConnectivity')return {success:true,data:{isOfflineMode:false,isOnline:true}};throw Error(method);},on:()=>{}}};
 const context={window:root,globalThis:root,URL,Event,AbortSignal,TextEncoder,localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)},crypto:{randomUUID:()=> '12345678-1234-1234-1234-123456789012'},fetch:async()=>new Response(JSON.stringify({ok:true}),{status:200})};
 vm.runInNewContext(source,context);const api=root.DictionaryCommunity;await api.ready;assert.equal(api.enabled,true);
 failRead=true;await api.refreshPermissions();assert.equal(api.enabled,true,'a temporary host permission-read error must not be mistaken for explicit denial');
 assert(!events.includes('dictionary-community-disabled'));
}
await permissionReadFailureDoesNotRevokeGrant();


async function hostEventWinsOverStalePermissionRead(){
 const listeners=new Map(),values=new Map();let resolveRead;
 const root={DICTIONARY_COMMUNITY_API:'https://otzaria-dictionary-community.dakulefsky.workers.dev',navigator:{onLine:true},dispatchEvent:()=>{},addEventListener:()=>{},Otzaria:{call:async method=>{if(method==='app.getGrantedPermissions')return await new Promise(resolve=>resolveRead=resolve);if(method==='app.getConnectivity')return {success:true,data:{isOfflineMode:false,isOnline:true}};throw Error(method);},on:(name,fn)=>{if(!listeners.has(name))listeners.set(name,[]);listeners.get(name).push(fn);}}};
 const context={window:root,globalThis:root,URL,Event,AbortSignal,TextEncoder,localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)},crypto:{randomUUID:()=> '12345678-1234-1234-1234-123456789012'},fetch:async()=>new Response(JSON.stringify({ok:true}),{status:200})};
 vm.runInNewContext(source,context);const api=root.DictionaryCommunity;
 await new Promise(resolve=>setTimeout(resolve,0));
 for(const fn of listeners.get('plugin.boot')||[])await fn({permissions:['network.access']});
 resolveRead({success:true,data:{permissions:[]}});
 await api.ready;
 assert.equal(api.enabled,true,'a stale pre-boot permission response must not overwrite the host boot snapshot');
}
await hostEventWinsOverStalePermissionRead();

console.log('PASS: permission gating, boot snapshot precedence, durable offline queue, race-safe sync, and reconnect recovery.');
