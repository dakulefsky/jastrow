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
  ["KRU02859","KRU02860","שן המפתח","פרי האלון","Key-bit versus acorn; distinct meanings."],
  ["KRU02827","KRU02828","1) ילד בפעם הראשונה","בשל (הפרי)","Bearing for the first time versus fruit ripening/maturing; different senses."],
  ["KRU02827","KRU02828","1) ילד בפעם הראשונה","ביכר","Bearing for the first time versus recognizing something as first-born; different grammatical senses."],
  ["KRU02827","KRU02828","1) ילד בפעם הראשונה","כנ״ל. בכור׳ פ״ג מ״ב: המבכירות מניקות.","The first-time-bearing sense is not equivalent to the separate firstborn/citation sense in the Hifil entry."]
,
  ["KRU02878","KRU02879","הרבה","אלף","Quantity adjective 'many/much' versus the numeral one thousand; not synonymous."],
  ["KRU02897","KRU02898","1) עצר, חסם","בעט","To stop or block versus to kick; distinct actions."],
  ["KRU03078","KRU03080","התעקם באמצע ונטה לנפול","הכה ברגל, סרב","Bending/leaning versus kicking or refusing; distinct senses."],
  ["KRU03083","KRU03084","1) פ״י שאל","פיהק","To ask/inquire versus to yawn; unrelated meanings."],
  ["KRU03092","KRU03093","מצופה או סגור במתכת מרכב מבדיל ועופרת","בעץ (שם מתכת)","Tinned or coated with metal versus tin as a metal; adjective/material distinction."],
  ["KRU03133","KRU03135","שרף","פער פיו","To burn versus to open one's mouth wide; distinct verbs."],
  ["KRU03209","KRU03210","ברכה קטנה","בקי","A small pond versus an expert; unrelated senses."],
  ["KRU03228","KRU03229","עדר בקר, רפת הבקר","פחזות, זדון","Cattle herd/cattle-yard versus rashness and malice; distinct meanings."],
  ["KRU03235","KRU03236","1) שדה מחוץ למקום המושב","בן","An outside field versus son/offspring; distinct nouns."],
  ["KRU03293","KRU03294","שם אבן טובה","אור הבוקר","A precious stone versus morning light; distinct referents."],
  ["KRU03441","KRU03442","בשר, גוף","בשורה","Flesh/body versus tidings; unrelated meanings."],
  ["KRU03530","KRU03531","כל ארץ ישראל חוץ מירושלים והמקדש","שם מקום","The land outside Jerusalem and the Temple versus a place-name; distinct senses."],
  ["KRU03545","KRU03546","גבוה","שם צמח","Tall/high versus a plant name; distinct meanings."],
  ["KRU03662","KRU03664","בא בשנים, נהיה גדול","עשה מעשה גדיל, קלע","Growing older versus plaiting/braiding; distinct verbal senses."],
  ["KRU03742","KRU03743","שם מקום","צנור, תעלה","A place-name versus a pipe/channel; distinct referents."],
  ["KRU03862","KRU03863","גדוד","כותל","A troop/band versus a wall; unrelated nouns."],
  ["KRU03936","KRU03937","דבורה","שם עוף טורף","A bee versus a bird of prey; distinct animals."],
  ["KRU03993","KRU03994","נתח, חתיכה","עדר צאן","A piece/portion versus a flock of sheep; distinct meanings."],
  ["KRU04029","KRU04030","גבור","אבר הזכרות","A strong man/hero versus the male organ; distinct senses."],
  ["KRU04039","KRU04040","מין גרגר זרעונים","צמח מר וחריף, מין לענה","A seed/grain versus a bitter herb/wormwood; distinct plants."],
  ["KRU04071","KRU04072","זר","נואף","A stranger versus an adulterer; distinct social categories."],
  ["KRU04118","KRU04119","שנות האדם, תקופת החיים, חבורת אנשים שנולדו בזמן אחד","לשון הפעמון","Age/cohort versus a bell clapper; unrelated meanings."],
  ["KRU04153","KRU04154","מטָעה במגרש העיר","שם נהר","A garden plot within a town versus a river-name; distinct referents."],
  ["KRU04171","KRU04172","מקורב, רגיל אצל־","בעל אחות האשה","An intimate/familiar person versus a brother-in-law; related social context but not synonyms."],
  ["KRU04202","KRU04203","מין חולי","חץ","A disease versus an arrow/projectile; distinct meanings."],
  ["KRU04312","KRU04313","שם מדינה (באירופא)","התגלות","The country of the Gauls versus revelation; unrelated senses."],
  ["KRU04383","KRU04384","שלם","כלייה","Complete/perfect versus destruction; distinct meanings."],
  ["KRU04399","KRU04401","בלע משקה","חפר בור","To sip/suck up liquid versus to dig a pit; distinct actions."],
  ["KRU04435","KRU04436","זנב","גניבה","Tail versus theft/stolen object; unrelated senses."],
  ["KRU04557","KRU04558","זולל וסובא, להוט אחרי שתיה","בהשאלה: להוט אחרי תשמיש","A glutton/drinker versus sexual appetite; distinct senses."],
  ["KRU04579","KRU04580","חלק הגוף מן הצואר עד החזה","אשה שנתיהדה","The throat/neck region versus a woman who converted; distinct meanings."],
  ["KRU04649","KRU04650","מאכל הלעוס החוזר מן הקיבה אל הפה, גֵרה","על ידי המשך הדבור, דרך אגב","Cud/regurgitated food versus an incidental aside in speech; unrelated meanings."],
  ["KRU04653","KRU04654","הוציא, הרחיק, נתן גט לאשה","העלה, משך למעלה","To expel/divorce versus to hoist/pull upward; distinct actions."],
  ["KRU04870","KRU04871","מנהיג ונשיא","מקום","A leader/chief versus a place; distinct meanings."],
  ["KRU04926","KRU04928","מין חולי בעין","מוץ","An eye disease versus chaff; unrelated nouns."],
  ["KRU05060","KRU05061","האח!","צער","An exclamation ('Ah!') versus grief/sorrow; distinct meanings."],
  ["KRU05113","KRU05114","יושב בדירה","גר","A lodger versus a proselyte; distinct social/legal categories."],
  ["KRU05145","KRU05146","שמא, אולי","עובדה","Perhaps/maybe versus a fact; distinct meanings."],
  ["KRU05203","KRU05204","שמחה","כאב דוקר בעין","Joy versus a stabbing pain in the eye; unrelated meanings."],
  ["KRU05234","KRU05235","זֵר","רפת","A crown/wreath versus a stable; unrelated objects."],
  ["KRU05682","KRU05683","כראוי","אוגן, שפה לכלי","Properly/appropriately versus the rim of a vessel; distinct meanings."],
  ["KRU05714","KRU05715","עלה התמר","שם מקום","A palm leaf versus a place-name; distinct referents."],
  ["KRU05777","KRU05778","זה, זאת","איזה?","This/that (demonstrative) versus which? (interrogative); distinct grammatical meanings."],
  ["KRU05954","KRU05955","קבל הנאה ותועלת","פיעל, הֶהֱנָה הפ׳, גרם הנאה","To enjoy/benefit versus to cause another to benefit; different valency and voice."],
  ["KRU06019","KRU06020","נציב","אצטדין למרוץ","A governor/official versus a race-course; unrelated meanings."]
 ].map(([a,b,x,y,reason])=>{
  const ids=[a,b].sort().join('|'),glosses=[normalize(x),normalize(y)].sort().join(' | ');
  return [ids+'::'+glosses,reason];
 }));
 // Ambiguous Hebrew pairs retained for later source-level review; no runtime merge is implied.
 const deferredSynonymPairs=new Map([
  ["KRU12499","KRU12500","התרומם","התנופף ברוח","Deferred: the source meanings 'to rise/swing oneself' and 'to wave in the wind' are related motions but not demonstrably equivalent; the cited passages differ."],

 ].map(([a,b,x,y,reason])=>{
  const ids=[a,b].sort().join('|'),glosses=[normalize(x),normalize(y)].sort().join(' | ');
  return [ids+'::'+glosses,reason];
 }));
 // A cross-reference meaning can be one sense inside a larger numbered part.
 // This reviewed mapping resolves only that exact sub-sense; the other numbered
 // senses remain independent and the original full part stays attached.
 const reviewedSenseSegmentPairRecords=[
  {a:'KRU17474',b:'KRU17475',aMeaning:'הִקְנִיט הרגיז',bPrefix:'כנ״ל',display:'הִקְנִיט הרגיז'},
  {a:'KRU20037',b:'KRU20038',aMeaning:'הִתְקִיל נכשל',bPrefix:'נכשל',bSenseIndex:1,useFullText:true,display:'הִתְקִיל נכשל'}
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
   const label=labelKey(part.label),scope=normalize(source.word||word),homonym=homonymNumber(entry.word);
   const segmentPair=reviewedSenseSegmentPairRecords.find(pair=>pair.b===entry.rid&&sourceEntries.some(sourceEntry=>sourceEntry.rid===pair.a&&(sourceEntry.parts||[]).some(sourcePart=>normalize(sourcePart.meaning||sourcePart.text)===normalize(pair.aMeaning))));
   const text=segmentPair?.useFullText&&part.text?part.text:(part.meaning||part.text||'');
   if(!normalize(text))continue;
   const segments=segmentPair?splitNumberedSenseSegments(text):null;
   const targetIndex=segmentPair?.bSenseIndex??0;
   if(segmentPair&&segments?.length>targetIndex&&normalize(segments[targetIndex]).startsWith(normalize(segmentPair.bPrefix))){
    if(segmentPair.useFullText){
     const originalMeaning=part.meaning||'';
     if(normalize(originalMeaning)&&normalize(originalMeaning)!==normalize(segmentPair.display))prepared.push({source,entry,part,text:originalMeaning,label,scope,homonym,alternatives:splitAlternatives(originalMeaning)});
     prepared.push({source,entry,part,text:segmentPair.display,label,scope,homonym,alternatives:splitAlternatives(segmentPair.display)});
    }else{
     prepared.push({source,entry,part,text:segmentPair.display,label,scope,homonym,alternatives:splitAlternatives(segmentPair.display)});
     for(const [index,segment] of segments.entries())if(index!==targetIndex)prepared.push({source,entry,part,text:segment,label,scope,homonym,alternatives:splitAlternatives(segment)});
    }
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
 root.HebrewMeaningConsolidation={merge,normalize,labelKey,canonicalMeaningKey,splitAlternatives,reviewedSynonymPairs,reviewedNonSynonymPairs,deferredSynonymPairs,reviewedSenseSegmentPairRefs,pairKey,equivalent};
})(typeof window==='undefined'?globalThis:window);
