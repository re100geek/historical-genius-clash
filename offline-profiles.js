/* HGC v14.3.6 server-free local profiles. Not remote authentication or encrypted storage. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.HGCOfflineProfiles = api;
})(typeof window === 'object' ? window : null, function () {
  'use strict';
  const VAULT = 'hgc.localProfiles.v1';
  const GUEST = 'hgc.localGuest.v1';
  const ACTIVE = 'hgc.localActive.v1';
  const LAST = 'hgc.localLastActive.v1';
  const PREFIX = 'historicalGeniusClash.';
  const SAFE_KEY = /^historicalGeniusClash\.[\w.-]{1,100}$/;
  const EXCLUDED = new Set(['historicalGeniusClash.recoveryGuard.v1']);
  const MAX_RECORD_BYTES = 2_200_000;
  const MAX_PROFILES = 3;
  const ITERATIONS = 150_000;
  const encoder = new TextEncoder();

  function storage() { return globalThis.localStorage; }
  // Preview/test origins can deny sessionStorage. Use a per-page ephemeral fallback;
  // ordinary device sessions still use the native browser storage.
  const ephemeralSession = new Map();
  const sessionFallback = {
    getItem: key => ephemeralSession.get(key) || null,
    setItem: (key, value) => ephemeralSession.set(key, String(value)),
    removeItem: key => ephemeralSession.delete(key),
  };
  function session() {
    try { return globalThis.sessionStorage || sessionFallback; }
    catch { return sessionFallback; }
  }
  function cryptoProvider() {
    const provider = globalThis.crypto;
    if (!provider?.subtle || !provider?.getRandomValues) {
      throw new Error('기기 프로필 암호 기능에는 보안 브라우저 환경이 필요합니다.');
    }
    return provider;
  }
  function readJSON(value, fallback) {
    if (!value) return fallback;
    try { return JSON.parse(value); } catch { return fallback; }
  }
  function vault(storageApi = storage()) {
    const value = readJSON(storageApi.getItem(VAULT), null);
    if (!value) return {version: 1, profiles: {}};
    if (value.version !== 1 || !value.profiles || typeof value.profiles !== 'object' ||
        Array.isArray(value.profiles)) throw new Error('기기 프로필 저장 구조가 올바르지 않습니다.');
    return value;
  }
  function validateRecords(records) {
    if (!records || typeof records !== 'object' || Array.isArray(records)) {
      throw new Error('저장 데이터 형식이 올바르지 않습니다.');
    }
    const result = {};
    for (const [key, value] of Object.entries(records)) {
      if (!SAFE_KEY.test(key) || EXCLUDED.has(key)) throw new Error('지원하지 않는 저장 키입니다.');
      if (typeof value !== 'string') throw new Error('게임 기록은 JSON 문자열이어야 합니다.');
      JSON.parse(value);
      result[key] = value;
    }
    if (JSON.stringify(result).length > MAX_RECORD_BYTES) {
      throw new Error('진행도 용량이 커서 저장할 수 없습니다. 백업 후 정리하세요.');
    }
    return result;
  }
  function capture(storageApi = storage()) {
    const result = {};
    for (let i = 0; i < storageApi.length; i += 1) {
      const key = storageApi.key(i);
      if (!SAFE_KEY.test(key || '') || EXCLUDED.has(key)) continue;
      const raw = storageApi.getItem(key);
      if (typeof raw !== 'string') continue;
      try { JSON.parse(raw); result[key] = raw; } catch { /* exclude invalid legacy data */ }
    }
    return validateRecords(result);
  }
  function restore(records, storageApi = storage()) {
    const incoming = validateRecords(records);
    const before = capture(storageApi);
    try {
      for (const key of Object.keys(before)) storageApi.removeItem(key);
      for (const [key, value] of Object.entries(incoming)) storageApi.setItem(key, value);
    } catch (error) {
      try {
        for (const key of Object.keys(incoming)) storageApi.removeItem(key);
        for (const [key, value] of Object.entries(before)) storageApi.setItem(key, value);
      } catch { /* Previous records also retained in account vault. */ }
      throw error;
    }
  }
  function writeVault(next, storageApi = storage()) {
    storageApi.setItem(VAULT, JSON.stringify(next));
  }
  function saveGuest(storageApi = storage()) {
    storageApi.setItem(GUEST, JSON.stringify(capture(storageApi)));
  }
  function currentId(sessionApi = session()) { return sessionApi.getItem(ACTIVE) || ''; }
  function isActive(sessionApi = session()) { return Boolean(currentId(sessionApi)); }
  function list(storageApi = storage()) {
    const all = vault(storageApi).profiles;
    return Object.entries(all).map(([id, p]) => ({id, name: p.name,
      updatedAt: p.updatedAt, keys: Object.keys(p.records || {}).length}));
  }
  function randomHex(bytes = 16) {
    const array = new Uint8Array(bytes);
    cryptoProvider().getRandomValues(array);
    return Array.from(array, n => n.toString(16).padStart(2, '0')).join('');
  }
  async function passwordHash(password, salt) {
    if (typeof password !== 'string' || password.length < 8 || password.length > 72) {
      throw new Error('비밀번호는 8~72자로 입력하세요.');
    }
    const subtle = cryptoProvider().subtle;
    const key = await subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
    const derived = await subtle.deriveBits({name: 'PBKDF2', salt: encoder.encode(salt),
      iterations: ITERATIONS, hash: 'SHA-256'}, key, 256);
    return Array.from(new Uint8Array(derived), n => n.toString(16).padStart(2, '0')).join('');
  }
  function profileName(name) {
    if (typeof name !== 'string' || !/^[\p{L}\p{N}_ -]{2,20}$/u.test(name.trim())) {
      throw new Error('프로필 이름은 2~20자(문자·숫자·띄어쓰기·_)로 입력하세요.');
    }
    return name.trim();
  }
  async function create(name, password, {storageApi = storage(), sessionApi = session()} = {}) {
    if (currentId(sessionApi)) throw new Error('현재 프로필에서 로그아웃한 뒤 새 프로필을 만드세요.');
    const trimmed = profileName(name);
    const next = vault(storageApi);
    if (Object.keys(next.profiles).length >= MAX_PROFILES) throw new Error('기기 프로필은 최대 3개입니다.');
    if (Object.values(next.profiles).some(p => p.name.toLowerCase() === trimmed.toLowerCase())) {
      throw new Error('이미 같은 이름의 프로필이 있습니다.');
    }
    const id = randomHex(12);
    const salt = randomHex(16);
    const hash = await passwordHash(password, salt);
    const records = capture(storageApi);
    saveGuest(storageApi); // Existing guest progress stays available after logout.
    next.profiles[id] = {name: trimmed, salt, hash, records, updatedAt: Date.now()};
    writeVault(next, storageApi);
    sessionApi.setItem(ACTIVE, id);
    storageApi.setItem(LAST, id);
    return {id, name: trimmed};
  }
  async function login(id, password, {storageApi = storage(), sessionApi = session()} = {}) {
    if (currentId(sessionApi)) throw new Error('현재 프로필에서 로그아웃하세요.');
    const next = vault(storageApi);
    const profile = next.profiles[id];
    if (!profile) throw new Error('프로필을 찾을 수 없습니다.');
    const actual = await passwordHash(password, profile.salt);
    if (actual !== profile.hash) throw new Error('비밀번호가 일치하지 않습니다.');
    saveGuest(storageApi);
    restore(profile.records, storageApi);
    sessionApi.setItem(ACTIVE, id);
    storageApi.setItem(LAST, id);
    return {id, name: profile.name};
  }
  function saveActive({storageApi = storage(), sessionApi = session()} = {}) {
    const id = currentId(sessionApi);
    if (!id) return false;
    const next = vault(storageApi);
    const profile = next.profiles[id];
    if (!profile) throw new Error('활성 프로필을 찾을 수 없습니다.');
    const records = capture(storageApi);
    if (JSON.stringify(records) === JSON.stringify(profile.records)) return false;
    profile.records = records;
    profile.updatedAt = Date.now();
    writeVault(next, storageApi);
    return true;
  }
  function logout({storageApi = storage(), sessionApi = session()} = {}) {
    saveActive({storageApi, sessionApi});
    const guest = readJSON(storageApi.getItem(GUEST), {});
    restore(guest, storageApi);
    sessionApi.removeItem(ACTIVE);
    storageApi.removeItem(LAST);
  }
  function boot({storageApi = storage(), sessionApi = session()} = {}) {
    const active = currentId(sessionApi);
    const last = storageApi.getItem(LAST);
    if (active) {
      const current = vault(storageApi).profiles[active];
      if (!current) {sessionApi.removeItem(ACTIVE); storageApi.removeItem(LAST); return;}
      // Reload within the same browser tab retains session and current records.
      return;
    }
    if (!last) return;
    const next = vault(storageApi);
    if (next.profiles[last]) {
      next.profiles[last].records = capture(storageApi);
      next.profiles[last].updatedAt = Date.now();
      writeVault(next, storageApi);
    }
    restore(readJSON(storageApi.getItem(GUEST), {}), storageApi);
    storageApi.removeItem(LAST);
  }
  function exportCurrent({storageApi = storage(), sessionApi = session()} = {}) {
    const id = currentId(sessionApi);
    const p = vault(storageApi).profiles[id];
    if (!p) throw new Error('먼저 기기 프로필에 로그인하세요.');
    saveActive({storageApi, sessionApi});
    return {format: 'hgc-local-profile-backup-v1', name: p.name,
      createdAt: new Date().toISOString(), records: capture(storageApi)};
  }
  async function importBackup(input, name, password,
      {storageApi = storage(), sessionApi = session()} = {}) {
    if (!input || input.format !== 'hgc-local-profile-backup-v1') {
      throw new Error('HGC 기기 프로필 백업 형식이 아닙니다.');
    }
    const records = validateRecords(input.records);
    const newName = profileName(name);
    const next = vault(storageApi);
    if (currentId(sessionApi)) throw new Error('먼저 로그아웃하세요.');
    if (Object.keys(next.profiles).length >= MAX_PROFILES) throw new Error('프로필은 최대 3개입니다.');
    if (Object.values(next.profiles).some(p => p.name.toLowerCase() === newName.toLowerCase())) {
      throw new Error('이미 같은 이름의 프로필이 있습니다.');
    }
    const id = randomHex(12), salt = randomHex(16);
    const hash = await passwordHash(password, salt);
    next.profiles[id] = {name: newName, salt, hash, records, updatedAt: Date.now()};
    writeVault(next, storageApi);
    return {id, name: newName};
  }
  return Object.freeze({VAULT, GUEST, ACTIVE, LAST, MAX_PROFILES, capture, restore,
    validateRecords, list, create, login, logout, saveActive, boot, isActive,
    currentId, exportCurrent, importBackup});
});

// Run before HGC engine reads game progress on page reload.
if (typeof window === 'object' && window.HGCOfflineProfiles) {
  try { window.HGCOfflineProfiles.boot(); }
  catch (error) { console.warn('Local profile startup check:', error); }
}
