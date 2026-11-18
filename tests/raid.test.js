'use strict';
/* Cooperative raid (/raid) end-to-end: the server must own the room, the boss and the
 * deterministic raid simulation, and must speak the packet names the client in
 * index.html sends and expects. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'hgc-raid-e2e-'));
process.env.HGC_DATA_DIR = temp;
const {server, onlineArena} = require('../server');
let port;
const peers = [];

async function raidPeer() {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/raid`);
  const packets = [];
  socket.addEventListener('message', event => {
    try {packets.push(JSON.parse(event.data));} catch { /* not a JSON game packet */ }
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Raid WebSocket open timeout')), 2500);
    socket.addEventListener('open', () => {clearTimeout(timeout); resolve();}, {once:true});
    socket.addEventListener('error', error => {clearTimeout(timeout); reject(error);}, {once:true});
  });
  const connection = {socket, packets, send(data) {socket.send(JSON.stringify(data));}};
  peers.push(connection);
  await expect(connection, message => message.type === 'raid_hello', 1500);
  return connection;
}
const tick = (ms=20) => new Promise(resolve => setTimeout(resolve, ms));
async function expect(connection, check, maxMs=3500) {
  const started = Date.now();
  do {
    const message = connection.packets.find(check);
    if (message) return message;
    await tick();
  } while (Date.now() - started < maxMs);
  throw new Error(`Timed out waiting for packet; messages=${JSON.stringify(connection.packets.slice(-4)).slice(0,700)}`);
}
async function expectNew(connection, after, check, maxMs=3500) {
  const started = Date.now();
  do {
    const message = connection.packets.slice(after).find(check);
    if (message) return message;
    await tick();
  } while (Date.now() - started < maxMs);
  throw new Error(`Timed out waiting for new packet; recent=${JSON.stringify(connection.packets.slice(-4)).slice(0,700)}`);
}

test.before(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
});
test.after(async () => {
  for (const connection of peers) if (connection.socket.readyState === WebSocket.OPEN) connection.socket.close();
  await tick(80);
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(temp, {recursive:true, force:true});
});

test('raid_hello advertises the raid roster, bosses and difficulties', async () => {
  const a = await raidPeer();
  const hello = a.packets.find(message => message.type === 'raid_hello');
  assert.equal(hello.protocolVersion, '1.0');
  assert.deepEqual(hello.bosses.sort(), ['colossus','tempest','warden']);
  assert.deepEqual(hello.difficulties.sort(), ['master','normal','veteran']);
  assert.ok(hello.characters.includes('yisunshin'));
  a.socket.close();
});

test('solo raid: create, ready, start and authoritative boss damage', async () => {
  const a = await raidPeer();
  a.send({type:'raid_create', hero:'newton', bossId:'warden', difficulty:'normal'});
  const joined = await expect(a, message => message.type === 'raid_joined' && message.slot === 0);
  assert.match(joined.room, /^[A-Z2-9]{6}$/);
  const lobby = await expect(a, message => message.type === 'raid_lobby' && message.room === joined.room);
  assert.equal(lobby.status, 'lobby');
  assert.equal(lobby.slots[0].hero, 'newton');
  assert.equal(lobby.slots[1], null);

  a.send({type:'raid_ready', ready:true});
  await expect(a, message => message.type === 'raid_lobby' && message.slots[0].ready === true);
  a.send({type:'raid_start'});
  await expect(a, message => message.type === 'raid_started' && message.room === joined.room);
  const started = await expect(a, message => message.type === 'raid_state' && message.state.status === 'running');
  assert.equal(started.state.players.length, 1);
  assert.equal(started.state.boss.maxHp, 3500);

  const room = onlineArena.raid.rooms.get(joined.room);
  assert.ok(room, 'raid room must exist on the server');
  const state = room.state;
  state.boss.x = 600;
  state.players[0].x = 540;
  state.players[0].dir = 1;
  state.players[0].cooldown = 0;
  const bossHp = state.boss.hp;
  const before = a.packets.length;
  a.send({type:'raid_input', keys:{attack:true}});
  await expectNew(a, before, message => message.type === 'raid_state' && message.state.boss.hp < bossHp, 2500);
  assert.ok(room.state.boss.hp < bossHp, 'a landed hero attack must damage the boss');
  assert.ok(room.state.players[0].damage > 0);
  a.send({type:'raid_input', keys:{attack:false}});
  a.socket.close();
});

test('two-player raid: lobby sync, start gate, partner leave ends the run, rematch', async () => {
  const host = await raidPeer();
  const guest = await raidPeer();
  host.send({type:'raid_create', hero:'galileo', bossId:'colossus', difficulty:'veteran'});
  const joined = await expect(host, message => message.type === 'raid_joined' && message.slot === 0);
  guest.send({type:'raid_join', room:joined.room.toLowerCase(), hero:'curie'});
  await expect(guest, message => message.type === 'raid_joined' && message.room === joined.room && message.slot === 1);
  const lobby = await expect(host, message => message.type === 'raid_lobby' && message.slots[1]?.hero === 'curie');
  assert.equal(lobby.difficulty, 'veteran');
  assert.equal(lobby.bossId, 'colossus');

  // The server refuses a start before everyone is ready.
  const beforeError = host.packets.length;
  host.send({type:'raid_start'});
  await expectNew(host, beforeError, message => message.type === 'raid_error', 1500);

  host.send({type:'raid_ready', ready:true});
  guest.send({type:'raid_ready', ready:true});
  await expect(host, message => message.type === 'raid_lobby' && message.slots.every(slot => slot && slot.ready));
  host.send({type:'raid_start'});
  await expect(guest, message => message.type === 'raid_started' && message.difficulty === 'veteran');
  const started = await expect(guest, message => message.type === 'raid_state' && message.state.status === 'running');
  assert.deepEqual(started.state.players.map(player => player.id), ['galileo','curie']);
  assert.equal(started.state.boss.maxHp, Math.round(4500 * 1.58 * 1.5));

  // The guest leaving mid-run ends the raid for the host instead of leaving a zombie fight.
  const beforeLeave = host.packets.length;
  guest.send({type:'raid_leave'});
  await expectNew(host, beforeLeave, message => message.type === 'raid_state' && message.state.status === 'lost', 2500);
  const notice = await expectNew(host, beforeLeave, message => message.type === 'raid_notice', 2500);
  assert.match(notice.message, /종료/);
  assert.equal(onlineArena.raid.rooms.get(joined.room).status, 'finished');

  // Rematch returns the surviving player to the lobby and a solo run can start again.
  const beforeRematch = host.packets.length;
  host.send({type:'raid_rematch'});
  await expectNew(host, beforeRematch, message => message.type === 'raid_lobby' && message.status === 'lobby', 2000);
  host.send({type:'raid_ready', ready:true});
  host.send({type:'raid_start'});
  const restart = await expectNew(host, beforeRematch, message => message.type === 'raid_state' && message.state.status === 'running', 2500);
  assert.equal(restart.state.players.length, 1);
  host.socket.close();
});

test('unknown room and stray raid packets fail softly', async () => {
  const a = await raidPeer();
  const before = a.packets.length;
  a.send({type:'raid_join', room:'ZZZZZZ', hero:'newton'});
  await expectNew(a, before, message => message.type === 'raid_error', 1500);
  a.send({type:'raid_input', keys:{attack:true}});
  await expectNew(a, before, message => message.type === 'raid_error' && /먼저/.test(message.message), 1500);
  a.socket.close();
});
