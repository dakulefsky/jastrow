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
 async function results(word){
  const index=root.JASTROW_INDEX,S=root.JastrowSearch,phrase=S.phraseLookup(index,word);
  if(!phrase.ids.length&&S.splitWords(word).length>1){
   if(!S.hasSelectionTranslations(index,word))return [];
   const lists=await Promise.all(S.segmentWords(index,word).map(async part=>(await results(part.word)).map(item=>({...item,selectedWord:part.word}))));
   return lists.flat();
  }
  const result=phrase.ids.length?phrase:S.lookup(index,word,100,'length',false);
  if(['suggestions','invalid','empty'].includes(result.kind))return [];
  const records=(await Promise.all(result.ids.map(id=>root.JastrowReadingView.records(index,id,load,word,{phrase:phrase.ids.length>0,lookupWord:S.matchingQuery(index,result.prefixMatches,id,word)})))).flat();
  return root.DictionaryMeanings.merge(records,word).map(group=>({
   text:group.text,spelling:group.spelling,
   // Numeric sense numbers are not grammatical qualifications.
   label:group.form?group.sources[0].meaning.label:'',
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
   return (i+1)+'. **'+short(item.text).replace(/\*/g,'')+'**'+(heading?'\n'+heading.replace(/\*/g,''):'');
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
 async function show(word){
  const current=++serial;
  try{
   const items=await results(word);if(current!==serial)return;
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
 root.DictionaryQuick={results,meanings,message,show};
 if(root.Otzaria)root.Otzaria.on('reader.context_menu_item_clicked',p=>p.itemId==='jastrow-lookup'&&show(root.JastrowContext.selectionText(p)));
})(typeof window==='undefined'?globalThis:window);
