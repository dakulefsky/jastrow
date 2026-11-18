const assert=require('node:assert/strict'),path=require('node:path');
const {chromium,executablePath}=require('./browser_support.cjs');
(async()=>{const browser=await chromium.launch({executablePath,args:['--no-sandbox']});try{
 const page=await browser.newPage();for(const file of ['search.js','reading-view.js','unified-view.js','context-menu.js','quick-lookup.js'])await page.addScriptTag({path:path.join(__dirname,'plugin',file)});
 const result=await page.evaluate(async()=>{
  const entries=[{h:'כינוי',html:'<div class="sense">, v. <a data-headword="אמצעי">אמצעי</a></div>'},{h:'אמצעי',html:'<div class="sense">= <a data-headword="עיקר">same</a>, q. v.</div>'},{h:'עיקר',html:'<div class="sense"><i>original target meaning</i></div>'},{h:'מחזור',html:'<div class="sense">v. <a data-headword="חזרה">חזרה</a></div>'},{h:'חזרה',html:'<div class="sense">v. <a data-headword="מחזור">מחזור</a></div>'},{h:'דיון',html:'<div class="sense">An extended discussion comparing <a data-headword="עיקר">עיקר</a>, with qualifications.</div>'},{h:'עצמי',html:'<div class="sense"><i>own meaning</i>; compare <a data-headword="עיקר">עיקר</a></div>'},{h:'פעל',html:'<div class="sense"><i>to do</i></div><div class="sense"><b>Pa.</b><div class="sense"><i>to do repeatedly</i></div></div>'},{h:'חסר',html:'<div class="sense">v. <a data-headword="איננו">איננו</a></div>'}].map((e,id)=>({...e,r:'TEST'+id,b:9000}));
  const index={entries,forms:{},direct:Object.fromEntries(entries.map((e,id)=>[JastrowSearch.normalize(e.h),[id]]))},chunk=Object.fromEntries(entries.map((e,id)=>[id,e]));
  const load=async()=>chunk,read=id=>JastrowReadingView.records(index,id,load,entries[id].h);
  const chain=await read(0),cycle=await read(3),discussion=await read(5),own=await read(6),missing=await read(8);
  window.JASTROW_INDEX=index;window.JASTROW_CHUNKS[9000]=chunk;
  const qualified=await DictionaryQuick.results('פעל'),redirected=await DictionaryQuick.results('כינוי');
  const cyclic=await DictionaryQuick.results('מחזור'),missingTarget=await DictionaryQuick.results('חסר'),ordinaryProse=await DictionaryQuick.results('דיון'),unknown=await DictionaryQuick.results('אבגדהוזחטיכלמנסעפצקרשת');
  const original=JastrowReadingView.records;let failure='';
  try{JastrowReadingView.records=async()=>{throw Error('Simulated chunk failure');};await DictionaryQuick.results('כינוי');}catch(e){failure=e.message;}finally{JastrowReadingView.records=original;}
  return {qualified,redirected,cyclic,missingTarget,ordinaryProse,unknown,failure,chain:chain.map(r=>r.id),target:DictionaryMeanings.merge(chain,'כינוי').map(g=>({text:g.text,sources:g.sources.map(s=>s.id)})),cycle:cycle.map(r=>r.id),discussion:discussion.map(r=>r.id),own:own.map(r=>r.id),missing:missing.map(r=>r.id)};
 });
 assert.deepEqual(result.chain,[0,1,2]);assert.deepEqual(result.target,[{text:'original target meaning',sources:[2]}]);assert.deepEqual(result.cycle,[3,4]);assert.deepEqual(result.discussion,[5]);assert.deepEqual(result.own,[6]);assert.deepEqual(result.missing,[8]);
 assert.deepEqual(result.qualified.map(x=>x.label),['','Pa.']);assert.equal(result.redirected[0].spelling,'עיקר');assert.equal(result.redirected[0].text,'original target meaning');assert.equal(result.redirected[0].entryId,2);
 assert.equal(result.cyclic.length,0,'redirect cycles must not create quick choices');assert.equal(result.missingTarget.length,0,'missing redirect targets must not create quick choices');
 assert(result.ordinaryProse.every(x=>x.entryId!==2),'ordinary prose references must not be followed as dictionary redirects');
 if(result.ordinaryProse.length)assert(result.ordinaryProse.some(x=>/extended discussion/.test(x.text)));
 assert.equal(result.unknown.length,0);assert.equal(result.failure,'Simulated chunk failure','failed dictionary chunks must fail closed rather than show a misleading popup');
 console.log('PASS redirect chains preserve exact target attribution; cycles, missing targets and unknown words produce no quick choices; ordinary prose references remain untouched; chunk errors fail closed.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
