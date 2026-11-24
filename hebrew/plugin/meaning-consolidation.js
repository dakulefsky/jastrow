(function(root){
 'use strict';
 const normalize=value=>root.HebrewLookup.normalize(String(value||''));
 const labelKey=value=>normalize(String(value||'').replace(/\\b\\d+\\b/g,'').trim());
 function merge(sources,word){
  const groups=[];
  for(const source of sources||[])for(const entry of source.records||[])for(const part of entry.parts||[]){
   const text=part.meaning||part.text||'',label=labelKey(part.label),scope=normalize(source.word||word);
   if(!normalize(text))continue;
   let group=groups.find(g=>g.scope===scope&&g.label===label&&normalize(g.text)===normalize(text));
   if(!group){group={word:entry.word,text,scope,label,items:[]};groups.push(group);}
   if(!group.items.some(x=>x.e.rid===entry.rid&&x.p===part))group.items.push({e:entry,p:part,selectedWord:source.word||undefined});
  }
  return groups;
 }
 root.HebrewMeaningConsolidation={merge,normalize,labelKey};
})(typeof window==='undefined'?globalThis:window);
