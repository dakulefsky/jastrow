(function(root){
 'use strict';
 let API=String(root.DICTIONARY_COMMUNITY_API||'').replace(/\/+$/,'');
 if(!/^https:\/\/otzaria-dictionary-community\.dakulefsky\.workers\.dev$/.test(API))API='';
 const voterKey='otzaria-dictionary-community-voter-v1';
 const queueKey='otzaria-dictionary-community-pending-v1';
 let permissionGranted=false,permissionKnown=false,permissionEpoch=0,networkAvailable=false,offlineMode=false,syncing=false,permissionRead=null;
 const inflight=new Set();
 const timeoutMs={health:1800,rank:1800,vote:3000};
 function storageGet(key,fallback){try{const value=localStorage.getItem(key);return value===null||value===undefined?fallback:value;}catch{return fallback;}}
 function storageSet(key,value){try{localStorage.setItem(key,value);return true;}catch{return false;}}
 function randomId(){try{if(crypto?.randomUUID)return crypto.randomUUID();if(crypto?.getRandomValues){const bytes=new Uint8Array(16);crypto.getRandomValues(bytes);return [...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');}}catch{}return '';}
 function voterId(){let id=storageGet(voterKey,'');if(id)return id;id=randomId();if(id&&storageSet(voterKey,id))return id;return '';}
 function normalize(word){return String(word||'').normalize('NFKD').replace(/[\u0591-\u05c7]/g,'').replace(/[^א-ת]/g,'').slice(0,100);}
 function contextRange(selection){return selection?.sourceRange||selection?.renderedRange||selection?.sections?.[0]?.sourceRange||selection?.sections?.[0]?.renderedRange||null;}
 function contextWords(raw){return String(raw||'').normalize('NFKD').replace(/\p{M}/gu,'').match(/[א-ת]+/g)||[];}
 function contextFeatureSpecs(selection){
  const range=contextRange(selection);if(!range)return [];
  const left=contextWords(range.beforeText?.raw),right=contextWords(range.afterText?.raw),specs=[];
  if(left.length)specs.push({label:'L1',value:left[left.length-1],weight:1});
  if(right.length)specs.push({label:'R1',value:right[0],weight:1});
  if(left.length>1)specs.push({label:'L2',value:left.slice(-2).join(' '),weight:3});
  if(right.length>1)specs.push({label:'R2',value:right.slice(0,2).join(' '),weight:3});
  if(left.length&&right.length)specs.push({label:'AROUND',value:left[left.length-1]+'|'+right[0],weight:4});
  return specs;
 }
 async function hashSpecs(specs,group){
  const subtle=root.crypto?.subtle;
  if(!Array.isArray(specs)||specs.length<2||!subtle?.digest||typeof TextEncoder!=='function')return [];
  const output=[];
  for(const item of specs){
   try{
    const digest=await subtle.digest('SHA-256',new TextEncoder().encode('otzaria-context-v1|'+item.label+'|'+item.value));
    const hash=[...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0')).join('');
    output.push({hash,weight:item.weight,group});
   }catch{return [];}
  }
  return output;
 }
 async function contextFeatures(selection,word){
  const specs=contextFeatureSpecs(selection);
  if(specs.length<2)return [];
  const local=await hashSpecs(specs,'local');
  if(local.length<2)return [];
  const output=[...local];
  if(word&&root.DictionaryMesorat?.getParallelProfiles){
   try{
    const profiles=await root.DictionaryMesorat.getParallelProfiles(selection,word,specs);
    for(let i=0;i<Math.min(4,profiles.length);i++){
     const group=/^[A-Za-z0-9_-]{1,32}$/.test(profiles[i]?.group||'')?profiles[i].group:'mesora-'+i;
     const parallel=await hashSpecs(profiles[i]?.specs,group);
     if(parallel.length>=2)output.push(...parallel);
    }
   }catch{}
  }
  return output.slice(0,25);
 }
 function hasContext(selection){return contextFeatureSpecs(selection).length>=2;}
 function contextKey(features){return features.map(item=>(item.group||'default')+':'+item.hash+':'+item.weight).sort().join('.');}

 function idFor(entry){if(!entry||!(entry.r||entry.rid))return '';return (entry.source==='krupnik'||entry.rid?'krupnik:':'jastrow:')+(entry.r||entry.rid);}
 function validQueueItem(item){return item&&typeof item.word==='string'&&typeof item.entryId==='string'&&typeof item.voterId==='string'&&typeof item.id==='string'&&typeof item.token==='string'&&(!item.scope||item.scope==='general'||item.scope==='contextual')&&(item.scope!=='contextual'||Array.isArray(item.contextFeatures));}
 function readQueue(){try{const q=JSON.parse(storageGet(queueKey,'[]'));return Array.isArray(q)?q.filter(validQueueItem).slice(-200):[];}catch{return [];}}
 function writeQueue(queue){return storageSet(queueKey,JSON.stringify(queue.slice(-200)));}
 function emit(type){try{root.dispatchEvent(new Event(type));}catch{}}
 function pendingCount(){return readQueue().length;}
 function setNetwork(available){const changed=networkAvailable!==available;networkAvailable=available;if(changed)emit(available?'dictionary-community-enabled':'dictionary-community-offline');}
 function abortRequests(){for(const controller of inflight){try{controller.abort();}catch{}}inflight.clear();}
 function setPermission(granted){
  permissionKnown=true;const changed=permissionGranted!==granted;permissionGranted=granted;
  if(!granted){setNetwork(false);abortRequests();if(changed){emit('dictionary-community-disabled');emit('dictionary-community-permission-denied');}}
  else if(changed)emit('dictionary-community-permission-granted');
 }
 function controllerFor(timeout){const controller=typeof AbortController==='function'?new AbortController():null;if(controller)inflight.add(controller);const timer=controller&&typeof root.setTimeout==='function'?root.setTimeout(()=>controller.abort(),timeout):null;return {signal:controller?.signal,done:()=>{if(timer!==null)root.clearTimeout(timer);if(controller)inflight.delete(controller);}};}
 async function request(url,options={},timeout=2500){const ctl=controllerFor(timeout);try{return await fetch(url,{...options,...(ctl.signal?{signal:ctl.signal}:{})});}finally{ctl.done();}}
 async function checkConnectivity(){
  try{if(root.Otzaria?.call){const result=await root.Otzaria.call('app.getConnectivity',{});if(result?.success&&result.data){offlineMode=result.data.isOfflineMode===true;if(offlineMode||result.data.isOnline===false){setNetwork(false);return false;}if(result.data.isOnline===true)return true;}}}catch{}
  return !offlineMode&&root.navigator?.onLine!==false;
 }
 async function checkHealth(){
  if(!permissionGranted||!API||!(await checkConnectivity())){setNetwork(false);return false;}
  try{const response=await request(API+'/health',{headers:{Accept:'application/json'}},timeoutMs.health);if(!response.ok)throw Error('health');const data=await response.json();if(data.ok!==true)throw Error('health');if(!permissionGranted)return false;setNetwork(true);return true;}
  catch{setNetwork(false);return false;}
 }
 async function refreshPermissions(){
  if(permissionRead)return permissionRead;
  permissionRead=(async()=>{const epoch=permissionEpoch;try{
   const result=await root.Otzaria?.call?.('app.getGrantedPermissions',{});
   if(epoch!==permissionEpoch)return permissionGranted;
   if(result?.success!==true||!Array.isArray(result.data?.permissions))return false;
   setPermission(result.data.permissions.includes('network.access'));
   if(!permissionGranted)return false;
   if(await checkHealth())await flushQueue();
   return true;
  }catch{return false;}finally{permissionRead=null;}})();
  return permissionRead;
 }
 function markOffline(){setNetwork(false);}
 async function rank(word,entries,selection){
  if(!permissionGranted||!networkAvailable||!Array.isArray(entries)||!entries.length)return {preferredEntryId:null,entries,preferenceScope:null};
  const ids=entries.map(x=>typeof x==='string'?x:idFor(x)).filter(Boolean).slice(0,40);if(!ids.length)return {preferredEntryId:null,entries,preferenceScope:null};
  try{
   const features=selection?await contextFeatures(selection,word):[];
   const url=new URL(API+'/v1/suggestions');url.searchParams.set('word',normalize(word));url.searchParams.set('ids',ids.join(','));
   if(features.length)url.searchParams.set('context',JSON.stringify(features));
   const response=await request(url,{headers:{Accept:'application/json'}},timeoutMs.rank);if(!response.ok)throw Error('rank');
   const data=await response.json();if(!permissionGranted)return {preferredEntryId:null,entries,preferenceScope:null};
   const preferred=data.preferredEntryId;if(!preferred)return {preferredEntryId:null,entries,preferenceScope:null,votes:Number(data.totalVotes)||0,contextualVotes:Number(data.contextualVotes)||0};
   const reordered=[...entries].sort((a,b)=>{const aid=typeof a==='string'?a:idFor(a),bid=typeof b==='string'?b:idFor(b);return aid===preferred?-1:bid===preferred?1:0;});
   return {preferredEntryId:preferred,entries:reordered,votes:Number(data.totalVotes)||0,contextualVotes:Number(data.contextualVotes)||0,preferenceScope:data.preferenceScope||null};
  }catch{markOffline();return {preferredEntryId:null,entries,preferenceScope:null};}
 }
 function enqueue(word,entryId,voter,scope='general',features=[]){
  const normalized=normalize(word);if(!normalized||!entryId||!voter)return {ok:false,reason:'unavailable'};
  const key=scope==='contextual'?contextKey(features):'general',id=normalized+'|'+voter+'|'+scope+'|'+key;
  const queue=readQueue(),existing=queue.findIndex(item=>item.id===id);
  if(existing<0&&queue.length>=200)return {ok:false,reason:'queue_full',pending:queue.length};
  const item={id,word:normalized,entryId,voterId:voter,scope,contextFeatures:scope==='contextual'?features:undefined,createdAt:Date.now(),token:randomId()};if(!item.token)return {ok:false,reason:'unavailable'};
  const next=queue.filter(x=>x.id!==id);next.push(item);
  if(!writeQueue(next))return {ok:false,reason:'storage'};
  emit('dictionary-community-queue-updated');return {ok:true,queued:true,pending:next.length};
 }
 function sameQueuedVote(a,b){return !!a&&!!b&&a.id===b.id&&a.token===b.token&&a.entryId===b.entryId&&(a.scope||'general')===(b.scope||'general');}
 async function flushQueue(){
  if(syncing||!permissionGranted||!networkAvailable||!(await checkConnectivity()))return {synced:0,pending:pendingCount()};
  syncing=true;let synced=0;
  try{
   const batch=readQueue();
   for(const item of batch){
    if(!permissionGranted||!networkAvailable||!(await checkConnectivity()))break;
    const current=readQueue().find(x=>x.id===item.id);if(!sameQueuedVote(current,item))continue;
    try{
     const response=await request(API+'/v1/vote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({word:item.word,entryId:item.entryId,voterId:item.voterId,scope:item.scope||'general',...(item.scope==='contextual'?{contextFeatures:item.contextFeatures}:{})})},timeoutMs.vote);
     if(!permissionGranted)break;
     if(!response.ok)throw Error('vote');
     const data=await response.json();if(typeof data.accepted!=='boolean'||(!data.accepted&&!data.duplicate))throw Error('vote response');
     // Re-read after the network await: a newer offline choice for this same
     // word may have replaced the item while the older request was in flight.
     const latest=readQueue(),stillCurrent=latest.find(x=>x.id===item.id);
     if(sameQueuedVote(stillCurrent,item)){writeQueue(latest.filter(x=>!sameQueuedVote(x,item)));synced++;}
    }catch{markOffline();break;}
   }
  }finally{syncing=false;emit('dictionary-community-queue-updated');if(synced&&pendingCount()===0)emit('dictionary-community-synced');}
  return {synced,pending:pendingCount()};
 }
 async function vote(word,entry,options={}){
  if(!permissionGranted)return {ok:false,reason:'permission'};
  const normalized=normalize(word),entryId=typeof entry==='string'?entry:idFor(entry),voter=voterId(),scope=options.scope==='contextual'?'contextual':'general';
  if(!normalized||!entryId||!voter)return {ok:false,reason:'unavailable'};
  const features=scope==='contextual'?await contextFeatures(options.selection,normalized):[];
  if(scope==='contextual'&&features.length<2)return {ok:false,reason:'context_unavailable'};
  const payload={word:normalized,entryId,voterId:voter,scope,...(scope==='contextual'?{contextFeatures:features}:{})};
  if(!networkAvailable&&!await checkHealth())return permissionGranted?enqueue(normalized,entryId,voter,scope,features):{ok:false,reason:'permission'};
  if(!permissionGranted)return {ok:false,reason:'permission'};
  if(!(await checkConnectivity()))return permissionGranted?enqueue(normalized,entryId,voter,scope,features):{ok:false,reason:'permission'};
  if(!permissionGranted)return {ok:false,reason:'permission'};
  try{const response=await request(API+'/v1/vote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)},timeoutMs.vote);if(!permissionGranted)return {ok:false,reason:'permission'};if(!response.ok)throw Error('vote');const data=await response.json();if(typeof data.accepted!=='boolean')throw Error('vote response');return {ok:data.accepted===true,duplicate:data.duplicate===true,votes:Number(data.votes)||0,scope};}
  catch{if(!permissionGranted)return {ok:false,reason:'permission'};markOffline();return enqueue(normalized,entryId,voter,scope,features);}
 }
 function permissionsFrom(payload){if(Array.isArray(payload?.permissions))return payload.permissions;if(Array.isArray(payload?.data?.permissions))return payload.data.permissions;return null;}
 function permissionChanged(payload){const permissions=permissionsFrom(payload);if(permissions){permissionEpoch++;setPermission(permissions.includes('network.access'));if(permissionGranted)checkHealth().then(ok=>ok&&flushQueue()).catch(()=>{});}else refreshPermissions();}
 try{root.Otzaria?.on?.('plugin.permissions_changed',permissionChanged);}catch{}
 try{root.Otzaria?.on?.('plugin.boot',async payload=>{const permissions=permissionsFrom(payload);if(permissions){permissionEpoch++;setPermission(permissions.includes('network.access'));if(permissionGranted&&await checkHealth())await flushQueue();}else await refreshPermissions();});}catch{}
 try{root.addEventListener?.('online',async()=>{if(!permissionKnown)await refreshPermissions();else if(permissionGranted&&await checkHealth())await flushQueue();});}catch{}
 try{root.addEventListener?.('focus',async()=>{if(!permissionKnown)await refreshPermissions();else if(permissionGranted&&await checkHealth())await flushQueue();});}catch{}
 try{root.document?.addEventListener?.('visibilitychange',async()=>{if(root.document.visibilityState==='visible'&&permissionGranted&&await checkHealth())await flushQueue();});}catch{}
 const api={ready:Promise.resolve(false),normalize,idFor,rank,vote,contextFeatures,hasContext,flushQueue,refreshPermissions};
 Object.defineProperties(api,{enabled:{enumerable:true,get:()=>permissionGranted},online:{enumerable:true,get:()=>networkAvailable},pending:{enumerable:true,get:pendingCount}});
 root.DictionaryCommunity=api;api.ready=refreshPermissions();
})(typeof window==='undefined'?globalThis:window);
