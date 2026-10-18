// The store card image is separate from the screenshot gallery and plugin assets.
// Reuse the validator's authenticated client without logging credentials or cookies.
const fs=require('node:fs'),path=require('node:path');
async function main(){
 const actionPath=path.resolve(process.env.RUNNER_WORKSPACE||path.dirname(process.env.GITHUB_WORKSPACE),'../_actions/Otzaria/otzaria-plugin-validator/v1/src/publish.js');
 const {StoreClient,resolveUpdateFields}=require(actionPath);
 const raw=JSON.parse(fs.readFileSync('hebrew/plugin/manifest.json','utf8'));
 const client=new StoreClient();await client.login(process.env.OTZARIA_USER,process.env.OTZARIA_PASSWORD);
 const resolved=await client.resolveId(raw.id);if(!resolved.exists||!resolved.owned||!resolved.id)throw Error('Cannot identify owned dictionary listing');
 const url=client.editUrl(resolved.id),headers={cookie:client.jar.header()};
 const currentRes=await fetch(url,{headers});if(!currentRes.ok)throw Error('Cannot read existing store listing');const current=await currentRes.json();
 const fields=resolveUpdateFields({manifest:{...raw,raw},current,syncMetadata:false});
 const form=new FormData();for(const [k,v] of Object.entries(fields))form.set(k,v);
 form.set('imageFile',new Blob([fs.readFileSync('hebrew/plugin/assets/dictionary-logo.png')],{type:'image/png'}),'dictionary-logo.png');
 const res=await fetch(url,{method:'PUT',headers,body:form});const result=await res.json();
 if(!res.ok||!result.success)throw Error('Store icon update failed: '+(result.error||res.status));
 console.log('Store card icon updated successfully. Pending approval: '+Boolean(result.pendingApproval));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
