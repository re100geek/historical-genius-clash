const test = require('node:test');
const assert = require('node:assert/strict');
const profiles = require('../src/offline/offline-profiles.js');

class MemoryStorage {
  constructor() { this.contents = new Map(); }
  get length() { return this.contents.size; }
  key(i) { return Array.from(this.contents.keys())[i] ?? null; }
  getItem(k) { return this.contents.has(k) ? this.contents.get(k) : null; }
  setItem(k, v) { this.contents.set(String(k), String(v)); }
  removeItem(k) { this.contents.delete(k); }
}
function setup() {
  const storageApi = new MemoryStorage();
  const sessionApi = new MemoryStorage();
  const opts = {storageApi, sessionApi};
  storageApi.setItem('historicalGeniusClash.eraExpedition.v1', JSON.stringify({act: 1, gold: 3}));
  storageApi.setItem('historicalGeniusClash.tower.v1', JSON.stringify({newton: 37}));
  return {storageApi, sessionApi, opts};
}

test('local profiles preserve and restore existing tower and era progress', async () => {
  const {storageApi, opts} = setup();
  const p = await profiles.create('학습자1', 'samplePass123', opts);
  assert.equal(profiles.list(storageApi).length, 1);
  storageApi.setItem('historicalGeniusClash.tower.v1', JSON.stringify({newton: 41}));
  profiles.saveActive(opts);
  profiles.logout(opts);
  assert.equal(JSON.parse(storageApi.getItem('historicalGeniusClash.tower.v1')).newton, 37);
  await assert.rejects(() => profiles.login(p.id, 'wrongPassword', opts), /비밀번호/);
  await profiles.login(p.id, 'samplePass123', opts);
  assert.equal(JSON.parse(storageApi.getItem('historicalGeniusClash.tower.v1')).newton, 41);
  assert.equal(JSON.parse(storageApi.getItem('historicalGeniusClash.eraExpedition.v1')).act, 1);
});

test('profiles isolate gameplay progress, preserve guest, and hash PIN rather than store raw', async () => {
  const {storageApi, opts} = setup();
  const first = await profiles.create('alpha', 'password123', opts);
  assert(!storageApi.getItem(profiles.VAULT).includes('password123'));
  storageApi.setItem('historicalGeniusClash.tower.v1', JSON.stringify({newton: 48}));
  profiles.logout(opts);
  const second = await profiles.create('beta', 'password456', opts);
  storageApi.setItem('historicalGeniusClash.tower.v1', JSON.stringify({newton: 62}));
  profiles.logout(opts);
  await profiles.login(first.id, 'password123', opts);
  assert.equal(JSON.parse(storageApi.getItem('historicalGeniusClash.tower.v1')).newton, 48);
  profiles.logout(opts);
  await profiles.login(second.id, 'password456', opts);
  assert.equal(JSON.parse(storageApi.getItem('historicalGeniusClash.tower.v1')).newton, 62);
});

test('save across reload, then lock and restore guest on browser restart', async () => {
  const {storageApi, sessionApi, opts} = setup();
  await profiles.create('alpha', 'password123', opts);
  storageApi.setItem('historicalGeniusClash.tower.v1', JSON.stringify({newton: 69}));
  profiles.boot(opts); // same session and refreshed page should preserve current state
  assert.equal(JSON.parse(storageApi.getItem('historicalGeniusClash.tower.v1')).newton, 69);
  const anotherTab = new MemoryStorage(); // new browser session after previous pagehide
  profiles.boot({storageApi, sessionApi: anotherTab});
  assert.equal(JSON.parse(storageApi.getItem('historicalGeniusClash.tower.v1')).newton, 37);
  assert.equal(profiles.list(storageApi).length, 1);
  assert.equal(sessionApi.getItem(profiles.ACTIVE) !== null, true);
});

test('backup exports progress without password hash and imports after validation', async () => {
  const {storageApi, opts} = setup();
  await profiles.create('first', 'password123', opts);
  const exported = profiles.exportCurrent(opts);
  assert.equal(exported.format, 'hgc-local-profile-backup-v1');
  assert.equal(exported.records['historicalGeniusClash.tower.v1'], '{"newton":37}');
  assert.equal(JSON.stringify(exported).includes('password123'), false);
  profiles.logout(opts);
  const imported = await profiles.importBackup(exported, 'second', 'password456', opts);
  await profiles.login(imported.id, 'password456', opts);
  assert.equal(JSON.parse(storageApi.getItem('historicalGeniusClash.tower.v1')).newton, 37);
});

test('reject malformed imports and unexpected game keys', async () => {
  const {opts} = setup();
  await assert.rejects(() => profiles.importBackup({format: 'wrong'}, 'new', 'password123', opts));
  assert.throws(() => profiles.validateRecords({'hgc.localProfiles.v1': '{}'}), /키/);
  assert.throws(() => profiles.validateRecords({'historicalGeniusClash.tower.v1': '{bad'}));
  assert.throws(() => profiles.validateRecords({'historicalGeniusClash.recoveryGuard.v1': '{}'}));
});

test('third local profile is allowed but fourth is rejected', async () => {
  const {storageApi, opts} = setup();
  for (let i = 0; i < 3; i += 1) {
    await profiles.create('slot' + i, 'password123', opts);
    profiles.logout(opts);
  }
  await assert.rejects(() => profiles.create('slot3', 'password123', opts), /최대 3개/);
  assert.equal(profiles.list(storageApi).length, 3);
});
