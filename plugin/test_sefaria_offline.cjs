'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const manifest={
 formatVersion:1,edition:'William Davidson Edition - English',
 tractates:[{title:'Berakhot',heTitle:'ברכות',slug:'berakhot',file:'texts/berakhot.js'}]
};
const tractate={
 title:'Berakhot',heTitle:'ברכות',versionTitle:'William Davidson Edition - English',
 license:'CC-BY-NC',sectionNames:['Daf','Line'],
 text:[[],[],['','The first paragraph discusses the law.','The second paragraph discusses a different subject.'],['The next daf contains another discussion.']]
};
const calls=[];
const root={
 document:{
  createElement(){return {src:'',async:false,onload:null,onerror:null,remove(){}};},
  head:{appendChild(script){
   calls.push(String(script.src));
   if(String(script.src).endsWith('manifest.js'))root.SefariaOfflineTranslationManifest=manifest;
   else if(String(script.src).endsWith('texts/berakhot.js'))root.SefariaOfflineTranslationData={berakhot:tractate};
   else{script.onerror?.();return;}
   script.onload?.();
  }}
 }
};
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
 const pageOnly=offline.parseReference('ברכות, דף ד','ברכות');
 assert.equal(pageOnly.daf,4);
 assert.equal(pageOnly.side,null);
 assert.equal(pageOnly.dafIndex,6);
 const first=await offline.getPassage('דף ב עמוד א:1',{currentBook:'תלמוד בבלי - מסכת ברכות'});
 assert.equal(first.scope,'paragraph');
 assert.match(first.text,/first paragraph/);
 const second=await offline.getPassage('ברכות, דף ב ע״א:3',{currentBook:'ברכות'});
 assert.equal(second.scope,'paragraph');
 assert.match(second.text,/second paragraph/);
 const wholeDaf=await offline.getPassage('ברכות, דף ב',{currentBook:'ברכות'});
 assert.equal(wholeDaf.scope,'daf');
 assert.match(wholeDaf.text,/first paragraph/);
 assert.match(wholeDaf.text,/next daf/);
 const next=await offline.prepareDaf({currentRef:'ברכות, דף ב',currentBook:'ברכות'});
 assert.equal(next.scope,'daf');
 assert.equal(next.ready,true);
 assert.equal(calls.filter(x=>x.endsWith('texts/berakhot.js')).length,1,'tractate script should stay cached after first load');
 assert.equal(calls.filter(x=>x.endsWith('manifest.js')).length,1,'manifest should stay cached');
 console.log('Offline Bavli passage tests passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
