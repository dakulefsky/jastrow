'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

(async()=>{
 const pluginPath=path.join(__dirname,'plugin'),fetched=[],messages=[];
 const root={console,Otzaria:{on(){},call:async(method,args)=>{
  if(method==='ui.showMessage'){messages.push(args);return {success:true};}
  if(method==='library.getBookToc')return {success:true,data:[
   {text:'דף ב עמוד א',index:0,level:1},
   {text:'דף ב עמוד ב',index:100,level:1}
  ]};
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
 const baseSelection={currentRef:'ברכות, דף ב עמוד א',currentBook:'ברכות',currentBookId:'ברכות'};
 const passage=await root.SefariaOfflineTranslation.getPassage('ברכות, דף ב עמוד א:1',baseSelection);
 assert.equal(passage.source,'offline','Hebrew offline passage lookup failed: '+JSON.stringify({passage,parsed:root.SefariaOfflineTranslation.parseReference('ברכות, דף ב עמוד א:1',baseSelection.currentBook)}));
 assert.equal(passage.scope,'paragraph');
 assert.equal(passage.versionTitle,'William Davidson Edition - Hebrew');
 assert(passage.text&&/[א-ת]/.test(passage.text),'Hebrew Steinsaltz paragraph should be readable');
 const passageWords=root.SefariaEvidence.normalizeHebrew(passage.text).split(' ');
 const common=new Set('של את על אל עם אם או גם כי לא כן הוא היא הם הן אני אתה אתם אנחנו אשר זה זאת אלה אלו כל מן בין תוך עבור אחרי לפני כאשר'.split(' '));
 let phraseStart=-1;
 for(let i=0;i+2<passageWords.length;i++){
  const window=passageWords.slice(i,i+3),content=window.filter(word=>!common.has(word)&&word.length>=2);
  if(content.length>=2){phraseStart=i;break;}
 }
 assert(phraseStart>=0,'real Hebrew paragraph should contain at least two content words in a short phrase');
 const phrase=passageWords.slice(phraseStart,phraseStart+3).join(' ');
 // Otzaria selections carry currentIndex/sectionIndex for the paragraph,
 // while sourceRange.exactText is the selected Aramaic source word—not Hebrew.
 const selection={...baseSelection,currentIndex:0,sectionIndex:0,text:'מילה בארמית',
  sourceRange:{exactText:'מילה בארמית',beforeText:{raw:'לפני'},afterText:{raw:'אחרי'}}};
 const indexedPassage=await root.SefariaOfflineTranslation.getPassage(selection.currentRef,selection);
 assert.equal(indexedPassage.scope,'paragraph','Otzaria currentIndex should resolve the matching offline paragraph');
 assert.equal(indexedPassage.text,passage.text,'book paragraph index should map to the corresponding Steinsaltz paragraph');
 const secondSide={currentRef:'ברכות, דף ב עמוד ב',currentBook:'ברכות',currentBookId:'ברכות',
  currentIndex:100,sectionIndex:100,sourceRange:{exactText:'מילה בארמית'}};
 const sideBLine=await root.SefariaOfflineTranslation.getPassage('ברכות, דף ב עמוד ב:1',secondSide);
 const sideBIndexed=await root.SefariaOfflineTranslation.getPassage(secondSide.currentRef,secondSide);
 assert.equal(sideBIndexed.scope,'paragraph','TOC-relative paragraph indices should resolve side 2b');
 assert.equal(sideBIndexed.text,sideBLine.text,'the TOC heading should resolve the first paragraph on side 2b');
 const berakhot=root.SefariaOfflineTranslationData.berakhot;
 const sideAParagraphs=Array.isArray(berakhot.text[0])?berakhot.text[0]:[berakhot.text[0]];
 const secondAIndex=sideAParagraphs.findIndex((value,index)=>index>0&&typeof value==='string'&&value.trim());
 if(secondAIndex>=0){
  const explicit=await root.SefariaOfflineTranslation.getPassage('ברכות, דף ב עמוד א:'+(secondAIndex+1),selection);
  const mapped=await root.SefariaOfflineTranslation.getPassage(selection.currentRef,{...selection,currentIndex:secondAIndex,sectionIndex:secondAIndex});
  assert.equal(mapped.scope,'paragraph','TOC-relative index should resolve a later paragraph on side 2a');
  assert.equal(mapped.text,explicit.text,'later side 2a line should map to the matching offline paragraph');
 }
 const sideBData=Array.isArray(berakhot.text[1])?berakhot.text[1]:[berakhot.text[1]],secondBIndex=sideBData.findIndex((value,index)=>index>0&&typeof value==='string'&&value.trim());
 if(secondBIndex>=0){
  const explicit=await root.SefariaOfflineTranslation.getPassage('ברכות, דף ב עמוד ב:'+(secondBIndex+1),secondSide);
  const mapped=await root.SefariaOfflineTranslation.getPassage(secondSide.currentRef,{...secondSide,currentIndex:100+secondBIndex,sectionIndex:100+secondBIndex});
  assert.equal(mapped.scope,'paragraph','TOC-relative index should resolve a later paragraph on side 2b');
  assert.equal(mapped.text,explicit.text,'later side 2b line should map to the matching offline paragraph');
 }
 assert(phrase.split(' ').length>=2);
 const result=await root.SefariaEvidence.compareTranslation('בדיקה',[
  {id:'hebrew-source',text:phrase},{id:'weak-stop-word',text:'גם'}
 ],selection);
 assert.equal(result.source,'offline');
 assert.equal(result.scope,'paragraph');
 assert.equal(result.versionTitle,'William Davidson Edition - Hebrew');
 assert.equal(result.matches[0]?.id,'hebrew-source');
 assert.equal(result.matches[0]?.matchedPhrase,phrase);
 assert.equal(result.matches.some(item=>item.id==='weak-stop-word'),false,
  'a Hebrew stop-word coincidence must never count as contextual meaning evidence');
 assert(Number.isFinite(result.matches[0]?.evidenceScore)&&result.matches[0].contentWordCount>=2,
  'recommendation evidence must expose a weighted multi-content-word score');
 assert.deepEqual(fetched,['data/sefaria-bavli/manifest.js','data/sefaria-bavli/texts/berakhot.js']);
 // Simulate a cold, independent foreground webview: its cache is not prepared
 // by the background webview, and right-click must still load the bundled
 // corpus locally after showing the instant dictionary meanings.
 root.SefariaOfflineTranslation.clearCache();
 fetched.length=0;
 root.HebrewLookup={
  valid:()=>true,normalize:value=>String(value||'').replace(/\s+/g,' ').trim(),
  lookup:()=>[{word:'בדיקה',rid:'KRU99999',parts:[
   {meaning:phrase,text:phrase,label:'meaning supported by this paragraph'},
   {meaning:'משמעות שאינה מופיעה כלל בפסקה',text:'unrelated gloss',label:'unmatched alternative'}
  ]}],
  segmentWords:()=>[]
 };
 assert.equal(root.SefariaOfflineTranslation.isDafPrepared(selection.currentRef,selection),false,
  'foreground starts with a cold local cache');
 await root.DictionaryQuick.show('בדיקה',selection);
 assert.equal(messages.length,2,'right-click should show an instant result and then an offline recommendation refresh');
 assert(!messages[0].message.includes('★ מומלץ'),'the immediate result must not guess before evidence loads');
 assert(messages[1].message.includes('★ מומלץ'),'the cold foreground webview should find the recommendation from bundled Hebrew text');
 assert(messages[1].message.indexOf('★ מומלץ')<messages[1].message.indexOf('משמעות שאינה מופיעה כלל בפסקה'),
  'the meaning actually found in the selected Hebrew paragraph must be moved to the top and marked');
 assert(!messages[1].message.includes('משמעות שאינה מופיעה כלל בפסקה — ★ מומלץ'),
  'an unsupported alternative must never receive the recommendation marker');
 const ambiguous=await root.SefariaEvidence.compareTranslation('בדיקה',[
  {id:'meaning-a',text:phrase},{id:'meaning-b',text:phrase}
 ],selection);
 assert.equal(root.SefariaEvidence.bestContextualMatch(ambiguous),null,
  'equally supported Hebrew meanings must remain unranked rather than guessing');
 assert.deepEqual(fetched,['data/sefaria-bavli/manifest.js','data/sefaria-bavli/texts/berakhot.js'],
  'the recommendation must use only bundled assets, with no network fetch');
 console.log('Full offline Hebrew Steinsaltz paragraph comparison and cold-cache quick recommendation passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
