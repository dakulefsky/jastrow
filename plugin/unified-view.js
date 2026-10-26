(function(root){
 'use strict';
 const S=root.JastrowSearch||(typeof require==='function'?require('./search.js'):null);
 const clean=text=>String(text).normalize('NFKC').toLowerCase().replace(/[.\s]+$/,'').trim().replace(/\s+/g,' ');
 const stem=label=>/^[—\s]*\d+[).]?\s*$/.test(label||'')?'':clean(label||'');
 const parts=text=>String(text).split(/[,;]/).map(clean).filter(Boolean);
 function compatible(a,b){
  const aa=S.markedLetters(a),bb=S.markedLetters(b);
  if(S.normalize(a)!==S.normalize(b))return false;
  return aa.every((x,i)=>!x.marks.length||!bb[i].marks.length||x.marks.join('')===bb[i].marks.join(''));
 }
 // Reviewed source equivalence: both cite Targum Ruth 2:3 for אִרְעָא.
 // Restrict this to these original glosses, not a general synonym rewrite.
 function reviewedEquivalent(source,item){
  const pair=[source,item].map(s=>s.entry.r+'|'+s.meaning.text).sort();
  return pair[0]==='A03220|accident, occurrence'&&pair[1]==='KRU02095|in accident';
 }
 function sameMeaning(group,item){
  if(group.form!==stem(item.meaning.label)||!group.sources.every(s=>S.normalize(s.spelling)===S.normalize(item.spelling)))return false;
  if(clean(group.text)===clean(item.meaning.text)||group.sources.some(s=>reviewedEquivalent(s,item)))return true;
  const a=parts(group.text),b=parts(item.meaning.text);
  // Consolidate identical English meanings and contained synonym lists.
  // Different lists merely sharing one word remain separate. Original vowel
  // readings belong to their source references, not duplicate meaning cards.
  return Math.min(a.length,b.length)>=1&&(a.every(x=>b.includes(x))||b.every(x=>a.includes(x)));
 }
 function merge(records,word){
  const groups=[];
  for(const {id,entry,meanings,lookupWord} of records)for(const meaning of meanings){
   if(!meaning.text?.trim())continue;
   const matchingWord=lookupWord||word,spelling=S.displayHeadword(entry,matchingWord),item={id,entry,meaning,spelling};
   let group=groups.find(g=>sameMeaning(g,item));
   if(!group){group={text:meaning.text,form:stem(meaning.label),spelling,sources:[],rank:S.vowelRank(entry,matchingWord)};groups.push(group);}
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
  section.append(body);return section;
 }
 function card(group,number,notes){
  const li=element('li',undefined,'meaning-card');li.dataset.vowelRank=group.rank;
  const badge=element('span',String(number),'meaning-number');badge.setAttribute('aria-hidden','true');
  const content=element('div',undefined,'meaning-content'),spelling=element('div',group.spelling,'meaning-spelling');spelling.dir='rtl';
  content.append(spelling);
  if(group.form)content.append(element('div',group.sources[0].meaning.label,'meaning-form'));
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
  for(const group of groups){const item=card(group,++number,notes);(hasExact&&group.rank>0?otherList:list).append(item);}
  section.append(list);
  if(otherList.children.length){const alternatives=element('details',undefined,'other-readings');alternatives.append(element('summary','Other possible vowel readings'),otherList);section.append(alternatives);}
  const withoutMeanings=records.filter(r=>!r.meanings.length);
  if(withoutMeanings.length){const details=element('details',undefined,'scholarly-entry original-only');details.append(element('summary','Additional dictionary references'));withoutMeanings.forEach((r,i)=>details.append(sourceBlock({...r,meaning:{text:'',label:''}},i)));section.append(details);}
  return section;
 }
 const api={merge,render,compatible};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.DictionaryMeanings=api;
})(typeof window!=='undefined'?window:globalThis);
