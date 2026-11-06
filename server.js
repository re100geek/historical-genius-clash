'use strict';
/* Historical Genius Clash v10.1 — dependency-free HTTP + WebSocket arena server.
 * This is a starter server for casual friend matches, not a production anti-cheat service.
 * Server exclusively authorizes movement, attacks, damage, energy, timers and victory.
 */
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const MAX_ROOMS = 80;
const TICK_MS = 1000 / 30;
const MAX_MESSAGE_BYTES = 2048;
const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const VALID_STAGES = ['library','observatory','workshop','laboratory','power','calculation','pella','agora','academy','alps'];
const CHARACTER_DEFINITIONS = [
 ['newton',1060,0.78,100,18,60,15], ['leibniz',910,1.02,76,12,48,13],
 ['handel',970,0.86,94,14,54,14], ['bach',1120,0.66,102,20,64,17],
 ['davinci',1000,0.91,92,16,58,15], ['galileo',950,0.96,112,14,52,14],
 ['curie',990,0.86,96,15,57,15], ['tesla',945,1.05,88,14,63,17],
 ['ada',935,1.0,107,13,54,16], ['alexander',1025,0.92,108,16,59,16],
 ['socrates',975,0.94,94,14,54,15], ['plato',965,0.88,111,15,56,16],
 ['hannibal',1050,0.81,103,18,60,17]
];
const STATS = new Map(CHARACTER_DEFINITIONS.map(([id,hp,speed,reach,normalDamage,specialDamage,energyGain])=>[id,{id,hp,speed,reach,normalDamage,specialDamage,energyGain}]));
const rooms = new Map();
const clients = new Set();
const inputNames = ['left','right','jump','guard','attack','strong','special','dash','dodge'];
const emptyInput = () => ({left:false,right:false,jump:false,guard:false,attack:false,strong:false,special:false,dash:false,dodge:false});
const clamp = (n,min,max) => Math.max(min,Math.min(max,n));
const now = () => Date.now();

