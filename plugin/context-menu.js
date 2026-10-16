(function(root){
  'use strict';
  // The host owns the declarative menu registration. This helper only reads
  // selection payloads when the user clicks; no background process is needed.
  function selectionText(payload){
    const p=payload||{},s=p.selection||{};
    for(const value of [s.renderedSelectedText,p.selectedText,p.renderedSelectedText,s.text,p.text,s.normalizedSelectedText,p.normalizedSelectedText,s.sourceSelectedText,p.sourceSelectedText]){
      if(typeof value==='string'&&value.trim())return value.trim();
    }
    return '';
  }
  root.JastrowContext={selectionText};
})(typeof window!=='undefined'?window:globalThis);
