'use strict';
const $=id=>document.getElementById(id),el=(tag,text,cls)=>{const n=document.createElement(tag);n.textContent=text;if(cls)n.className=cls;return n;};
let recentLookups=[],trail=[],trailPosition=-1,activeReaderContext=null,activeMesoratContext=null;
function mesoratSelection(selection,event){
 const s=selection&&typeof selection==='object'?selection:{},p=event&&typeof event==='object'?event:{};
 return {...s,
  currentBookId:s.currentBookId||s.bookId||s.currentBook||p.currentBookId||p.bookId||p.currentBook,
  currentIndex:Number.isInteger(s.currentIndex)?s.currentIndex:Number.isInteger(s.sectionIndex)?s.sectionIndex:Number.isInteger(p.currentIndex)?p.currentIndex:p.sectionIndex,
  type:s.type||s.currentType||p.type||p.currentType,source:s.source||s.currentSource||p.source||p.currentSource
 };
}

try{const saved=JSON.parse(localStorage.getItem('aramaic-hebrew-student-v1')||'{}');if(Array.isArray(saved.recent))recentLookups=saved.recent.filter(x=>typeof x==='string'&&x.length<=300).slice(0,10);}catch{}
function renderRecent(){const nav=$('recent-lookups');if(!nav)return;nav.replaceChildren();nav.hidden=!recentLookups.length;if(nav.hidden)return;nav.append(el('span','חיפושים אחרונים','recent-label'));for(const word of recentLookups){const b=el('button',word);b.type='button';b.onclick=()=>search(word);nav.append(b);}const clear=el('button','ניקוי','clear-recent');clear.type='button';clear.onclick=()=>{recentLookups=[];saveRecent();renderRecent();};nav.append(clear);}
function saveRecent(){try{localStorage.setItem('aramaic-hebrew-student-v1',JSON.stringify({recent:recentLookups}));}catch{}}
function rememberLookup(word){recentLookups=[word,...recentLookups.filter(x=>x!==word)].slice(0,10);saveRecent();renderRecent();}
function renderTrail(){const nav=$('definition-history');if(!nav)return;nav.replaceChildren();for(const [label,step] of [['הקודם',-1],['הבא',1]]){const b=el('button',label);b.type='button';b.disabled=step<0?trailPosition<=0:trailPosition>=trail.length-1;b.onclick=()=>{const next=trailPosition+step;if(next>=0&&next<trail.length){trailPosition=next;search(trail[next],false);renderTrail();}};nav.append(b);}nav.hidden=!trail.length;}
function recordTrail(word){if(trail[trailPosition]===word)return;trail=trail.slice(0,trailPosition+1);trail.push(word);if(trail.length>50)trail.shift();trailPosition=trail.length-1;renderTrail();}
function renderMatches(records,word){
 const list=$('matches'),count=$('match-count');if(!list||!count)return;list.replaceChildren();
 const entries=[...new Map(records.map(e=>[e.rid,e])).values()];
 const active=activeReaderContext&&HebrewLookup.normalize(activeReaderContext.word)===HebrewLookup.normalize(word)?activeReaderContext.selection:null;
 const contextual=!!(active&&window.DictionaryCommunity?.hasContext?.(active));
  const parallelContexts=active&&activeMesoratContext?[activeMesoratContext]:[];
 count.textContent=entries.length+' ערכים';
 if(window.DictionaryCommunity?.enabled&&entries.length){
  const intro=el('section','','community-feedback community-feedback-he');
  intro.append(el('span','תרומה לקהילה','community-feedback-kicker'),
   el('h3',contextual?'איזה ערך מתאים כאן?':'איזו משמעות מתאימה בדרך כלל?','community-feedback-label'),
   el('p',contextual?'״מתאים כאן״ עוזר ללומדים בהקשרים דומים. ״העדפה כללית״ משפיעה על העדפת המילון הרחבה.':'בחיפוש הזה אין טקסט סמוך זמין. הצבעה כללית משפיעה על העדפת המילון הרחבה.','community-feedback-description'));
  list.append(intro);
 }
 for(const entry of entries){
  const row=el('div','','community-match-row');
  const open=el('button',entry.word,'result');open.type='button';open.dir='rtl';open.onclick=()=>search(entry.word);row.append(open);
  if(window.DictionaryCommunity?.enabled){
   const preview=entry.parts?.map(part=>part.meaning||part.text).find(Boolean)||'';
   if(preview)row.append(el('small',preview.slice(0,70),'community-match-preview'));
   const controls=el('div','','community-vote-controls');const vote=el('button',contextual?'מתאים כאן':'העדפה כללית','community-vote');vote.type='button';vote.title='בחירת הערך למילה';
   vote.setAttribute('aria-label','בחירת הערך '+entry.word+(preview?' — '+preview:''));
   const submit=async(scope,control)=>{
    control.disabled=true;const status=row.querySelector('.community-vote-status')||el('small','','community-vote-status');if(!status.isConnected)row.append(status);
    try{
     const result=await DictionaryCommunity.vote(word,{rid:entry.rid},{scope,selection:active,parallelContexts});
     if(!result.ok&&!result.duplicate){status.textContent=result.reason==='context_unavailable'?'לא ניתן לקרוא את המילים שסביב הבחירה, ולכן לא נשלחה הצבעה הקשרית.':result.reason==='queue_full'?'תור הבחירות הלא־מקוונות מלא. יש להתחבר לרשת ולנסות שוב.':result.reason==='storage'?'לא ניתן לשמור את הבחירה במכשיר.':'לא ניתן לשמור את הבחירה. אפשר לנסות שוב.';control.disabled=false;return;}
     status.textContent=result.queued?'הבחירה נשמרה במכשיר ותישלח כשיהיה חיבור לרשת.':result.ok?(scope==='contextual'?'תודה, ההצבעה ההקשרית נשמרה.':'תודה, ההעדפה הכללית נשמרה.'):'כבר הצבעת עבור המילה הזאת בהיקף הזה.';
     control.textContent='נבחר';control.classList.add('is-selected');control.disabled=true;
    }catch{status.textContent='אירעה שגיאה. אפשר לנסות שוב.';control.disabled=false;}
   };
   vote.onclick=()=>submit(contextual?'contextual':'general',vote);
   vote.classList.add('community-vote-compact');controls.append(vote);
   if(contextual){const general=el('button','העדפה כללית','community-vote-general');general.type='button';general.title='קביעת העדפה כללית למילה';general.onclick=()=>submit('general',general);controls.append(general);}
   row.append(controls);
  }
  list.append(row);
 }
}
if(typeof window.addEventListener==='function')window.addEventListener('dictionary-community-synced',()=>{document.querySelectorAll('.community-vote-status').forEach(node=>{if(node.textContent.includes('נשמרה במכשיר'))node.textContent='ההצבעה נשלחה כעת לקהילה.';});});
if(typeof window.addEventListener==='function')window.addEventListener('dictionary-community-disabled',()=>{
 document.querySelectorAll('.community-feedback,.community-vote,.community-vote-status,.community-match-preview').forEach(node=>node.remove());
 if(window.Otzaria)for(let i=0;i<3;i++){try{Promise.resolve(Otzaria.call('reader.removeContextMenuItem',{id:'aramaic-hebrew-community-vote-'+i})).catch(()=>{});}catch{}}
});
let lastSearched='',searchSerial=0;
async function search(q,record=true){const serial=++searchSerial;lastSearched=String(q);if(activeReaderContext&&HebrewLookup.normalize(String(q))!==HebrewLookup.normalize(activeReaderContext.word))activeReaderContext=null;activeMesoratContext=null;$('query').value=q;const out=$('results');out.replaceChildren();$('clear').hidden=!q;if(!q.trim()){renderMatches([],'');$('status').textContent='';return;}if(String(q).trim().toLowerCase()==='who created this?'){renderMatches([],'');out.append(el('p','Daniel Avrahom','creator-easter-egg'));$('status').textContent='';return;}const activeSelection=activeReaderContext&&HebrewLookup.normalize(String(q))===HebrewLookup.normalize(activeReaderContext.word)?activeReaderContext.selection:null;
 if(window.DictionaryCommunity?.enabled&&activeSelection&&window.MesoratHashasContext?.findParallelContext){
  activeMesoratContext=await MesoratHashasContext.findParallelContext(q,activeSelection);
  if(serial!==searchSerial)return;
 }
 let records=HebrewLookup.lookup(q);
 if(window.DictionaryCommunity?.enabled&&records.length>1){
  const ranked=await DictionaryCommunity.rank(q,records.map(e=>({rid:e.rid})),activeSelection,activeMesoratContext?[activeMesoratContext]:[]);
  if(serial!==searchSerial)return;
  if(ranked.preferredEntryId){const order=new Map(ranked.entries.map((e,i)=>[e.rid,i]));records=[...records].sort((a,b)=>(order.get(a.rid)??999)-(order.get(b.rid)??999));}
 }
 renderMatches(records,q);$('status').textContent=records.length?'':!HebrewLookup.valid(q)?'יש להזין מילה או ביטוי באותיות עבריות.':'לא נמצא ערך למילה או לביטוי זה.';if(!records.length)return;if(record){recordTrail(q);rememberLookup(q);}
 out.append(el('h2',q,'query-title'));const formMatch=records.find(e=>e.matchedForm);if(formMatch){const note=el('p','זוהתה צורה נטויה; הערך הבסיסי במילון: '+formMatch.word,'form-attestation');out.append(note);}const groups=new Map();
 for(const e of records)for(const p of e.parts){const text=p.meaning||p.text,key=[HebrewLookup.normalize(e.word),p.label.replace(/\b\d+\b/g,''),text].join('|');if(!groups.has(key))groups.set(key,{word:e.word,text,items:[]});groups.get(key).items.push({e,p});}
 let number=0;for(const g of groups.values()){const card=el('article','','meaning-card');card.append(el('span',String(++number),'number'),el('h3',g.word),el('p',g.text));const details=el('details','');details.append(el('summary','הערך המלא ומקורו'));for(const {e,p} of g.items){details.append(el('p',p.text),el('small','קרופניק וזילברמן · '+e.rid+(p.label?' · '+p.label:'')));}card.append(details);out.append(card);}}
