(function(root){
  'use strict';
  function normalize(s){return String(s).normalize('NFKD').replace(/[^\u05d0-\u05ea]/g,'');}
  function markedLetters(text){
    const letters=[];
    for(const ch of String(text).normalize('NFKD')){
      if(/[א-ת]/.test(ch))letters.push({letter:ch,marks:[]});
      else if(/[\u05b0-\u05bc\u05c1\u05c2\u05c7]/.test(ch)&&letters.length)letters[letters.length-1].marks.push(ch);
    }
    return letters;
  }
  function hasVowels(text){return markedLetters(text).some(l=>l.marks.length);}
  function vowelRank(entry,query){
    const q=markedLetters(query);if(!q.some(l=>l.marks.length))return 0;
    const words=[entry.h,...(entry.alt||[])].filter(w=>normalize(w)===normalize(query));
    if(!words.length)return 1;
    return Math.min(...words.map(w=>{
      const candidate=markedLetters(w);let unknown=false;
      for(let i=0;i<q.length;i++)if(q[i].marks.length){
        if(!candidate[i]?.marks.length){unknown=true;continue;}
        if(q[i].marks.some(mark=>!candidate[i].marks.includes(mark)))return 2;
      }
      return unknown?1:0;
    }));
  }
  function validWord(text){const word=String(text).trim();return !!word && word.length<=120 && word.split(/\s+/).length===1 && !/[A-Za-z0-9]/.test(word) && !!normalize(word);}
  function indexedMatches(index,q){return [...new Set([...(index.direct[q]||[]),...(index.forms[q]||[]),...(index.attestedForms?.[q]||[]).map(x=>x.id)])];}
  function prefixMatches(index,query){
    const letters=markedLetters(query),q=normalize(query),matches=[];
    // Attached conjunction/relative marker/preposition/article, in that order.
    // These are possible analyses, not new dictionary-attested word forms.
    // Never remove internal letters, a verbal nun, or arbitrary suffixes.
    for(let n=1;n<=4&&q.length-n>=2;n++){
      const prefix=q.slice(0,n);if(!/^ו?[דש]?[בכלמ]?ה?$/.test(prefix))continue;
      const base=q.slice(n),baseQuery=letters.slice(n).map(l=>l.letter+l.marks.join('')).join('');
      for(const id of indexedMatches(index,base))matches.push({id,prefix,base,baseQuery});
    }
    return matches;
  }
  function endingMatches(index,query){
    if(!index.inflections)return [];
    const letters=markedLetters(query),q=normalize(query),matches=[],medial=s=>s.replace(/[ךםןףץ]/g,c=>({'ך':'כ','ם':'מ','ן':'נ','ף':'פ','ץ':'צ'})[c]);
    for(let n=0;n<=4&&q.length-n>=3;n++){
      const prefix=q.slice(0,n);if(n&&!/^ו?[דש]?[בכלמ]?ה?$/.test(prefix))continue;
      const word=q.slice(n);
      for(const rule of index.inflections.rules)for(const suffix of rule.endings){
        if(!word.endsWith(suffix))continue;
        const stem=word.slice(0,-suffix.length);if(stem.length<2)continue;
        for(const item of index.inflections.stems[medial(stem)]||[]){
          if(item.family!==rule.family)continue;
          // Keep vowels on retained consonants; final-letter restoration and
          // dictionary emphatic aleph do not invent vowel marks.
          const retained=letters.slice(n,n+stem.length);
          const baseQuery=[...item.base].map((c,i)=>c+(retained[i]?.marks.join('')||'')).join('');
          matches.push({...item,prefix,suffix,baseQuery,label:rule.label});
        }
      }
      // Consonant-preserving imperfect forms: one verbal person/modal prefix,
      // optionally followed by a plural ending. Do not infer weak-root changes.
      if(index.inflections.verbalPrefixes.includes(word[0]))for(const suffix of index.inflections.imperfectEndings){
        if(suffix&&!word.endsWith(suffix))continue;
        const stem=word.slice(1,suffix?-suffix.length:undefined);if(stem.length<3)continue;
        for(const item of index.inflections.stems[medial(stem)]||[]){
          if(item.family!=='verb')continue;
          const retained=letters.slice(n+1,n+1+stem.length);
          const baseQuery=[...item.base].map((c,i)=>c+(retained[i]?.marks.join('')||'')).join('');
          matches.push({...item,prefix:prefix+word[0],suffix,baseQuery,label:'possible verb form'});
        }
      }
    }
    return matches;
  }
  function matchingQuery(index,matches,id,query){
    const entry={...index.entries[id],alt:index.aliases?.[id]||[]};
    const choices=(matches||[]).filter(m=>m.id===id);
    choices.sort((a,b)=>vowelRank(entry,a.baseQuery)-vowelRank(entry,b.baseQuery)||a.prefix.length-b.prefix.length);
    return choices[0]?.baseQuery||query;
  }
  function lookup(index, query, limit=100, order='length',includeJastrow=false){
    if(!validWord(query))return {kind:String(query).trim()?'invalid':'empty',ids:[],total:0};
    let prefixed=[];
    const vowelFit=id=>vowelRank({...index.entries[id],alt:index.aliases?.[id]||[]},matchingQuery(index,prefixed,id,query));
    const q=normalize(query);if(!q)return {kind:'empty',ids:[],total:0};
    const direct=index.direct[q]||[];
    const forms=index.forms[q]||[],attested=(index.attestedForms?.[q]||[]).map(x=>x.id);
    let ids=[...new Set([...direct,...forms,...attested])];
    // Keep every attested candidate: a concise source match must not hide
    // another dictionary's distinct meaning for the same spelling.
    let kind=direct.length?'headword':forms.length?'word form':attested.length?'attested form':'suggestions';
    if(!ids.length){
      prefixed=prefixMatches(index,query);
      if(prefixed.length){ids=[...new Set(prefixed.map(m=>m.id))];kind='prefixed form';}
      else{
        prefixed=endingMatches(index,query);
        if(prefixed.length){ids=[...new Set(prefixed.map(m=>m.id))];kind='inflected form';}
      }
    }
    if(!ids.length){
      // Suggestions are spelling matches, never invented translations or inferred roots.
      ids=index.entries.map((e,i)=>({i,n:normalize(e.h)})).filter(e=>e.n.startsWith(q)).map(e=>e.i);
    }
    if(kind!=='suggestions'&&order==='length'&&index.entryLengths){
      const tier=id=>{const m=prefixed.find(m=>m.id===id);return m?m.prefix.length*3+((index.direct[m.base]||[]).includes(id)?0:(index.attestedForms?.[m.base]||[]).some(x=>x.id===id)?1:2):direct.includes(id)?0:attested.includes(id)?1:2;};
      ids.sort((a,b)=>tier(a)-tier(b)||vowelFit(a)-vowelFit(b)||Number(index.entries[b].source==='krupnik')-Number(index.entries[a].source==='krupnik')||(index.entryLengths[b]||0)-(index.entryLengths[a]||0)||a-b);
    }
    return {kind,ids:ids.slice(0,limit),total:ids.length,...(prefixed.length?{prefixMatches:prefixed.filter(m=>ids.slice(0,limit).includes(m.id))}:{})};
  }
  function hasTranslation(index, text){
    const word=String(text).trim();
    if(!validWord(word))return false;
    const q=normalize(word);
    return !!q && !!(indexedMatches(index,q).length||prefixMatches(index,word).length||endingMatches(index,word).length);
  }
  function displayHeadword(entry,word=''){
    const same=[entry.h,...(entry.alt||[])].filter(h=>normalize(h)===normalize(word)).sort((a,b)=>vowelRank({h:a},word)-vowelRank({h:b},word))[0];
    return (same||entry.h).replace(/\s+[IVXLCDM]+$/,'').replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+$/,'').replace(/^\*/, '').trim();
  }
  function splitWords(text){
    const value=String(text).trim();if(!value||value.length>500||/[A-Za-z0-9]/.test(value))return [];
    const words=value.split(/[\s\u05be]+/).map(w=>w.replace(/^[,.;:!?״׳"'()\[\]{}–—]+|[,.;:!?״׳"'()\[\]{}–—]+$/g,'')).filter(Boolean);
    return words.length<=12&&words.every(validWord)?words:[];
  }
  function phraseLookup(index,text){
    const words=splitWords(text),key=words.map(normalize).join(' ');
    const ids=words.length>1?[...(index.phrases?.[key]||[])]:[];
    return {kind:'phrase',ids,total:ids.length};
  }
  function segmentWords(index,text){
    const words=splitWords(text),segments=[];
    for(let start=0;start<words.length;){
      let found=false;
      for(let end=words.length;end>start+1;end--){
        const word=words.slice(start,end).join(' '),result=phraseLookup(index,word);
        if(result.ids.length){segments.push({word,result});start=end;found=true;break;}
      }
      if(!found){segments.push({word:words[start],result:null});start++;}
    }
    return segments;
  }
  function hasSelectionTranslations(index,text){const segments=segmentWords(index,text);return !!segments.length&&segments.every(s=>s.result?.ids.length||hasTranslation(index,s.word));}

  const api={hasVowels,vowelRank,markedLetters,prefixMatches,endingMatches,matchingQuery,phraseLookup,segmentWords,hasSelectionTranslations,splitWords,normalize,lookup,hasTranslation,validWord,displayHeadword};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.JastrowSearch=api;
})(typeof window!=='undefined'?window:globalThis);
