// Structural audit of the reading aid; not a semantic certification.
const {chromium,executablePath}=require('./browser_support.cjs');
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
(async()=>{
 const browser=await chromium.launch({executablePath,args:['--no-sandbox']});
 try{
  const page=await browser.newPage();
  await page.goto(pathToFileURL(path.join(__dirname,'../Jastrow-Preview.html')).href);
  const result=await page.evaluate(()=>{
   let entries=0,entriesWithPhrases=0,phrases=0,crossReferences=0;
   const failures=[],resolution={exactHeadword:0,indexedForm:0,suggestionOnly:0,unresolved:0},examples={suggestionOnly:[],unresolved:[]};
   const exact=new Set(index.entries.map(e=>e.h));
   for(const chunk of Object.values(window.JASTROW_CHUNKS))for(const [id,entry]of Object.entries(chunk)){
    const body=document.createElement('div');body.innerHTML=entry.html;entries++;
    for(const link of body.querySelectorAll('a[data-headword]')){
     crossReferences++;const target=link.dataset.headword;
     let kind=exact.has(target)?'exactHeadword':JastrowSearch.hasTranslation(index,target)?'indexedForm':JastrowSearch.lookup(index,target).total?'suggestionOnly':'unresolved';
     resolution[kind]++;if(examples[kind]?.length<12)examples[kind].push({id,headword:entry.h,target});
    }
    const found=JastrowReadingView.phrases(body);if(found.length)entriesWithPhrases++;
    for(const phrase of found){phrases++;if(!body.textContent.includes(phrase.text))failures.push({id,text:phrase.text});}
   }
   return{entries,entriesWithPhrases,phrases,failures,crossReferences,resolution,examples,limitation:'Literal phrase containment and link-resolution classification do not certify contextual translation or interpretation.'};
  });
  fs.writeFileSync(path.join(__dirname,'reading-audit.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));if(result.failures.length)process.exitCode=1;
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
