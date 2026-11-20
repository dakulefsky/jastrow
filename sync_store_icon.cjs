// The store card image and long description are separate from the plugin package.
// Update both through the authenticated owner edit route, then read back the listing.
const fs=require('node:fs'),path=require('node:path');
async function main(){
 const actionPath=path.resolve(process.env.RUNNER_WORKSPACE||path.dirname(process.env.GITHUB_WORKSPACE),'../_actions/Otzaria/otzaria-plugin-validator/v1/src/publish.js');
 const {StoreClient,resolveUpdateFields}=require(actionPath);
 const raw=JSON.parse(fs.readFileSync('plugin/manifest.json','utf8'));
 const description=fs.readFileSync('.github/assets/jastrow-store-description.en.txt','utf8').trim();
 if(!description)throw Error('Store description is empty');
 const client=new StoreClient();await client.login(process.env.OTZARIA_USER,process.env.OTZARIA_PASSWORD);
 const resolved=await client.resolveId(raw.id);if(!resolved.exists||!resolved.owned||!resolved.id)throw Error('Cannot identify owned dictionary listing');
 const url=client.editUrl(resolved.id),headers={cookie:client.jar.header()};
 const currentRes=await fetch(url,{headers});if(!currentRes.ok)throw Error('Cannot read existing store listing');const current=await currentRes.json();
 const fields=resolveUpdateFields({manifest:{...raw,raw},current,syncMetadata:false});
 const form=new FormData();for(const [k,v] of Object.entries(fields))form.set(k,v);
 form.set('description',description);
 form.set('imageFile',new Blob([fs.readFileSync('screenshots/store-emblem.png')],{type:'image/png'}),'dictionary-logo.png');
 const res=await fetch(url,{method:'PUT',headers,body:form});const result=await res.json();
 if(!res.ok||!result.success)throw Error('Store listing update failed: '+(result.error||res.status));
 const verifyRes=await fetch(url,{headers:{cookie:client.jar.header()}});
 if(!verifyRes.ok)throw Error('Could not verify updated store listing');
 const updated=await verifyRes.json();
 if(updated.description!==description)throw Error('Store description verification failed');
 console.log('Store card icon and long description updated and verified. Pending approval: '+Boolean(result.pendingApproval));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});