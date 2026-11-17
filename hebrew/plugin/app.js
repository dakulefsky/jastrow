'use strict';
const $=id=>document.getElementById(id),el=(tag,text,cls)=>{const n=document.createElement(tag);n.textContent=text;if(cls)n.className=cls;return n;};
let recentLookups=[],trail=[],trailPosition=-1,activeReaderContext=null;
function readerSourceLabel(context){const ref=DictionaryQuick.sourceLabel(context);return ref?el('p',ref,'reader-origin'):null;}
try{const saved=JSON.parse(localStorage.getItem('aramaic-hebrew-student-v1')||'{}');if(Array.isArray(saved.recent))recentLookups=saved.recent.filter(x=>typeof x==='string'&&x.length<=300).slice(0,10);}catch{}
function renderRecent(){const nav=$('recent-lookups');if(!nav)return;nav.replaceChildren();nav.hidden=!recentLookups.length;if(nav.hidden)return;nav.append(el('span','חיפושים אחרונים','recent-label'));for(const word of recentLookups){const b=el('button',word);b.type='button';b.onclick=()=>search(word);nav.append(b);}const clear=el('button','ניקוי','clear-recent');clear.type='button';clear.onclick=()=>{recentLookups=[];saveRecent();renderRecent();};nav.append(clear);}
function saveRecent(){try{localStorage.setItem('aramaic-hebrew-student-v1',JSON.stringify({recent:recentLookups}));}catch{}}
function rememberLookup(word){recentLookups=[word,...recentLookups.filter(x=>x!==word)].slice(0,10);saveRecent();renderRecent();}
function renderTrail(){const nav=$('definition-history');if(!nav)return;nav.replaceChildren();for(const [label,step] of [['הקודם',-1],['הבא',1]]){const b=el('button',label);b.type='button';b.disabled=step<0?trailPosition<=0:trailPosition>=trail.length-1;b.onclick=()=>{const next=trailPosition+step;if(next>=0&&next<trail.length){trailPosition=next;search(trail[next],false);renderTrail();}};nav.append(b);}nav.hidden=!trail.length;}
function recordTrail(word){if(trail[trailPosition]===word)return;trail=trail.slice(0,trailPosition+1);trail.push(word);if(trail.length>50)trail.shift();trailPosition=trail.length-1;renderTrail();}
function renderMatches(records,word){
 const list=$('matches'),count=$('match-count');if(!list||!count)return;list.replaceChildren();
 const entries=[...new Map(records.map(e=>[e.rid,e])).values()];
 count.textContent=entries.length+' ערכים';
 for(const entry of entries){
  const row=el('div','','match-row');
  const open=el('button',entry.word,'result');open.type='button';open.dir='rtl';open.onclick=()=>search(entry.word);row.append(open);
  
  list.append(row);
 }
}
let lastSearched='',searchSerial=0;
async function search(q,record=true,preserveReaderContext=false){const serial=++searchSerial;lastSearched=String(q);if(!preserveReaderContext)activeReaderContext=null;$('query').value=q;const out=$('results');out.replaceChildren();$('clear').hidden=!q;if(!q.trim()){renderMatches([],'');$('status').textContent='';return;}if(String(q).trim().toLowerCase()==='who created this?'){renderMatches([],'');out.append(el('p','Daniel Avrahom','creator-easter-egg'));$('status').textContent='';return;}let records=HebrewLookup.lookup(q);renderMatches(records,q);$('status').textContent=records.length?'':!HebrewLookup.valid(q)?'יש להזין מילה או ביטוי באותיות עבריות.':'לא נמצא ערך למילה או לביטוי זה.';if(!records.length)return;if(record){recordTrail(q);rememberLookup(q);}
 if(activeReaderContext&&HebrewLookup.normalize(activeReaderContext.word)===HebrewLookup.normalize(q)){const origin=readerSourceLabel(activeReaderContext);if(origin)out.append(origin);}
 out.append(el('h2',q,'query-title'));const formMatch=records.find(e=>e.matchedForm);if(formMatch){const note=el('p','זוהתה צורה נטויה; הערך הבסיסי במילון: '+formMatch.word,'form-attestation');out.append(note);}const groups=new Map();
 for(const e of records)for(const p of e.parts){const text=p.meaning||p.text,key=[HebrewLookup.normalize(e.word),p.label.replace(/\b\d+\b/g,''),text].join('|');if(!groups.has(key))groups.set(key,{word:e.word,text,items:[]});groups.get(key).items.push({e,p});}
 const groupList=[...groups.values()];
 const active=activeReaderContext&&HebrewLookup.normalize(activeReaderContext.word)===HebrewLookup.normalize(q)?activeReaderContext.selection:null;
 const cardsByGroup=new Map();
 let number=0;for(const [groupIndex,g] of groupList.entries()){const card=el('article','','meaning-card');card.append(el('span',String(++number),'number'),el('h3',g.word));const definition=el('p',g.text,'definition-text');card.append(definition);
 const details=el('details','');details.append(el('summary','הערך המלא ומקורו'));for(const {e,p} of g.items){details.append(el('p',p.text),el('small','קרופניק וזילברמן · '+e.rid+(p.label?' · '+p.label:'')));}card.append(details);out.append(card);cardsByGroup.set(String(groupIndex),card);}
 // Translation evidence is strictly optional: render the dictionary first and
 // only add a clue later if this daf was already prepared in the background.
 if(active&&window.SefariaEvidence?.compareTranslation){
  const candidates=groupList.map((g,i)=>({id:String(i),text:[...new Set(g.items.map(({p})=>p.english||'').filter(Boolean))].join('; ')})).filter(candidate=>candidate.text);
  if(candidates.length){
   SefariaEvidence.compareTranslation(q,candidates,active).then(evidence=>{
    if(serial!==searchSerial)return;
    const match=(evidence.matches||[])[0];
    if(match){
     const card=cardsByGroup.get(match.id);
     if(card){
      card.append(el('small','מומלץ','recommended-label'));
      card.classList.add('recommended-meaning');
      out.insertBefore(card,out.querySelector('.meaning-card'));
      out.querySelectorAll('.meaning-card .number').forEach((node,index)=>node.textContent=String(index+1));
     }
    }
   }).catch(()=>{});
  }
 }
}
$('form').onsubmit=e=>{e.preventDefault();search($('query').value);};$('clear').onclick=()=>{search('');$('query').focus();};
$('selected').onclick=async()=>{try{const r=await Otzaria.call('reader.getSelection');const text=HebrewLookup.selectionText(r?.data);if(r?.success&&text){activeReaderContext={word:text,selection:r.data||null};search(text,true,true);}else $('status').textContent='יש לבחור מילה בטקסט תחילה.';}catch{$('status').textContent='לא ניתן לקרוא את הבחירה. אפשר להקליד בשדה החיפוש.';}};
document.addEventListener('keydown',e=>{if(e.key==='/'&&!e.target.closest('input,textarea,[contenteditable]')){e.preventDefault();$('query').focus();}});


