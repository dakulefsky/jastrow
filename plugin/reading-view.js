(function(root){
  'use strict';
  const grammar=/^(?:Ithpe|Ithpa|Ithpal|Ithpo|Af|Pa|Pe|Hif|Hithpa|Nif|Pi|Pu|Hof|Pilp|Pol|pass|act|part|inf|perf|imperf|ibid|ib|supra|infra|nazir)\.?$/i;
  function phrases(body){
    const results=[];
    for(const sense of body.querySelectorAll('.sense')){
      // Each nested sense is handled separately. Take only explicit italic phrases,
      // never paraphrase Jastrow or treat his example translations as definitions.
      const copy=sense.cloneNode(true);
      copy.querySelectorAll('.sense').forEach(n=>n.remove());
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
          const value={text,label};
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
  function render(body){
    const meanings=phrases(body);
    const fragment=document.createDocumentFragment();
    if(meanings.length){
      const section=document.createElement('section');section.className='quick-meanings';
      const title=document.createElement('h3');title.textContent='Meanings';section.append(title);
      const list=document.createElement('ul');
      for(const meaning of meanings){
        const li=document.createElement('li');
        if(meaning.label){const label=document.createElement('span');label.className='meaning-form';label.dir='auto';label.textContent=meaning.label;li.append(label);}
        const text=document.createElement('span');text.textContent=meaning.text;li.append(text);list.append(li);
      }
      section.append(list);
      const note=document.createElement('p');note.className='reading-note';note.textContent='Selected definition phrases from Jastrow. The full entry may contain additional meanings and qualifications.';section.append(note);fragment.append(section);
    }
    const details=document.createElement('details');details.className='scholarly-entry';details.open=!meanings.length;
    const summary=document.createElement('summary');summary.textContent='Full Jastrow entry · sources, examples & grammar';details.append(summary,body);fragment.append(details);
    return fragment;
  }
  root.JastrowReadingView={phrases,render};
})(window);
