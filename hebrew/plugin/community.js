(function(root){
 'use strict';
 const API=String(root.DICTIONARY_COMMUNITY_API||'').replace(/\\/$/,'');
 const key='otzaria-dictionary-community-voter-v1';
 // Fail closed: no community UI unless the host grants network access and the
 // configured service answers its health check. All failures are silent.
 let networkAvailable=false;
 function voterId(){try{let id=localStorage.getItem(key);if(!id){id=crypto.randomUUID();localStorage.setItem(key,id);}return id;}catch{return '';}}
 function normalize(word){return String(word||'').normalize('NFKD').replace(/[\\u0591-\\u05c7]/g,'').replace(/[^א-ת]/g,'').slice(0,100);}
 function idFor(entry){if(!entry||!(entry.r||entry.rid))return '';return (entry.source==='krupnik'||entry.rid?'krupnik:':'jastrow:')+(entry.r||entry.rid);}
 function disable(){networkAvailable=false;}
 const ready=(async()=>{if(!API)return false;try{const response=await fetch(API+'/health',{headers:{Accept:'application/json'},signal:AbortSignal.timeout(1800)});if(!response.ok)return false;const data=await response.json();networkAvailable=data.ok===true;return networkAvailable;}catch{return false;}})();
 async function rank(word,entries){if(!networkAvailable||!Array.isArray(entries)||!entries.length)return {preferredEntryId:null,entries};const ids=entries.map(x=>typeof x==='string'?x:idFor(x)).filter(Boolean).slice(0,40);if(!ids.length)return {preferredEntryId:null,entries};try{const u=new URL(API+'/v1/suggestions');u.searchParams.set('word',normalize(word));u.searchParams.set('ids',ids.join(','));const r=await fetch(u,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(1800)});if(!r.ok){disable();return {preferredEntryId:null,entries};}const data=await r.json();const preferred=data.preferredEntryId;if(!preferred)return {preferredEntryId:null,entries};const reordered=[...entries].sort((a,b)=>{const aid=typeof a==='string'?a:idFor(a),bid=typeof b==='string'?b:idFor(b);return aid===preferred?-1:bid===preferred?1:0;});return {preferredEntryId:preferred,entries:reordered,votes:data.totalVotes||0};}catch{disable();return {preferredEntryId:null,entries};}}
 async function vote(word,entry){if(!networkAvailable)return {ok:false,reason:'offline'};const entryId=typeof entry==='string'?entry:idFor(entry),voter=voterId();if(!entryId||!voter)return {ok:false,reason:'unavailable'};try{const r=await fetch(API+'/v1/vote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({word:normalize(word),entryId,voterId:voter}),signal:AbortSignal.timeout(2500)});if(!r.ok){disable();return {ok:false,reason:'service'};}const data=await r.json();return {ok:!!data.accepted,duplicate:!data.accepted,votes:data.votes||0};}catch{disable();return {ok:false,reason:'offline'};}}
 const api={ready,normalize,idFor,rank,vote};
 Object.defineProperty(api,'enabled',{enumerable:true,get:()=>networkAvailable});
 root.DictionaryCommunity=api;
})(typeof window==='undefined'?globalThis:window);
