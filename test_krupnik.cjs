const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),S=require('./plugin/search.js');
const c={window:{JASTROW_CHUNKS:{}}};vm.createContext(c);
for(const name of ['index.js','attested-forms.js','ranking.js','krupnik-index.js'])vm.runInContext(fs.readFileSync(__dirname+'/plugin/data/'+name,'utf8'),c);
const i=c.window.JASTROW_INDEX;
assert.equal(i.entries.length,32512+15407);assert.equal(i.entryLengths.length,i.entries.length);
for(const file of fs.readdirSync(__dirname+'/plugin/data').filter(x=>/^krupnik-1\d+\.js$/.test(x)))vm.runInContext(fs.readFileSync(__dirname+'/plugin/data/'+file,'utf8'),c);
let count=0;
for(let id=32512;id<i.entries.length;id++){
 const meta=i.entries[id],entry=c.window.JASTROW_CHUNKS[meta.b][id];assert.equal(entry.h,meta.h);assert.equal(entry.source,'krupnik');assert(entry.glosses.length);
 for(const g of entry.glosses){assert(g.text.trim());assert(!g.text.includes('|'));assert(!/<script|javascript:/i.test(entry.html));}count++;
}
for(const word of ['מא','אמר','אוֹגַר','תניא']){
 const found=S.lookup(i,word,100);const direct=new Set(i.direct[S.normalize(word)]||[]);let sawForm=false;
 for(const id of found.ids){if(!direct.has(id))sawForm=true;else assert(!sawForm,'Exact matches must precede forms');}
}
const kOnly=Object.keys(c.window.KRUPNIK_DATA.direct).find(w=>!i.forms[w]&&!i.direct[w].some(id=>id<32512));assert(kOnly);assert(S.hasTranslation(i,kOnly));assert(!S.hasTranslation(i,'hello'));assert(!S.hasTranslation(i,'מא אמר'));
const ma=S.lookup(i,'מא').ids;assert.equal(i.entries[ma[0]].source,'krupnik');
assert(c.window.JASTROW_CHUNKS[i.entries[ma[0]].b][ma[0]].glosses.some(g=>g.text==='what? how?'));
console.log('PASS: '+count+' offline English entries; chunk pointers, original glosses, concise-source preference, exact-first ordering, Krupnik-only context availability.');
