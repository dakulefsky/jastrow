const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const S=require('./plugin/search.js'),ctx={window:{}};vm.createContext(ctx);
for(const name of ['index','attested-forms','ranking','krupnik-index','phrases'])vm.runInContext(fs.readFileSync(__dirname+'/plugin/data/'+name+'.js','utf8'),ctx);
const index=ctx.window.JASTROW_INDEX;
for(const [word,base] of [['לרחמנא','רחמנא'],['ברחמנא','רחמנא'],['ולרחמנא','רחמנא'],['לצפרא','צפרא'],['בצפרא','צפרא'],['דלתניא','תניא'],['דאמרינן','אמרינן']]){
 const r=S.lookup(index,word);assert.equal(r.kind,'prefixed form',word);
 assert(S.hasTranslation(index,word));assert(S.hasSelectionTranslations(index,word+' טבא'));
 assert(r.prefixMatches.some(m=>m.base===base),word);
 const expected=S.lookup(index,base).ids;for(const id of expected)assert(r.ids.includes(id),word+': lost dictionary sense');
 for(const m of r.prefixMatches)assert.equal(S.normalize(word),m.prefix+m.base);
}
// An actual indexed form is stronger than an inferred prefix split.
for(const word of ['אמר','דאמר','תניא','תנן','אמרינן'])assert.notEqual(S.lookup(index,word).kind,'prefixed form');
const synthetic={entries:[{h:'סָפַר'},{h:'סֵפֶר'},{h:'לְסֵפֶר'}],direct:{ספר:[0,1]},forms:{},entryLengths:[100,1,1]};
assert.equal(S.lookup(synthetic,'לְסֵפֶר').ids[0],1,'rank by the remaining pointed word');
synthetic.direct.לספר=[2];assert.deepEqual(S.lookup(synthetic,'לְסֵפֶר').ids,[2]);
delete synthetic.direct.לספר;
for(const word of ['נספר','ספרנ','סנפר','וווספר','לזזזזזז','לספרabc']){
 assert.equal(S.hasTranslation(synthetic,word),false,word);assert.notEqual(S.lookup(synthetic,word).kind,'prefixed form');
}
const limited=S.lookup(index,'ובספרא',1);assert.equal(limited.ids.length,1);assert(limited.prefixMatches.every(m=>limited.ids.includes(m.id)));
console.log('PASS prefixed real dictionary forms, combined prefixes, all base senses, attested inflections, partial vowels, exact-match precedence, bounded splitting, and no arbitrary nun/internal/suffix removal.');
