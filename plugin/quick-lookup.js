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
   const lists=await Promise.all(parts.map(async part=>{
    const items=await results(part.word,selection,{maxCandidates:perPart});
    const mapped=items.map(item=>({...item,selectedWord:part.word}));
    mapped.hasMore=items.hasMore===true;
    return mapped;
   }));
   const combined=lists.flat().slice(0,maxCandidates);
   combined.hasMore=lists.some(list=>list.hasMore)||lists.reduce((count,list)=>count+list.length,0)>maxCandidates;
   return combined;
  }
  const result=phrase.ids.length?phrase:S.lookup(index,word,maxCandidates,'length',false);
  if(['suggestions','invalid','empty'].includes(result.kind))return [];
  const ids=result.ids.slice(0,maxCandidates);
  const hasMore=Number.isFinite(result.total)&&result.total>ids.length;
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
   let evidence=root.SefariaEvidence?.compareTranslation
    ?await root.SefariaEvidence.compareTranslation(word,candidates,selection,{preparedOnly:true}).catch(()=>({matches:[]}))
    :{matches:[]};
   // A selection can arrive before the background daf prefetch finishes.
   // In that case, load the same bundled offline passage on demand rather
   // than silently suppressing the recommendation for this lookup.
   if(evidence?.reason==='not_prepared'&&root.SefariaEvidence?.compareTranslation){
    evidence=await root.SefariaEvidence.compareTranslation(word,candidates,selection,{preparedOnly:false}).catch(()=>evidence);
   }
   const matches=Array.isArray(evidence?.matches)?evidence.matches:[];
   const matched=new Map(matches.map(item=>[String(item.id),item]));
   merged.forEach(item=>{const match=matched.get(item.candidateId);if(match){item.translationMatch=true;item.translationPhrase=match.matchedPhrase;item.translationMatchType=match.matchType;item.translationScope=evidence.scope;}});
   // Rank evidence by match quality AND how much of the gloss is actually
   // supported. A specific multi-word gloss is stronger than an incidental
   // one-word collision, even when both are technically exact matches.
   const evidenceScore=match=>{
    const base=match.matchType==='exact'?300:match.matchType==='inflected_phrase'?200:match.matchType==='inflected_word'?100:0;
    const phrase=String(match.candidatePhrase||'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').trim().split(/\s+/).filter(Boolean);
    const stop=new Set('a an the and or of to in on at by for from with as is are was were be been being do does did have has had it this that these those'.split(' '));
    const content=phrase.filter(token=>!stop.has(token));
    return base+Math.min(content.length,8)*12+Math.min(phrase.length,8);
   };
   const score=item=>item.translationMatchType==='exact'?300:item.translationMatchType==='inflected_phrase'?200:item.translationMatchType==='inflected_word'?100:0;
   const sourceHasEvidence=matches.length>0;
   let preferredId=null;
   if(sourceHasEvidence){
    const ranked=matches.map(match=>({id:String(match.id),score:evidenceScore(match)})).sort((a,b)=>b.score-a.score);
    // Only suppress the star when the best evidence is genuinely equal.
    if(ranked[0].score>0&&(ranked.length===1||ranked[0].score>ranked[1].score))preferredId=ranked[0].id;
   }
   merged.sort((a,b)=>score(b)-score(a));
   if(preferredId){
    const best=merged.findIndex(item=>item.candidateId===preferredId);
    if(best>=0){merged[best].recommended=true;if(best>0)merged.unshift(merged.splice(best,1)[0]);}
   }
  }
  // Preserve the lookup's overflow count even when duplicate source entries
  // merge into fewer visible meaning groups than the fetched candidate cap.
  merged.hasMore=hasMore;
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
