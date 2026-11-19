'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const root={
 console,
 SefariaOfflineWordAlignment:{
  formatVersion:1,
  method:'IBM Model 1 lexical alignment; same-index segment pairs only',
  license:'CC-BY-NC',
  attribution:'William Davidson Edition; Koren Publishers; Sefaria.',
  nullLinks:[{word:'the',probability:0.99},{word:'a',probability:0.98}],
  links:{
   'אמר':[{word:'said',probability:0.96},{word:'say',probability:0.02}],
   'רב':[{word:'rav',probability:0.97}],
   'דין':[{word:'law',probability:0.91}],
  }
 }
};
vm.runInNewContext(fs.readFileSync('plugin/sefaria-offline.js','utf8'),{window:root,globalThis:root,console});

(async()=>{
 const api=root.SefariaOfflineTranslation;
 const parallel={
  aligned:true,
  scope:'paragraph',
  segments:[
   {line:1,side:'a',sourceText:'אָמַר רַב דִּינָא',translationText:'Rav said the law'},
  ]
 };
 const said=await api.getWordTranslations('אָמַר',parallel);
 assert.equal(said.status,'ok');
 assert.equal(said.translations[0].text,'said');
 assert(said.translations[0].alignmentScore>0.8);
 assert.match(said.scoreSemantics,/not calibrated translation accuracy/);
 const rav=await api.getWordTranslations('רַב',parallel);
 assert.equal(rav.status,'ok');
 assert.equal(rav.translations[0].text,'Rav');
 const missing=await api.getWordTranslations('תניא',parallel);
 assert.equal(missing.status,'word_not_in_parallel_passage');
 const unaligned=await api.getWordTranslations('אָמַר',{aligned:false,reason:'segment_count_mismatch'});
 assert.equal(unaligned.status,'unaligned');
 assert.equal(unaligned.reason,'segment_count_mismatch');
 const realRoot={console};
 const realContext={window:realRoot,globalThis:realRoot,console};
 const assetLoads=[];
 realRoot.document={
  createElement(){return {src:'',async:false,onload:null,onerror:null,remove(){}};},
  head:{appendChild(script){
   const assetPath='plugin/'+String(script.src).replace(/^\/+/, '');
   assetLoads.push(assetPath);
   try{
    const source=fs.readFileSync(assetPath,'utf8');
    vm.runInNewContext(source,realContext,{filename:assetPath});
    script.onload?.();
   }catch(error){
    script.onerror?.();
    throw error;
   }
  }}
 };
 vm.runInNewContext(fs.readFileSync('plugin/sefaria-offline.js','utf8'),realContext,{filename:'plugin/sefaria-offline.js'});
 const realApi=realRoot.SefariaOfflineTranslation;
 const realParallel=await realApi.getParallelPassage('ברכות, דף ב עמוד א',{currentBook:'ברכות'});
 assert.equal(realParallel.aligned,true,'Berakhot 2a should expose aligned parallel paragraphs');
 const wanted=['מאימתי','קורין','שמע','בערבין','משעה'];
 const examples=[];
 for(const word of wanted){
  const result=await realApi.getWordTranslations(word,realParallel);
  examples.push({word,status:result.status,translation:result.translations?.[0]?.text||null,score:result.translations?.[0]?.alignmentScore||null});
 }
 console.log('Real Bavli contextual lookup samples:',JSON.stringify(examples));
 const realModel=realRoot.SefariaOfflineWordAlignment;
 assert.equal(realModel.formatVersion,1);
 assert.equal(realModel.license,'CC-BY-NC');
 assert(realModel.candidatePairs>70000,'the model must scan the broad matched Shas corpus');
 assert(realModel.trainingPairs<=40000,'the trained model should respect its bounded build-time sample');
 assert(realModel.sampledTractates===37,'the alignment sample should represent all 37 tractates');
 assert(realModel.samplingFraction>0&&realModel.samplingFraction<1);
 assert(realModel.sourceWords>1000,'the model should cover a substantial Aramaic vocabulary');
 assert.deepEqual(assetLoads.map(path=>path.slice('plugin/'.length)),[
  'data/sefaria-bavli/manifest.js',
  'data/sefaria-bavli/texts/berakhot.js',
  'data/sefaria-bavli/word-alignments.js'
 ],'the manifest, tractate, and alignment model should load lazily from local plugin assets');
 assert(examples.some(example=>example.status==='ok'),'the real Bavli model should align at least one checked word in Berakhot 2a');
 console.log('Offline contextual word alignment tests passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
