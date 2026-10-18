(function(root){
 'use strict';
 const normalize=s=>String(s).normalize('NFKD').replace(/[\u0591-\u05c7]/g,'').replace(/[^א-ת\s]/g,'').trim().replace(/\s+/g,' ');
 function valid(q){return typeof q==='string'&&q.length<=300&&/[א-ת]/.test(q)&&!/[A-Za-z0-9\u0600-\u06ff]/.test(q)&&q.trim().split(/\s+/).length<=12;}
 function pointing(s){const out=[];for(const c of s.normalize('NFD')){if(/[א-ת]/.test(c))out.push({c,marks:[]});else if(/[\u05b0-\u05bc\u05c1\u05c2\u05c7]/.test(c)&&out.length)out.at(-1).marks.push(c);}return out;}
 function rank(word,q){const a=pointing(word),b=pointing(q);if(a.map(x=>x.c).join('')!==b.map(x=>x.c).join(''))return 2;let supplied=false;for(let i=0;i<b.length;i++){if(b[i].marks.length)supplied=true;if(b[i].marks.some(m=>!a[i].marks.includes(m)))return 1;}return supplied?0:1;}
 function lookup(q){if(!valid(q))return [];const d=root.HEBREW_DICTIONARY,key=normalize(q),ids=d.index[key]||[];return [...new Set(ids)].map(i=>d.entries[i]).sort((a,b)=>{const score=e=>Math.min(...[e.word,...e.alt].filter(w=>normalize(w)===key).map(w=>rank(w,q)));return score(a)-score(b)||a.rid.localeCompare(b.rid);});}
 function selectionText(p){const s=p?.selection||{};return s.renderedSelectedText||p?.renderedSelectedText||p?.selectedText||s.text||p?.text||s.normalizedSelectedText||p?.normalizedSelectedText||'';}
 root.HebrewLookup={normalize,lookup,valid,rank,selectionText};
})(typeof window==='undefined'?globalThis:window);
