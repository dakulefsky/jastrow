const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const manifest=JSON.parse(fs.readFileSync(__dirname+'/plugin/manifest.json'));
assert(!manifest.contributes.startup.contextMenuItems);assert(manifest.contributes.startup.activationEvents.includes('app.startup'));assert(manifest.contributes.startup.activationEvents.includes('reader.selection_changed'));assert(manifest.contributes.startup.keepAlive);for(const p of ['reader.context_menu','app.run_on_startup','app.background_keep_alive','events.subscribe:reader.selection_changed'])assert(manifest.permissions.includes(p));
const ctx={window:{},console};vm.createContext(ctx);for(const f of ['search.js','data/index.js','data/attested-forms.js','data/krupnik-index.js','data/phrases.js','context-menu.js'])vm.runInContext(fs.readFileSync(__dirname+'/plugin/'+f,'utf8'),ctx);
ctx.JastrowSearch=ctx.window.JastrowSearch;ctx.JastrowContext=ctx.window.JastrowContext;
let selected='',delay=null;const events={},calls=[];ctx.Otzaria=ctx.window.Otzaria={on:(e,f)=>events[e]=f,call:async(m,p)=>{calls.push({m,p});if(m==='reader.getSelection'){if(delay)return new Promise(r=>delay.resolve=r);return {success:true,data:{renderedSelectedText:selected}};}return {success:true};}};
vm.runInContext(fs.readFileSync(__dirname+'/plugin/availability.js','utf8'),ctx);
const flush=()=>new Promise(r=>setImmediate(r));
(async()=>{selected='מיתיבי';await events['plugin.boot']();await flush();assert.equal(calls.at(-1).m,'reader.addContextMenuItem');assert(calls.at(-1).p.showWhen.selectionContainsAny.includes(selected));assert(calls.at(-1).p.openPlugin);
 selected='אבגדהוזחטיכלמנסעפצקרשת';events['reader.selection_changed']({text:selected});await flush();assert.equal(calls.at(-1).m,'reader.removeContextMenuItem');
 selected='אמר אבגדהוזחטיכלמנסעפצקרשת';events['reader.selection_changed']({text:selected});await flush();assert.equal(calls.at(-1).m,'reader.removeContextMenuItem');
 selected='צפרא טבא';events['reader.selection_changed']({text:selected});await flush();assert.equal(calls.at(-1).m,'reader.addContextMenuItem');assert(calls.at(-1).p.showWhen.selectionContainsAny.includes(selected));
 selected='אמר';events['reader.selection_changed']({text:'אָמַר'});await flush();assert.equal(calls.at(-1).m,'reader.addContextMenuItem');assert(calls.at(-1).p.showWhen.selectionContainsAny.includes('אמר'));assert(calls.at(-1).p.showWhen.selectionContainsAny.includes('אָמַר'));
 delay={};events['reader.selection_changed']({text:'רחמנא'});await flush();events['reader.selection_changed']({text:'אבגדהוזחטיכלמנסעפצקרשת'});delay.resolve({success:true,data:{renderedSelectedText:'רחמנא'}});delay=null;await flush();assert.equal(calls.at(-1).m,'reader.removeContextMenuItem');
 for(const text of ['תניא','תנן','רחמנא']){selected=text;events['reader.selection_changed']({text});await flush();assert.equal(calls.at(-1).m,'reader.addContextMenuItem');}
 selected='נפקא מינה';events['reader.selection_changed']({text:selected});await flush();assert.equal(calls.at(-1).m,'reader.addContextMenuItem');assert.equal(calls.at(-1).p.title,'Aramaic → Eng.');
 console.log('PASS: filtered known/unknown/multiword availability, cold recovery, source-vs-rendered vowels, stale response rejection, startup/keep-alive declarations.');
})().catch(e=>{console.error(e);process.exitCode=1});
