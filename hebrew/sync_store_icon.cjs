// The Hebrew store card image and long description are separate from the plugin package.
const fs=require('node:fs'),path=require('node:path');
async function main(){
 const actionPath=path.resolve(process.env.RUNNER_WORKSPACE||path.dirname(process.env.GITHUB_WORKSPACE),'../_actions/Otzaria/otzaria-plugin-validator/v1/src/publish.js');
 const {StoreClient,resolveUpdateFields}=require(actionPath);
 const raw=JSON.parse(fs.readFileSync('hebrew/plugin/manifest.json','utf8'));
 const description=fs.readFileSync('hebrew/store-description.he.txt','utf8').trim();
 if(!description)throw Error('Hebrew store description is empty');
 const client=new StoreClient();await client.login(process.env.OTZARIA_USER,process.env.OTZARIA_PASSWORD);
 const resolved=await client.resolveId(raw.id);if(!resolved.exists||!resolved.owned||!resolved.id)throw Error('Cannot identify owned Hebrew dictionary listing');
 const url=client.editUrl(resolved.id);
 async function request(options={}){
  const response=await fetch(url,{...options,headers:{...(options.headers||{}),cookie:client.jar.header()}});
  client.jar.store(response);
  if(!response.ok)throw Error('Hebrew store metadata request failed: HTTP '+response.status);
  return response;
 }
 const current=await (await request()).json();
 const fields=resolveUpdateFields({manifest:{...raw,raw},current,syncMetadata:false});
 const iconForm=new FormData();for(const [k,v] of Object.entries(fields))iconForm.set(k,v);
 iconForm.set('imageFile',new Blob([fs.readFileSync('hebrew/plugin/assets/dictionary-logo.png')],{type:'image/png'}),'dictionary-logo.png');
 const iconResponse=await request({method:'PUT',body:iconForm}),iconResult=await iconResponse.json();
 if(!iconResult.success)throw Error('Hebrew store card icon update failed: '+(iconResult.error||'unknown error'));
 const descriptionForm=new FormData();for(const [k,v] of Object.entries(fields))descriptionForm.set(k,v);
 descriptionForm.set('description',description);
 const descriptionResponse=await request({method:'PUT',body:descriptionForm}),descriptionResult=await descriptionResponse.json();
 if(!descriptionResult.success)throw Error('Hebrew store description update failed: '+(descriptionResult.error||'unknown error'));
 const updated=await (await request()).json();
 const normalize=value=>String(value||'').replace(/\r\n?/g,'\n').trim();
 if(normalize(updated.description)!==normalize(description))throw Error('Hebrew store description verification failed');
 console.log('Hebrew store card icon and long description updated and verified. Pending approval: '+Boolean(descriptionResult.pendingApproval));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
