(function(root){
 'use strict';
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
 async function results(word,selection,options={}){
  const index=root.JASTROW_INDEX,S=root.JastrowSearch,phrase=S.phraseLookup(index,word);
  const maxCandidates=Number.isInteger(options.maxCandidates)?Math.max(1,Math.min(40,options.maxCandidates)):100;
  if(!phrase.ids.length&&S.splitWords(word).length>1){
   if(!S.hasSelectionTranslations(index,word))return [];
   const parts=S.segmentWords(index,word),perPart=Math.max(2,Math.ceil(maxCandidates/Math.max(1,parts.length)));
   const lists=await Promise.all(parts.map(async part=>(await results(part.word,selection,{maxCandidates:perPart})).map(item=>({...item,selectedWord:part.word}))));
   return lists.flat().slice(0,maxCandidates);
  }
  const result=phrase.ids.length?phrase:S.lookup(index,word,maxCandidates,'length',false);
  if(['suggestions','invalid','empty'].includes(result.kind))return [];
  const ids=result.ids.slice(0,maxCandidates);
  const records=(await Promise.all(ids.map(id=>root.JastrowReadingView.records(index,id,load,word,{phrase:phrase.ids.length>0,lookupWord:S.matchingQuery(index,result.prefixMatches,id,word)})))).flat();
  const merged=root.DictionaryMeanings.merge(records,word).map(group=>({
   text:group.text,spelling:group.spelling,
   entryId:group.sources[0]?.id,
   sourceCount:new Set(group.sources.map(source=>source.id)).size,
   // Retain source metadata for the full dictionary; the quick menu shows the
   // spelling and concise gloss, not grammatical labels.
   label:group.form?group.sources[0].meaning.label:'',
  }));
  if(selection&&merged.length){
   merged.forEach((item,i)=>{item.candidateId=String(i);});
   const candidates=merged.map(item=>({id:item.candidateId,text:item.text}));
   const evidence=root.SefariaEvidence?.compareTranslation
    ?await root.SefariaEvidence.compareTranslation(word,candidates,selection,{preparedOnly:true}).catch(()=>({matches:[]}))
    :{matches:[]};
   const matches=Array.isArray(evidence?.matches)?evidence.matches:[];
   const matched=new Map(matches.map(item=>[String(item.id),item]));
   merged.forEach(item=>{const match=matched.get(item.candidateId);if(match){item.translationMatch=true;item.translationPhrase=match.matchedPhrase;item.translationMatchType=match.matchType;item.translationScope=evidence.scope;}});
   const matchScore=match=>match.matchType==='exact'?3:match.matchType==='inflected_phrase'?2:1;
   const score=item=>item.translationMatchType==='exact'?3:item.translationMatchType==='inflected_phrase'?2:item.translationMatchType==='inflected_word'?1:0;
   const sourceHasEvidence=matches.length>0;
   let preferredId=null;
   if(sourceHasEvidence){
    const highest=Math.max(...matches.map(matchScore));
    const winners=[...new Set(matches.filter(match=>matchScore(match)===highest).map(match=>String(match.id)))];
    if(winners.length===1)preferredId=winners[0];
   }else if(evidence.reason==='no_candidate_wording_found'&&root.MesoresHaShas?.propagatedPreference){
    const preparedRank=async(candidateWord,entries,linkedSelection)=>{
     if(!root.SefariaEvidence?.compareTranslation)return null;
     const linkedEvidence=await root.SefariaEvidence.compareTranslation(candidateWord,entries,linkedSelection,{preparedOnly:true});
     const linkedMatches=Array.isArray(linkedEvidence?.matches)?linkedEvidence.matches:[];
     if(!linkedMatches.length)return null;
     const highest=Math.max(...linkedMatches.map(matchScore));
     const winners=[...new Set(linkedMatches.filter(match=>matchScore(match)===highest).map(match=>String(match.id)))];
     return winners.length===1?{preferredEntryId:winners[0],preferenceScope:'contextual'}:null;
    };
    const mesoresPromise=root.MesoresHaShas.propagatedPreference(selection,word,candidates,preparedRank).catch(()=>null);
    const parallel=typeof root.setTimeout==='function'
     ?await new Promise(resolve=>{
       let settled=false;
       const timer=root.setTimeout(()=>{if(!settled){settled=true;resolve(null);}},500);
       Promise.resolve(mesoresPromise).then(value=>{if(!settled){settled=true;root.clearTimeout?.(timer);resolve(value);}},()=>{if(!settled){settled=true;root.clearTimeout?.(timer);resolve(null);}});
      })
     :await mesoresPromise;
    if(parallel?.preferredEntryId)preferredId=String(parallel.preferredEntryId);
   }
   merged.sort((a,b)=>score(b)-score(a));
   if(preferredId){
    const best=merged.findIndex(item=>item.candidateId===preferredId);
    if(best>=0){merged[best].recommended=true;if(best>0)merged.unshift(merged.splice(best,1)[0]);}
   }
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
 async function captureReaderContext(selection){
  if(!selection||typeof selection!=='object')return null;
  const outer=selection;
  const nested=outer.selection&&typeof outer.selection==='object'?outer.selection:outer;
  const context={...nested};
  for(const key of ['currentRef','currentTitle','currentBook','currentBookId','sourceRange','renderedRange','sections']){
   if((context[key]===undefined||context[key]===null||context[key]==='')&&outer[key]!==undefined)context[key]=outer[key];
  }
  const hasReference=!!(context.currentRef||context.sourceRange?.ref||context.sourceRange?.currentRef||
   context.renderedRange?.ref||context.sections?.[0]?.sourceRange?.ref||context.currentTitle||context.reference);
  if(!hasReference&&selection&&typeof selection==='object'){
   try{
    const response=await root.Otzaria.call('reader.getCurrentRef');
    if(response?.success&&response.data){
     for(const [key,value] of Object.entries(response.data))if(context[key]===undefined||context[key]===null||context[key]==='')context[key]=value;
    }
   }catch{}
  }
  return context;
 }
 async function meanings(word,selection){return (await results(word,selection)).map(item=>(item.selectedWord?item.selectedWord+': ':'')+item.text);}
 root.DictionaryQuick={results,meanings,previewCandidates,captureReaderContext};
})(typeof window==='undefined'?globalThis:window);