$('form').onsubmit=e=>{e.preventDefault();search($('query').value);};$('clear').onclick=()=>{search('');$('query').focus();};
$('selected').onclick=async()=>{try{const r=await Otzaria.call('reader.getSelection');const text=HebrewLookup.selectionText(r?.data);if(r?.success&&text){activeReaderContext={word:text,selection:mesoratSelection(r.data,r.data)};search(text);}else $('status').textContent='יש לבחור מילה בטקסט תחילה.';}catch{$('status').textContent='לא ניתן לקרוא את הבחירה. אפשר להקליד בשדה החיפוש.';}};
document.addEventListener('keydown',e=>{if(e.key==='/'&&!e.target.closest('input,textarea,[contenteditable]')){e.preventDefault();$('query').focus();}});
window.DictionaryCommunity?.ready?.then(()=>{if(window.DictionaryCommunity.enabled&&lastSearched)search(lastSearched,false);}).catch(()=>{});
if(typeof window.addEventListener==='function')window.addEventListener('dictionary-community-permission-granted',()=>{if(lastSearched)search(lastSearched,false);});
if(window.Otzaria){
 Otzaria.on('ui.messageClicked',p=>{const word=p?.payload?.dictionaryWord;if(typeof word==='string')search(word);});Otzaria.on('reader.context_menu_item_clicked',p=>{if(p.itemId==='aramaic-hebrew-open'){const word=HebrewLookup.selectionText(p);activeReaderContext={word,selection:mesoratSelection(p.selection,p)};search(word);}});Otzaria.on('theme.changed',theme);Otzaria.on('plugin.boot',p=>{theme(p.theme);$('selected').hidden=false;});}
