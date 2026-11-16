(function(root){
 'use strict';
 const cache=new Map();

 function words(value){
  return String(value||'').normalize('NFKD').replace(/\p{M}/gu,'').match(/[א-ת]+/g)||[];
 }
 function singleWord(value){
  const parts=words(value);
  return parts.length===1?parts[0]:'';
 }
 function cleanHtml(value){
  return String(value||'')
   .replace(/<\s*br\s*\/?>/gi,' ')
   .replace(/<\/(?:p|div|li|section|article|h[1-6])\s*>/gi,' ')
   .replace(/<[^>]*>/g,' ')
   .replace(/&nbsp;|&#160;|&#xA0;/gi,' ')
   .replace(/&amp;/gi,'&')
   .replace(/&lt;/gi,'<')
   .replace(/&gt;/gi,'>')
   .replace(/&quot;/gi,'"')
   .replace(/&#39;|&apos;/gi,"'");
 }
 function selectionParts(word,selection){
  if(!selection||typeof selection!=='object')return null;
  if(Array.isArray(selection.sections)&&selection.sections.length!==1)return null;
  const section=Array.isArray(selection.sections)?selection.sections[0]:selection;
  const selected=singleWord(word);
  if(!selected)return null;
  const range=section?.sourceRange||section?.renderedRange||selection.sourceRange||selection.renderedRange;
  if(!range||!range.beforeText||!range.afterText)return null;
  const left=words(range.beforeText.raw),right=words(range.afterText.raw);
  if(!left.length||!right.length)return null;
  const currentBookId=selection.currentBookId||section?.currentBookId||selection.bookId||section?.bookId||selection.currentBook;
  const currentIndex=Number.isInteger(selection.currentIndex)?selection.currentIndex:
   Number.isInteger(selection.sectionIndex)?selection.sectionIndex:
   Number.isInteger(section?.currentIndex)?section.currentIndex:section?.sectionIndex;
  if(typeof currentBookId!=='string'||!currentBookId.trim()||!Number.isInteger(currentIndex)||currentIndex<0)return null;
  const type=selection.type||selection.currentType||section?.type||section?.currentType;
  const source=selection.source||selection.currentSource||section?.source||section?.currentSource;
  if(type&&type!=='text')return null;
  if(source&&source!=='library')return null;
  return {selected,left:left.slice(-2),right:right.slice(0,2),bookId:currentBookId.trim(),line:currentIndex};
 }
 function matchPassage(word,left,right,passage){
  const selected=singleWord(word),tokens=words(cleanHtml(passage));
  if(!selected||!Array.isArray(left)||!Array.isArray(right)||!left.length||!right.length)return null;
  const positions=[];
  for(let i=0;i<tokens.length;i++)if(tokens[i]===selected)positions.push(i);
  if(positions.length!==1)return null;
  const at=positions[0],before=tokens.slice(Math.max(0,at-left.length),at),after=tokens.slice(at+1,at+1+right.length);
  let leftMatches=0,rightMatches=0;
  for(let i=1;i<=Math.min(left.length,before.length);i++){
   if(left[left.length-i]===before[before.length-i])leftMatches++;
   else break;
  }
  for(let i=0;i<Math.min(right.length,after.length);i++){
   if(right[i]===after[i])rightMatches++;
   else break;
  }
  const total=left.length+right.length,matches=leftMatches+rightMatches;
  if(leftMatches<1||rightMatches<1||matches<2||matches/total<0.75)return null;
  return {before,after,score:matches/total,matches,total};
 }
 function targetDescriptor(link){
  if(!link||typeof link.targetTitle!=='string'||!link.targetTitle.trim()||!Number.isInteger(link.targetLine)||link.targetLine<0)return null;
  if(link.targetIsUserBook===true)return null;
  if(link.targetSource&&link.targetSource!=='o')return null;
  const out={targetTitle:link.targetTitle,targetLine:link.targetLine};
  for(const key of ['targetLineEnd','targetIsUserBook','targetCategoryId'])if(Object.prototype.hasOwnProperty.call(link,key))out[key]=link[key];
  return out;
 }
 async function resolve(word,selection,parts){
  try{
   if(!root.Otzaria?.call)return null;
   const linked=await root.Otzaria.call('library.getLinks',{
    bookId:parts.bookId,startLine:parts.line,endLine:parts.line,
    connectionTypes:['MESORAT_HASHAS'],includeAnchors:false
   });
   if(linked?.success!==true||linked.data?.truncated===true||!Array.isArray(linked.data?.links))return null;
   const unique=new Map();
   for(const link of linked.data.links){
    if(String(link.connectionType||'').toUpperCase()!=='MESORAT_HASHAS'||link.sourceLine!==parts.line)continue;
    const target=targetDescriptor(link);if(!target)continue;
    const key=[target.targetTitle,target.targetLine,target.targetLineEnd??'',target.targetCategoryId??''].join('|');
    if(!unique.has(key))unique.set(key,target);
   }
   const targets=[...unique.values()];
   if(!targets.length||targets.length>25)return null;
   const result=await root.Otzaria.call('library.getLinkContent',{links:targets});
   if(result?.success!==true||!Array.isArray(result.data?.items)||result.data.items.length!==targets.length)return null;
   const candidates=[];
   for(let i=0;i<targets.length;i++){
    const item=result.data.items[i];if(!item||typeof item.content!=='string'||item.error)continue;
    const match=matchPassage(word,parts.left,parts.right,item.content);if(!match)continue;
    const context={sourceRange:{beforeText:{raw:match.before.join(' ')},afterText:{raw:match.after.join(' ')}}};
    const signature=match.before.join(' ')+'|'+match.after.join(' ');
    candidates.push({context,signature,score:match.score,matches:match.matches});
   }
   if(!candidates.length)return null;
   candidates.sort((a,b)=>b.score-a.score||b.matches-a.matches);
   const best=candidates[0],ties=candidates.filter(x=>x.score===best.score&&x.matches===best.matches);
   if(ties.some(x=>x.signature!==best.signature))return null;
   return best.context;
  }catch{return null;}
 }
 async function findParallelContext(word,selection){
  const parts=selectionParts(word,selection);if(!parts)return null;
  const key=[parts.bookId,parts.line,parts.selected,parts.left.join(' '),parts.right.join(' ')].join('|');
  if(cache.has(key))return cache.get(key);
  const promise=resolve(word,selection,parts);
  cache.set(key,promise);
  const result=await promise;
  if(!result)cache.delete(key);
  if(cache.size>100){const first=cache.keys().next().value;if(first!==undefined)cache.delete(first);}
  return result;
 }
 root.MesoratHashasContext={
  findParallelContext,selectionParts,matchPassage,words,cleanHtml
 };
})(typeof window!=='undefined'?window:globalThis);
