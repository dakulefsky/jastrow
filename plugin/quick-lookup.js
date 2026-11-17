(function(root){
 'use strict';
 let serial=0;
 const loads=new Map();
 root.JASTROW_CHUNKS=root.JASTROW_CHUNKS||{};
 function load(n){
  if(root.JASTROW_CHUNKS[n])return Promise.resolve(root.JASTROW_CHUNKS[n]);
  if(!loads.has(n)){
   const p=new Promise((resolve,reject)=>{
    const s=document.createElement('script');s.src='data/'+(n>=1000?'krupnik-':'chunk-')+n+'.js';
    s.onload=()=>{s.remove();root.JASTROW_CHUNKS[n]?resolve(root.JASTROW_CHUNKS[n]):reject(Error('Missing chunk'));};
    s.onerror=()=>{s.remove();reject(Error('Chunk unavailable'));};document.head.append(s);
   });
   loads.set(n,p);p.catch(()=>loads.delete(n));
  }
  return loads.get(n);
 }
 async function results(word,selection){
  const index=root.JASTROW_INDEX,S=root.JastrowSearch,phrase=S.phraseLookup(index,word);
  if(!phrase.ids.length&&S.splitWords(word).length>1){
   if(!S.hasSelectionTranslations(index,word))return [];
   const lists=await Promise.all(S.segmentWords(index,word).map(async part=>(await results(part.word)).map(item=>({...item,selectedWord:part.word}))));
   return lists.flat();
  }
  const result=phrase.ids.length?phrase:S.lookup(index,word,100,'length',false);
  if(['suggestions','invalid','empty'].includes(result.kind))return [];
  let ids=result.ids;
  const records=(await Promise.all(ids.map(id=>root.JastrowReadingView.records(index,id,load,word,{phrase:phrase.ids.length>0,lookupWord:S.matchingQuery(index,result.prefixMatches,id,word)})))).flat();
  const merged=root.DictionaryMeanings.merge(records,word).map(group=>({
   text:group.text,spelling:group.spelling,
   // Numeric sense numbers are not grammatical qualifications.
   label:group.form?group.sources[0].meaning.label:'',
  }));
  if(selection&&root.SefariaEvidence?.compareTranslation){
   const evidence=await root.SefariaEvidence.compareTranslation(word,merged.map((item,i)=>({id:String(i),text:item.text})),selection);
   const matched=new Map((evidence.matches||[]).map(item=>[item.id,item]));
   merged.forEach((item,i)=>{const match=matched.get(String(i));if(match){item.translationMatch=true;item.translationPhrase=match.matchedPhrase;item.translationMatchType=match.matchType;item.translationScope=evidence.scope;}});
  }
  return merged;
 }
 async function previewCandidates(word,result){
  const index=root.JASTROW_INDEX,S=root.JastrowSearch;
  return Promise.all((result?.ids||[]).map(async id=>{
   try{
    const lookupWord=S.matchingQuery(index,result.prefixMatches,id,word);
    const records=await root.JastrowReadingView.records(index,id,load,word,{lookupWord});
    const meaning=records.flatMap(record=>record.meanings||[]).find(item=>item.text)?.text||'';
    return {id,meaning};
   }catch{return {id,meaning:''};}
  }));
 }
 async function meanings(word){
  return (await results(word)).map(item=>(item.selectedWord?item.selectedWord+': ':'')+item.text);
 }
 function message(word,items,prefixed=false){
  const short=s=>s.length>180?s.slice(0,177)+'…':s;
  const lines=items.slice(0,2).map((item,i)=>{
   if(typeof item==='string')return (i+1)+'. **'+short(item).replace(/\*/g,'')+'**';
   const heading=[item.selectedWord,item.spelling,item.label].filter((s,n,a)=>s&&a.indexOf(s)===n).join(' · ');
   return (i+1)+'. **'+short(item.text).replace(/\*/g,'')+'**'+(heading?'\n'+heading.replace(/\*/g,''):'')+(item.translationMatch?'\nSteinsaltz wording: “'+item.translationPhrase+'”'+(item.translationScope==='paragraph'?' (this paragraph).':' (this daf).'):'');
  });
  return [word+(prefixed?' — possible '+(typeof prefixed==='string'?prefixed:'prefixed form'):''),...lines,
   ...(prefixed?['Base-word meanings; check the grammatical form in context.']:[]),
   items.length>2?'More meanings — click to open dictionary':'Click for full entry and sources'].join('\n');
 }
 function formKind(word){
  const S=root.JastrowSearch,index=root.JASTROW_INDEX;
  const analyses=S.segmentWords(index,word).filter(part=>!part.result).map(part=>S.lookup(index,part.word));
  const prefix=analyses.some(r=>r.kind==='prefixed form');
  const ending=analyses.some(r=>r.kind==='inflected form'||r.prefixMatches?.some(m=>m.suffix!==undefined));
  return prefix&&ending?'prefixed form; possible inflected form':ending?'inflected form':prefix?'prefixed form':false;
 }
 async function show(word,selection){
  const current=++serial;
  if(String(word).trim().toLowerCase()==='who created this?'){
   try{await root.Otzaria.call('ui.showMessage',{message:'Daniel Avrahom'});}catch{console.warn('Quick dictionary lookup unavailable');}
   return;
  }
  try{
   const items=await results(word,selection);if(current!==serial)return;
   if(!items.length){
    if(!root.JastrowSearch.hasSelectionTranslations(root.JASTROW_INDEX,word))return;
    await root.Otzaria.call('ui.showMessage',{message:word+'\nNo short meaning is available. Click to open the dictionary entry and references.',tapPayload:{dictionaryWord:word},tapOpenPlugin:true});return;
   }
   const res=await root.Otzaria.call('ui.showMessage',{message:message(word,items,formKind(word)),tapPayload:{dictionaryWord:word},tapOpenPlugin:true});
   if(res?.success===false)console.warn('Quick dictionary lookup unavailable; use Open dictionary.');
  }catch{
   if(current===serial){
    console.warn('Quick dictionary lookup failed; use Open dictionary.');
    await root.Otzaria.call('ui.showMessage',{message:word+'\nThe quick result could not load. Click to open the dictionary.',tapPayload:{dictionaryWord:word},tapOpenPlugin:true});
   }
  }
 }
 root.DictionaryQuick={results,meanings,message,show,previewCandidates};
 if(root.Otzaria)root.Otzaria.on('reader.context_menu_item_clicked',async p=>{
  const word=root.JastrowContext.selectionText(p);
  if(p.itemId==='jastrow-lookup'){await show(word,p.selection);return;}

 });
})(typeof window==='undefined'?globalThis:window);
