// The store card image and long description are separate from the plugin package.
// Update the image first, then update the long description through the same owner edit route.
// The description is sent in its own PUT to match the store's metadata-edit flow.
const fs=require('node:fs'),path=require('node:path');
async function main(){
 const actionPath=path.resolve(process.env.RUNNER_WORKSPACE||path.dirname(process.env.GITHUB_WORKSPACE),'../_actions/Otzaria/otzaria-plugin-validator/v1/src/publish.js');
 const {StoreClient,resolveUpdateFields}=require(actionPath);
 const raw=JSON.parse(fs.readFileSync('plugin/manifest.json','utf8'));
 const description=fs.readFileSync('.github/assets/jastrow-store-description.en.txt','utf8').trim();
 if(!description)throw Error('Store description is empty');
 const client=new StoreClient();await client.login(process.env.OTZARIA_USER,process.env.OTZARIA_PASSWORD);
 const resolved=await client.resolveId(raw.id);if(!resolved.exists||!resolved.owned||!resolved.id)throw Error('Cannot identify owned dictionary listing');
 const url=client.editUrl(resolved.id);
 async function request(options={}){
  const response=await fetch(url,{...options,headers:{...(options.headers||{}),cookie:client.jar.header()}});
  client.jar.store(response);
  if(!response.ok)throw Error('Store metadata request failed: HTTP '+response.status);
  return response;
 }
 const current=await (await request()).json();
 const fields=resolveUpdateFields({manifest:{...raw,raw},current,syncMetadata:false});

 // Keep the icon upload isolated from the long-description update.
 const iconForm=new FormData();for(const [k,v] of Object.entries(fields))iconForm.set(k,v);
 iconForm.set('imageFile',new Blob([fs.readFileSync('screenshots/store-emblem.png')],{type:'image/png'}),'dictionary-logo.png');
 const iconResponse=await request({method:'PUT',body:iconForm});
 const iconResult=await iconResponse.json();
 if(!iconResult.success)throw Error('Store card icon update failed: '+(iconResult.error||'unknown error'));

 // Match the store's own metadata-edit workflow: send description separately.
 const descriptionForm=new FormData();for(const [k,v] of Object.entries(fields))descriptionForm.set(k,v);
 descriptionForm.set('description',description);
 const descriptionResponse=await request({method:'PUT',body:descriptionForm});
 const descriptionResult=await descriptionResponse.json();
 if(!descriptionResult.success)throw Error('Store description update failed: '+(descriptionResult.error||'unknown error'));

 const updated=await (await request()).json();
 const normalizeLineEndings=value=>String(value||'').replace(/\\r\\n?/g,'\\n').trim();
 if(normalizeLineEndings(updated.description)!==normalizeLineEndings(description)){
  console.error('Expected description length:',description.length);
  console.error('Read-back description length:',String(updated.description||'').length);
  console.error('Read-back description:',JSON.stringify(updated.description));
  throw Error('Store description verification failed');
 }
 console.log('Store card icon and long description updated and verified (line endings normalized). Pending approval: '+Boolean(descriptionResult.pendingApproval));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});