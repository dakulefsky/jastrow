'use strict';
window.JASTROW_CHUNKS={};
const index=window.JASTROW_INDEX, $=id=>document.getElementById(id);
let resultIds=[], currentId=null, query='',limit=60, requestSerial=0, entrySerial=0;
const chunkPromises=new Map();
function loadChunk(n){
  if(window.JASTROW_CHUNKS[n])return Promise.resolve(window.JASTROW_CHUNKS[n]);
  if(!chunkPromises.has(n))chunkPromises.set(n,new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src='data/chunk-'+n+'.js';
    script.onload=()=>window.JASTROW_CHUNKS[n]?resolve(window.JASTROW_CHUNKS[n]):reject(new Error('Missing dictionary chunk'));
    script.onerror=()=>{chunkPromises.delete(n);script.remove();reject(new Error('Could not load dictionary file'));};
    document.head.append(script);
  }));
  return chunkPromises.get(n);
}
function setStatus(s){$('status').textContent=s;}
function el(tag, text, cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
async function showEntry(id){
  const serial=++entrySerial;
  try{
    const entry=(await loadChunk(index.entries[id].b))[id];if(serial!==entrySerial)return;
    currentId=id;$('entry').replaceChildren();
    $('entry').append(el('h2',entry.h,'entry-title'));
    const meta=el('p',entry.alt.length?'Also listed as: '+entry.alt.join(' · '):'Jastrow · Original English definition','entry-meta');meta.dir='auto';$('entry').append(meta);
    const body=el('div',undefined,'definition');body.dir='ltr';body.innerHTML=entry.html;$('entry').append(JastrowReadingView.render(body));
    const nav=el('div',undefined,'entry-nav');
    for(const [label,offset] of [['Previous entry',-1],['Next entry',1]]){
      const b=el('button',label);b.disabled=id+offset<0||id+offset>=index.entries.length;b.onclick=()=>showEntry(id+offset);nav.append(b);
    }$('entry').append(nav);
    document.querySelectorAll('.result').forEach(b=>{const active=Number(b.dataset.id)===id;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
  }catch(e){if(serial===entrySerial)setStatus('Unable to open this entry. Try again. '+e.message);}
}
async function search(word, more=false){
  query=String(word).trim();$('query').value=query;if(!more)limit=60;
  const serial=++requestSerial;++entrySerial;
  const normalized=JastrowSearch.normalize(query);
  if(query.split(/\s+/).length>1){setStatus('Please look up one word at a time.');$('results').replaceChildren();$('more').hidden=true;$('match-count').textContent='';$('entry').replaceChildren(el('p','Enter a single Aramaic or Hebrew word to see its dictionary matches.'));currentId=null;return;}
  const r=JastrowSearch.lookup(index,query,limit);resultIds=r.ids;
  $('results').replaceChildren();$('more').hidden=r.total<=limit;
  if(!normalized){setStatus('Enter an Aramaic or Hebrew word in Hebrew letters.');$('match-count').textContent='';$('entry').replaceChildren(el('p','Enter a word in Hebrew letters to begin.'));currentId=null;return;}
  $('match-count').textContent=r.total.toLocaleString()+(r.total===1?' match':' matches');
  for(const id of r.ids){const b=el('button',index.entries[id].h,'result');b.dir='rtl';b.dataset.id=id;b.setAttribute('aria-pressed','false');b.onclick=()=>showEntry(id);$('results').append(b);}
  if(!r.ids.length){$('match-count').textContent='0 matches';$('entry').replaceChildren(el('h2','No matching entry'),el('p','Try a different spelling or the dictionary headword. Not every inflected form is indexed.'));setStatus('No entry found for '+query+'.');return;}
  setStatus((r.kind==='suggestions'?'No exact match. Headwords beginning with this spelling: ':r.kind==='word form'?'Indexed word-form matches: ':'Headword and indexed word-form matches: ')+r.total+(r.total>limit?' · showing '+limit:''));
  if(serial===requestSerial){
    if(r.ids.length===1&&r.kind!=='suggestions')await showEntry(r.ids[0]);
    else {
      currentId=null;
      $('entry').replaceChildren(el('h2',r.kind==='suggestions'?'Choose a suggested headword':'Choose a matching entry'),el('p','This spelling has several possible matches. Select a headword from the list and read its definition in the context of your passage.'));
    }
  }
}
function theme(t){
  const c=t?.colorScheme;if(!c)return;
  for(const [key,role] of Object.entries({'primary':'primary','on-primary':'onPrimary','surface':'surface','on-surface':'onSurface','surface-container':'surfaceContainerHigh','outline':'outline','muted':'onSurfaceVariant'})){
    if(c[role])document.documentElement.style.setProperty('--color-'+key,c[role]);
  }
}
$('search-form').onsubmit=e=>{e.preventDefault();search($('query').value);};
$('more').onclick=()=>{limit+=60;search(query,true);};
$('help-toggle').onclick=()=>{const show=$('help').hidden;$('help').hidden=!show;$('help-toggle').setAttribute('aria-expanded',String(show));};
document.addEventListener('click',e=>{
  const example=e.target.closest('[data-query]');if(example){search(example.dataset.query);return;}
  const cross=e.target.closest('a[data-headword]');if(cross){e.preventDefault();const ids=index.entries.map((x,i)=>x.h===cross.dataset.headword?i:-1).filter(i=>i>=0);if(ids.length)showEntry(ids[0]);else search(cross.dataset.headword);}
});
$('selection').hidden=true;
if(window.Otzaria){
  Otzaria.on('theme.changed',theme);
  Otzaria.on('reader.context_menu_item_clicked',p=>{if(p.itemId==='jastrow-lookup')search(p.selectedText||'');});
  Otzaria.on('plugin.boot',p=>{
    theme(p.theme);$('selection').hidden=false;
    $('selection').onclick=async()=>{
      const res=await Otzaria.call('reader.getSelection');
      if(res.success&&res.data?.text)search(res.data.text);else setStatus('Select a word in an Otzaria text first, then choose Jastrow — English from the context menu.');
    };
  });
}
$('count').textContent=index.entries.length.toLocaleString()+' entries';
setStatus('Ready · Search with or without nekudos.');
