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
 function compatible(a,b,word){
  // Consonantal identity is required for every lookup. Only enforce vowel
  // agreement when the user's query supplied vowels; unpointed lookup should
  // still combine the same consonantal headword across source vocalizations.
  if(S.normalize(a)!==S.normalize(b))return false;
  if(!S.hasVowels(word))return true;
  const aa=S.markedLetters(a),bb=S.markedLetters(b);
  return aa.every((x,i)=>!x.marks.length||!bb[i].marks.length||x.marks.join('')===bb[i].marks.join(''));
 }
 const reviewedSourceGlossPairs=new Set([
  ['KRU11703','E00635','softening','melting, softening'],
  ['KRU03578','C00617','hump, height','hump'],
  ['KRU03629','C00640','blasphemy','blasphemy, reviling'],
  ['KRU03783','C00540','cut wool','wool-shearing'],
  ['KRU03931','C00509','wheat flour of the second course','wheat flour of the second course, dark flour'],
  ['KRU03950','C00532','circumciser','circumciser, surgeon.'],
  ['KRU03955','C00537','to be cut, to be shorn, to be trimmed','to be cut, trimmed, shorn.'],
  ['KRU03956','C00537','to cut, to shear','to cut, shear'],
  ['KRU03956','C00538','to cross, to pass','to cross, pass'],
  ['KRU03958','C00541','to go out of one’s way','to pass, go out of one’s way'],
  ['KRU03985','C00568','to cut branches off, to tap','to cut branches off'],
  ['KRU03989','C00573','to be decreed','to be decreed, ordained'],
  ['KRU03990','C00574','to cut, to split','to cut, split'],
  ['KRU03994','C00578','sheep in folds, flock','sheep in folds, fold, flock'],
  ['KRU04003','C00590','to laugh, to jest','to laugh, jest'],
  ['KRU04022','C00610','top, back','back, top'],
  ['KRU04040','C00629','a bitter herb, worm-wood','worm-wood, bitter herb'],
  ['KRU04043','C00631','full of incisions','full of incisions, wrinkled'],
  ['KRU04048','C00638','ravines','valleys, ravines'],
  ['KRU04055','C00645','one whose hand or fingers are cut off or stumped','one whose hand or fingers are cut off'],
  ['KRU04058','C00648','flame','flame, light'],
  ['KRU04059','C00649','pond','cavity, pond'],
  ['KRU04061','C00652','flame-red','flame-colored'],
  ['KRU04062','C00654','hell, place of punishment of the wicked in the hereafter','place of punishment of the wicked in the hereafter, hell'],
  ['KRU04067','C00659','inhabitants of Coptos (Upper Egypt)','inhabitants of Coptos'],
  ['KRU04080','C00673','haughty, proud','haughty, proud man'],
  ['KRU04082','C00675','pride','pride, haughtiness'],
  ['KRU04088','C00682','tapping','cutting, tapping'],
  ['KRU04099','C00690','to attack, to fight','to attack, fight'],
  ['KRU04108','C00700','to manifest power, to treat with vigor','to manifest power, treat with rigor'],
  ['KRU04109','C00701','he who had his arteries opened','he who had his arteries opened, bled to death.'],
  ['KRU04112','C00708','troop, invaders, robbers','ravaging troop, invaders, robbers'],
  ['KRU04117','C00714','adultery','adultery, whoredom'],
  ['KRU04119','C00717','clapper of a bell','ball, clapper of a bell'],
  ['KRU04132','C00726','the glowing horizon','flashes, the glowing horizon'],
  ['KRU04145','C00741','the use of letters for their numerical value (in homiletic interpretation)','the use of letters for their numerical value; homiletic interpretation based on the numerical value of letters'],
  ['KRU04149','C00747','for the sake of, in order that','for the sake of, on account of; in order that'],
  ['KRU04150','C00746','to cover, to protect','to cover, surround with; to protect'],
  ['KRU04173','C00777','side, neighbourhood','neighborhood, side'],
  ['KRU04173','C00777','trnsf. way, manner','way, manner'],
  ['KRU04174','C00778','agony of death','agony of death, dying stage'],
  ['KRU04175','C00779','a large vessel which turned out defective','a large vessel which turned out defective or unwieldy'],
  ['KRU04185','C00791','embracing','embracing, hugging'],
  ['KRU04186','C00792','rim, railing','railing, rim'],
  ['KRU04199','C00803','for, as a consequence','as a consequence, for'],
  ['KRU04200','C00805','lime','lime, plaster.'],
  ['KRU04200','C00805','froth','froth, foam.'],
  ['KRU04201','C00806','arrow','projectile, arrow'],
  ['KRU04203','C00806','projectile','projectile, arrow'],
  ['KRU04205','C00810','shooter, arrow-maker','arrow-maker'],
  ['KRU04207','C00814','scraping, rind','rind'],
  ['KRU04212','C00820','provocation, stirring up','instigation, provocation, stirring up'],
  ['KRU05829','E00659','calculation of proportions','mark; calculation of proportions'],
  ['KRU05838','E00695','banqueting (around the table)','placing the divans around the table;'],
  ['KRU05894','E00559','these, those','these, those, these things'],
  ['KRU05911','E00586','doing late','doing late, procrastination'],
  ['KRU05919','E00607','belt, girdle','belt'],
  ['KRU05921','E00611','melancholic, confused in mind','confused in mind, delirious'],
  ['KRU05927','E00625','sweepings','sweepings, refuse'],
  ['KRU05944','E00653','objection','intervention, objection'],
  ['KRU05944','E00678','pleasure, benefit','enjoyment, pleasure, benefit'],
  ['KRU05954','E00675','to enjoy, to profit','to be pleased, to enjoy, to profit'],
  ['KRU05955','E00675','to benefit, to cause to share','to benefit, to entertain, to cause to share'],
  ['KRU05959','E00673','putting down','putting down, depositing, laying down'],
  ['KRU05984','E00711','enticement','seduction, enticement'],
  ['KRU05987','E00714','testimony','testimony, deposition'],
  ['KRU05991','E00716','wrapping, throwing over one’s shoulders','throwing over one’s shoulders, wrapping'],
  ['KRU05992','E00717','unconsciousness','unconsciousness, forgetfulness'],
  ['KRU05993','E00719','placing, appearance','placing, being placed, appearance'],
  ['KRU05994','E00724','first stage of sexual connection','sexual contact, the first stage of sexual connection'],
  ['KRU06004','E00736','displacing','upturning, displacing'],
  ['KRU06007','E00741','to turn','to turn, change'],
  ['KRU06014','E00755','interruption, ceasing','ceasing, interruption, interval'],
  ['KRU06017','E00759','public property','confiscation; public property.'],
  ['KRU06019','E00763','governor','governor, lieutenant'],
  ['KRU06024','E00769','flaying','stripping, flaying'],
  ['KRU06033','E00786','laying out of mattresses, carpets','making a couch, laying out of mattresses, carpets'],
  ['KRU06041','E00791','burning on the altar','letting rise in smoke, burning on the altar'],
  ['KRU06049','E00800','going round','surrounding, going round'],
  ['KRU06053','E00811','coupling of heterogenous animals','coupling of heterogeneous animals'],
  ['KRU06055','E00814','execution by decapitation','execution by decapitation with a sword'],
  ['KRU06056','E00817','habit, fluency','habit;'],
  ['KRU06056','E00817','leading to','leading to, occasion for'],
  ['KRU06057','E00820','sensation, sense','sense'],
  ['KRU06070','E00853','washing','washing, bathing'],
  ['KRU06074','E00858','here is, behold','behold, here is'],
  ['KRU06080','E00867','grits','grits, polenta'],
  ['KRU06081','E00870','carrying on one’s shoulder','on one’s shoulder'],
  ['KRU06084','E00875','nodding','nodding assent'],
  ['KRU06085','E00876','removal','lifting, removal'],
  ['KRU06097','E00899','lecture, discourse','discourse'],
  ['KRU06101','E00909','giving back','restoring, giving back'],
  ['KRU06107','E00916','getting up early','getting up early; early work, study'],
  ['KRU06112','E00923','early rising','early rising, early morning hour'],
  ['KRU06121','E00934','plenty','plenty, liberality'],
  ['KRU06127','E00940','since, if','since, when, if'],
  ['KRU06130','E00946','cutting off','knocking off, cutting off'],
  ['KRU06138','E00957','untying','untying, loosening'],
  ['KRU06172','F00031','woe, oh!','oh! woe!'],
  ['KRU06178','F00041','curtain','door-curtain, curtain'],
  ['KRU06185','F00055','debility','senility, debility'],
  ['KRU06186','F00056','remnant','rest, remnant'],
  ['KRU06190','F00071','meeting','meeting, appointment'],
  ['KRU06206','F00109','a certain pastry','certain pastry, tart'],
  ['KRU06207','F00115','to forgive','to be indulgent, forgive'],
  ['KRU06769','H00347','entrenchment around a well','the entrenchment around a well'],
  ['KRU06769','H00348','something sweet','something sweet, sweetness'],
  ['KRU06797','H00397','one of the five books of Moses','Ḥomesh, one of the five books of Moses'],
  ['KRU06813','H00418','to cleanse, to rub','to rub, cleanse'],
  ['KRU06827','H00443','to make clear, to make evident','to make clear, evident'],
  ['KRU06847','H00487','to be affected','to feel pain, be affected'],
  ['KRU06867','H00525','to see','to discern, see'],
  ['KRU06872','H00532','grip of the hand','the grip of the hand'],
  ['KRU06883','H00550','to nip off','to cut off, nip off'],
  ['KRU06886','H00553','to be presumed, to be known for','to be presumed, be held for, be known for'],
  ['KRU06886','H00554','to take possession','to take possession, to claim possession'],
  ['KRU06890','H00561','to go around','to surround, go around'],
  ['KRU06918','H00608','to dig, to hollow out','to dig, hollow out'],
  ['KRU06930','H00631','sin, misconduct','sin, misconduct, failing'],
  ['KRU06936','H00639','to be snatched','to be snatched, hurried'],
  ['KRU06939','H00644','to strike','to whip, strike'],
  ['KRU06945','H00653','loved object','love; loved object'],
  ['KRU06962','H00673','lying-in-woman','lying-in woman, woman in confinement.'],
  ['KRU07008','H00765','redemption of sacred objects','redemption of sacred objects, secularization'],
  ['KRU07009','H00766','outsider, stranger, non-priest','outsider, stranger, non-priest, non-Israelite'],
  ['KRU07034','H00803','fermentation, becoming sour','becoming sour, fermentation, leavening'],
  ['KRU07097','H00902','concluding formula of a benediction in the prayer','the formula with which a prayer closes, concluding benediction'],
  ['KRU07101','H00915','to fish with the angle','to insert a hook, to fish with the angle, to fasten'],
  ['KRU07578','H01733','potter’s clay','potter’s clay, clay-ground.'],
  ['KRU07583','H01740','to revile','to blaspheme, revile'],
  ['KRU07583','H01740','to be quick','to be quick, be early'],
  ['KRU07586','H01749','to cut a trench','to dig a cavity, to cut a trench'],
  ['KRU07589','H01758','kernel, stone of a fruit','stones of a fruit'],
  ['KRU07591','H01760','to gnash the teeth','to gnash, grind the teeth'],
  ['KRU07593','H01767','to set free','to be set free'],
  ['KRU07596','H01778','to make deaf','to deafen, make deaf'],
  ['KRU07597','H01779','to be entangled','to be entangled, confounded'],
  ['KRU07607','H01804','stillness, secret','whispering, stillness, secret'],
  ['KRU07621','H01826','to be silent','be silent, quiet'],
  ['KRU07621','H01827','to feel','to feel, suffer'],
  ['KRU07631','H01847','to be dark','to become dark'],
  ['KRU07632','H01847','to darken','to darken, obscure'],
  ['KRU07633','H01846','to spare, withold','to spare, withhold'],
  ['KRU07636','H01858','to plan','to plan, design'],
  ['KRU07645','H01865','to bandage, to saddle','to bandage, saddle, harness'],
  ['KRU07649','H01868','to take into consideration','to apprehend, take into consideration'],
  ['KRU07649','H01868','to feel pain','to feel heavy, feel pain'],
  ['KRU07660','H01881','to put down','to put down, rest']
 ].filter(pair=>Array.isArray(pair)&&pair.length===4).map(pair=>{const [a,b,x,y]=pair;return [a,b].sort().join('|')+'::'+[clean(x),clean(y)].sort().join(' | ');}));
 function reviewedEquivalent(source,item){
  if(!compatible(source.spelling,item.spelling))return false;
  const ids=[source.entry.r,item.entry.r].sort().join('|');
  const glosses=[clean(source.meaning.text),clean(item.meaning.text)].sort().join(' | ');
  return (ids==='A03220|KRU02095'&&glosses==='accident, occurrence | in accident')||
   reviewedSourceGlossPairs.has(ids+'::'+glosses);
 }
 function compatibleForm(a,b){
  // A missing source label is unknown, not evidence of a different grammatical sense.
  // Two explicit, conflicting labels remain separate.
  return !a||!b||a===b;
 }
 function sameMeaning(group,item,word){
  const itemForm=stem(item.meaning.label);
  if(!compatibleForm(group.form,itemForm)||!group.sources.every(s=>compatible(s.spelling,item.spelling,word)))return false;
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
