'use strict';
window.JASTROW_CHUNKS=window.JASTROW_CHUNKS||{};
const index=window.JASTROW_INDEX, $=id=>document.getElementById(id);
let resultIds=[], currentId=null, query='',limit=60, requestSerial=0, entrySerial=0;
const chunkPromises=new Map();
function loadChunk(n){
  if(window.JASTROW_CHUNKS[n])return Promise.resolve(window.JASTROW_CHUNKS[n]);
  if(!chunkPromises.has(n)){
    const promise=new Promise((resolve,reject)=>{
      const script=document.createElement('script');script.src='data/chunk-'+n+'.js';
      script.onload=()=>{script.remove();window.JASTROW_CHUNKS[n]?resolve(window.JASTROW_CHUNKS[n]):reject(new Error('Missing dictionary chunk'));};
      script.onerror=()=>{script.remove();reject(new Error('Could not load dictionary file'));};
      document.head.append(script);
    });
    chunkPromises.set(n,promise);
    promise.catch(()=>{if(chunkPromises.get(n)===promise)chunkPromises.delete(n);});
  }
  return chunkPromises.get(n);
}
let trail=[],trailPosition=-1;
function renderTrail(){
 const nav=$('definition-history');nav.replaceChildren();
 for(const [label,step] of [['← Back',-1],['Forward →',1]]){const b=el('button',label);b.type='button';b.disabled=step<0?trailPosition<=0:trailPosition>=trail.length-1;b.onclick=()=>showEntry(trail[trailPosition+step].id,false,trailPosition+step,trail[trailPosition+step].word);nav.append(b);}
 nav.hidden=!trail.length;
}
function syncEntryLink(id){try{history.replaceState(null,'','#'+new URLSearchParams({entry:String(id),word:query}));}catch{}}
function setStatus(s){$('status').textContent=s;}
function el(tag, text, cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
function matchType(id,word){
 const n=JastrowSearch.normalize(word);if(!n)return '';
 if((index.direct[n]||[]).includes(id))return 'Headword match';
 if((index.forms[n]||[]).includes(id))return 'Indexed word form';
 if((index.attestedForms?.[n]||[]).some(x=>x.id===id))return 'Form discussed by Jastrow';
 return 'Spelling suggestion';
}
function renderWordLink(id,word){
 if(!word)return;
 const kind=matchType(id,word),box=el('div',undefined,'word-link');
 const words=el('div',undefined,'word-link-words');
 const selected=el('span',word,'selected-word');selected.dir='rtl';
 const arrow=el('span','→','word-link-arrow');arrow.setAttribute('aria-hidden','true');
 const head=el('span',index.entries[id].h,'matched-headword');head.dir='rtl';
 words.append(selected,arrow,head);
 box.append(el('span',kind,'match-kind'),words,el('p',kind==='Spelling suggestion'?'This is a suggested spelling, not a confirmed match for your word.':kind==='Headword match'?'Your spelling matches this dictionary headword or one of its listed spellings.':'Your word is linked to this dictionary entry. This does not select a particular meaning or verb form.'));
 $('entry').append(box);
}
async function showEntry(id,record=true,targetPosition=null,word=query){
  if(!Number.isInteger(id)||id<0||id>=index.entries.length)return;
  const serial=++entrySerial;
  $('entry').setAttribute('aria-busy','true');
  $('entry').replaceChildren(el('p','Opening Jastrow…','entry-loading'));
  try{
    const entry=(await loadChunk(index.entries[id].b))[id];if(serial!==entrySerial)return;
    if(word!==query){limit=60;const serial=++requestSerial;paintMatches(JastrowSearch.lookup(index,word,60,$('match-order').value),word,serial);}
    query=word;$('query').value=query;
    if(record&&(trail[trailPosition]?.id!==id||trail[trailPosition]?.word!==word)){trail=trail.slice(0,trailPosition+1);trail.push({id,word});if(trail.length>50)trail.shift();trailPosition=trail.length-1;}else if(targetPosition!==null)trailPosition=targetPosition;
    currentId=id;setStatus(word?'Showing '+entry.h+' for '+word+'.':'Browsing Jastrow’s dictionary.');renderTrail();syncEntryLink(id);$('entry').replaceChildren();renderWordLink(id,word);rememberLookup(id,word);
    $('entry').append(el('h2',entry.h,'entry-title'));
    const meta=el('p',entry.alt.length?'Also listed as: '+entry.alt.join(' · '):'Jastrow · Original English definition','entry-meta');meta.dir='auto';$('entry').append(meta);
    const evidence=(index.attestedForms?.[JastrowSearch.normalize(query)]||[]).find(x=>x.id===id);
    if(evidence){const note=el('aside',undefined,'form-attestation');note.append(el('p','This form is explicitly discussed in this Jastrow entry.'),el('blockquote',evidence.quote));$('entry').append(note);}
    const body=el('div',undefined,'definition');body.dir='ltr';body.innerHTML=entry.html;const passages=JastrowReadingView.renderPassages(body,word);if(passages)$('entry').append(passages);$('entry').append(JastrowReadingView.render(body));
    const nav=el('div',undefined,'entry-nav');
    for(const [label,offset] of [['Previous entry',-1],['Next entry',1]]){
      const b=el('button',label);b.disabled=id+offset<0||id+offset>=index.entries.length;b.onclick=()=>showEntry(id+offset,true,null,'');nav.append(b);
    }$('entry').append(nav);
    document.querySelectorAll('.result').forEach(b=>{const active=Number(b.dataset.id)===id;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
  }catch(e){if(serial===entrySerial){setStatus('Unable to open this entry. Try again. '+e.message);const retry=el('button','Try opening again');retry.type='button';retry.onclick=()=>showEntry(id,record,targetPosition,word);$('entry').replaceChildren(el('h2','This entry could not be loaded'),el('p','The dictionary file did not open. Retry without losing your word.'),retry);}}
  finally{if(serial===entrySerial)$('entry').removeAttribute('aria-busy');}
}
async function fillMatchPreviews(ids,serial){
 // Small batches keep long ambiguous lists responsive. Chunks are cached offline.
 for(let start=0;start<ids.length;start+=8){
  if(serial!==requestSerial)return;
  await Promise.all(ids.slice(start,start+8).map(async id=>{
   try{
    const entry=(await loadChunk(index.entries[id].b))[id];if(serial!==requestSerial)return;
    const button=[...$('results').children].find(n=>Number(n.dataset.id)===id);if(!button)return;
    const body=el('div');body.innerHTML=entry.html;
    const phrases=JastrowReadingView.phrases(body),snippet=el('span',undefined,'result-meaning');snippet.dir='ltr';
    snippet.textContent=phrases.length?phrases.slice(0,2).map(p=>(p.label?p.label+': ':'')+p.text).join(' / '):'Open the original entry';
    // Visual clipping only: the accessible text retains the complete phrase.
    button.append(snippet);
   }catch{/* Individual previews are optional; selecting the entry can retry. */}
  }));
 }
}

function paintMatches(r,word,serial){
 resultIds=r.ids;$('results').replaceChildren();$('more').hidden=r.total<=limit;
 $('match-count').textContent=r.total?r.total.toLocaleString()+(r.total===1?' match':' matches'):'';
 for(const id of r.ids){const b=el('button',index.entries[id].h,'result');b.dir='rtl';b.dataset.id=id;b.append(el('span',matchType(id,word),'result-kind'));b.setAttribute('aria-pressed','false');b.onclick=()=>showEntry(id,true,null,word);$('results').append(b);}
 $('ranking-note').hidden=r.total<2||r.kind==='suggestions'||$('match-order').value!=='length';
 fillMatchPreviews(r.ids,serial);
}
async function search(word, more=false){
  query=String(word).trim();$('query').value=query;if(!more)limit=60;
  const serial=++requestSerial;++entrySerial;$('entry').removeAttribute('aria-busy');
  const normalized=JastrowSearch.normalize(query);
  if(query&&!JastrowSearch.validWord(query)){setStatus('Enter one Hebrew or Aramaic word in Hebrew letters, without English letters or numbers.');$('results').replaceChildren();$('more').hidden=true;$('match-count').textContent='';$('entry').replaceChildren(el('p','Enter a single Aramaic or Hebrew word to see its dictionary matches.'));currentId=null;return;}
  const r=JastrowSearch.lookup(index,query,limit,$('match-order').value);paintMatches(r,query,serial);
  if(!normalized){setStatus('Enter an Aramaic or Hebrew word in Hebrew letters.');$('match-count').textContent='';$('entry').replaceChildren(el('p','Enter a word in Hebrew letters to begin.'));currentId=null;return;}
  if(!r.ids.length){currentId=null;$('match-count').textContent='0 matches';$('entry').replaceChildren(el('h2','No matching entry'),el('p','Try a different spelling or the dictionary headword. Not every inflected form is indexed.'));setStatus('No entry found for '+query+'.');return;}
  setStatus((r.kind==='suggestions'?'No exact match. Headwords beginning with this spelling: ':r.kind==='attested form'?'Source-attested word-form matches: ':r.kind==='word form'?'Indexed word-form matches: ':'Headword and indexed word-form matches: ')+r.total+(r.total>limit?' · showing '+limit:''));
  if(serial===requestSerial){
    if(r.ids.length===1&&r.kind!=='suggestions')await showEntry(r.ids[0]);
    else {
      currentId=null;
      $('entry').replaceChildren(el('h2',r.kind==='suggestions'?'Choose a suggested headword':'Choose a matching entry'),el('p',r.kind==='suggestions'?'These headwords begin with your spelling. They are suggestions, not confirmed translations.':'Compare the original meaning previews in the list, then open the entry that fits your passage. No meaning has been selected automatically.'));
    }
  }
}
function theme(t){
  if(t?.typography?.uiFontFamily)document.documentElement.style.setProperty('--font-main',t.typography.uiFontFamily+', system-ui, sans-serif');
  if(t?.typography?.fontFamily)document.documentElement.style.setProperty('--body',t.typography.fontFamily+', Georgia, serif');
  const c=t?.colorScheme;if(!c)return;
  const colors={primary:c.primary,'on-primary':c.onPrimary,surface:c.surface,'on-surface':c.onSurface,'surface-container':c.surfaceContainerHigh||c.surfaceContainerHighest||c.surface,outline:c.outline,muted:c.onSurfaceVariant||c.onSurface,accent:c.tertiary||c.primary,'book-accent':c.onPrimary};
  for(const [key,color] of Object.entries(colors))if(color)document.documentElement.style.setProperty('--color-'+key,color);
  document.documentElement.style.colorScheme=t.mode==='dark'?'dark':'light';
}
let recentLookups=[],readingSize=100;
try{const data=JSON.parse(localStorage.getItem('jastrow-student-v1')||'{}');
 if(Array.isArray(data.recent))recentLookups=data.recent.filter(x=>Number.isInteger(x.id)&&x.id>=0&&x.id<index.entries.length&&typeof x.word==='string'&&x.word.length<=120).slice(0,12);
 if([90,100,110,120,130,140].includes(data.readingSize))readingSize=data.readingSize;
 if(['length','dictionary'].includes(data.matchOrder))$('match-order').value=data.matchOrder;
}catch{}
function savePreferences(){try{localStorage.setItem('jastrow-student-v1',JSON.stringify({recent:recentLookups,readingSize,matchOrder:$('match-order').value}));}catch{}}
function renderRecent(){
 const nav=$('recent-lookups');nav.replaceChildren();nav.hidden=!recentLookups.length;if(nav.hidden)return;
 nav.append(el('span','Recent','recent-label'));
 for(const item of recentLookups){const b=el('button',item.word||index.entries[item.id].h);b.type='button';b.dir='rtl';b.title=index.entries[item.id].h;b.onclick=()=>showEntry(item.id,true,null,item.word);nav.append(b);}
 const clear=el('button','Clear recent','clear-recent');clear.type='button';clear.onclick=()=>{recentLookups=[];savePreferences();renderRecent();};nav.append(clear);
}
function rememberLookup(id,word){
 recentLookups=[{id,word},...recentLookups.filter(x=>!(x.id===id&&x.word===word))].slice(0,12);savePreferences();renderRecent();
}
function setReadingSize(value){readingSize=Math.max(90,Math.min(140,value));document.documentElement.style.setProperty('--reading-scale',readingSize/100);$('text-size').textContent=readingSize+'%';$('text-smaller').disabled=readingSize===90;$('text-larger').disabled=readingSize===140;savePreferences();}
$('text-smaller').onclick=()=>setReadingSize(readingSize-10);$('text-larger').onclick=()=>setReadingSize(readingSize+10);setReadingSize(readingSize);renderRecent();
document.addEventListener('keydown',e=>{
 const typing=e.target.closest('input,textarea,[contenteditable=true]');
 if(e.key==='/'&&!typing&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();$('query').focus();$('query').select();}
 if(e.key==='ArrowDown'&&e.target===$('query')){e.preventDefault();if($('query').value.trim()!==query)search($('query').value).then(()=>$('results').firstElementChild?.focus());else $('results').firstElementChild?.focus();}
 const button=e.target.closest('.result');if(button&&['ArrowDown','ArrowUp','Home','End'].includes(e.key)){
  e.preventDefault();const buttons=[...$('results').children],i=buttons.indexOf(button),next=e.key==='Home'?0:e.key==='End'?buttons.length-1:Math.max(0,Math.min(buttons.length-1,i+(e.key==='ArrowDown'?1:-1)));buttons[next]?.focus();
 }
});
$('match-order').onchange=()=>{savePreferences();search($('query').value);};
$('clear-query').onclick=()=>{search('');$('query').focus();};
$('search-form').onsubmit=e=>{e.preventDefault();search($('query').value);};
$('more').onclick=()=>{limit+=60;search(query,true);};
$('help-toggle').onclick=()=>{const show=$('help').hidden;$('help').hidden=!show;$('help-toggle').setAttribute('aria-expanded',String(show));};
document.addEventListener('click',e=>{
  const cross=e.target.closest('a[data-headword]');if(cross){e.preventDefault();const ids=index.entries.map((x,i)=>x.h===cross.dataset.headword?i:-1).filter(i=>i>=0);if(ids.length)showEntry(ids[0],true,null,cross.dataset.headword);else search(cross.dataset.headword);}
});
$('selection').hidden=true;
if(window.Otzaria){
  Otzaria.on('theme.changed',theme);
  Otzaria.on('reader.context_menu_item_clicked',p=>{if(p.itemId==='jastrow-lookup')search(JastrowContext.selectionText(p));});
  Otzaria.on('plugin.boot',p=>{
    theme(p.theme);$('selection').hidden=false;
    Otzaria.call('app.getGrantedPermissions').then(res=>{
      const permissions=res?.data?.permissions;if(!res?.success||!Array.isArray(permissions))return;
      const required=['app.run_on_startup','app.background_keep_alive','events.subscribe:reader.selection_changed','reader.context_menu'];
      const missing=required.some(x=>!permissions.includes(x));$('right-click-state').hidden=!missing;
      if(missing)$('right-click-state').textContent='For indexed-word-only right-click lookup, enable background execution, keep-alive and text-selection access in Otzaria’s permissions for Jastrow.';
    }).catch(()=>{});
    $('selection').onclick=async()=>{
      try{const res=await Otzaria.call('reader.getSelection');
      const text=JastrowContext.selectionText(res?.data);if(res?.success&&text)search(text);else setStatus('Select a word in an Otzaria text first, then choose Jastrow — English from the context menu.');}
      catch{setStatus('Could not read the selected word. You can type it in the search field.');}
    };
  });
}
$('count').textContent=index.entries.length.toLocaleString()+' entries';
setStatus('Ready · Search with or without nekudos.');

renderTrail();
function readEntryLink(){try{const p=new URLSearchParams(location.hash.slice(1)),id=Number(p.get('entry'));if(p.has('entry')&&Number.isInteger(id)&&id>=0&&id<index.entries.length){requestSerial++;query=p.get('word')||'';$('query').value=query;showEntry(id);}}catch{}}
window.addEventListener('hashchange',readEntryLink);readEntryLink();
