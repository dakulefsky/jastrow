const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const ctx={window:{JASTROW_CHUNKS:{}}};vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname,'plugin/data/index.js'),'utf8'),ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname,'plugin/data/attested-forms.js'),'utf8'),ctx);
const index=ctx.window.JASTROW_INDEX,search=require('./plugin/search.js');
assert.equal(index.entries.length,32512);
assert.equal(Object.keys(index.forms).length,64410);
assert.equal(search.normalize('אָמַר'),'אמר');
assert.deepEqual(search.lookup(index,'אָמַר').ids,search.lookup(index,'אמר').ids);
for(const [word,expected] of [['איבעיא','בְּעֵי I'],['מיתיבי','תּוּב I'],['רחמנא','רַחֲמָן ²']]){
  const result=search.lookup(index,word);assert(result.ids.some(i=>index.entries[i].h===expected));
}
assert(search.lookup(index,'דאמר').ids.some(i=>index.entries[i].h==='אָמַר I'));
assert.equal(search.lookup(index,'xyz').total,0);
assert(search.lookup(index,'תניא').ids.includes(32133));assert(search.lookup(index,'תנן').ids.includes(32133));assert.equal(search.lookup(index,'תניא').kind,'attested form');
assert.equal(search.lookup(index,'אבגדהוזחטיכלמנסעפצקרשת').total,0);
assert(search.lookup(index,'שקלא').total>1);
assert.equal(search.lookup(index,'א',2).ids.length,2);
for(const entries of [index.direct,index.forms])for(const ids of Object.values(entries))for(const id of ids)assert(id>=0&&id<index.entries.length);
for(const name of fs.readdirSync(path.join(__dirname,'plugin/data')).filter(n=>n.startsWith('chunk-'))){
  vm.runInContext(fs.readFileSync(path.join(__dirname,'plugin/data',name),'utf8'),ctx);
}
let total=0;
for(const chunk of Object.values(ctx.window.JASTROW_CHUNKS))for(const [id,e] of Object.entries(chunk)){
  total++;assert.equal(e.h,index.entries[id].h);assert.equal(e.r,index.entries[id].r);
  assert(!/<script|<iframe|\son\w+=|javascript:/i.test(e.html));
}
assert.equal(total,index.entries.length);
console.log('PASS: complete entry set, all index pointers, vowel normalization, real inflections, ambiguity, missing forms, safe HTML, and chunk integrity');
for(const word of ['אמרabc','אמר2','ש קל','123','abc']){assert.equal(search.lookup(index,word).total,0);assert.equal(search.hasTranslation(index,word),false);}
assert(search.validWord('אָמַר'));assert(search.validWord('"אמר"'));
console.log('PASS: manual search and context-menu availability consistently reject mixed-script and multiword input');
