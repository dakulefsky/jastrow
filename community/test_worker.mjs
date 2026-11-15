import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('./worker/src/index.js', import.meta.url), 'utf8');
const { default: worker } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

class MockDB {
  constructor(){ this.links=new Map([['jastrow:JAS1','krupnik:KRU1']]); this.votes=new Map(); }
  prepare(sql){
    return { bind:(...args)=>({
      all:async()=>{
        if(sql.includes('FROM entry_links'))return {results:args.filter(x=>this.links.has(x)).map(alias_id=>({alias_id,canonical_id:this.links.get(alias_id)}))};
        if(sql.includes('GROUP BY canonical_id')){
          const [word,...ids]=args,counts=new Map();
          for(const vote of this.votes.values())if(vote.word===word&&ids.includes(vote.id))counts.set(vote.id,(counts.get(vote.id)||0)+1);
          return {results:[...counts].map(([canonical_id,votes])=>({canonical_id,votes}))};
        }
        throw new Error('Unexpected all SQL: '+sql);
      },
      first:async()=>{
        if(sql.includes('SELECT canonical_id FROM votes'))return this.votes.get(args[0]+'|'+args[1])?{canonical_id:this.votes.get(args[0]+'|'+args[1]).id}:null;
        if(sql.includes('COUNT(*) AS votes')){
          const [word,id]=args;return {votes:[...this.votes.values()].filter(v=>v.word===word&&v.id===id).length};
        }
        throw new Error('Unexpected first SQL: '+sql);
      },
      run:async()=>{
        if(sql.includes('INSERT INTO votes')){
          const [word,id,voter]=args;this.votes.set(word+'|'+voter,{word,id});return {meta:{changes:1}};
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
const duplicate=await (await call('/v1/vote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({word:'נפקא',entryId:'krupnik:KRU1',voterId:'voter-token-1-abcdefghijklmnop'})})).json();
assert.equal(duplicate.duplicate,true,'same installation cannot vote twice for the same word');
await call('/v1/vote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({word:'נפקא',entryId:'krupnik:KRU2',voterId:'voter-token-1-abcdefghijklmnop'})});
result=await (await call('/v1/suggestions?word=%D7%A0%D7%A4%D7%A7%D7%90&ids=jastrow%3AJAS1%2Ckrupnik%3AKRU2')).json();
assert.equal(result.preferredEntryId,'jastrow:JAS1','one changed vote moves but does not erase other users’ consensus');\nawait call('/v1/vote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({word:'נפקא',entryId:'krupnik:KRU2',voterId:'voter-token-2-abcdefghijklmnop'})});\nresult=await (await call('/v1/suggestions?word=%D7%A0%D7%A4%D7%A7%D7%90&ids=jastrow%3AJAS1%2Ckrupnik%3AKRU2')).json();\nassert.equal(result.preferredEntryId,'krupnik:KRU2','community consensus should move when users change their choice');
console.log('PASS: Worker health, three-vote threshold, Jastrow/Krupnik shared IDs, duplicate prevention, and vote changes.');
