'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

function verify(root){
 const base=path.join(root,'data','sefaria-bavli');
 const manifest=JSON.parse(fs.readFileSync(path.join(base,'manifest.json'),'utf8'));
 assert.equal(manifest.formatVersion,1);
 assert.equal(manifest.edition,'William Davidson Edition - English');
 assert.equal(manifest.tractateCount,manifest.tractates.length);
 assert(manifest.tractates.length>=35,'the complete Bavli collection should contain all major tractates');
 assert.match(fs.readFileSync(path.join(base,'ATTRIBUTION.txt'),'utf8'),/CC BY-NC/);
 const titles=new Set();
 for(const meta of manifest.tractates){
  assert(meta.title&&meta.heTitle&&meta.slug&&meta.file);
  assert.equal(meta.license,'CC-BY-NC',meta.title);
  assert(!meta.file.includes('..'));
  assert(meta.file.startsWith('texts/'));
  assert(!titles.has(meta.title),'duplicate tractate '+meta.title);
  titles.add(meta.title);
  const data=JSON.parse(fs.readFileSync(path.join(base,meta.file),'utf8'));
  assert.equal(data.versionTitle,manifest.edition,meta.title);
  assert.equal(data.license,'CC-BY-NC',meta.title);
  assert(Array.isArray(data.text)&&data.text.some(daf=>Array.isArray(daf)&&daf.some(line=>typeof line==='string'&&line.trim())),meta.title+' has no readable daf text');
 }
 for(const title of ['Berakhot','Shabbat','Yevamot','Bava Kamma','Sanhedrin'])assert(titles.has(title),'missing '+title);
 return manifest.tractateCount;
}
const english=verify('plugin');
const hebrew=verify('hebrew/plugin');
assert.equal(english,hebrew,'both plugins must bundle the same complete English Shas');
console.log('Bundled offline Bavli data verified: '+english+' tractates in both plugins');
