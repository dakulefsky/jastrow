const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),zlib=require('node:zlib');
const S=require('./plugin/search.js'),c={window:{}};vm.createContext(c);
for(const name of ['index','attested-forms','ranking','krupnik-index','phrases','inflections'])vm.runInContext(fs.readFileSync(__dirname+'/plugin/data/'+name+'.js','utf8'),c);
const index=c.window.JASTROW_INDEX;
for(const [word,expected] of [['דיניהון','דין'],['דינכון','דין'],['ספרייכון','ספר'],['ביתיהון','בית'],['מילתיהון','מילתא'],['דמילתייכו','מילתא'],['כתבינן','כתב'],['דאמריתון','אמר']]){
 const r=S.lookup(index,word);assert.equal(r.kind,'inflected form',word);assert(S.hasTranslation(index,word));
 assert(r.prefixMatches.some(m=>m.base===expected),word);assert(S.hasSelectionTranslations(index,word+' טבא'));
 for(const m of r.prefixMatches){assert(r.ids.includes(m.id));assert(m.label);}
}
for(const word of ['מלכין','גברין','מילתין','אמרינן','תנן'])assert.notEqual(S.lookup(index,word).kind,'inflected form','never replace an imported full-word match');
for(const word of ['אבגדהוזחטיכלמנסעפצקרשת','מילתאabc','דיניהון2','מילנתא'])assert(!S.hasTranslation(index,word),word);
const limited=S.lookup(index,'מילתיהון',1);assert.equal(limited.ids.length,1);assert(limited.prefixMatches.every(m=>limited.ids.includes(m.id)));
const future=S.lookup(index,'דנכתבון');assert.equal(future.kind,'inflected form');assert(future.prefixMatches.some(m=>m.family==='verb'&&m.base==='כתב'&&m.prefix==='דנ'&&m.suffix==='ון'));
const provenance=JSON.parse(zlib.gunzipSync(fs.readFileSync(__dirname+'/audit/inflection-provenance.json.gz')));
for(const [name,digest] of Object.entries(provenance.inputSha256))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(__dirname+'/plugin/data/'+name)).digest('hex'),digest,name);
for(const items of Object.values(index.inflections.stems))for(const m of items){
 assert(index.entries[m.id]);const evidence=provenance.entryEvidence[m.id];assert(evidence.families.includes(m.family));assert(evidence.spellings.includes(m.base));assert.equal(index.entries[m.id].r,evidence.sourceRef);
}
console.log('PASS real suffix and combined-prefix candidates, noun/verb eligibility, exact indexed precedence, unknown rejection, bounded results, and all dictionary source hashes/pointers.');
