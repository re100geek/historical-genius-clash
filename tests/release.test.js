'use strict';
/* One release version across the whole repository, and /api/release must report it
 * together with the deployed commit so the in-game "게임 버전 확인" check agrees. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'hgc-release-'));
process.env.HGC_DATA_DIR = temp;
const pkg = require('../package.json');
const {server, GAME_VERSION, GIT_COMMIT} = require('../server');
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let port;

test.before(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
});
test.after(async () => {
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(temp, {recursive:true, force:true});
});

test('package.json is the single source of the release version', () => {
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
  assert.equal(GAME_VERSION, pkg.version);
  const clientVersion = indexHtml.match(/const GAME_VERSION = '([^']+)';/);
  assert.ok(clientVersion, 'index.html must declare GAME_VERSION');
  assert.equal(clientVersion[1], pkg.version, 'index.html GAME_VERSION must equal package.json version');
});

test('no stale version label is shown by the client', () => {
  for (const stale of ['v14.3.2', 'V14.4.1 ', '게임 v14.3']) {
    assert.equal(indexHtml.includes(stale), false, `index.html still carries the stale version label ${stale}`);
  }
  assert.ok(indexHtml.includes(`v${pkg.version}`), 'index.html must show the release version');
});

test('/api/release reports version, protocol and commit', async () => {
  const response = await fetch(`http://127.0.0.1:${port}/api/release`);
  assert.equal(response.status, 200);
  const release = await response.json();
  assert.equal(release.gameVersion, pkg.version);
  assert.equal(release.protocolVersion, '10.3');
  assert.equal(release.raidProtocolVersion, '1.0');
  assert.ok(release.features.includes('coop-raid'));
  assert.equal(release.commit, GIT_COMMIT);
  assert.ok(release.commit === null || /^[0-9a-f]{7}$/.test(release.commit), 'commit must be a 7-character short hash when known');
});

test('health endpoint carries the same version', async () => {
  const response = await fetch(`http://127.0.0.1:${port}/health`);
  const health = await response.json();
  assert.equal(health.status, 'ok');
  assert.equal(health.gameVersion, pkg.version);
  assert.equal(health.characters, 17);
});
