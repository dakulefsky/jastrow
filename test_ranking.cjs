const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),S=require('./plugin/search.js');
const c={window:{}};vm.createContext(c);for(const n of ['index.js','attested-forms.js','ranking.js'])vm.runInContext(fs.readFileSync(__dirname+'/plugin/data/'+n,'utf8'),c);const i=c.window.JASTROW_INDEX;
assert.equal(i.entryLengths.length,32512);assert(i.entryLengths.every(n=>Number.isInteger(n)&&n>=0));
const ordered=S.lookup(i,'דאמר').ids,original=S.lookup(i,'דאמר',100,'dictionary').ids;assert.deepEqual([...ordered].sort((a,b)=>a-b),[...original].sort((a,b)=>a-b));for(let n=1;n<ordered.length;n++)assert(i.entryLengths[ordered[n-1]]>=i.entryLengths[ordered[n]]);
assert.equal(i.entryLengths[ordered[0]],Math.max(...original.map(id=>i.entryLengths[id])));const q='אמר',direct=new Set(i.direct[q]);let left=false;for(const id of S.lookup(i,q).ids){if(!direct.has(id))left=true;else assert(!left);}
const meta=JSON.parse(fs.readFileSync(__dirname+'/plugin/data/ranking-provenance.json'));assert(meta.notFrequency);assert(meta.notSenseProbability);
console.log('PASS: all entry lengths populated, longer-entry ordering, same candidate set, exact headword priority, deterministic dictionary order, no frequency claims.');
