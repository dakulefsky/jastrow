const fs=require('node:fs');
const {StoreClient,resolveUpdateFields}=require(process.env.GITHUB_WORKSPACE+'/validator/src/publish.js');
(async()=>{
 const client=new StoreClient('https://otzaria.org');
 await client.login(process.env.OTZARIA_USER,process.env.OTZARIA_PASSWORD);
 const resolved=await client.resolveId('org.shiurplayer.local');
 if(!resolved.exists||!resolved.owned)throw Error('Owned Inside listing not found');
 const url=client.editUrl(resolved.id);
 async function request(options={}){const r=await fetch(url,{...options,headers:{Cookie:client.jar.header()}});client.jar.store(r);if(!r.ok)throw Error('Store metadata request failed: HTTP '+r.status);return r.json();}
 const current=await request();
 const description=fs.readFileSync('.github/assets/inside-player-api.he.txt','utf8');
 const fields=resolveUpdateFields({manifest:{version:current.version},current,syncMetadata:false});
 const form=new FormData();for(const [k,v]of Object.entries(fields))form.set(k,v);form.set('description',description);
 await request({method:'PUT',body:form});
 const updated=await request();if(updated.description!==description)throw Error('Description verification failed');
 console.log('Verified developer API description on Inside listing; package version '+updated.version);
})().catch(e=>{console.error(e.message);process.exitCode=1});
