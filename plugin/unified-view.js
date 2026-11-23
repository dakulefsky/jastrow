(function(root){
 'use strict';
 const S=root.JastrowSearch||(typeof require==='function'?require('./search.js'):null);
 const clean=text=>String(text).normalize('NFKC').toLowerCase().replace(/[’‘]/g,"'").replace(/[‐‑–—]/g,'-').replace(/[.\s]+$/,'').trim().replace(/\s+/g,' ');
 const stem=label=>{
  let value=String(label||'').trim();
  // Krupnik often prefixes/suffixes grammatical labels with sense numbers;
  // Jastrow generally records the grammatical label without that numbering.
  value=value.replace(/^[—\s]*\d+[).]?\s*/,'').replace(/\s+\d+[).]?\s*$/,'');
  return clean(value);
 };
 const parts=text=>String(text).split(/[,;]/).map(clean).filter(Boolean);
 // Small exact synonym groups; no token-overlap or stemming heuristics.
 const synonymGroups=[
  ['sometimes','at times','from time to time','occasionally'],
  ['happen','to happen','occur','to occur','take place']
 ];
 const synonymKey=text=>{
  const value=clean(text);
  return synonymGroups.find(group=>group.includes(value))?.[0]||value;
 };
 // Manually reviewed cross-dictionary gloss equivalents. Each pair is scoped
 // to the same Hebrew headword, so an English phrase cannot merge unrelated
 // entries elsewhere in the dictionary. Keep this list conservative.
 const reviewedGlossPairs=new Set([
  ['land, ground','land, earth, ground, field'],
  ['outlet','outlet, opening'],
  ['father, my father','my father'],
  ['of noble descent','noble descent'],
  ['to commit suicide','to commit suicide wilfully'],
  ['city-gate-guards','city-gate-guards, police'],
  ['to be attached','to be attached to, cling to'],
  ['to harden','to strengthen, harden'],
  ['half-done (meat)','half-done meat'],
  ['thorn-bush','thorn, thorn-bush'],
  ['staying under the same roof','staying under the same roof with an unclean object'],
  ['a species of dates','a species of late and inferior dates'],
  ['of aaronic (priestly) parentage','of priestly parentage, aaronide'],
  ['pure gold','pure gold, unalloyed'],
  ['the same','this, the same'],
  ['there is','there is, there are'],
  ['but for','unless, but for'],
  ['human being','human being, person'],
  ['to be consumed','to be eaten, consumed'],
  ['to protect','to protect, surround'],
  ['huge, bulky, large','bulky, huge, large'],
  ['to glut','to swallow large quantities at a time, to glut'],
  ['military camp','military camp, fort'],
  ['rebellious conduct','sulky, rebellious conduct, howling'],
  ["to roll one's self","to roll one's self, wallow"],
  ['to low, to roar','to burst forth, to roar, low'],
  ['to remove impurity of vessels by means of hot water','to remove impurity by means of hot water, to cleanse'],
  ['to rebuke','to shout, to rebuke'],
  ['arm, shoulder','arms, shoulders'],
  ['to make airtight, to paste with gypsum','to make air-tight, to paste with gypsum, clay'],
  ['to be darkened through the process of sulphuring','to be darkened through sulphur fumes'],
  ['peat','a pressed hard mass, peat, turf'],
  ['convert to judaism','a proselyte, convert to judaism'],
  ['well for irrigating fields','wheel-work, well for irrigating fields'],
  ['garden-rocket (eruca)','garden-rocket, eruca'],
  ['to ripen into full berries','to grow berries, to ripen into full berries'],
  ['of many colors','of many colours']
 ].map(pair=>pair.map(clean).sort().join(' | ')));
 const reviewedGlossEquivalent=(a,b)=>{
  if(S.normalize(a.spelling)!==S.normalize(b.spelling))return false;
  return reviewedGlossPairs.has([clean(a.meaning.text),clean(b.meaning.text)].sort().join(' | '));
 };
 function compatible(a,b){
  const aa=S.markedLetters(a),bb=S.markedLetters(b);
  if(S.normalize(a)!==S.normalize(b))return false;
  return aa.every((x,i)=>!x.marks.length||!bb[i].marks.length||x.marks.join('')===bb[i].marks.join(''));
 }
 function reviewedEquivalent(source,item){
  const pair=[source,item].map(s=>s.entry.r+'|'+s.meaning.text).sort();
  return pair[0]==='A03220|accident, occurrence'&&pair[1]==='KRU02095|in accident';
 }
 function compatibleForm(a,b){
  // A missing source label is unknown, not evidence of a different grammatical sense.
  // Two explicit, conflicting labels remain separate.
  return !a||!b||a===b;
 }
 function sameMeaning(group,item,word){
  const itemForm=stem(item.meaning.label);
  if(!compatibleForm(group.form,itemForm)||(S.hasVowels(word)&&!group.sources.every(s=>compatible(s.spelling,item.spelling))))return false;
  return synonymKey(group.text)===synonymKey(item.meaning.text)||
   group.sources.some(s=>reviewedEquivalent(s,item)||reviewedGlossEquivalent(s,item));
 }
 function merge(records,word){
  const groups=[];
  for(const {id,entry,meanings,lookupWord} of records)for(const meaning of meanings){
   if(!meaning.text?.trim())continue;
   const matchingWord=lookupWord||word,spelling=S.displayHeadword(entry,matchingWord),item={id,entry,meaning,spelling};
   let group=groups.find(g=>sameMeaning(g,item,word));
   if(!group){group={text:meaning.text,form:stem(meaning.label),spelling,sources:[],rank:S.vowelRank(entry,matchingWord)};groups.push(group);}
   if(!group.form)group.form=stem(meaning.label);
   if(parts(meaning.text).length>parts(group.text).length)group.text=meaning.text;
   const rank=S.vowelRank(entry,matchingWord);if(rank<group.rank)group.spelling=spelling;group.rank=Math.min(group.rank,rank);
   if(!group.sources.some(s=>s.id===id&&s.meaning.text===meaning.text&&stem(s.meaning.label)===stem(meaning.label)))group.sources.push(item);
  }
  if(S.hasVowels(word))groups.sort((a,b)=>a.rank-b.rank);
  return groups;
 }
 let nextId=0;
 function element(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
 function sourceBlock(source,index){
  const section=element('section',undefined,'meaning-source');section.id='meaning-source-'+(++nextId);
  const name=source.entry.source==='krupnik'?'Krupnik & Silbermann':'Jastrow';
  section.append(element('h4','['+(index+1)+'] '+name),element('p',source.entry.h,'source-headword'));
  if(source.meaning.label)section.append(element('p',source.meaning.label,'entry-meta'));
  section.append(element('blockquote',source.meaning.text,'source-gloss'));
  const body=element('div',undefined,'definition');body.dir=source.entry.source==='krupnik'?'auto':'ltr';body.innerHTML=source.entry.html;
  if(source.entry.source==='krupnik')body.style.whiteSpace='pre-line';
  const citedWordExamples=source.entry.source==='krupnik'?null:root.JastrowReadingView?.renderPassages?.(body,source.lookupWord||source.spelling);
  section.append(body);if(citedWordExamples)section.append(citedWordExamples);return section;
 }
 function card(group,number,notes,meaningIndex){
  const li=element('li',undefined,'meaning-card');li.dataset.vowelRank=group.rank;li.dataset.meaningIndex=String(meaningIndex);
  const badge=element('span',String(number),'meaning-number');badge.setAttribute('aria-hidden','true');
  const content=element('div',undefined,'meaning-content'),spelling=element('div',group.spelling,'meaning-spelling');spelling.dir='rtl';
  content.append(spelling);
  if(group.form)content.append(element('div',group.form,'meaning-form'));
  content.append(element('p',group.text,'meaning-text'));
  const refs=element('span',undefined,'meaning-references');refs.setAttribute('aria-label','Source references');
  const details=element('details',undefined,'scholarly-entry');
  const sourceCount=new Set(group.sources.map(s=>s.id)).size;
  details.append(element('summary','More detail'+(sourceCount>1?' · '+sourceCount+' sources':'')));
  group.sources.forEach((source,i)=>{
   const section=sourceBlock(source,i),ref=element('a','['+(i+1)+']');ref.href='#'+section.id;ref.setAttribute('aria-label','Open source '+(i+1));
   ref.onclick=e=>{e.preventDefault();details.open=true;section.scrollIntoView({block:'nearest'});};
   refs.append(ref);if(notes?.[source.id])section.append(element('p',notes[source.id],'entry-meta'));details.append(section);
  });
  content.append(refs,details);li.append(badge,content);return li;
 }
 function render(records,word,notes={}){
  const groups=merge(records,word),section=element('section',undefined,'quick-meanings unified-meanings');
  const list=element('ol'),otherList=element('ol');let number=0;
  const hasExact=S.hasVowels(word)&&groups.some(g=>g.rank===0);
  groups.forEach((group,index)=>{const item=card(group,++number,notes,index);(hasExact&&group.rank>0?otherList:list).append(item);});
  section.append(list);
  if(otherList.children.length){const alternatives=element('details',undefined,'other-readings');alternatives.append(element('summary','Other possible vowel readings'),otherList);section.append(alternatives);}
  const withoutMeanings=records.filter(r=>!r.meanings.length);
  if(withoutMeanings.length){const details=element('details',undefined,'scholarly-entry original-only');details.append(element('summary','Additional dictionary references'));withoutMeanings.forEach((r,i)=>details.append(sourceBlock({...r,meaning:{text:'',label:''}},i)));section.append(details);}
  return section;
 }
 const api={merge,render,compatible,synonymKey,reviewedGlossPairs};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.DictionaryMeanings=api;
})(typeof window!=='undefined'?window:globalThis);
