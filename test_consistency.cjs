const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const S=require('./plugin/search.js'),c={window:{JASTROW_CHUNKS:{}}};vm.createContext(c);
for(const n of ['index','attested-forms','ranking','krupnik-index'])vm.runInContext(fs.readFileSync(__dirname+'/plugin/data/'+n+'.js','utf8'),c);
const index=c.window.JASTROW_INDEX;
function entry(id){const m=index.entries[id];if(!c.window.JASTROW_CHUNKS[m.b])vm.runInContext(fs.readFileSync(__dirname+'/plugin/data/'+(m.b>=1000?'krupnik-':'chunk-')+m.b+'.js','utf8'),c);return c.window.JASTROW_CHUNKS[m.b][id];}
const ids=S.lookup(index,'צפרא').ids;
assert(ids.some(id=>entry(id).glosses?.some(g=>g.text==='morning')));
assert(ids.some(id=>/fowl, bird/.test(entry(id).html)),'concise morning entry must not hide the bird entry');
for(let n=0;n<10;n++)assert.deepEqual(S.lookup(index,'צפרא').ids,ids);
assert.deepEqual(S.lookup(index,'צַפְרָא').ids,ids);
for(const id of ids){const e=entry(id),title=S.displayHeadword(e,'צפרא');assert.equal(S.normalize(title),'צפרא');assert(!/[IVX⁰¹²³⁴⁵⁶⁷⁸⁹]/.test(title));}
assert.equal(S.displayHeadword({h:'צְפַר IV',alt:['צַפְרָא']},'צפרא'),'צַפְרָא');
assert.equal(S.displayHeadword({h:'צְפַר²'},'צפר'),'צְפַר');
for(const q of ['צפרא','ספרא','אמר','מא']){const r=S.lookup(index,q),direct=new Set(index.direct[S.normalize(q)]||[]);let linked=false;for(const id of r.ids){if(!direct.has(id))linked=true;else assert(!linked,'direct match after linked form');}}
assert(S.lookup(index,'ספרא').ids.some(id=>entry(id).glosses?.some(g=>g.text==='book')));
console.log('PASS: morning and bird retained, Roman labels removed only from display, repeated/vowelled searches stable, exact matches first, distinct same-spelling entries retained.');

assert.deepEqual(S.splitWords('צפרא, טבא!'),['צפרא','טבא']);
assert.deepEqual(S.splitWords('צפרא־טבא'),['צפרא','טבא']);
assert.deepEqual(S.splitWords('צפרא abc'),[]);
assert.deepEqual(S.splitWords(Array(13).fill('צפרא').join(' ')),[]);
assert(S.hasSelectionTranslations(index,'צפרא טבא'));
assert(!S.hasSelectionTranslations(index,'צפרא אבגדהוזחטיכלמנסעפצקרשת'));
const pointedIndex={entries:[{h:'סָפַר'},{h:'סֵפֶר'}],direct:{ספר:[0,1]},forms:{},entryLengths:[100,10]};
assert.equal(S.lookup(pointedIndex,'ספר').ids[0],0);
assert.equal(S.lookup(pointedIndex,'סֵפֶר').ids[0],1);
console.log('PASS: bounded multiword parsing, punctuation, known-only phrase selection and exact vowel priority.');
