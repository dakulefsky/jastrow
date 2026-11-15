(function(root){
 'use strict';
 let API=String(root.DICTIONARY_COMMUNITY_API||'');
 while(API.endsWith('/'))API=API.slice(0,-1);
 const key='otzaria-dictionary-community-voter-v1';
 const permissionKey='otzaria-dictionary-community-network-approved-v1';
 const queueKey='otzaria-dictionary-community-pending-v1';
 let networkAvailable=false,permissionGranted=false,syncing=false;
 function storageGet(k,fallback){try{const v=localStorage.getItem(k);return v===null?fallback:v;}catch{return fallback;}}
 function storageSet(k,v){try{localStorage.setItem(k,v);return true;}catch{return false;}}
 function voterId(){try{let id=localStorage.getItem(key);if(!id){id=crypto.randomUUID();localStorage.setItem(key,id);}return id;}catch{return '';}}
 function normalize(word){return String(word||'').normalize('NFKD').replace(/[\\u0591-\\u05c7]/g,'').replace(/[^א-ת]/g,'').slice(0,100);}
 function idFor(entry){if(!entry||!(entry.r||entry.rid))return '';return (entry.source==='krupnik'||entry.rid?'krupnik:':'jastrow:')+(entry.r||entry.rid);}
 function readQueue(){try{const q=JSON.parse(storageGet(queueKey,'[]'));return Array.isArray(q)?q.filter(x=>x&&typeof x.word==='string'&&typeof x.entryId==='string'&&typeof x.voterId==='string'&&typeof x.id==='string').slice(-200):[];}catch{return [];}}
 function writeQueue(q){return storageSet(queueKey,JSON.stringify(q.slice(-200)));}
 function emit(type){try{root.dispatchEvent(new Event(type));}catch{}}
 function pendingCount(){return readQueue().length;}
 function disable(){if(!networkAvailable)return;networkAvailable=false;emit('dictionary-community-disabled');}
 async function checkHealth(){
  if(!API||root.navigator?.onLine===false){networkAvailable=false;return false;}
  try{const response=await fetch(API+'/health',{headers:{Accept:'application/json'},signal:AbortSignal.timeout(1800)});if(!response.ok)throw new Error('health');const data=await response.json();if(data.ok!==true)throw new Error('health');networkAvailable=true;permissionGranted=true;storageSet(permissionKey,'1');emit('dictionary-community-enabled');return true;}
  catch{networkAvailable=false;permissionGranted=false;emit('dictionary-community-disabled');return false;}
 }
 permissionGranted=storageGet(permissionKey,'')==='1';
 const ready=(async()=>{if(root.navigator?.onLine===false){networkAvailable=false;return false;}const ok=await checkHealth();if(ok)await flushQueue();return networkAvailable;})();
 async function rank(word,entries){if(!networkAvailable||!Array.isArray(entries)||!entries.length)return {preferredEntryId:null,entries};const ids=entries.map(x=>typeof x==='string'?x:idFor(x)).filter(Boolean).slice(0,40);if(!ids.length)return {preferredEntryId:null,entries};try{const u=new URL(API+'/v1/suggestions');u.searchParams.set('word',normalize(word));u.searchParams.set('ids',ids.join(','));const r=await fetch(u,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(1800)});if(!r.ok){disable();return {preferredEntryId:null,entries};}const data=await r.json();const preferred=data.preferredEntryId;if(!preferred)return {preferredEntryId:null,entries};const reordered=[...entries].sort((a,b)=>{const aid=typeof a==='string'?a:idFor(a),bid=typeof b==='string'?b:idFor(b);return aid===preferred?-1:bid===preferred?1:0;});return {preferredEntryId:preferred,entries:reordered,votes:data.totalVotes||0};}catch{disable();return {preferredEntryId:null,entries};}}
 function enqueue(word,entryId,voter){
  const normalized=normalize(word);if(!normalized||!entryId||!voter)return {ok:false,reason:'unavailable'};
  const q=readQueue(),id=normalized+'|'+voter;
  const item={id,word:normalized,entryId,voterId:voter,createdAt:Date.now()};
  const next=q.filter(x=>x.id!==id);next.push(item);
  if(!writeQueue(next))return {ok:false,reason:'storage'};
  emit('dictionary-community-queue-updated');
  return {ok:true,queued:true,pending:next.length};
 }
 async function flushQueue(){
  if(syncing||!networkAvailable||!permissionGranted||root.navigator?.onLine===false)return {synced:0,pending:pendingCount()};
  syncing=true;let synced=0;
  try{
   let q=readQueue();
   for(const item of q){
    if(!networkAvailable||root.navigator?.onLine===false)break;
    try{
     const r=await fetch(API+'/v1/vote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({word:item.word,entryId:item.entryId,voterId:item.voterId}),signal:AbortSignal.timeout(3000)});
     if(!r.ok){disable();break;}
     const data=await r.json();if(typeof data.accepted!=='boolean'){disable();break;}
     q=q.filter(x=>x.id!==item.id);writeQueue(q);synced++;
    }catch{networkAvailable=false;emit('dictionary-community-disabled');break;}
   }
  }finally{syncing=false;emit('dictionary-community-queue-updated');if(synced)emit('dictionary-community-synced');}
  return {synced,pending:pendingCount()};
 }
 async function vote(word,entry){
  const entryId=typeof entry==='string'?entry:idFor(entry),voter=voterId();
  if(!entryId||!voter)return {ok:false,reason:'unavailable'};
  if(!permissionGranted)return {ok:false,reason:'offline'};
  if(root.navigator?.onLine===false||!networkAvailable)return enqueue(word,entryId,voter);
  try{
   const r=await fetch(API+'/v1/vote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({word:normalize(word),entryId,voterId:voter}),signal:AbortSignal.timeout(2500)});
   if(!r.ok){disable();return enqueue(word,entryId,voter);}
   const data=await r.json();if(typeof data.accepted!=='boolean'){disable();return enqueue(word,entryId,voter);}
   return {ok:data.accepted===true,duplicate:data.duplicate===true,votes:data.votes||0};
  }catch{networkAvailable=false;emit('dictionary-community-disabled');return enqueue(word,entryId,voter);}
 }
 root.addEventListener?.('online',async()=>{if(await checkHealth())await flushQueue();});
 root.addEventListener?.('focus',async()=>{if(root.navigator?.onLine!==false&&!networkAvailable&&await checkHealth())await flushQueue();});
 root.addEventListener?.('dictionary-community-enabled',()=>{flushQueue().catch(()=>{});});
 const api={ready,normalize,idFor,rank,vote,flushQueue};
 Object.defineProperties(api,{enabled:{enumerable:true,get:()=>permissionGranted&&(networkAvailable||root.navigator?.onLine===false)},online:{enumerable:true,get:()=>networkAvailable},pending:{enumerable:true,get:pendingCount}});
 root.DictionaryCommunity=api;
 if(typeof root.setInterval==='function')root.setInterval(()=>{if(root.navigator?.onLine!==false&&!networkAvailable)checkHealth().then(ok=>ok&&flushQueue()).catch(()=>{});else flushQueue().catch(()=>{});},60000);
})(typeof window==='undefined'?globalThis:window);
