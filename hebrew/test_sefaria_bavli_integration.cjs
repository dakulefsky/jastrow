'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

(async()=>{
 const pluginPath=path.join(__dirname,'plugin'),fetched=[],messages=[];
 const root={console,Otzaria:{on(){},call:async(method,args)=>{
  if(method==='ui.showMessage'){messages.push(args);return {success:true};}
  throw new Error('Offline Hebrew comparison unexpectedly called host API: '+method);
 }} };
 root.document={
  createElement(){return {src:'',async:false,onload:null,onerror:null,remove(){}};},
  head:{appendChild(script){
   const asset=String(script.src);fetched.push(asset);
   try{vm.runInNewContext(fs.readFileSync(path.join(pluginPath,asset),'utf8'),context);script.onload?.();}
   catch(error){script.onerror?.(error);}
  }}
 };
 const context={window:root,globalThis:root,console};
 vm.runInNewContext(fs.readFileSync(path.join(pluginPath,'sefaria-offline.js'),'utf8'),context);
 vm.runInNewContext(fs.readFileSync(path.join(pluginPath,'sefaria-evidence.js'),'utf8'),context);
 vm.runInNewContext(fs.readFileSync(path.join(pluginPath,'quick-lookup.js'),'utf8'),context);
 const baseSelection={currentRef:'ברכות, דף ב עמוד א',currentBook:'ברכות',currentBookId:'berakhot'};
 const passage=await root.SefariaOfflineTranslation.getPassage('ברכות, דף ב עמוד א:1',baseSelection);
 assert.equal(passage.source,'offline','Hebrew offline passage lookup failed: '+JSON.stringify({passage,parsed:root.SefariaOfflineTranslation.parseReference('ברכות, דף ב עמוד א:1',baseSelection.currentBook)}));
 assert.equal(passage.scope,'paragraph');
 assert.equal(passage.versionTitle,'William Davidson Edition - Hebrew');
 assert(passage.text&&/[א-ת]/.test(passage.text),'Hebrew Steinsaltz paragraph should be readable');
 const phrase=root.SefariaEvidence.normalizeHebrew(passage.text).split(' ').slice(0,4).join(' ');
 // Otzaria selections carry currentIndex/sectionIndex for the paragraph,
 // while sourceRange.exactText is the selected Aramaic source word—not Hebrew.
 const selection={...baseSelection,currentIndex:0,sectionIndex:0,text:'מילה בארמית',
  sourceRange:{exactText:'מילה בארמית',beforeText:{raw:'לפני'},afterText:{raw:'אחרי'}}};
 const indexedPassage=await root.SefariaOfflineTranslation.getPassage(selection.currentRef,selection);
 assert.equal(indexedPassage.scope,'paragraph','Otzaria currentIndex should resolve the matching offline paragraph');
 assert.equal(indexedPassage.text,passage.text,'book paragraph index should map to the corresponding Steinsaltz paragraph');
 const berakhot=root.SefariaOfflineTranslationData.berakhot;
 const sideA=Array.isArray(berakhot.text[0])?berakhot.text[0]:[berakhot.text[0]];
 const secondSide={currentRef:'ברכות, דף ב עמוד ב',currentBook:'ברכות',currentBookId:'berakhot',
  currentIndex:sideA.length,sectionIndex:sideA.length,sourceRange:{exactText:'מילה בארמית'}};
 const sideBLine=await root.SefariaOfflineTranslation.getPassage('ברכות, דף ב עמוד ב:1',secondSide);
 const sideBIndexed=await root.SefariaOfflineTranslation.getPassage(secondSide.currentRef,secondSide);
 assert.equal(sideBIndexed.scope,'paragraph','global paragraph indices should advance across daf sides');
 assert.equal(sideBIndexed.text,sideBLine.text,'the global book index should resolve the first paragraph on side 2b');
 assert(phrase.split(' ').length>=2);
 const result=await root.SefariaEvidence.compareTranslation('בדיקה',[{id:'hebrew-source',text:phrase}],selection);
 assert.equal(result.source,'offline');
 assert.equal(result.scope,'paragraph');
 assert.equal(result.versionTitle,'William Davidson Edition - Hebrew');
 assert.equal(result.matches[0]?.id,'hebrew-source');
 assert.equal(result.matches[0]?.matchedPhrase,phrase);
 assert.deepEqual(fetched,['data/sefaria-bavli/manifest.js','data/sefaria-bavli/texts/berakhot.js']);
 // Simulate a cold, independent foreground webview: its cache is not prepared
 // by the background webview, and right-click must still load the bundled
 // corpus locally after showing the instant dictionary meanings.
 root.SefariaOfflineTranslation.clearCache();
 fetched.length=0;
 root.HebrewLookup={
  valid:()=>true,normalize:value=>String(value||'').replace(/\s+/g,' ').trim(),
  lookup:()=>[{word:'בדיקה',rid:'KRU99999',parts:[{meaning:phrase,text:phrase,label:''}]}],
  segmentWords:()=>[]
 };
 assert.equal(root.SefariaOfflineTranslation.isDafPrepared(selection.currentRef,selection),false,
  'foreground starts with a cold local cache');
 await root.DictionaryQuick.show('בדיקה',selection);
 assert.equal(messages.length,2,'right-click should show an instant result and then an offline recommendation refresh');
 assert(!messages[0].message.includes('★ מומלץ'),'the immediate result must not guess before evidence loads');
 assert(messages[1].message.includes('★ מומלץ'),'the cold foreground webview should find the recommendation from bundled Hebrew text');
 assert.deepEqual(fetched,['data/sefaria-bavli/manifest.js','data/sefaria-bavli/texts/berakhot.js'],
  'the recommendation must use only bundled assets, with no network fetch');
 console.log('Full offline Hebrew Steinsaltz paragraph comparison and cold-cache quick recommendation passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
