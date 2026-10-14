(function(root){
  'use strict';
  function normalize(s){return String(s).normalize('NFKD').replace(/[^\u05d0-\u05ea]/g,'');}
  function lookup(index, query, limit=100){
    const q=normalize(query);if(!q)return {kind:'empty',ids:[],total:0};
    const direct=index.direct[q]||[];
    const forms=index.forms[q]||[];
    let ids=[...new Set([...direct,...forms])];
    let kind=direct.length?'headword':forms.length?'word form':'suggestions';
    if(!ids.length){
      // Suggestions are spelling matches, never invented translations or inferred roots.
      ids=index.entries.map((e,i)=>({i,n:normalize(e.h)})).filter(e=>e.n.startsWith(q)).map(e=>e.i);
    }
    return {kind,ids:ids.slice(0,limit),total:ids.length};
  }
  function hasTranslation(index, text){
    const word=String(text).trim();
    if(!word || word.split(/\s+/).length!==1 || /[A-Za-z0-9]/.test(word))return false;
    const q=normalize(word);
    return !!q && !!((index.direct[q]||[]).length || (index.forms[q]||[]).length);
  }
  const api={normalize,lookup,hasTranslation};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.JastrowSearch=api;
})(typeof window!=='undefined'?window:globalThis);
