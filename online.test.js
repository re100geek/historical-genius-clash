'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'hgc-ws-e2e-'));
process.env.HGC_DATA_DIR = temp;
const {server, onlineArena} = require('../server');
let port;
const peers = [];

async function peer() {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const packets = [];
  socket.addEventListener('message', event => {
    try {packets.push(JSON.parse(event.data));} catch { /* not a JSON game packet */ }
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('WebSocket open timeout')), 2500);
    socket.addEventListener('open', () => {clearTimeout(timeout); resolve();}, {once:true});
    socket.addEventListener('error', error => {clearTimeout(timeout); reject(error);}, {once:true});
  });
  const connection = {socket, packets, send(data) {socket.send(JSON.stringify(data));}};
  peers.push(connection);
  await expect(connection, message => message.type === 'hello', 1000);
  return connection;
}
function tick(ms=20) {return new Promise(resolve => setTimeout(resolve, ms));}
async function expect(connection, check, maxMs=3500) {
  const started = Date.now();
  do {
    const message = connection.packets.find(check);
    if (message) return message;
    await tick();
  } while (Date.now() - started < maxMs);
  throw new Error(`Timed out waiting for packet; messages=${JSON.stringify(connection.packets.slice(-5)).slice(0,800)}`);
}
async function expectNew(connection, after, check, maxMs=2500) {
  const started = Date.now();
  do {
    const message = connection.packets.slice(after).find(check);
    if (message) return message;
    await tick();
  } while (Date.now()-started<maxMs);
  throw new Error(`Timed out waiting for new packet; recent=${JSON.stringify(connection.packets.slice(-4)).slice(0,600)}`);
}
test.before(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
});
test.after(async () => {
  for (const connection of peers) if (connection.socket.readyState === WebSocket.OPEN) connection.socket.close();
  await tick(60);
  for (const connection of peers) if (connection.socket.readyState !== WebSocket.CLOSED) connection.socket.close();
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(temp, {recursive:true, force:true});
});

test('real WebSocket connection, two new characters, two-player room and state stream', async () => {
  const a = await peer();
  const b = await peer();
  const names = a.packets.find(packet => packet.type === 'hello').characters;
  for (const id of ['jackson', 'jordan', 'pele', 'yisunshin']) assert.ok(names.includes(id));
  a.send({type:'create', character:'jordan', stage:'basketball'});
  const host = await expect(a, packet => packet.type==='joined' && packet.slot===0);
  assert.match(host.room,/^[A-Z2-9]{6}$/);
  b.send({type:'join', room:host.room, character:'pele'});
  await expect(b, packet => packet.type==='joined' && packet.room===host.room && packet.slot===1);
  const lobby = await expect(a, packet => packet.type==='lobby' && packet.people?.[1]?.character==='pele');
  assert.equal(lobby.stage,'basketball');
  assert.equal(lobby.people[0].character,'jordan');
  a.send({type:'ready',ready:true});
  b.send({type:'ready',ready:true});
  await expect(a, packet => packet.type==='countdown' && packet.characters?.join(',')==='jordan,pele');
  await expect(b, packet => packet.type==='start', 5000);
  const state = await expect(a, packet => packet.type==='state' && packet.status==='running', 2000);
  assert.deepEqual(state.fighters.map(f=>f.id), ['jordan', 'pele']);
  assert.equal(state.stage,'basketball');
  assert.ok(state.frame >= 0);
  assert.ok(onlineArena.rooms.has(host.room));
  const room = onlineArena.rooms.get(host.room);
  // Gameplay input still arrives over WebSocket; only the test moves fighters into
  // direct hit range instead of spending many seconds on movement inputs.
  room.fighters[0].x = 430;room.fighters[1].x = 486;
  room.fighters[0].dir = 1;room.fighters[1].dir = -1;
  const originalHp = room.fighters[1].hp;
  const beforeAttack = a.packets.length;
  a.send({type:'input',keys:{attack:true}});
  await expectNew(a,beforeAttack, packet=>packet.type==='state' && packet.fighters?.[1]?.hp<originalHp, 3000);
  assert.ok(room.fighters[1].hp < originalHp, 'Valid normal attack must damage target');
  assert.ok(room.fighters[0].energy > 0, 'Landed attack must fill special meter');
  a.send({type:'input',keys:{attack:false}});
  await tick(800);
  room.fighters[0].cooldown=0;room.fighters[0].attack='';room.fighters[0].attackTime=0;room.fighters[0].energy=100;
  room.fighters[0].x=425;room.fighters[1].x=484;
  room.fighters[1].stun=0;room.fighters[1].invuln=0;
  const hpBeforeSpecial=room.fighters[1].hp;
  const beforeSpecial=a.packets.length;
  a.send({type:'input',keys:{special:true}});
  await expectNew(a,beforeSpecial, packet=>packet.type==='state' && packet.fighters?.[0]?.energy<100,2500);
  assert.ok(room.fighters[0].energy<100,'Special must consume energy');
  await expectNew(a,beforeSpecial, packet=>packet.type==='state' && packet.fighters?.[1]?.hp<hpBeforeSpecial,3500);
  assert.ok(room.fighters[1].hp<hpBeforeSpecial,'Special must damage target');
  a.send({type:'input',keys:{special:false}});
  // Host can return to lobby after guest disconnect and admit a fresh client.
  const beforeQuit=a.packets.length;
  b.socket.close();
  await expectNew(a,beforeQuit,packet=>packet.type==='opponent_left',2500);
  const next=await peer();
  next.send({type:'join',room:host.room,character:'yisunshin'});
  await expect(next,packet=>packet.type==='joined' && packet.slot===1,2500);
  assert.equal(onlineArena.rooms.get(host.room).players[1].character,'yisunshin');
  next.socket.close();a.socket.close();
});

test('all four newcomer specials consume meter but never hit opponents outside their 250px server range',async()=>{
  const roster=['jackson','jordan','pele','yisunshin'];
  for(const id of roster){
    const a=await peer();const b=await peer();
    a.send({type:'create',character:id,stage:'library'});
    const joined=await expect(a,packet=>packet.type==='joined'&&packet.slot===0);
    b.send({type:'join',room:joined.room,character:'newton'});
    await expect(b,packet=>packet.type==='joined'&&packet.slot===1);
    a.send({type:'ready',ready:true});b.send({type:'ready',ready:true});
    await expect(a,packet=>packet.type==='countdown');
    const room=onlineArena.rooms.get(joined.room);
    room.countdown=1;await expect(a,packet=>packet.type==='start');
    room.fighters[0].x=100;room.fighters[1].x=880;
    room.fighters[0].vx=0;room.fighters[1].vx=0;
    room.fighters[0].energy=100;
    const hp=room.fighters[1].hp;
    const start=a.packets.length;
    a.send({type:'input',keys:{special:true}});
    await expectNew(a,start,packet=>packet.type==='state' && packet.fighters?.[0]?.energy===0,2200);
    await expectNew(a,start,packet=>packet.type==='state' && packet.fighters?.[0]?.attack==='',3200);
    assert.equal(room.fighters[1].hp,hp,id+' unexpectedly hit across arena');
    assert.equal(room.fighters[0].specialsUsed,1,id+' special usage counter');
    a.send({type:'input',keys:{special:false}});
    a.socket.close();b.socket.close();
    await tick(50);
  }
});
