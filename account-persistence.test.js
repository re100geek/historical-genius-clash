'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const net = require('node:net');
const {spawn} = require('node:child_process');
const ROOT = path.resolve(__dirname,'..');
async function freePort(){
  return await new Promise((resolve,reject)=>{
    const s=net.createServer();s.once('error',reject);
    s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});
  });
}
async function launch(dataDir,port){
  const child=spawn(process.execPath,['server.js'],{cwd:ROOT,
    env:{...process.env,PORT:String(port),HOST:'127.0.0.1',HGC_DATA_DIR:dataDir},
    stdio:['ignore','pipe','pipe']});
  let startup='';child.stdout.on('data',data=>{startup+=data.toString();});
  let errors='';child.stderr.on('data',data=>{errors+=data.toString();});
  const base=`http://127.0.0.1:${port}`;
  for(let i=0;i<60;i++){
    if(child.exitCode!==null)throw new Error('Server failed: '+errors);
    try{const r=await fetch(base+'/health');if(r.ok)return {child,base};}catch{}
    await new Promise(resolve=>setTimeout(resolve,60));
  }
  child.kill();throw new Error('Server readiness timeout: '+startup+' '+errors);
}
async function stop(child){
  child.kill('SIGTERM');
  await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);setTimeout(()=>{child.kill('SIGKILL');resolve();},3000).unref();});
}
function rest(base,route,method='GET',data,cookie){
 return fetch(base+route,{method,headers:{Origin:base,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},
   body:data===undefined?undefined:JSON.stringify(data)});
}
test('real HTTP server account survives process restart and saves tower across devices',async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'hgc-data-durable-'));
 let server1,server2;
 try{
   const port=await freePort();server1=await launch(temp,port);
   const base=server1.base;
   let response=await rest(base,'/api/auth/register','POST',{username:'tower_retest',password:'long-safe-password-174'});
   assert.equal(response.status,201);
   const cookie=response.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie);
   const save={'historicalGeniusClash.tower.v1':JSON.stringify({jordan:43,pele:12}),
     'historicalGeniusClash.newcomerCollection.v1':JSON.stringify({jordan:['legendary']}),
     'historicalGeniusClash.eraExpedition.v1':JSON.stringify({v:1,active:null,archive:[{heroId:'newton',seed:13579,steps:12,result:'won'}]})};
   response=await rest(base,'/api/auth/profile','PUT',{revision:0,data:save},cookie);
   assert.equal(response.status,200);assert.equal((await response.json()).revision,1);
   await stop(server1.child);server1=null;
   assert.ok(fs.existsSync(path.join(temp,'accounts.json')));
   const db=fs.readFileSync(path.join(temp,'accounts.json'),'utf8');
   assert.ok(!db.includes('long-safe-password-174'),'Password must never persist in plaintext');
   server2=await launch(temp,port);
   response=await rest(base,'/api/auth/login','POST',{username:'tower_retest',password:'long-safe-password-174'});
   assert.equal(response.status,200);
   const secondCookie=response.headers.get('set-cookie').split(';')[0];
   response=await rest(base,'/api/auth/profile','GET',undefined,secondCookie);
   assert.equal(response.status,200);
   const restored=await response.json();assert.equal(restored.revision,1);
   assert.deepEqual(JSON.parse(restored.data['historicalGeniusClash.tower.v1']),{jordan:43,pele:12});
   assert.equal(JSON.parse(restored.data['historicalGeniusClash.eraExpedition.v1']).archive[0].steps,12);
   response=await rest(base,'/api/auth/profile','PUT',{revision:0,data:save},secondCookie);
   assert.equal(response.status,409,'Stale concurrent update must fail');
   response=await fetch(base+'/health');
   assert.equal((await response.json()).online,'10.3');
 }finally{
   if(server1)await stop(server1.child);
   if(server2)await stop(server2.child);
   fs.rmSync(temp,{recursive:true,force:true});
 }
});
