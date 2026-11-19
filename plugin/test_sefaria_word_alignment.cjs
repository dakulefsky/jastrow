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
 assert(said.translations[0].confidence>0.8);
 const rav=await api.getWordTranslations('רַב',parallel);
 assert.equal(rav.status,'ok');
 assert.equal(rav.translations[0].text,'Rav');
 const missing=await api.getWordTranslations('תניא',parallel);
 assert.equal(missing.status,'word_not_in_parallel_passage');
 const unaligned=await api.getWordTranslations('אָמַר',{aligned:false,reason:'segment_count_mismatch'});
 assert.equal(unaligned.status,'unaligned');
 assert.equal(unaligned.reason,'segment_count_mismatch');
 console.log('Offline contextual word alignment tests passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
