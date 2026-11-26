(function(root){
 'use strict';
 const normalize=value=>root.HebrewLookup.normalize(String(value||''));
 const labelKey=value=>normalize(String(value||'').replace(/\b\d+\b/g,'').trim());

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

 const dictionaryHomonymsByForm=new Map();
 for(const entry of root.HEBREW_DICTIONARY?.entries||[])for(const form of [entry.word,...(entry.alt||[])]){
  const key=normalize(form),number=homonymNumber(form);
  if(!key||number===null)continue;
  if(!dictionaryHomonymsByForm.has(key))dictionaryHomonymsByForm.set(key,new Set());
  dictionaryHomonymsByForm.get(key).add(number);
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
  ['KRU02736','KRU02892','מקום הבליעה בגרון','פנים הגרון'],
  // KRU09162 / KRU09163: same straightening sense; the latter retains additional distinct senses.
  ['KRU09162','KRU09163','עשה ישר ומכוון','1) עשה ישר']
 ].map(([a,b,x,y])=>{
  const ids=[a,b].sort().join('|'),glosses=[normalize(x),normalize(y)].sort().join(' | ');
  return ids+'::'+glosses;
 }));
 // Source-reviewed false positives for the candidate queue. This registry never changes runtime meanings.
 const reviewedNonSynonymPairs=new Map([

  ["KRU02691","KRU02692","ירוש׳ שבי׳ פ״ו ל״ו ע״ג: ביריי רבתא.","שם אמורא","Different proper-name classes: the first record identifies a place, while the second explicitly identifies an Amora."],
  ["KRU18231","KRU18232","ריכך, עשה רך","כנ״ל. תרג׳ איוב כ״ג ט״ז (הרך לבי): רכך לבבי. אִתְרַכֵּךְ אתפ׳, נעשה רך","Different grammatical voice and meaning: 'to make soft' is causative/transitive; 'to become soft' is intransitive/reflexive."],
  ["KRU07060","KRU07061","שם עיר בארץ ישראל","שם אמורא","Different referents: Haifa is a town; the other record is a personal name of an Amora."],
  ["KRU02827","KRU02828","1) ילד בפעם הראשונה","ליקט בכורים","Different senses and forms: bearing for the first time is not the Hifil act of plucking first fruits."],
  ["KRU00180","KRU04150","פ״י, כתת","אפע׳, שמר, הגין","Different meanings: crushing versus covering/protecting; shared headword normalization is insufficient."],
  ["KRU00207","KRU00208","שכר","חולין ק״ד ע״ב: אגרא חמוה דר׳ אבא.","Reward versus a proper personal name; these are distinct homonymous senses."],
  ["KRU00372","KRU00373","אוזן","נאד","Ear versus skin bag; distinct lexical meanings."],
  ["KRU00372","KRU00373","אוזן","הדום, שרפרף","Ear versus footstool; distinct lexical meanings."],
  ["KRU00467","KRU00468","שטר מכירה או מתנה","פקעת","Contract/deed versus skein; distinct lexical meanings."],
  ["KRU00585","KRU00586","יסוד","שם עיר בגליל","Foundation versus a town in Galilee; distinct lexical meanings."],
  ["KRU00594","KRU00595","אכסניא","בעל אכסניא","Inn versus innkeeper; related concepts but not synonyms."],
  ["KRU00722","KRU00724","חג של עכו״ם","איזו","Heathen holiday versus the interrogative 'which?'; distinct homonymous forms."],
  ["KRU00728","KRU00729","שם אמורא","מערב","Personal name of an Amora versus 'west'; distinct lexical meanings."],
  ["KRU00751","KRU00752","שליח","תל, גבעה","Messenger versus hill; distinct lexical meanings."],
  ["KRU00848","KRU00850","בר׳ י״ח ע״ב: אימא לה לאימא; ירוש׳ נדה פ״א מ״ט ע״א: אבא טבי ואימה טביתה.","פלך לטויה","Mother versus distaff; distinct lexical meanings."],
  ["KRU00985","KRU00986","אגודה, חבילה","שר של מעלה, מלאך","Bunch/bundle versus angel; distinct lexical meanings."],
  ["KRU01073","KRU01074","נשואין","חפרפרת","Matrimony versus mole; distinct homonymous senses."],
  ["KRU01341","KRU01342","– אמונה","הר בצפונה של א״י","Faith/trust versus Mount Amanus; distinct lexical meanings."],
  ["KRU01562","KRU01563","בגד","ציון לדרך וגבול","Robe/garment versus landmark/boundary marker; distinct lexical meanings."],
  ["KRU01660","KRU01661","תורן","רפסודה, דוברה","Mast-yard versus raft/float; distinct objects."],
  ["KRU01687","KRU01690","– אַף אֵלָהֵין ובפרט, ומה גם","שם מלאך","Conjunctive/emphatic 'how much rather' versus the name of an angel; distinct senses."],
  ["KRU01755","KRU01756","הדום, שרפרף","מרדעת, אוכף","Footstool versus saddle; distinct objects."],
  ["KRU01989","KRU01991","דרך","אור","Way/path versus light; distinct meanings."],
  ["KRU01989","KRU01991","אורח","אור","Guest versus light; distinct meanings."],
  ["KRU02026","KRU02027","נעשה ארוך","תקן, הכין","To grow longer versus to prepare; distinct verbal meanings."],
  ["KRU02026","KRU02027","נעשה ארוך","נקה","To grow longer versus to cleanse; distinct verbal meanings."],
  ["KRU02581","KRU02582","צנור","יחי!","Duct/channel versus the exclamation 'long live!'; unrelated meanings."],
  ["KRU02788","KRU02789","אות שניה של אלף בית","בית","The letter Bet versus a house/receptacle; distinct homonymous senses."],
  ["KRU02788","KRU02789","אות שניה של אלף בית","בת, מדת הלח","The letter Bet versus a liquid measure; distinct homonymous senses."],
  ["KRU02859","KRU02860","ציר הדלת","אלון","Door hinge versus oak tree; distinct meanings."],
  ["KRU02859","KRU02860","ציר הדלת","פרי האלון","Door hinge versus acorn; distinct meanings."],
  ["KRU02859","KRU02860","שן המפתח","אלון","Key-bit versus oak tree; distinct meanings."],
  ["KRU02859","KRU02860","שן המפתח","פרי האלון","Key-bit versus acorn; distinct meanings."]
 ].map(([a,b,x,y,reason])=>{
  const ids=[a,b].sort().join('|'),glosses=[normalize(x),normalize(y)].sort().join(' | ');
  return [ids+'::'+glosses,reason];
 }));
 // A cross-reference meaning can be one sense inside a larger numbered part.
 // This reviewed mapping resolves only that exact sub-sense; the other numbered
 // senses remain independent and the original full part stays attached.
 const reviewedSenseSegmentPairRecords=[
  {a:'KRU17474',b:'KRU17475',aMeaning:'הִקְנִיט הרגיז',bPrefix:'כנ״ל',display:'הִקְנִיט הרגיז'}
 ];
 const reviewedSenseSegmentPairRefs=new Set(reviewedSenseSegmentPairRecords.map(pair=>[pair.a,pair.b].sort().join('|')));
 const splitNumberedSenseSegments=value=>{
  const text=String(value||''),matches=[...text.matchAll(/(?:^|\s)(\d+)\)\s*/g)];
  if(matches.length<2||!/^\s*1\)/.test(text))return null;
  return matches.map((match,index)=>{
   const start=match.index+match[0].length,end=matches[index+1]?.index??text.length;
   return text.slice(start,end).trim();
  }).filter(Boolean);
 };
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
  const sourceEntries=(sources||[]).flatMap(source=>source.records||[]);
  for(const source of sources||[])for(const entry of source.records||[])for(const part of entry.parts||[]){
   const text=part.meaning||part.text||'',label=labelKey(part.label),scope=normalize(source.word||word),homonym=homonymNumber(entry.word);
   if(!normalize(text))continue;
   const segmentPair=reviewedSenseSegmentPairRecords.find(pair=>pair.b===entry.rid&&sourceEntries.some(sourceEntry=>sourceEntry.rid===pair.a&&(sourceEntry.parts||[]).some(sourcePart=>normalize(sourcePart.meaning||sourcePart.text)===normalize(pair.aMeaning))));
   const segments=segmentPair?splitNumberedSenseSegments(text):null;
   if(segmentPair&&segments?.length>1&&normalize(segments[0]).startsWith(normalize(segmentPair.bPrefix))){
    prepared.push({source,entry,part,text:segmentPair.display,label,scope,homonym,alternatives:splitAlternatives(segmentPair.display)});
    for(const segment of segments.slice(1))prepared.push({source,entry,part,text:segment,label,scope,homonym,alternatives:splitAlternatives(segment)});
   }else prepared.push({source,entry,part,text,label,scope,homonym,alternatives:splitAlternatives(text)});
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
  const compatibleInScope=(scope,a,b)=>homonymCompatible(a,b,homonymsByScope.get(scope));
  const splitParts=new Set();
  for(let i=0;i<prepared.length;i++)for(let j=i+1;j<prepared.length;j++){
   const a=prepared[i],b=prepared[j];
   if(a.scope!==b.scope||!compatibleInScope(a.scope,a.homonym,b.homonym)||(a.label&&b.label&&a.label!==b.label))continue;
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
    let group=groups.find(g=>g.scope===scope&&compatibleInScope(scope,g.homonym,homonym)&&(!g.label||!label||g.label===label)&&g.items.some(existing=>equivalent(existing,item)));
    if(!group){group={word:entry.word,text:displayMeaning,scope,label,homonym,items:[]};groups.push(group);}
    else if(group.homonym===null&&homonym!==null)group.homonym=homonym;
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
 root.HebrewMeaningConsolidation={merge,normalize,labelKey,canonicalMeaningKey,splitAlternatives,reviewedSynonymPairs,reviewedNonSynonymPairs,reviewedSenseSegmentPairRefs,pairKey,equivalent};
})(typeof window==='undefined'?globalThis:window);
