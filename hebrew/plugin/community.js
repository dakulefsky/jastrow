(function(root){
 'use strict';
 let API=String(root.DICTIONARY_COMMUNITY_API||'').replace(/\/+$/,'');
 if(!/^https:\/\/otzaria-dictionary-community\.dakulefsky\.workers\.dev$/.test(API))API='';
 const voterKey='otzaria-dictionary-community-voter-v1';
 const queueKey='otzaria-dictionary-community-pending-v1';
 let permissionGranted=false,permissionKnown=false,permissionEpoch=0,networkAvailable=false,offlineMode=false,syncing=false,permissionRead=null;
 const inflight=new Set();
 const timeoutMs={health:1800,rank:1800,vote:3000};
 const featureTypes=new Set(['exact','pair','left1','right1','left2','right2','left2right1','left1right2']);
 function storageGet(key,fallback){try{const value=localStorage.getItem(key);return value===null||value===undefined?fallback:value;}catch{return fallback;}}
 function storageSet(key,value){try{localStorage.setItem(key,value);return true;}catch{return false;}}
 function randomId(){try{if(root.crypto?.randomUUID)return root.crypto.randomUUID();if(root.crypto?.getRandomValues){const bytes=new Uint8Array(16);root.crypto.getRandomValues(bytes);return [...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');}}catch{}return '';}
 function voterId(){let id=storageGet(voterKey,'');if(id)return id;id=randomId();if(id&&storageSet(voterKey,id))return id;return '';}
 function normalize(word){return String(word||'').normalize('NFKD').replace(/[\u0591-\u05c7]/g,'').replace(/[^א-ת]/g,'').slice(0,100);}
 function normalizeContextTokens(value){return (String(value||'').normalize('NFKD').replace(/[\u0591-\u05c7\u2060]/g,'').match(/[א-ת]+/g)||[]).map(x=>x.slice(0,32)).filter(Boolean);}
 function idFor(entry){if(!entry||!(entry.r||entry.rid))return '';return (entry.source==='krupnik'||entry.rid?'krupnik:':'jastrow:')+(entry.r||entry.rid);}
 function validQueueItem(item){return item&&typeof item.word==='string'&&typeof item.entryId==='string'&&typeof item.voterId==='string'&&typeof item.id==='string'&&typeof item.token==='string';}
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
 async function digestHex(value){
  try{
   const subtle=root.crypto?.subtle;if(!subtle?.digest||typeof TextEncoder==='undefined')return '';
   const digest=await subtle.digest('SHA-256',new TextEncoder().encode(value));
   return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
  }catch{return '';}
 }
 function contextWindow(selection,word){
  let selected=selection?.selection||selection||{};
  const selectedText=selected.renderedSelectedText||selected.normalizedSelectedText||selected.sourceSelectedText||selected.text||selection?.selectedText||'';
  if(selectedText&&normalize(selectedText)!==normalize(word))return null;
  if(Array.isArray(selected.sections)){
   if(selected.sections.length!==1)return null;
   selected=selected.sections[0];
  }
  const anchor=selected.sourceRange||selected.renderedRange;
  if(!anchor||!anchor.beforeText||!anchor.afterText)return null;
  const before=anchor.beforeText.normalized||anchor.beforeText.raw||'';
  const after=anchor.afterText.normalized||anchor.afterText.raw||'';
  const left=normalizeContextTokens(before).slice(-2),right=normalizeContextTokens(after).slice(0,2);
  // Require evidence on both sides. A word at the edge of a selection or
  // an unanchored PDF/commentary selection should never create a broad guess.
  if(!left.length||!right.length)return null;
  const features=[
   ['exact',JSON.stringify({left,right})],
   ['pair',left[left.length-1]+'|'+right[0]],
   ['left1',left[left.length-1]],
   ['right1',right[0]]
  ];
  if(left.length>1){features.push(['left2',left.join(' ')]);features.push(['left2right1',left.join(' ')+'|'+right[0]]);}
  if(right.length>1){features.push(['right2',right.join(' ')]);features.push(['left1right2',left[left.length-1]+'|'+right.join(' ')]);}
  const unique=new Map(features.map(([type,value])=>[type+'|'+value,[type,value]]));
  return [...unique.values()];
 }
 async function buildContext(selection,word){
  const windowFeatures=contextWindow(selection,word);if(!windowFeatures)return null;
  const contextKey=await digestHex('otzaria-context-v1|'+normalize(word)+'|'+JSON.stringify(windowFeatures[0][1]));
  if(!contextKey)return null;
  const features=[];
  for(const [type,value] of windowFeatures){
   if(!featureTypes.has(type))continue;
   const hash=await digestHex('otzaria-context-feature-v1|'+type+'|'+value);
   if(hash)features.push({type,hash});
  }
  return features.length?{contextKey,features}:null;
 }
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
  const contextual=selection!==undefined&&selection!==null;
  if(!permissionGranted||!networkAvailable||!Array.isArray(entries)||!entries.length)return {preferredEntryId:null,entries,scope:contextual?'context':'general'};
  const ids=entries.map(x=>typeof x==='string'?x:idFor(x)).filter(Boolean).slice(0,40);if(!ids.length)return {preferredEntryId:null,entries,scope:contextual?'context':'general'};
  let context=null;
  if(contextual){context=await buildContext(selection,word);if(!context)return {preferredEntryId:null,entries,scope:'context',contextAvailable:false};}
  try{
   const url=new URL(API+'/v1/suggestions');url.searchParams.set('word',normalize(word));url.searchParams.set('ids',ids.join(','));
   url.searchParams.set('scope',contextual?'context':'general');
   if(context)url.searchParams.set('features',JSON.stringify(context.features));
   const response=await request(url,{headers:{Accept:'application/json'}},timeoutMs.rank);if(!response.ok)throw Error('rank');
   const data=await response.json();if(!permissionGranted)return {preferredEntryId:null,entries,scope:contextual?'context':'general'};
   const preferred=data.preferredEntryId;if(!preferred)return {preferredEntryId:null,entries,scope:contextual?'context':'general',contextAvailable:!!context};
   const reordered=[...entries].sort((a,b)=>{const aid=typeof a==='string'?a:idFor(a),bid=typeof b==='string'?b:idFor(b);return aid===preferred?-1:bid===preferred?1:0;});
   return {preferredEntryId:preferred,entries:reordered,votes:Number(data.totalVotes)||0,scope:contextual?'context':'general',confidence:Number(data.confidence)||undefined};
  }catch{markOffline();return {preferredEntryId:null,entries,scope:contextual?'context':'general'};}
 }
 function queueId(word,scope,voter,contextKey){return normalize(word)+'|'+scope+'|'+(contextKey||'')+'|'+voter;}
 function enqueue(word,entryId,voter,scope='legacy',context=null){
  const normalized=normalize(word);if(!normalized||!entryId||!voter)return {ok:false,reason:'unavailable'};
  const id=queueId(normalized,scope,voter,context?.contextKey||'');
  const queue=readQueue(),existing=queue.findIndex(item=>item.id===id);
  if(existing<0&&queue.length>=200)return {ok:false,reason:'queue_full',pending:queue.length};
  const item={id,word:normalized,entryId,voterId:voter,scope,createdAt:Date.now(),token:randomId()};
  if(context){item.contextKey=context.contextKey;item.features=context.features;}
  if(!item.token)return {ok:false,reason:'unavailable'};
  const next=queue.filter(x=>x.id!==id);next.push(item);
  if(!writeQueue(next))return {ok:false,reason:'storage'};
  emit('dictionary-community-queue-updated');return {ok:true,queued:true,pending:next.length};
 }
 function sameQueuedVote(a,b){return !!a&&!!b&&a.id===b.id&&a.token===b.token&&a.entryId===b.entryId;}
 async function flushQueue(){
  if(syncing||!permissionGranted||!networkAvailable||!(await checkConnectivity()))return {synced:0,pending:pendingCount()};
  syncing=true;let synced=0;
  try{
   const batch=readQueue();
   for(const item of batch){
    if(!permissionGranted||!networkAvailable||!(await checkConnectivity()))break;
    const current=readQueue().find(x=>x.id===item.id);if(!sameQueuedVote(current,item))continue;
    try{
     const body={word:item.word,entryId:item.entryId,voterId:item.voterId,scope:item.scope||'legacy'};
     if(item.scope==='context'){body.contextKey=item.contextKey;body.features=item.features;}
     const response=await request(API+'/v1/vote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)},timeoutMs.vote);
     if(!permissionGranted)break;if(!response.ok)throw Error('vote');
     const data=await response.json();if(typeof data.accepted!=='boolean'||(!data.accepted&&!data.duplicate))throw Error('vote response');
     // Re-read after the network await: a newer offline choice in this exact
     // scope/context may have replaced the item while the older request was in flight.
     const latest=readQueue(),stillCurrent=latest.find(x=>x.id===item.id);
     if(sameQueuedVote(stillCurrent,item)){writeQueue(latest.filter(x=>!sameQueuedVote(x,item)));synced++;}
    }catch{markOffline();break;}
   }
  }finally{syncing=false;emit('dictionary-community-queue-updated');if(synced&&pendingCount()===0)emit('dictionary-community-synced');}
  return {synced,pending:pendingCount()};
 }
 async function vote(word,entry,options={}){
  if(!permissionGranted)return {ok:false,reason:'permission'};
  const normalized=normalize(word),entryId=typeof entry==='string'?entry:idFor(entry),voter=voterId(),scope=options?.scope||'legacy';
  if(!normalized||!entryId||!voter||!['legacy','general','context'].includes(scope))return {ok:false,reason:'unavailable'};
  let context=null;
  if(scope==='context'){context=await buildContext(options.selection,normalized);if(!context)return {ok:false,reason:'context_unavailable'};}
  if(!networkAvailable&&!await checkHealth())return permissionGranted?enqueue(normalized,entryId,voter,scope,context):{ok:false,reason:'permission'};
  if(!permissionGranted)return {ok:false,reason:'permission'};
  if(!(await checkConnectivity()))return permissionGranted?enqueue(normalized,entryId,voter,scope,context):{ok:false,reason:'permission'};
  if(!permissionGranted)return {ok:false,reason:'permission'};
  const body={word:normalized,entryId,voterId:voter,scope};
  if(context){body.contextKey=context.contextKey;body.features=context.features;}
  try{
   const response=await request(API+'/v1/vote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)},timeoutMs.vote);
   if(!permissionGranted)return {ok:false,reason:'permission'};if(!response.ok)throw Error('vote');
   const data=await response.json();if(typeof data.accepted!=='boolean')throw Error('vote response');
   return {ok:data.accepted===true,duplicate:data.duplicate===true,votes:Number(data.votes)||0,scope};
  }catch{
   if(!permissionGranted)return {ok:false,reason:'permission'};markOffline();return enqueue(normalized,entryId,voter,scope,context);
  }
 }
 function permissionsFrom(payload){if(Array.isArray(payload?.permissions))return payload.permissions;if(Array.isArray(payload?.data?.permissions))return payload.data.permissions;return null;}
 function permissionChanged(payload){const permissions=permissionsFrom(payload);if(permissions){permissionEpoch++;setPermission(permissions.includes('network.access'));if(permissionGranted)checkHealth().then(ok=>ok&&flushQueue()).catch(()=>{});}else refreshPermissions();}
 try{root.Otzaria?.on?.('plugin.permissions_changed',permissionChanged);}catch{}
 try{root.Otzaria?.on?.('plugin.boot',async payload=>{const permissions=permissionsFrom(payload);if(permissions){permissionEpoch++;setPermission(permissions.includes('network.access'));if(permissionGranted&&await checkHealth())await flushQueue();}else await refreshPermissions();});}catch{}
 try{root.addEventListener?.('online',async()=>{if(!permissionKnown)await refreshPermissions();else if(permissionGranted&&await checkHealth())await flushQueue();});}catch{}
 try{root.addEventListener?.('focus',async()=>{if(!permissionKnown)await refreshPermissions();else if(permissionGranted&&await checkHealth())await flushQueue();});}catch{}
 try{root.document?.addEventListener?.('visibilitychange',async()=>{if(root.document.visibilityState==='visible'&&permissionGranted&&await checkHealth())await flushQueue();});}catch{}
 const api={ready:Promise.resolve(false),normalize,idFor,rank,vote,flushQueue,refreshPermissions,buildContext,contextWindow};
 Object.defineProperties(api,{enabled:{enumerable:true,get:()=>permissionGranted},online:{enumerable:true,get:()=>networkAvailable},pending:{enumerable:true,get:pendingCount}});
 root.DictionaryCommunity=api;api.ready=refreshPermissions();
})(typeof window==='undefined'?globalThis:window);