'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

(async()=>{
 for(const pluginRoot of ['plugin','hebrew/plugin']){
  for(const file of ['./'+pluginRoot+'/sefaria-offline.js','./'+pluginRoot+'/sefaria-evidence.js'])delete require.cache[require.resolve(file)];
  const fetched=[];
  global.Otzaria={on(){},call:async method=>{throw new Error('Offline comparison unexpectedly called host API: '+method);}};
  global.fetch=async url=>{
   const value=String(url);fetched.push(value);
   if(!value.startsWith('data/sefaria-bavli/'))throw new Error('Unexpected network request: '+value);
   const file=path.join(__dirname,pluginRoot,value);
   return {ok:true,json:async()=>JSON.parse(fs.readFileSync(file,'utf8'))};
  };
  require('./'+pluginRoot+'/sefaria-offline.js');
  const evidence=require('./'+pluginRoot+'/sefaria-evidence.js');
  const result=await evidence.compareTranslation('שמע',[{id:'candidate-1',text:'beginning of tractate'}],
   {sourceRange:{ref:'ברכות, דף ב עמוד א:1'},currentBook:'ברכות'});
  assert.equal(result.source,'offline',pluginRoot);
  assert.equal(result.scope,'paragraph',pluginRoot);
  assert.equal(result.matches[0].id,'candidate-1',pluginRoot);
  assert.equal(result.matches[0].matchedPhrase,'beginning of tractate',pluginRoot);
  assert.deepEqual(fetched,['data/sefaria-bavli/manifest.json','data/sefaria-bavli/texts/berakhot.json']);
 }
 console.log('Full offline Bavli comparison passed in both plugins');
})().catch(error=>{console.error(error);process.exitCode=1;});
