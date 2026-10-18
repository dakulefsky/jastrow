const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),S=require('./plugin/search.js');
const c={window:{JASTROW_CHUNKS:{}}};vm.createContext(c);
for(const name of ['index','attested-forms','ranking','krupnik-index','phrases'])vm.runInContext(fs.readFileSync(__dirname+'/plugin/data/'+name+'.js','utf8'),c);
const i=c.window.JASTROW_INDEX,audit=JSON.parse(fs.readFileSync(__dirname+'/plugin/data/phrase-provenance.json'));
const key=w=>S.splitWords(w).map(S.normalize).join(' ');
for(const row of audit.entries){
 assert((i.phrases[row.key]||[]).includes(row.entryId));
 const meta=i.entries[row.entryId];assert.equal(meta.r,row.rid);
 if(!c.window.JASTROW_CHUNKS[meta.b])vm.runInContext(fs.readFileSync(__dirname+'/plugin/data/'+(meta.b>=1000?'krupnik-':'chunk-')+meta.b+'.js','utf8'),c);
 const e=c.window.JASTROW_CHUNKS[meta.b][row.entryId];
 assert([e.h,...e.alt].some(h=>key(h.replace(/\s+[IVXLCDM]+$/,'').replace(/^\*|^\(|\)$/g,''))===row.key));
 if(row.source==='krupnik')for(const g of i.phraseGlosses[row.entryId]){
  assert(row.primarySourceHtml.join(' ').includes(g.text),'phrase gloss must occur in its primary source text');
 }
}
for(const [query,meaning] of [['נפקא מינה','the practical difference is'],['מאי שנא','wherein lies the difference?'],['מאי טעמא','what is the reason? why?'],['איכא דאמרי','some say']]){
 const r=S.phraseLookup(i,query);assert(r.ids.length,query);assert(r.ids.some(id=>i.phraseGlosses[id]?.some(g=>g.text===meaning)));
 assert.deepEqual(S.segmentWords(i,query).map(s=>s.word),[query]);
}
const nafka=S.phraseLookup(i,'נפקא מינה').ids[0];assert.deepEqual(Array.from(i.phraseGlosses[nafka],g=>g.text),['the practical difference is']);
assert.equal(S.phraseLookup(i,'מאישנא').ids.length,0);assert(!i.phrases['בית א']);
assert.equal(S.segmentWords(i,'נפקא מינה טבא').length,2);
const fake={phrases:{'אבא אמא':[1],'אבא אמא אחא':[2]}};
assert.equal(S.segmentWords(fake,'אבא אמא אחא')[0].result.ids[0],2);
assert.equal(S.phraseLookup(i,'נַפְקָא מִינָהּ').ids[0],nafka);
console.log('PASS: '+audit.uniquePhrases+' boundary-preserving dictionary phrases; exact source headwords/glosses, longest phrase grouping, vowel normalization, no unrelated derived forms or abbreviation expansion.');
