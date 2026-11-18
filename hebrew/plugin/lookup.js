(function(root){
 'use strict';
 const normalize=s=>String(s).normalize('NFKD').replace(/[\u0591-\u05c7]/g,'').replace(/[^א-ת\s]/g,'').trim().replace(/\s+/g,' ');
 function valid(q){return typeof q==='string'&&q.length<=300&&/[א-ת]/.test(q)&&!/[A-Za-z0-9\u0600-\u06ff]/.test(q)&&q.trim().split(/\s+/).length<=12;}
 function pointing(s){const out=[];for(const c of s.normalize('NFD')){if(/[א-ת]/.test(c))out.push({c,marks:[]});else if(/[\u05b0-\u05bc\u05c1\u05c2\u05c7]/.test(c)&&out.length)out.at(-1).marks.push(c);}return out;}
 function rank(word,q){const a=pointing(word),b=pointing(q);if(a.map(x=>x.c).join('')!==b.map(x=>x.c).join(''))return 2;let supplied=false;for(let i=0;i<b.length;i++){if(b[i].marks.length)supplied=true;if(b[i].marks.some(m=>!a[i].marks.includes(m)))return 1;}return supplied?0:1;}
 // Conservative Aramaic/Hebrew clitic and pronominal-ending analysis. Exact
 // dictionary forms always win; stripped candidates are only used as fallback.
 const PREFIXES=['ו','ב','כ','ל','מ','ד','ה','ש','וב','וכ','ול','ומ','וד','וה','וש','כש','שה','לכש'];
 const SUFFIXES=['יהון','יהי','יהו','יה','תיהון','תיהי','תיהו','תיה','תין','תון','נון','יה','ין','ון','נן','נא','יה','יהי','י','ך','ו','ה','ם','ן','ת','א'];
 function formCandidates(q){
  const word=normalize(q).replace(/\s+/g,'');if(word.length<3)return [];
  const out=[],seen=new Set(),add=(base,prefix='',suffix='')=>{if(base.length<2||base===word)return;const key=base+'|'+prefix+'|'+suffix;if(!seen.has(key)){seen.add(key);out.push({base,prefix,suffix});}};
  for(const p of PREFIXES)if(word.startsWith(p)&&word.length-p.length>=2)add(word.slice(p.length),p,'');
  for(const s of SUFFIXES)if(word.endsWith(s)&&word.length-s.length>=2)add(word.slice(0,-s.length),'',s);
  for(const p of PREFIXES)if(word.startsWith(p))for(const s of SUFFIXES)if(word.length-p.length-s.length>=2&&word.endsWith(s))add(word.slice(p.length,-s.length),p,s);
  return out;
 }
 function lookup(q){
  if(!valid(q))return [];
  const d=root.HEBREW_DICTIONARY,key=normalize(q),exact=d.index[key]||[];
  const found=exact.map(i=>({entry:d.entries[i],matchedForm:false,baseWord:d.entries[i].word,prefix:'',suffix:''}));
  if(!found.length&&!key.includes(' ')){
   const candidates=formCandidates(q);
   for(const candidate of candidates){
    for(const i of d.index[candidate.base]||[])found.push({entry:d.entries[i],matchedForm:true,baseWord:candidate.base,prefix:candidate.prefix,suffix:candidate.suffix});
   }
  }
  const unique=new Map();
  for(const item of found){const k=item.entry.rid+'|'+item.baseWord;if(!unique.has(k))unique.set(k,item);}
  return [...unique.values()].sort((a,b)=>(a.matchedForm?1:0)-(b.matchedForm?1:0)||rank(a.entry.word,q)-rank(b.entry.word,q)||a.entry.rid.localeCompare(b.entry.rid)).map(item=>({...item.entry,matchedForm:item.matchedForm,baseWord:item.baseWord,prefix:item.prefix,suffix:item.suffix}));
 }
 function segmentWords(text){
  const words=normalize(text).split(' ').filter(Boolean),segments=[];
  if(words.length<2)return segments;
  for(let start=0;start<words.length;){
   let match=null;
   for(let end=words.length;end>start+1;end--){
    const phrase=words.slice(start,end).join(' ');
    const records=lookup(phrase);
    if(records.length){match={word:phrase,records};start=end;break;}
   }
   if(match){segments.push(match);continue;}
   const word=words[start++],records=lookup(word);
   if(records.length)segments.push({word,records});
  }
  return segments;
 }
 function selectionText(p){const s=p?.selection||{};return s.renderedSelectedText||p?.renderedSelectedText||p?.selectedText||s.text||p?.text||s.normalizedSelectedText||p?.normalizedSelectedText||'';}
 root.HebrewLookup={normalize,lookup,valid,rank,selectionText,formCandidates,segmentWords};
})(typeof window==='undefined'?globalThis:window);
