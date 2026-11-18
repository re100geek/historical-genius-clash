'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'hgc-auth-v2-'));
process.env.HGC_DATA_DIR=tmp;
const {server}=require('../server');
let base='';
let cookie='';
let user='';
async function query(route, method='GET', payload, suppliedCookie=cookie) {
  const response=await fetch(base+route,{method,headers:{
    Origin:base,'Content-Type':'application/json',Cookie:suppliedCookie},
    body:payload===undefined?undefined:JSON.stringify(payload)});
  const data=await response.json();
  if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];
  return {status:response.status,data};
}
test.before(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 base=`http://127.0.0.1:${server.address().port}`;
 user='user_'+Date.now();
});
test.after(async()=>{
 await new Promise(resolve=>server.close(resolve));
 fs.rmSync(tmp,{recursive:true,force:true});
});
test('registration and password protection',async()=>{
 const registered=await query('/api/auth/register','POST',{username:user,password:'safe-character-password-83'});
 assert.equal(registered.status,201);
 assert.equal(registered.data.account.username,user);
 assert.match(cookie,/hgc_session_v2=/);
 const persisted=fs.readFileSync(path.join(tmp,'accounts.json'),'utf8');
 assert.ok(!persisted.includes('safe-character-password-83'));
 assert.ok(persisted.includes('passwordHash'));
 assert.equal((await query('/api/auth/register','POST',{username:user,password:'another-long-password'})).status,409);
});
test('profile revision and tower progress persistence',async()=>{
 const data={'historicalGeniusClash.tower.v1':JSON.stringify({newton:23,pele:4}),
  'historicalGeniusClash.storyProgress.v1':JSON.stringify({completed:2})};
 assert.equal((await query('/api/auth/profile')).data.revision,0);
 const written=await query('/api/auth/profile','PUT',{revision:0,data});
 assert.equal(written.status,200);assert.equal(written.data.revision,1);
 assert.equal((await query('/api/auth/profile','PUT',{revision:0,data})).status,409);
 const read=await query('/api/auth/profile');
 assert.equal(read.status,200);assert.equal(read.data.data['historicalGeniusClash.tower.v1'],data['historicalGeniusClash.tower.v1']);
});
test('logout invalidates session and login restores account',async()=>{
 assert.equal((await query('/api/auth/logout','POST',{})).status,200);
 assert.equal((await query('/api/auth/profile')).status,401);
 assert.equal((await query('/api/auth/login','POST',{username:user,password:'wrong-password-234'})).status,401);
 assert.equal((await query('/api/auth/login','POST',{username:user,password:'safe-character-password-83'})).status,200);
 const p=await query('/api/auth/profile');
 assert.equal(JSON.parse(p.data.data['historicalGeniusClash.tower.v1']).newton,23);
});
test('origin, invalid profile and static paths rejected',async()=>{
 const token=cookie;
 assert.equal((await query('/api/auth/profile','PUT',{revision:1,data:{'invalid':'value'}})).status,400);
 const evil=await fetch(base+'/api/auth/profile',{method:'PUT',headers:{Origin:'https://other.example',Cookie:token,'Content-Type':'application/json'},body:JSON.stringify({revision:1,data:{}})});
 assert.equal(evil.status,403);
 assert.equal((await fetch(base+'/data/accounts.json')).status,404);
 assert.equal((await fetch(base+'/')).status,200);
});