class MiniWS {
 constructor(socket) {
  this.socket=socket;this.buffer=Buffer.alloc(0);this.closed=false;this.onmessage=null;this.onclose=null;this.pongAt=now();
  socket.on('data',chunk=>this.receive(chunk));socket.on('close',()=>this.onSocketClose());socket.on('end',()=>this.onSocketClose());socket.on('error',()=>this.close());
 }
 send(obj){if(this.closed)return;const data=Buffer.from(JSON.stringify(obj),'utf8');this.writeFrame(1,data);}
 writeFrame(opcode,data=Buffer.alloc(0)) {
  if(this.closed || this.socket.destroyed)return;
  const length=data.length;const head=length<126?Buffer.alloc(2):length<=65535?Buffer.alloc(4):Buffer.alloc(10);
  head[0]=0x80|opcode;
  if(length<126)head[1]=length;
  else if(length<=65535){head[1]=126;head.writeUInt16BE(length,2);}
  else{head[1]=127;head.writeBigUInt64BE(BigInt(length),2);}
  this.socket.write(Buffer.concat([head,data]));
 }
 receive(chunk){
  if(this.closed)return;
  if(this.buffer.length+chunk.length>MAX_MESSAGE_BYTES*4){this.close();return;}
  this.buffer=Buffer.concat([this.buffer,chunk]);
  while(this.buffer.length>=2){
   const b0=this.buffer[0],b1=this.buffer[1],masked=!!(b1&128),opcode=b0&15;
   if(!(b0&128)||!masked||!(opcode===1||opcode===8||opcode===9||opcode===10)){this.close();return;}
   let length=b1&127,offset=2;
   if(length===126){if(this.buffer.length<4)return;length=this.buffer.readUInt16BE(2);offset=4;}
   else if(length===127){if(this.buffer.length<10)return;const big=this.buffer.readBigUInt64BE(2);if(big>BigInt(MAX_MESSAGE_BYTES)){this.close();return;}length=Number(big);offset=10;}
   if(length>MAX_MESSAGE_BYTES){this.close();return;}
   if(this.buffer.length<offset+4+length)return;
   const mask=this.buffer.subarray(offset,offset+4);offset+=4;
   const payload=Buffer.from(this.buffer.subarray(offset,offset+length));
   this.buffer=this.buffer.subarray(offset+length);
   for(let i=0;i<payload.length;i++)payload[i]^=mask[i&3];
   if(opcode===8){this.close();return;}
   if(opcode===9){this.writeFrame(10,payload);continue;}
   if(opcode===10){this.pongAt=now();continue;}
   try{if(typeof this.onmessage==='function')this.onmessage(JSON.parse(payload.toString('utf8')));}catch(error){this.send({type:'error',message:'잘못된 메시지 형식'});}
  }
 }
 close(){if(this.closed)return;this.closed=true;try{this.socket.end(Buffer.from([0x88,0x00]));}catch{}this.socket.destroy();this.onSocketClose();}
 onSocketClose(){if(this._closedHandled)return;this._closedHandled=true;this.closed=true;clients.delete(this);if(this.onclose)this.onclose();}
}
function roomCode(){for(let k=0;k<30;k++){let code='';for(let i=0;i<6;i++)code+=ROOM_CODE_CHARS[crypto.randomInt(ROOM_CODE_CHARS.length)];if(!rooms.has(code))return code;}throw Error('No room codes available');}
const send = (ws,value) => {if(ws&&!ws.closed)ws.send(value);};
function tell(room,value){for(const p of room.players)if(p)send(p.ws,value);}
function roomStatus(room){
 return {type:'lobby',room:room.code,host:room.players[0]?.id||null,stage:room.stage,
   people:room.players.map((p,i)=>p?{slot:i,character:p.character,ready:p.ready}:null),
   status:room.status};
}
function emitLobby(room){tell(room,roomStatus(room));}
function freshFighter(player,index){
 const s=STATS.get(player.character),x=index?710:250;
 return {id:s.id,slot:index,x,y:316,vx:0,vy:0,dir:index?-1:1,hp:s.hp,maxHp:s.hp,energy:0,guardMeter:100,guard:false,ground:true,
  cooldown:0,stun:0,invuln:0,dodgeCd:0,dashCd:0,dash:0,attack:'',attackTime:0,attackAge:0,hitDone:false,flash:0,
  combo:0,comboTimer:0,specialsUsed:0,prev:emptyInput()};
}
function changeCharacter(room,player,id){if(room.status!=='lobby'&&room.status!=='finished')return; if(!STATS.has(id))return;
 player.character=id;player.ready=false;if(room.status==='finished')room.status='lobby';emitLobby(room);
}
function leaveRoom(p){
 const room=p.room;if(!room)return;p.room=null;
 const slot=room.players.indexOf(p);if(slot>=0)room.players[slot]=null;
 if(room.status==='running'||room.status==='countdown'){
   room.status='finished';room.winner=slot===0?1:0;
   tell(room,{type:'result',winner:room.winner,reason:'disconnect'});
 }
 if(room.players.every(x=>!x)){rooms.delete(room.code);}else{
   if(!room.players[0] && room.players[1]){room.players[0]=room.players[1];room.players[1]=null;room.players[0].slot=0;send(room.players[0].ws,{type:'joined',room:room.code,slot:0});}
   room.status='lobby';room.players.forEach(x=>{if(x)x.ready=false;});emitLobby(room);
 }
}
function startMatch(room){
 if(room.players.length!==2||!room.players.every(p=>p&&p.ready))return;
 room.status='countdown';room.countdown=90;room.ticks=0;room.fighters=room.players.map(freshFighter);room.winner=null;
 room.players.forEach(p=>{p.input=emptyInput();p.lastInputAt=now();});
 tell(room,{type:'countdown',seconds:3,room:room.code,stage:room.stage,characters:room.fighters.map(f=>f.id)});
 emitLobby(room);
}
function sendState(room,events=[]){
 const data={type:'state',room:room.code,status:room.status,stage:room.stage,frame:room.ticks,seconds:Math.max(0,Math.ceil((2700-room.ticks)/30)),winner:room.winner,events,
  fighters:room.fighters.map(f=>({id:f.id,slot:f.slot,x:Math.round(f.x*10)/10,y:Math.round(f.y*10)/10,vx:Math.round(f.vx*10)/10,vy:Math.round(f.vy*10)/10,dir:f.dir,hp:f.hp,maxHp:f.maxHp,energy:Math.round(f.energy),guardMeter:Math.round(f.guardMeter),guard:f.guard,ground:f.ground,attack:f.attack,attackAge:f.attackAge,attackTime:f.attackTime,flash:f.flash,stun:f.stun,combo:f.combo}))};
 tell(room,data);
}
function resolveHit(attacker,target,room,events){
 const t=attacker.attack;const s=STATS.get(attacker.id);
 const range=t==='special'?Math.max(245,s.reach+130):s.reach+(t==='heavy'?46:20);
 const forward=(target.x-attacker.x)*attacker.dir;
 if(forward < -28 || Math.abs(target.x-attacker.x)>range || Math.abs(target.y-attacker.y)>105 || target.invuln>0)return;
 const power=t==='special'?s.specialDamage*1.5:t==='heavy'?s.normalDamage*1.5*1.6:s.normalDamage*1.5;
 const guard=target.guard&&target.guardMeter>0&&target.ground;
 const damage=Math.max(1,Math.round(power*(guard?.28:1)));
 target.hp=Math.max(0,target.hp-damage);target.flash=8;target.stun=guard?3:t==='special'?16:t==='heavy'?12:7;
 target.vx=attacker.dir*(guard?2:t==='special'?9:6);
 if(!guard)target.vy=t==='special'?-4:-2;
 if(guard){target.guardMeter=Math.max(0,target.guardMeter-(t==='heavy'?33:t==='special'?38:18));if(target.guardMeter===0){target.stun=26;target.guard=false;}}
 if(t!=='special')attacker.energy=Math.min(100,attacker.energy+s.energyGain*(t==='heavy'?1.4:1));
 target.energy=Math.min(100,target.energy+(guard?4:8));
 attacker.combo=attacker.comboTimer>0?attacker.combo+1:1;attacker.comboTimer=65;
 events.push({type:'hit',from:attacker.slot,to:target.slot,damage,guard,kind:t,combo:attacker.combo});
 if(target.hp===0){room.winner=attacker.slot;room.status='finished';events.push({type:'ko',winner:attacker.slot});}
}
function startAttack(f,kind,events){
 if(f.cooldown>0||f.stun>0||f.attackTime>0||!f.ground||f.dash>0||f.guard)return;
 if(kind==='special'){if(f.energy<100)return;f.energy=0;f.specialsUsed++;}
 f.attack=kind;f.attackTime=kind==='special'?38:kind==='heavy'?22:16;f.attackAge=0;f.hitDone=false;
 f.cooldown=kind==='special'?48:kind==='heavy'?29:20;
 events.push({type:'attack',slot:f.slot,kind});
}
function stepFighter(f,input,events){
 const s=STATS.get(f.id),edge=(k)=>input[k]&&!f.prev[k];
 f.dir=f.slot===0?1:-1; // replaced below by opponent position in stepMatch
 if(f.cooldown>0)f.cooldown--;if(f.stun>0)f.stun--;if(f.flash>0)f.flash--;if(f.dashCd>0)f.dashCd--;
 if(f.dodgeCd>0)f.dodgeCd--;if(f.invuln>0)f.invuln--;if(f.comboTimer>0)f.comboTimer--;else f.combo=0;
 const horizontal=(input.left?-1:0)+(input.right?1:0);
 f.guard=!!(input.guard&&f.stun===0&&f.ground&&f.attackTime===0&&f.guardMeter>0&&f.dash===0);
 if(!f.guard)f.guardMeter=clamp(f.guardMeter+.21,0,100);
 if(f.stun===0){
   if(!f.guard&&horizontal&&f.dash===0)f.vx=clamp(f.vx+horizontal*s.speed*1.25,-7,7);
   if(edge('jump')&&f.ground&&!f.guard){f.vy=-12.1;f.ground=false;}
   if(edge('dash')&&f.dashCd===0&&f.ground&&!f.guard&&f.attackTime===0){f.dash=8;f.dashCd=44;f.vx=(horizontal||f.dir)*12;}
   if(edge('dodge')&&f.dodgeCd===0&&f.ground&&f.attackTime===0){f.invuln=11;f.dodgeCd=55;f.vx=-(horizontal||f.dir)*9;}
   if(edge('special'))startAttack(f,'special',events);
   else if(edge('strong'))startAttack(f,'heavy',events);
   else if(edge('attack'))startAttack(f,'normal',events);
 }
 f.prev={...input};
 if(f.attackTime>0){f.attackTime--;f.attackAge++;if(f.attackTime===0)f.attack='';}
 if(f.dash>0)f.dash--;
 f.x=clamp(f.x+f.vx,44,916);f.vx*=f.dash>0?.91:.78;
 f.vy+=.62;f.y+=f.vy;
 if(f.y>=316){f.y=316;f.vy=0;f.ground=true;}
}
function stepMatch(room){
 const events=[];
 if(room.status==='countdown'){room.countdown--;if(room.countdown<=0){room.status='running';tell(room,{type:'start',room:room.code});}return;}
 if(room.status!=='running')return;
 room.ticks++;
 const all=room.fighters;
 for(let i=0;i<2;i++){
   const p=room.players[i],f=all[i];if(!p)return;
   f.dir=all[1-i].x>=f.x?1:-1;
   const input=now()-p.lastInputAt>550?emptyInput():p.input;
   stepFighter(f,input,events);
 }
 for(let i=0;i<2;i++){
  const f=all[i],target=all[1-i];f.dir=target.x>=f.x?1:-1;
  if(f.attack&&!f.hitDone){
    const threshold=f.attack==='special'?15:f.attack==='heavy'?9:5;
    if(f.attackAge>=threshold){f.hitDone=true;resolveHit(f,target,room,events);}
  }
 }
 if(all[0].x>all[1].x&&all[0].x-all[1].x<30){all[0].x-=15;all[1].x+=15;}
 if(room.ticks>=2700&&room.status==='running'){
  const a=all[0].hp/all[0].maxHp,b=all[1].hp/all[1].maxHp;
  room.winner=a===b?null:(a>b?0:1);room.status='finished';events.push({type:'timeout',winner:room.winner});
 }
 if(room.ticks%2===0||events.length)sendState(room,events);
 if(room.status==='finished')tell(room,{type:'result',winner:room.winner,reason:events.some(e=>e.type==='timeout')?'timeout':'ko'});
}
function createRoom(ws,character,stage){
 if(rooms.size>=MAX_ROOMS){send(ws,{type:'error',message:'현재 방이 가득 찼습니다.'});return;}
 const code=roomCode();const player={ws,room:null,slot:0,character:STATS.has(character)?character:'newton',ready:false,input:emptyInput(),lastInputAt:now(),lastMessageAt:0};
 const room={code,players:[player,null],status:'lobby',stage:VALID_STAGES.includes(stage)?stage:'library',fighters:[],ticks:0};
 player.room=room;rooms.set(code,room);ws.player=player;
 send(ws,{type:'joined',room:code,slot:0});emitLobby(room);
}
function joinRoom(ws,code,character){
 const room=rooms.get(code);if(!room){send(ws,{type:'error',message:'해당 방을 찾지 못했습니다.'});return;}
 if(room.players[1]||room.status==='running'||room.status==='countdown'){send(ws,{type:'error',message:'입장 가능한 방이 아닙니다.'});return;}
 const player={ws,room,slot:1,character:STATS.has(character)?character:'leibniz',ready:false,input:emptyInput(),lastInputAt:now(),lastMessageAt:0};
 room.players[1]=player;ws.player=player;room.players.forEach(p=>{if(p)p.ready=false;});room.status='lobby';
 send(ws,{type:'joined',room:code,slot:1});emitLobby(room);
}
function handle(ws,data){
 if(!data||typeof data!=='object'||Array.isArray(data)||typeof data.type!=='string')return;
 const p=ws.player;
 if(!p){
  if(data.type==='create')createRoom(ws,data.character,data.stage);
  else if(data.type==='join')joinRoom(ws,String(data.room||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6),data.character);
  return;
 }
 if(data.type==='leave'){leaveRoom(p);ws.player=null;send(ws,{type:'left'});return;}
 if(data.type==='character'){changeCharacter(p.room,p,data.character);return;}
 if(data.type==='ready'){
  if(p.room.status!=='lobby')return;
  p.ready=!!data.ready;emitLobby(p.room);
  if(p.room.players.every(q=>q&&q.ready))startMatch(p.room);
  return;
 }
 if(data.type==='input'&&p.room.status==='running'){
  if(now()-p.lastMessageAt<12)return;
  p.lastMessageAt=now();p.lastInputAt=now();
  if(!data.keys||typeof data.keys!=='object')return;
  const clean=emptyInput();for(const key of inputNames)clean[key]=data.keys[key]===true;
  p.input=clean;
 }
 if(data.type==='rematch'&&p.room.status==='finished'){
  p.room.status='lobby';p.room.players.forEach(q=>{if(q){q.ready=false;q.input=emptyInput();}});emitLobby(p.room);
 }
}
const server=http.createServer((req,res)=>{
 const requestPath=new URL(req.url,'http://localhost').pathname;
 if(req.method!=='GET'){res.writeHead(405);res.end();return;}
 if(requestPath==='/health'){
  res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(JSON.stringify({ok:true,version:'10.1',rooms:rooms.size,players:clients.size}));return;
 }
 if(requestPath!=='/'&&requestPath!=='/index.html'){res.writeHead(404);res.end('Not found');return;}
 const file=path.join(__dirname,'index.html');
 fs.readFile(file,(error,data)=>{
  if(error){res.writeHead(500);res.end('Game unavailable');return;}
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(data);
 });
});
server.on('upgrade',(req,socket,head)=>{
 try{
  if(new URL(req.url,'http://localhost').pathname!=='/ws'){socket.destroy();return;}
  const origin=req.headers.origin||'';
  const allowed=(process.env.ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean);
  if(origin){const hostname=(req.headers.host||'').split(':')[0];
   const localNullOrigin=origin==='null'&&['localhost','127.0.0.1','::1'].includes(hostname);
   const matchingOrigin=origin!=='null'&&new URL(origin).hostname===hostname;
   if(!localNullOrigin&&!matchingOrigin&&!allowed.includes(origin)){socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');socket.destroy();return;}
  }
  if(req.headers.upgrade?.toLowerCase()!=='websocket'||req.headers['sec-websocket-version']!=='13'||!String(req.headers['sec-websocket-key']||'').match(/^[A-Za-z0-9+/]{22}==$/)){
    socket.destroy();return;
  }
  const key=req.headers['sec-websocket-key'];const accept=crypto.createHash('sha1').update(key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+accept+'\r\n\r\n');
  if(clients.size>=160){socket.destroy();return;}
  const ws=new MiniWS(socket);clients.add(ws);
  ws.onmessage=d=>handle(ws,d);ws.onclose=()=>{if(ws.player)leaveRoom(ws.player);};
  ws.send({type:'hello',version:'10.1',characters:[...STATS.keys()]});
  if(head?.length)ws.receive(head);
 }catch{socket.destroy();}
});
const tick=setInterval(()=>{for(const room of rooms.values())stepMatch(room);},TICK_MS);
const pulse=setInterval(()=>{for(const ws of [...clients]){if(now()-ws.pongAt>40000)ws.close();else ws.writeFrame(9,Buffer.from('hgc'));}},15000);
server.listen(PORT,HOST,()=>{
 console.log(`Historical Genius Clash v10.1.1 server started: http://localhost:${PORT}`);
 console.log('Server stays online while this terminal is open.');
 for(const iface of Object.values(os.networkInterfaces())){
  for(const addr of iface||[]){if(addr.family==='IPv4'&&!addr.internal){console.log(`Same Wi-Fi devices: http://${addr.address}:${PORT}`);}}
 }
});
function shutdown(){clearInterval(tick);clearInterval(pulse);for(const ws of [...clients])ws.close();server.close(()=>process.exit(0));}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
module.exports={server,rooms,STATS};
