(function(root){
 'use strict';
 const normalize=value=>root.HebrewLookup.normalize(String(value||''));
 const labelKey=value=>normalize(String(value||'').replace(/\b\d+\b/g,'').trim());
 // Each approved synonym is scoped to exact source records and exact Hebrew glosses.
 // Similar wording alone never merges Hebrew senses.
 const reviewedSynonymPairs=new Set([
  // These are source-specific equivalences reviewed against the original Hebrew definitions.
  ['KRU03116','KRU15803','מי שמפקידין אצלו','נאמן, שומר'],
  ['KRU03661','KRU03664','קלע וסבך חוטים או שערות וכדומה','עשה מעשה גדיל, קלע'],
  ['KRU06890','KRU06892','שנה, עשה שוב','שב ועשה'],
  ['KRU07618','KRU07619','כהה','תרג׳ עמ׳ ה׳ כ׳ (חושך יום ה׳): חשוך יומא דעתיד למיתי.'],
  ['KRU15532','KRU15533','העריץ ועבד לאלהות','עבד לאלהות'],
  ['KRU15825','KRU15827','נבקע','נפקע']
 ].map(([a,b,x,y])=>{
  const ids=[a,b].sort().join('|'),glosses=[normalize(x),normalize(y)].sort().join(' | ');
  return ids+'::'+glosses;
 }));
 function pairKey(a,b){
  const ids=[a.e.rid,b.e.rid].sort().join('|');
  const glosses=[normalize(a.p.meaning||a.p.text),normalize(b.p.meaning||b.p.text)].sort().join(' | ');
  return ids+'::'+glosses;
 }
 function equivalent(a,b){
  return normalize(a.p.meaning||a.p.text)===normalize(b.p.meaning||b.p.text)||reviewedSynonymPairs.has(pairKey(a,b));
 }
 function merge(sources,word){
  const groups=[];
  for(const source of sources||[])for(const entry of source.records||[])for(const part of entry.parts||[]){
   const text=part.meaning||part.text||'',label=labelKey(part.label),scope=normalize(source.word||word);
   if(!normalize(text))continue;
   const item={e:entry,p:part,selectedWord:source.word||undefined};
   let group=groups.find(g=>g.scope===scope&&(!g.label||!label||g.label===label)&&g.items.some(existing=>equivalent(existing,item)));
   if(!group){group={word:entry.word,text,scope,label,items:[]};groups.push(group);}
   if(!group.label)group.label=label;
   if(!group.items.some(x=>x.e.rid===entry.rid&&x.p===part)){
    group.items.push(item);
    group.displayTexts=[...new Set(group.items.map(x=>String(x.p.meaning||x.p.text||'').trim()).filter(Boolean))];
    group.text=group.displayTexts.join(' / ');
   }
  }
  return groups;
 }
 root.HebrewMeaningConsolidation={merge,normalize,labelKey,reviewedSynonymPairs,pairKey,equivalent};
})(typeof window==='undefined'?globalThis:window);
