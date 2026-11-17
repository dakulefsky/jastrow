'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

function verify(root){
 const base=path.join(root,'data','sefaria-bavli');
 const context={window:{},console};
 context.globalThis=context.window;
 vm.runInNewContext(fs.readFileSync(path.join(base,'manifest.js'),'utf8'),context);
 const manifest=context.window.SefariaOfflineTranslationManifest;
 assert.equal(manifest.formatVersion,1);
 assert.equal(manifest.edition,'William Davidson Edition - English');
 assert.equal(manifest.tractateCount,manifest.tractates.length);
 assert.equal(manifest.tractates.length,37,'the Bavli package should contain 37 tractates, excluding Sefaria introductory material');
 assert.match(fs.readFileSync(path.join(base,'ATTRIBUTION.txt'),'utf8'),/CC BY-NC/);
 const titles=new Set();
 for(const meta of manifest.tractates){
  assert(meta.title&&meta.heTitle&&meta.slug&&meta.file);
  assert.equal(meta.license,'CC-BY-NC',meta.title);
  assert(!meta.file.includes('..'));
  assert(meta.file.startsWith('texts/'));
  assert(!titles.has(meta.title),'duplicate tractate '+meta.title);
  titles.add(meta.title);
  vm.runInNewContext(fs.readFileSync(path.join(base,meta.file),'utf8'),context);
  const data=context.window.SefariaOfflineTranslationData?.[meta.slug];
  assert.equal(data.versionTitle,manifest.edition,meta.title);
  assert.equal(data.license,'CC-BY-NC',meta.title);
  assert(Array.isArray(data.text)&&data.text.some(daf=>Array.isArray(daf)&&daf.some(line=>typeof line==='string'&&line.trim())),meta.title+' has no readable daf text');
 }
 const expectedTitles=['Arakhin','Avodah Zarah','Bava Batra','Bava Kamma','Bava Metzia','Beitzah','Bekhorot','Berakhot','Chagigah','Chullin','Eruvin','Gittin','Horayot','Keritot','Ketubot','Kiddushin','Makkot','Megillah','Meilah','Menachot','Moed Katan','Nazir','Nedarim','Niddah','Pesachim','Rosh Hashanah','Sanhedrin','Shabbat','Shevuot','Sotah','Sukkah','Taanit','Tamid','Temurah','Yevamot','Yoma','Zevachim'];
 assert.deepEqual([...titles].sort(),expectedTitles.sort(),'the bundled data must contain the exact 37 Bavli tractates');
 return manifest.tractateCount;
}
const english=verify('plugin');
const hebrew=verify('hebrew/plugin');
assert.equal(english,hebrew,'both plugins must bundle the same complete English Shas');
console.log('Bundled offline Bavli data verified: '+english+' tractates in both plugins');
