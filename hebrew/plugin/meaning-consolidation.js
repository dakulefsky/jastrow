(function(root){
 'use strict';
 const normalize=value=>root.HebrewLookup.normalize(String(value||''));
 const labelKey=value=>{
  const raw=String(value||'').trim();
  if(/^\d+$/.test(raw))return '#'+raw;
  return normalize(raw.replace(/\b\d+\b/g,'').trim());
 };
 const homonymNumber=value=>{
  const text=String(value||'').trim(),sup=text.match(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+$/);
  if(sup)return Number([...sup[0]].map(ch=>'⁰¹²³⁴⁵⁶⁷⁸⁹'.indexOf(ch)).join(''));
  const arabic=text.match(/(?:^|\s)(\d+)$/);
  if(arabic)return Number(arabic[1]);
  const roman=text.match(/(?:^|\s)(I{1,3}|IV|V|VI|VII|VIII|IX|X)$/i);
  if(roman)return ({I:1,II:2,III:3,IV:4,V:5,VI:6,VII:7,VIII:8,IX:9,X:10})[roman[1].toUpperCase()]||null;
  return null;
 };
 const homonymCompatible=(a,b,knownNumbers)=>{
  if(a!==null&&b!==null)return a===b;
  if(a===null&&b===null)return true;
  return (knownNumbers?.size||0)<=1;
 };
 const labelsCompatibleInScope=(a,b,knownNumbers)=>{
  const aNumeric=/^#\d+$/.test(a||''),bNumeric=/^#\d+$/.test(b||'');
  if(aNumeric&&bNumeric)return a===b;
  if(aNumeric||bNumeric){
   if((a||'')&&!aNumeric||(b||'')&&!bNumeric)return false;
   return (knownNumbers?.size||0)<=1;
  }
  return !a||!b||a===b;
 };
 const dictionaryHomonymsByForm=new Map(),dictionaryNumericLabelsByForm=new Map();
 for(const entry of root.HEBREW_DICTIONARY?.entries||[])for(const form of [entry.word,...(entry.alt||[])]){
  const key=normalize(form),number=homonymNumber(form);
  if(!key)continue;
  if(number!==null){
   if(!dictionaryHomonymsByForm.has(key))dictionaryHomonymsByForm.set(key,new Set());
   dictionaryHomonymsByForm.get(key).add(number);
  }
  for(const part of entry.parts||[]){
   const numeric=/^\\d+$/.test(String(part.label||'').trim())?Number(String(part.label).trim()):null;
   if(numeric===null)continue;
   if(!dictionaryNumericLabelsByForm.has(key))dictionaryNumericLabelsByForm.set(key,new Set());
   dictionaryNumericLabelsByForm.get(key).add(numeric);
  }
 }
 // Exact Hebrew alternatives may be listed in a different order by the
 // source records. Normalize punctuation and order only; preserve word order
 // within each phrase and never infer synonyms from shared words.
 const canonicalMeaningKey=value=>[...new Set(String(value||'').split(/[;,]/).map(normalize).filter(Boolean))].sort().join(' | ');
 const splitAlternatives=value=>{
  const out=[];let current='',depth=0;
  for(const ch of String(value||'')){
   if(ch==='(')depth++;
   else if(ch===')')depth=Math.max(0,depth-1);
   if((ch===','||ch===';')&&depth===0){if(normalize(current))out.push(current.trim());current='';}
   else current+=ch;
  }
  if(normalize(current))out.push(current.trim());
  return out;
 };
 const itemMeaning=item=>item.displayMeaning||item.p.meaning||item.p.text||'';
 // Each approved synonym is scoped to exact source records and exact Hebrew glosses.
 // Similar wording alone never merges Hebrew senses.
 const reviewedSynonymPairs=new Set([
  // These are source-specific equivalences reviewed against the original Hebrew definitions.
  ['KRU03116','KRU15803','מי שמפקידין אצלו','נאמן, שומר'],
  ['KRU03661','KRU03664','קלע וסבך חוטים או שערות וכדומה','עשה מעשה גדיל, קלע'],
  ['KRU06890','KRU06892','שנה, עשה שוב','שב ועשה'],
  ['KRU07618','KRU07619','כהה','תרג׳ עמ׳ ה׳ כ׳ (חושך יום ה׳): חשוך יומא דעתיד למיתי.'],
  ['KRU15532','KRU15533','העריץ ועבד לאלהות','עבד לאלהות'],
  ['KRU15825','KRU15827','נבקע','נפקע'],
  ['KRU02835','KRU02882','השחית','שחק, קילקל'],
  ['KRU14546','KRU16290','על אחריותי','אני מקבל עלי את האחריות'],
  ['KRU15796','KRU15797','ביקע, הפריד','חילק'],
  ['KRU00145','KRU04650','בהזדמנות','על ידי המשך הדבור, דרך אגב'],
  ['KRU02736','KRU02892','מקום הבליעה בגרון','פנים הגרון']
 ].map(([a,b,x,y])=>{
  const ids=[a,b].sort().join('|'),glosses=[normalize(x),normalize(y)].sort().join(' | ');
  return ids+'::'+glosses;
 }));
 function pairKey(a,b){
  const ids=[a.e.rid,b.e.rid].sort().join('|');
  const glosses=[normalize(itemMeaning(a)),normalize(itemMeaning(b))].sort().join(' | ');
  return ids+'::'+glosses;
 }
 function equivalent(a,b){
  return canonicalMeaningKey(itemMeaning(a))===canonicalMeaningKey(itemMeaning(b))||reviewedSynonymPairs.has(pairKey(a,b));
 }
 function merge(sources,word){
  const groups=[],prepared=[];
  for(const source of sources||[])for(const entry of source.records||[])for(const part of entry.parts||[]){
   const text=part.meaning||part.text||'',label=labelKey(part.label),scope=normalize(source.word||word),homonym=homonymNumber(entry.word);
   if(!normalize(text))continue;
   prepared.push({source,entry,part,text,label,scope,homonym,numericLabel:/^\d+$/.test(String(part.label||'').trim())?Number(String(part.label).trim()):null,alternatives:splitAlternatives(text)});
  }
  // If two source parts share an exact Hebrew alternative, split those parts
  // into their individual alternatives for display. This allows a common
  // meaning to consolidate while an extra sense in the fuller gloss stays
  // separate. Original full parts remain attached to every resulting item.
  const homonymsByScope=new Map();
  for(const item of prepared){
   if(!homonymsByScope.has(item.scope))homonymsByScope.set(item.scope,new Set(dictionaryHomonymsByForm.get(item.scope)||[]));
   if(item.homonym!==null)homonymsByScope.get(item.scope).add(item.homonym);
  }
  const numericLabelsByScope=new Map();
  for(const item of prepared){
   if(!numericLabelsByScope.has(item.scope))numericLabelsByScope.set(item.scope,new Set(dictionaryNumericLabelsByForm.get(item.scope)||[]));
   if(item.numericLabel!==null)numericLabelsByScope.get(item.scope).add(item.numericLabel);
  }
  const compatibleInScope=(scope,a,b)=>homonymCompatible(a,b,homonymsByScope.get(scope));
  const labelsCompatible=(scope,a,b)=>labelsCompatibleInScope(a,b,numericLabelsByScope.get(scope));
  const splitParts=new Set();
  for(let i=0;i<prepared.length;i++)for(let j=i+1;j<prepared.length;j++){
   const a=prepared[i],b=prepared[j];
   if(a.scope!==b.scope||!compatibleInScope(a.scope,a.homonym,b.homonym)||!labelsCompatible(a.scope,a.label,b.label))continue;
   const leftValues=[...new Set(a.alternatives.map(normalize).filter(Boolean))];
   const rightValues=[...new Set(b.alternatives.map(normalize).filter(Boolean))];
   const right=new Set(rightValues);
   const overlaps=leftValues.some(value=>right.has(value));
   const sameCompleteSet=leftValues.length===rightValues.length&&leftValues.every(value=>right.has(value));
   if(overlaps&&!sameCompleteSet){splitParts.add(i);splitParts.add(j);}
  }
  for(let index=0;index<prepared.length;index++){
   const {source,entry,part,text,label,scope,homonym,alternatives}=prepared[index];
   const displayMeanings=splitParts.has(index)?alternatives:[text];
   for(const displayMeaning of displayMeanings){
    const item={e:entry,p:part,selectedWord:source.word||undefined,displayMeaning};
    let group=groups.find(g=>g.scope===scope&&compatibleInScope(scope,g.homonym,homonym)&&labelsCompatible(scope,g.label,label)&&g.items.some(existing=>equivalent(existing,item)));
    if(!group){group={word:entry.word,text:displayMeaning,scope,label,homonym,items:[]};groups.push(group);}
    else{
     if(group.homonym===null&&homonym!==null)group.homonym=homonym;
     if(!group.label&&label)group.label=label;
    }
    if(!group.label)group.label=label;
    if(!group.items.some(x=>x.e.rid===entry.rid&&x.p===part&&normalize(itemMeaning(x))===normalize(displayMeaning))){
     group.items.push(item);
     const displayTexts=[],seen=new Set();
     for(const existing of group.items)for(const alternative of splitAlternatives(itemMeaning(existing))){
      const key=normalize(alternative);
      if(key&&!seen.has(key)){seen.add(key);displayTexts.push(alternative);}
     }
     group.displayTexts=displayTexts;
     group.text=group.displayTexts.join(', ');
    }
   }
  }
  return groups;
 }
 root.HebrewMeaningConsolidation={merge,normalize,labelKey,canonicalMeaningKey,splitAlternatives,reviewedSynonymPairs,pairKey,equivalent};
})(typeof window==='undefined'?globalThis:window);