function theme(t){const c=t?.colorScheme;if(c){for(const [k,v] of Object.entries({'color-surface':c.surface,'color-on-surface':c.onSurface,'color-surface-container':c.surfaceContainerHigh||c.surface,'color-muted':c.onSurfaceVariant,'color-outline':c.outline,'color-primary':c.primary,'color-on-primary':c.onPrimary}))if(v)document.documentElement.style.setProperty('--'+k,v);}if(t?.typography?.uiFontFamily)document.body.style.fontFamily=t.typography.uiFontFamily+',system-ui,sans-serif';}

$('help-toggle').onclick=()=>{const open=$('help').hidden;$('help').hidden=!open;$('help-toggle').setAttribute('aria-expanded',String(open));};
let readingSize=100;try{const n=Number(localStorage.getItem('aramaic-hebrew-reading-size'));if([90,100,110,120,130,140].includes(n))readingSize=n;}catch{}
function resize(n){readingSize=Math.max(90,Math.min(140,n));document.documentElement.style.setProperty('--reading-scale',String(readingSize/100));$('text-size').textContent=readingSize+'%';$('text-smaller').disabled=readingSize===90;$('text-larger').disabled=readingSize===140;try{localStorage.setItem('aramaic-hebrew-reading-size',String(readingSize));}catch{}}
$('text-smaller').onclick=()=>resize(readingSize-10);$('text-larger').onclick=()=>resize(readingSize+10);resize(readingSize);renderRecent();renderTrail();