if(window.Otzaria){
 Otzaria.on('ui.messageClicked',p=>{const payload=p?.payload||{},word=payload.dictionaryWord;if(typeof word!=='string')return;const context=payload.readerContext&&typeof payload.readerContext==='object'?payload.readerContext:null;activeReaderContext=context?{word,selection:context}:null;search(word,true,!!context);});Otzaria.on('theme.changed',theme);Otzaria.on('plugin.boot',p=>{theme(p.theme);$('selected').hidden=false;});}
function theme(t){const c=t?.colorScheme;if(c){for(const [k,v] of Object.entries({'color-surface':c.surface,'color-on-surface':c.onSurface,'color-surface-container':c.surfaceContainerHigh||c.surface,'color-muted':c.onSurfaceVariant,'color-outline':c.outline,'color-primary':c.primary,'color-on-primary':c.onPrimary}))if(v)document.documentElement.style.setProperty('--'+k,v);}if(t?.typography?.uiFontFamily)document.body.style.fontFamily=t.typography.uiFontFamily+',system-ui,sans-serif';}

$('help-toggle').onclick=()=>{const open=$('help').hidden;$('help').hidden=!open;$('help-toggle').setAttribute('aria-expanded',String(open));};
let readingSize=100;try{const n=Number(localStorage.getItem('aramaic-hebrew-reading-size'));if([90,100,110,120,130,140].includes(n))readingSize=n;}catch{}
function resize(n){readingSize=Math.max(90,Math.min(140,n));document.documentElement.style.setProperty('--reading-scale',String(readingSize/100));$('text-size').textContent=readingSize+'%';$('text-smaller').disabled=readingSize===90;$('text-larger').disabled=readingSize===140;try{localStorage.setItem('aramaic-hebrew-reading-size',String(readingSize));}catch{}}
$('text-smaller').onclick=()=>resize(readingSize-10);$('text-larger').onclick=()=>resize(readingSize+10);resize(readingSize);renderRecent();renderTrail();
