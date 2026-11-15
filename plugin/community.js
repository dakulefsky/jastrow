(function(root){
 'use strict';
 let API=String(root.DICTIONARY_COMMUNITY_API||'');
 while(API.endsWith('/'))API=API.slice(0,-1);
 const key='otzaria-dictionary-community-voter-v1';
 const queueKey='otzaria-dictionary-community-pending-v1';
 let networkAvailable=false,permissionGranted=false,offlineMode=false,syncing=false;
 function storageGet(k,fallback){try{const v=localStorage.getItem(k);return v===null?fallback:v;}catch{return fallback;}}
 function storageSet(k,v){try{localStorage.setItem(k,v);return true;}catch{return false;}}
 function voterId(){try{let id=localStorage.getItem(key);if(!id){id=crypto.randomUUID();localStorage.setItem(key,id);}return id;}catch{return '';}}
 function normalize(word){return String(word||'').normalize('NFKD').replace(/[\u0591-\u05c7]/g,'').replace(/[^א-ת]/g,'').slice(0,100);}
 function idFor(entry){if(!entry||!(entry.r||entry.rid))return '';return (entry.source==='krupnik'||entry.rid?'krupnik:':'jastrow:')+(entry.r||entry.rid);}
 function readQueue(){try{const q=JSON.parse(storageGet(queueKey,'[]'));return Array.isArray(q)?q.filter(x=>x&&typeof x.word==='string'&&typeof x.entryId==='string'&&typeof x.voterId==='string'&&typeof x.id==='string').slice(-200):[];}catch{return [];}}
 function writeQueue(q){return storageSet(queueKey,JSON.stringify(q.slice(-200)));}
 function emit(type){try{root.dispatchEvent(new Event(type));}catch{}}
 function pendingCount(){return readQueue().length;}
 function setPermission(granted){
  const changed=permissionGranted!==granted;
  permissionGranted=granted;
  if(!granted){networkAvailable=false;if(changed){emit('dictionary-community-disabled');emit('dictionary-community-permission-denied');}}
  else if(changed){emit('dictionary-community-permission-granted');}
 }
 async function checkConnectivity(){
  try{
   if(root.Otzaria?.call){
    const result=await root.Otzaria.call('app.getConnectivity',{});
    if(result?.success&&result.data){
     offlineMode=result.data.isOfflineMode===true;
     if(offlineMode||result.data.isOnline===false){networkAvailable=false;return false;}
     if(result.data.isOnline===true)return true;
    }
   }
  }catch{}
  return !offlineMode&&root.navigator?.onLine!==false;
 }
 async function checkHealth(){
  if(!permissionGranted||!API||!(await checkConnectivity())){networkAvailable=false;return false;}
  try{
   const response=await fetch(API+'/health',{headers:{Accept:'application/json'},signal:AbortSignal.timeout(1800)});
   if(!response.ok)throw new Error('health');
   const data=await response.json();if(data.ok!==true)throw new Error('health');
   networkAvailable=true;emit('dictionary-community-enabled');return true;
  }catch{
   const wasEnabled=networkAvailable;networkAvailable=false;
   if(wasEnabled)emit('dictionary-community-offline');
   return false;
  }
 }
 async function refreshPermissions(){
  try{
   const result=await root.Otzaria?.call?.('app.getGrantedPermissions',{});
   const permissions=result?.success===true&&Array.isArray(result.data?.permissions)?result.data.permissions:[];
   const granted=permissions.includes('network.access');
   setPermission(granted);
   if(!granted)return false;
   if(await checkHealth())await flushQueue();
   return true;
  }catch{setPermission(false);return false;}
 }
 async function rank(word,entries){
  if(!permissionGranted||!networkAvailable||!Array.isArray(entries)||!entries.length)return {preferredEntryId:null,entries};
  const ids=entries.map(x=>typeof x==='string'?x:idFor(x)).filter(Boolean).slice(0,40);if(!ids.length)return {preferredEntryId:null,entries};
  try{
   const u=new URL(API+'/v1/suggestions');u.searchParams.set('word',normalize(word));u.searchParams.set('ids',ids.join(','));
   const r=await fetch(u,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(1800)});
   if(!r.ok){networkAvailable=false;emit('dictionary-community-offline');return {preferredEntryId:null,entries};}
   const data=await r.json(),preferred=data.preferredEntryId;
   if(!preferred)return {preferredEntryId:null,entries};
   const reordered=[...entries].sort((a,b)=>{const aid=typeof a==='string'?a:idFor(a),bid=typeof b==='string'?b:idFor(b);return aid===preferred?-1:bid===preferred?1:0;});
   return {preferredEntryId:preferred,entries:reordered,votes:data.totalVotes||0};
  }catch{networkAvailable=false;emit('dictionary-community-offline');return {preferredEntryId:null,entries};}
 }
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
  if(syncing||!permissionGranted||!networkAvailable||!await checkConnectivity())return {synced:0,pending:pendingCount()};
  syncing=true;let synced=0;
  try{
   let q=readQueue();
   for(const item of q){
    if(!permissionGranted||!networkAvailable||!(await checkConnectivity()))break;
    try{
     const r=await fetch(API+'/v1/vote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({word:item.word,entryId:item.entryId,voterId:item.voterId}),signal:AbortSignal.timeout(3000)});
     if(!r.ok){networkAvailable=false;emit('dictionary-community-offline');break;}
     const data=await r.json();if(typeof data.accepted!=='boolean'){networkAvailable=false;break;}
     q=q.filter(x=>x.id!==item.id);writeQueue(q);synced++;
    }catch{networkAvailable=false;emit('dictionary-community-offline');break;}
   }
  }finally{syncing=false;emit('dictionary-community-queue-updated');if(synced&&pendingCount()===0)emit('dictionary-community-synced');}
  return {synced,pending:pendingCount()};
 }
 async function vote(word,entry){
  if(!permissionGranted)return {ok:false,reason:'permission'};
  const entryId=typeof entry==='string'?entry:idFor(entry),voter=voterId();
  if(!entryId||!voter)return {ok:false,reason:'unavailable'};
  if(!networkAvailable||!(await checkConnectivity()))return enqueue(word,entryId,voter);
  try{
   const r=await fetch(API+'/v1/vote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({word:normalize(word),entryId,voterId:voter}),signal:AbortSignal.timeout(2500)});
   if(!r.ok){networkAvailable=false;emit('dictionary-community-offline');return enqueue(word,entryId,voter);}
   const data=await r.json();if(typeof data.accepted!=='boolean'){networkAvailable=false;emit('dictionary-community-offline');return enqueue(word,entryId,voter);}
   return {ok:data.accepted===true,duplicate:data.duplicate===true,votes:data.votes||0};
  }catch{networkAvailable=false;emit('dictionary-community-offline');return enqueue(word,entryId,voter);}
 }
 const permissionChanged=detail=>{
  const permissions=Array.isArray(detail?.permissions)?detail.permissions:[];
  setPermission(permissions.includes('network.access'));
  if(permissionGranted)checkHealth().then(ok=>ok&&flushQueue()).catch(()=>{});
 };
 try{root.Otzaria?.on?.('plugin.permissions_changed',permissionChanged);}catch{}
 try{root.addEventListener?.('online',async()=>{if(permissionGranted&&await checkHealth())await flushQueue();});}catch{}
 try{root.addEventListener?.('focus',async()=>{if(permissionGranted&&!networkAvailable&&await checkHealth())await flushQueue();});}catch{}
 const api={ready:Promise.resolve(false),normalize,idFor,rank,vote,flushQueue,refreshPermissions};
 Object.defineProperties(api,{enabled:{enumerable:true,get:()=>permissionGranted},online:{enumerable:true,get:()=>networkAvailable},pending:{enumerable:true,get:pendingCount}});
 root.DictionaryCommunity=api;
 api.ready=refreshPermissions();
 if(typeof root.setInterval==='function')root.setInterval(()=>{if(permissionGranted&&!networkAvailable)checkHealth().then(ok=>ok&&flushQueue()).catch(()=>{});else flushQueue().catch(()=>{});},60000);
})(typeof window==='undefined'?globalThis:window);
