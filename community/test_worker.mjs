import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('./worker/src/index.js', import.meta.url), 'utf8');
const { default: worker } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

class MockDB {
  constructor(){ this.links=new Map([['jastrow:JAS1','krupnik:KRU1']]); this.votes=new Map(); this.contextVotes=new Map(); this.contextFeatures=new Map(); this.nextContextVoteId=1; }
  prepare(sql){
    return { bind:(...args)=>({
      all:async()=>{
        if(sql.includes('FROM entry_links'))return {results:args.filter(x=>this.links.has(x)).map(alias_id=>({alias_id,canonical_id:this.links.get(alias_id)}))};
        if(sql.includes('FROM context_votes cv')){
          const [word,...featureIds]=args,results=[];
          for(const vote of this.contextVotes.values()){
            if(vote.word!==word)continue;
            const matched=(this.contextFeatures.get(vote.vote_id)||[]).filter(hash=>featureIds.includes(hash));
            if(matched.length)results.push({vote_id:vote.vote_id,canonical_id:vote.id,voter_hash:vote.voter,matched_features:matched.join(',')});
          }
          return {results:results.slice(0,1000)};
        }
        if(sql.includes('GROUP BY canonical_id')){
          const [word]=args,counts=new Map();
          for(const vote of this.votes.values())if(vote.word===word)counts.set(vote.id,(counts.get(vote.id)||0)+1);
          return {results:[...counts].map(([canonical_id,votes])=>({canonical_id,votes}))};
        }
        throw new Error('Unexpected all SQL: '+sql);
      },
      first:async()=>{
        if(sql.includes('SELECT canonical_id FROM votes'))return this.votes.get(args[0]+'|'+args[1])?{canonical_id:this.votes.get(args[0]+'|'+args[1]).id}:null;
        if(sql.includes('SELECT vote_id, canonical_id FROM context_votes')){
          const [word,key,voter]=args,vote=this.contextVotes.get(word+'|'+key+'|'+voter);return vote?{vote_id:vote.vote_id,canonical_id:vote.id}:null;
        }
        if(sql.includes('SELECT vote_id FROM context_votes')){
          const [word,key,voter]=args,vote=this.contextVotes.get(word+'|'+key+'|'+voter);return vote?{vote_id:vote.vote_id}:null;
        }
        if(sql.includes('COUNT(*) AS votes')){
          const [word,id]=args;
          if(sql.includes('FROM context_votes'))return {votes:[...this.contextVotes.values()].filter(v=>v.word===word&&v.id===id&&v.key===args[1]).length};
          return {votes:[...this.votes.values()].filter(v=>v.word===word&&v.id===id).length};
        }
        throw new Error('Unexpected first SQL: '+sql);
      },
      run:async()=>{
        if(sql.includes('INSERT INTO votes')){
          const [word,id,voter]=args;this.votes.set(word+'|'+voter,{word,id});return {meta:{changes:1}};
        }
        if(sql.includes('INSERT INTO context_votes')){
          const [word,key,id,voter]=args,k=word+'|'+key+'|'+voter,prior=this.contextVotes.get(k);
          const vote={vote_id:prior?.vote_id||this.nextContextVoteId++,word,key,id,voter};this.contextVotes.set(k,vote);
          return {meta:{changes:1}};
        }
        if(sql.includes('INSERT OR IGNORE INTO context_vote_features')){
          const [voteId,hash]=args;if(!this.contextFeatures.has(voteId))this.contextFeatures.set(voteId,[]);
          const rows=this.contextFeatures.get(voteId);if(!rows.includes(hash))rows.push(hash);return {meta:{changes:1}};
        }
        throw new Error('Unexpected run SQL: '+sql);
      }
    })};
  }
}
const DB=new MockDB(),env={DB};
const call=async(path,init={})=>worker.fetch(new Request('https://test.example'+path,init),env);
assert.equal((await (await call('/health')).json()).ok,true);
for(let i=1;i<=2;i++){
  const r=await call('/v1/vote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({word:'נפקא',entryId:'jastrow:JAS1',voterId:'voter-token-'+i+'-abcdefghijklmnop'})});
  assert.equal((await r.json()).accepted,true);
}
let result=await (await call('/v1/suggestions?word=%D7%A0%D7%A4%D7%A7%D7%90&ids=jastrow%3AJAS1%2Ckrupnik%3AKRU2')).json();
assert.equal(result.preferredEntryId,null,'two votes must not establish consensus');
await call('/v1/vote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({word:'נפקא',entryId:'krupnik:KRU1',voterId:'voter-token-3-abcdefghijklmnop'})});
result=await (await call('/v1/suggestions?word=%D7%A0%D7%A4%D7%A7%D7%90&ids=jastrow%3AJAS1%2Ckrupnik%3AKRU2')).json();
assert.equal(result.preferredEntryId,'jastrow:JAS1','Jastrow alias must share Krupnik vote pool');
// Votes for entries outside the current candidate list still count against
// the consensus denominator; a partial candidate list must not fake a win.
for(const i of [4,5]) await call('/v1/vote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({word:'בדיקה',entryId:'krupnik:KRU1',voterId:'outside-a-'+i+'-abcdefghijklmnop'})});
for(const i of [6,7]) await call('/v1/vote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({word:'בדיקה',entryId:'krupnik:KRU2',voterId:'outside-b-'+i+'-abcdefghijklmnop'})});
await call('/v1/vote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({word:'בדיקה',entryId:'krupnik:KRU1',voterId:'outside-c-8-abcdefghijklmnop'})});
const partial=await (await call('/v1/suggestions?word=%D7%91%D7%93%D7%99%D7%A7%D7%94&ids=krupnik%3AKRU1')).json();
assert.equal(partial.preferredEntryId,null,'votes for omitted candidates must count against consensus');
const oversized=await call('/v1/vote',{method:'POST',body:JSON.stringify({word:'נפקא',entryId:'krupnik:KRU1',voterId:'voter-token-9-abcdefghijklmnop',padding:'x'.repeat(5000)})});
assert.equal(oversized.status,413,'request body limit must apply even without Content-Length');
const nullBody=await call('/v1/vote',{method:'POST',headers:{'Content-Type':'application/json'},body:'null'});
assert.equal(nullBody.status,400,'null JSON must be rejected as an invalid vote, not crash the Worker');
const duplicate=await (await call('/v1/vote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({word:'נפקא',entryId:'krupnik:KRU1',voterId:'voter-token-1-abcdefghijklmnop'})})).json();
assert.equal(duplicate.duplicate,true,'same installation cannot vote twice for the same word');
await call('/v1/vote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({word:'נפקא',entryId:'krupnik:KRU2',voterId:'voter-token-1-abcdefghijklmnop'})});
result=await (await call('/v1/suggestions?word=%D7%A0%D7%A4%D7%A7%D7%90&ids=jastrow%3AJAS1%2Ckrupnik%3AKRU2')).json();
assert.equal(result.preferredEntryId,null,'two remaining votes must not establish consensus after a voter changes');
await call('/v1/vote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({word:'נפקא',entryId:'krupnik:KRU2',voterId:'voter-token-2-abcdefghijklmnop'})});
result=await (await call('/v1/suggestions?word=%D7%A0%D7%A4%D7%A7%D7%90&ids=jastrow%3AJAS1%2Ckrupnik%3AKRU2')).json();
assert.equal(result.preferredEntryId,null,'two votes for a new choice are still below the threshold');
await call('/v1/vote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({word:'נפקא',entryId:'krupnik:KRU2',voterId:'voter-token-3-abcdefghijklmnop'})});
result=await (await call('/v1/suggestions?word=%D7%A0%D7%A4%D7%A7%D7%90&ids=jastrow%3AJAS1%2Ckrupnik%3AKRU2')).json();
assert.equal(result.preferredEntryId,'krupnik:KRU2','community consensus should move when voters change their choice');

const feature = (char, weight) => ({hash:char.repeat(64),weight});
const contextWord='הקשר';
const contextA=[feature('a',1),feature('b',3),feature('c',4)];
const contextB=[feature('d',1),feature('e',3),feature('f',4)];
async function voteContext(entryId,voter,features,word='נפקא'){
  return call('/v1/vote',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({word,entryId,voterId:voter,scope:'contextual',contextFeatures:features})});
}
await voteContext('krupnik:KRU2','context-a-1-abcdefghijklmnop',contextA,contextWord);
let contextual=await (await call('/v1/suggestions?word=%D7%94%D7%A7%D7%A9%D7%A8&ids=jastrow%3AJAS1%2Ckrupnik%3AKRU2&context='+encodeURIComponent(JSON.stringify(contextA)))).json();
assert.equal(contextual.contextualPreferredEntryId,null,'one contextual vote must not reorder entries');
await voteContext('krupnik:KRU2','context-a-2-abcdefghijklmnop',contextA,contextWord);
contextual=await (await call('/v1/suggestions?word=%D7%94%D7%A7%D7%A9%D7%A8&ids=jastrow%3AJAS1%2Ckrupnik%3AKRU2&context='+encodeURIComponent(JSON.stringify(contextA)))).json();
assert.equal(contextual.contextualPreferredEntryId,'krupnik:KRU2','two installations agreeing in this usage should promote the contextual match');
assert.equal(contextual.preferenceScope,'contextual');
assert.equal(contextual.totalVotes,0,'contextual votes must never inflate the general vote pool');
await voteContext('jastrow:JAS1','context-b-1-abcdefghijklmnop',contextB,contextWord);
await voteContext('jastrow:JAS1','context-b-2-abcdefghijklmnop',contextB,contextWord);
const contextualB=await (await call('/v1/suggestions?word=%D7%94%D7%A7%D7%A9%D7%A8&ids=jastrow%3AJAS1%2Ckrupnik%3AKRU2&context='+encodeURIComponent(JSON.stringify(contextB)))).json();
assert.equal(contextualB.contextualPreferredEntryId,'jastrow:JAS1','the same word can favor a different meaning in a different context');
const contextualNone=await (await call('/v1/suggestions?word=%D7%94%D7%A7%D7%A9%D7%A8&ids=jastrow%3AJAS1%2Ckrupnik%3AKRU2&context='+encodeURIComponent(JSON.stringify([feature('9',1),feature('8',3),feature('7',4)])))).json();
assert.equal(contextualNone.contextualPreferredEntryId,null,'unrelated surrounding words must not inherit a vote');
const contextDuplicate=await (await voteContext('krupnik:KRU2','context-a-1-abcdefghijklmnop',contextA,contextWord)).json();
assert.equal(contextDuplicate.duplicate,true,'one installation can only vote once for the same contextual use');
const invalidContext=await call('/v1/vote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({word:'נפקא',entryId:'krupnik:KRU1',voterId:'context-invalid-abcdefghijklmnop',scope:'contextual',contextFeatures:[{hash:'not-a-hash',weight:1}]})});
assert.equal(invalidContext.status,400,'context hashes must be validated before storage');
\nconsole.log('PASS: Worker health, three-vote threshold, Jastrow/Krupnik shared IDs, duplicate prevention, and vote changes.');
