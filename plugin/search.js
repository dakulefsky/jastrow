(function(root){
  'use strict';
  function normalize(s){return String(s).normalize('NFKD').replace(/[^\u05d0-\u05ea]/g,'');}
  function validWord(text){const word=String(text).trim();return !!word && word.length<=120 && word.split(/\s+/).length===1 && !/[A-Za-z0-9]/.test(word) && !!normalize(word);}
  function lookup(index, query, limit=100, order='length'){
    if(!validWord(query))return {kind:String(query).trim()?'invalid':'empty',ids:[],total:0};
    const q=normalize(query);if(!q)return {kind:'empty',ids:[],total:0};
    const direct=index.direct[q]||[];
    const forms=index.forms[q]||[],attested=(index.attestedForms?.[q]||[]).map(x=>x.id);
    let ids=[...new Set([...direct,...forms,...attested])];
    let kind=direct.length?'headword':forms.length?'word form':attested.length?'attested form':'suggestions';
    if(!ids.length){
      // Suggestions are spelling matches, never invented translations or inferred roots.
      ids=index.entries.map((e,i)=>({i,n:normalize(e.h)})).filter(e=>e.n.startsWith(q)).map(e=>e.i);
    }
    if(kind!=='suggestions'&&order==='length'&&index.entryLengths){
      const tier=id=>direct.includes(id)?0:attested.includes(id)?1:2;
      ids.sort((a,b)=>tier(a)-tier(b)||(index.entryLengths[b]||0)-(index.entryLengths[a]||0)||a-b);
    }
    return {kind,ids:ids.slice(0,limit),total:ids.length};
  }
  function hasTranslation(index, text){
    const word=String(text).trim();
    if(!validWord(word))return false;
    const q=normalize(word);
    return !!q && !!((index.direct[q]||[]).length || (index.forms[q]||[]).length || (index.attestedForms?.[q]||[]).length);
  }
  const api={normalize,lookup,hasTranslation,validWord};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.JastrowSearch=api;
})(typeof window!=='undefined'?window:globalThis);
