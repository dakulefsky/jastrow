(function(root){
  'use strict';
  const grammar=/^(?:Ithpe|Ithpa|Ithpal|Ithpo|Af|Pa|Pe|Hif|Hithpa|Nif|Pi|Pu|Hof|Pilp|Pol|pass|act|part|inf|perf|imperf|ibid|ib|supra|infra|nazir)\.?$/i;
  function phrases(body){
    const results=[],originalItalics=[...body.querySelectorAll('i')];
    for(const sense of body.querySelectorAll('.sense')){
      // Each nested sense is handled separately. Take only explicit italic phrases,
      // never paraphrase Jastrow or treat his example translations as definitions.
      const copy=sense.cloneNode(true);
      copy.querySelectorAll('.sense').forEach(n=>n.remove());
      const originals=[...sense.querySelectorAll('i')].filter(n=>n.closest('.sense')===sense),copies=[...copy.querySelectorAll('i')];
      const walker=document.createTreeWalker(copy,NodeFilter.SHOW_TEXT);
      let node,depth=0,found=false,afterFirst='';
      while((node=walker.nextNode())){
        const italic=node.parentElement.closest('i');
        const reference=node.parentElement.closest('.citation, a, .morphology');
        const text=node.textContent.trim();
        if(italic && !reference && depth===0 && /[A-Za-z]{2}/.test(text) && !grammar.test(text)){
          if(found && /[A-Za-z\u05d0-\u05ea]/.test(afterFirst.replace(/[;,—.\s]/g,'')))break;
          if(text.length>240)break;
          let label='';
          // Retain the associated verb form, so derived meanings keep their context.
          const parent=sense.parentElement.closest('.sense');
          if(parent){const b=Array.from(parent.children).find(n=>n.tagName==='B');if(b)label=b.textContent.trim();}
          const ownSection=Array.from(sense.children).find(n=>n.tagName==='B');
          const value={text,label,section:ownSection?.textContent.trim()||'',sourceIndex:originalItalics.indexOf(originals[copies.indexOf(italic)])};
          if(!results.some(x=>x.text===text && x.label===label))results.push(value);
          found=true;afterFirst='';
        }else if(found){
          if(reference?.classList.contains('citation'))break;
          afterFirst+=' '+text;
        }
        for(const ch of node.textContent){if(ch==='('||ch==='[')depth++;else if(ch===')'||ch===']')depth=Math.max(0,depth-1);}
      }
    }
    return results;
  }
  function redirectTarget(body){
    const links=[...body.querySelectorAll('a[data-headword]')];
    const targets=[...new Set(links.map(a=>a.dataset.headword).filter(Boolean))];
    if(targets.length!==1)return null;
    const copy=body.cloneNode(true);copy.querySelectorAll('a,.morphology').forEach(n=>n.remove());
    const remainder=copy.textContent.replace(/\b(?:v|q|same|plur|of|see|variant|form|spelling|h|ch|foreg|preced)\b\.?/gi,'');
    // Only a standalone cross-reference, never an etymology, example or an
    // entry with its own substantive prose. Ambiguous references stay visible.
    return /^[\s,.;:=()[\]—–-]*$/.test(remainder)?targets[0]:null;
  }
  async function records(index,id,load,word,{phrase=false,lookupWord=word}={}){
    const output=[],seen=new Set();let budget=40;
    async function visit(current,query,depth){
      if(seen.has(current)||depth>6||budget--<=0)return;
      seen.add(current);
      const entry=(await load(index.entries[current].b))[current];
      if(!entry)throw Error('Missing dictionary entry');
      let body;
      const meanings=entry.source==='krupnik'?(phrase?(index.phraseGlosses?.[current]||[]):entry.glosses):phrases(body=Object.assign(document.createElement('div'),{innerHTML:entry.html}));
      output.push({id:current,entry,meanings,lookupWord:query});
      if(meanings.length||phrase)return;
      if(!body){body=document.createElement('div');body.innerHTML=entry.html;}
      const target=redirectTarget(body);if(!target)return;
      const candidates=index.direct[root.JastrowSearch.normalize(target)]||[];
      const exact=candidates.filter(n=>index.entries[n].h===target);
      for(const next of exact.length?exact:root.JastrowSearch.validWord(target)?candidates:[])await visit(next,target,depth+1);
    }
    await visit(id,lookupWord,0);return output;
  }
  function wordPassages(body,word){
    const normalize=root.JastrowSearch.normalize,q=normalize(word);if(!q)return [];
    const text=body.textContent,results=[];
    // Only literal Hebrew tokens that normalize to the selected word. No
    // prefix stripping, root inference, or reconstructed sentence translations.
    for(const match of text.matchAll(/[\u05d0-\u05ea][\u0591-\u05c7\u05d0-\u05ea״׳"']*/g)){
      if(normalize(match[0])!==q)continue;
      const start=Math.max(0,match.index-140),end=Math.min(text.length,match.index+match[0].length+180);
      if(results.some(p=>start<p.end&&end>p.start))continue;
      results.push({start,end,before:text.slice(start,match.index),word:match[0],after:text.slice(match.index+match[0].length,end),leading:start>0,trailing:end<text.length});
      if(results.length===3)break;
    }
    return results;
  }
  function renderPassages(body,word){
    const passages=wordPassages(body,word);if(!passages.length)return null;
    const section=document.createElement('details');section.className='word-passages';
    const summary=document.createElement('summary');summary.textContent='Your word in Jastrow’s text';section.append(summary);
    const note=document.createElement('p');note.textContent='Original excerpts around this spelling. These passages may discuss different usages.';
    for(const p of passages){const quote=document.createElement('blockquote'),mark=document.createElement('mark');mark.dir='auto';mark.textContent=p.word;quote.append((p.leading?'…':'')+p.before,mark,p.after+(p.trailing?'…':''));section.append(quote);}
    return section;
  }
  function render(body){
    const meanings=phrases(body);
    const fragment=document.createDocumentFragment();
    const details=document.createElement('details');details.className='scholarly-entry';details.open=!meanings.length;
    const summary=document.createElement('summary');summary.textContent='More detail';details.append(summary);
    if(meanings.length){
      const section=document.createElement('section');section.className='quick-meanings';
      const heading=document.createElement('div');heading.className='meanings-heading';
      const title=document.createElement('h3');title.textContent='Translation';heading.append(title);
      const count=document.createElement('span');count.textContent=meanings.length+' '+(meanings.length===1?'phrase':'phrases')+' · source order';section.append(heading);
      const note=document.createElement('p');note.className='reading-note';note.textContent='Jastrow’s own wording. These are entry meanings, not a translation chosen for your sentence. Expand a card for usage and qualifications.';
      const list=document.createElement('ol');
      for(const [number,meaning] of meanings.entries()){
        const li=document.createElement('li');li.className='meaning-card';li.hidden=number>=6;
        const badge=document.createElement('span');badge.className='meaning-number';badge.textContent=number+1;badge.setAttribute('aria-hidden','true');li.append(badge);
        const content=document.createElement('div');content.className='meaning-content';
        if(meaning.label){const label=document.createElement('span');label.className='meaning-form';label.dir='auto';label.textContent=meaning.label;content.append(label);}
        if(meaning.section && !/^[—\s]*(?:[IVXLCDM]+|\d+)[).]?\s*$/.test(meaning.section)){const label=document.createElement('span');label.className='meaning-section';label.dir='auto';label.textContent=meaning.section;content.append(label);}
        const text=document.createElement('p');text.className='meaning-text';text.textContent=meaning.text;content.append(text);
        const target=body.querySelectorAll('i')[meaning.sourceIndex];
        const sense=target?.closest('.sense');
        li.append(content);list.append(li);
      }
      section.append(list);
      if(meanings.length>6){
        let expanded=false;const moreButton=document.createElement('button');moreButton.type='button';moreButton.className='more-meanings';moreButton.setAttribute('aria-expanded','false');
        const update=()=>{moreButton.textContent=expanded?'Show fewer meanings':'More meanings';moreButton.setAttribute('aria-expanded',String(expanded));count.textContent=(expanded?meanings.length:'6 of '+meanings.length)+' phrases · source order';};
        moreButton.onclick=()=>{expanded=!expanded;[...list.children].slice(6).forEach(n=>n.hidden=!expanded);update();};update();section.append(moreButton);
      }
      const more=document.createElement('p');more.className='reading-note';more.textContent='The full entry may contain further meanings, forms and qualifications.';fragment.append(section);
    }
    details.append(body);fragment.append(details);
    return fragment;
  }
  root.JastrowReadingView={phrases,redirectTarget,records,render,wordPassages,renderPassages};
})(window);
