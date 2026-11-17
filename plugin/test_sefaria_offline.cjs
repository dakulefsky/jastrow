'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const manifest={
 formatVersion:1,edition:'William Davidson Edition - English',
 tractates:[{title:'Berakhot',heTitle:'ברכות',slug:'berakhot',file:'texts/berakhot.json'}]
};
const tractate={
 title:'Berakhot',heTitle:'ברכות',versionTitle:'William Davidson Edition - English',
 license:'CC-BY-NC',sectionNames:['Daf','Line'],
 text:[[],[],['The first paragraph discusses the law.','The second paragraph discusses a different subject.'],['The next daf contains another discussion.']]
};
const calls=[];
const root={fetch:async url=>{
 calls.push(String(url));
 if(String(url).endsWith('manifest.json'))return {ok:true,json:async()=>manifest};
 if(String(url).endsWith('texts/berakhot.json'))return {ok:true,json:async()=>tractate};
 return {ok:false};
}};
vm.runInNewContext(fs.readFileSync('plugin/sefaria-offline.js','utf8'),{window:root,globalThis:root,console});

(async()=>{
 const offline=root.SefariaOfflineTranslation;
 assert.deepEqual({...offline.parseReference('Berakhot 2a:1')},{ref:'Berakhot 2a:1',book:'Berakhot',daf:2,side:'a',line:1,dafIndex:2});
 const hebrewRef=offline.parseReference('ברכות, דף ב עמוד א','ברכות');
 assert.equal(hebrewRef.book,'ברכות');
 assert.equal(hebrewRef.daf,2);
 assert.equal(hebrewRef.side,'a');
 const gershayimRef=offline.parseReference('ברכות, דף ט״ו ע״ב','ברכות');
 assert.equal(gershayimRef.daf,15);
 assert.equal(gershayimRef.side,'b');
 assert.equal(gershayimRef.dafIndex,29);
 const first=await offline.getPassage('דף ב עמוד א:1',{currentBook:'תלמוד בבלי - מסכת ברכות'});
 assert.equal(first.scope,'paragraph');
 assert.match(first.text,/first paragraph/);
 const second=await offline.getPassage('ברכות, דף ב ע״א:2',{currentBook:'ברכות'});
 assert.equal(second.scope,'paragraph');
 assert.match(second.text,/second paragraph/);
 const wholeDaf=await offline.getPassage('Berakhot 2a',{currentBook:'Berakhot'});
 assert.equal(wholeDaf.scope,'daf');
 assert.match(wholeDaf.text,/first paragraph/);
 assert.match(wholeDaf.text,/second paragraph/);
 const next=await offline.prepareDaf({currentRef:'Berakhot 2b',currentBook:'Berakhot'});
 assert.equal(next.scope,'daf');
 assert.match(next.text,/next daf/);
 assert.equal(calls.filter(x=>x.endsWith('texts/berakhot.json')).length,1,'tractate JSON should stay cached after first load');
 assert.equal(calls.filter(x=>x.endsWith('manifest.json')).length,1,'manifest should stay cached');
 console.log('Offline Bavli passage tests passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
