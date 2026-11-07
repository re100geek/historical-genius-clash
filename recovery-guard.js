/* Historical Genius Clash v13.5 — optional, independent settings extension.
 * Preserves existing localStorage save keys and multiplayer protocol.
 */
(() => {
  'use strict';

  const GAME_VERSION = '13.6';
  const RECOVERY_KEY = 'historicalGeniusClash.recoveryGuard.v1';
  const SAVE_KEYS = Object.freeze([
    'historicalGeniusClash.goldAndSkins.v1',
    'historicalGeniusClash.storyProgress.v1',
    'historicalGeniusClash.keyBindings.v1',
    'historicalGeniusClash.soundSettings.v1',
    'historicalGeniusClash.profile.v1',
    'historicalGeniusClash.lastReplay.v1',
    'historicalGeniusClash.visualSettings.v1',
    'historicalGeniusClash.cinematics.v1',
    'historicalGeniusClash.controlComfort.v1',
    'historicalGeniusClash.onlineRecords.v10.3',
  ]);
  const MAX_BYTES = 3_100_000;
  const MAX_RECORD_CHARS = 2_000_000;
  const view = {pending: null};
  const $ = (selector) => document.querySelector(selector);
  const status = (message) => {
    const target = $('#backupStatus');
    if (target) target.textContent = message;
  };

  const readCurrent = () => Object.fromEntries(SAVE_KEYS.map((key) => [key, localStorage.getItem(key)]));

  const validate = (input) => {
    if (!input || input.schema !== 'hgc-backup-1' || !input.records ||
      typeof input.records !== 'object' || Array.isArray(input.records)) {
      throw new Error('HGC 게임 백업 파일을 선택하세요.');
    }
    const entries = Object.entries(input.records);
    if (!entries.length) throw new Error('백업 파일에 복원할 기록이 없습니다.');
    if (entries.some(([key]) => !SAVE_KEYS.includes(key))) {
      throw new Error('지원하지 않는 저장 항목이 포함돼 있습니다.');
    }
    const size = entries.reduce((total, [,value]) => total + String(value).length, 0);
    if (size > MAX_BYTES) throw new Error('백업 데이터가 3MB 제한을 초과했습니다.');
    for (const [,value] of entries) {
      if (typeof value !== 'string' || value.length > MAX_RECORD_CHARS) {
        throw new Error('저장 데이터의 길이나 형식이 올바르지 않습니다.');
      }
      JSON.parse(value);
    }
    return entries;
  };

  const summary = (records) => {
    const key = 'historicalGeniusClash.goldAndSkins.v1';
    let economy = {};
    try {
      economy = JSON.parse(records[key] || '{}') || {};
    } catch {
      economy = {};
    }
    const gold = Number.isFinite(Number(economy.gold)) ?
      Math.max(0, Math.floor(Number(economy.gold))) : 0;
    const owned = Array.isArray(economy.owned) ? economy.owned.length : 0;
    let online = '';
    try {
      const data = JSON.parse(records['historicalGeniusClash.onlineRecords.v10.3'] || '{}');
      if (Number.isSafeInteger(data.played) && data.played >= 0) online = ` · 온라인 ${data.played}전`;
    } catch { /* Old snapshots may not contain online records. */ }
    return `${Object.keys(records).length}개 항목 · 골드 ${gold} · 수집 무기 ${owned}종${online}`;
  };

  const writeTransaction = (records) => {
    const before = readCurrent();
    try {
      for (const [key, value] of Object.entries(records)) {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      }
    } catch (error) {
      for (const [key, value] of Object.entries(before)) {
        try {
          if (value === null) localStorage.removeItem(key);
          else localStorage.setItem(key, value);
        } catch {
          // The rollback snapshot is kept in RECOVERY_KEY for a later retry.
        }
      }
      throw error;
    }
  };

  const availableRecovery = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(RECOVERY_KEY) || 'null');
      if (!saved || saved.schema !== 'hgc-recovery-1' || !saved.records) return null;
      if (!SAVE_KEYS.every((key) => Object.hasOwn(saved.records, key))) return null;
      for (const key of SAVE_KEYS) {
        const value = saved.records[key];
        if (value !== null && typeof value !== 'string') return null;
      }
      return saved;
    } catch {
      return null;
    }
  };

  const recoveryButtonState = () => {
    const button = $('#hgc135Recover');
    if (button) button.disabled = !availableRecovery();
  };

  const cancelPreview = () => {
    view.pending = null;
    const panel = $('#hgc135Preview');
    if (panel) panel.hidden = true;
  };

  const openPreview = (payload) => {
    const entries = validate(payload);
    view.pending = {entries, payload};
    const panel = $('#hgc135Preview');
    $('#hgc135PreviewSummary').textContent = `파일: ${summary(payload.records)}`;
    $('#hgc135CurrentSummary').textContent = `현재: ${summary(Object.fromEntries(
      Object.entries(readCurrent()).filter(([,value]) => value !== null)))};
      복원 전에 현재 기록을 기기에 보관합니다.`;
    panel.hidden = false;
    status('백업을 검사했습니다. 아래 미리보기를 확인하고 복원을 승인하세요.');
  };

  const commitRestore = () => {
    if (!view.pending) return;
    try {
      const snapshot = {schema: 'hgc-recovery-1', savedAt: new Date().toISOString(), records: readCurrent()};
      localStorage.setItem(RECOVERY_KEY, JSON.stringify(snapshot));
      if (!availableRecovery()) throw new Error('복구용 기록을 확인할 수 없습니다.');
      const count = view.pending.entries.length;
      writeTransaction(Object.fromEntries(view.pending.entries));
      cancelPreview();
      recoveryButtonState();
      status(`${count}개 항목을 복원했습니다. 기존 기록도 기기에 보관했습니다. 게임을 새로고침해 적용하세요.`);
    } catch (error) {
      status(`복원 중단: ${error.message}. 기존 기록은 유지됩니다.`);
    }
  };

  const restoreRecovery = () => {
    const saved = availableRecovery();
    if (!saved) return status('복구할 이전 기록이 없습니다.');
    const priorRecovery = localStorage.getItem(RECOVERY_KEY);
    try {
      // First store a reversible snapshot. If storage is full, the active save is untouched.
      localStorage.setItem(RECOVERY_KEY, JSON.stringify({
        schema: 'hgc-recovery-1', savedAt: new Date().toISOString(), records: readCurrent(),
      }));
      try {
        writeTransaction(saved.records);
      } catch (error) {
        localStorage.setItem(RECOVERY_KEY, priorRecovery);
        throw error;
      }
      recoveryButtonState();
      status('이전 기록을 복구했습니다. 게임을 새로고침해 적용하세요.');
    } catch (error) {
      status(`이전 기록 복구 실패: ${error.message}`);
    }
  };

  const checkRelease = async () => {
    const target = $('#hgc135ReleaseStatus');
    target.textContent = '서버 버전을 확인하고 있습니다…';
    try {
      const response = await fetch('/api/release', {cache: 'no-store'});
      if (!response.ok) throw new Error(`서버 응답 ${response.status}`);
      const data = await response.json();
      if (data.gameVersion !== GAME_VERSION) {
        target.textContent = `서버 ${data.gameVersion || '알 수 없음'} · 현재 화면 v${GAME_VERSION} · 버전 불일치`;
        return;
      }
      const commit = /^[0-9a-f]{7}$/i.test(data.commit || '') ? ` · 커밋 ${data.commit}` : '';
      target.textContent = `게임 v${GAME_VERSION} / 온라인 규칙 ${data.protocolVersion || '미확인'}${commit} · 최신 연결 확인`;
    } catch {
      target.textContent = '온라인 버전 확인에 실패했습니다. 게임은 오프라인 모드에서도 사용할 수 있습니다.';
    }
  };

  const install = () => {
    const backup = $('#backupExport')?.closest('.evo-panel');
    if (!backup || $('#hgc135Panel')) return;
    const panel = document.createElement('section');
    panel.id = 'hgc135Panel';
    panel.className = 'hgc135-panel';
    panel.innerHTML = `
      <h3>v13.6 · 안정성 · 기록 보호 · 배포 확인</h3>
      <p>백업 파일을 먼저 검사합니다. 복원 전에 현재 기록을 별도로 보관합니다.</p>
      <div class="hgc135-actions">
        <button id="hgc135Recover" class="btn alt" type="button" disabled>직전 기록 되돌리기</button>
        <button id="hgc135CheckRelease" class="btn alt" type="button">게임 버전 확인</button>
        <button id="hgc135Refresh" class="btn alt" type="button">새 버전 다시 불러오기</button>
      </div>
      <div id="hgc135ReleaseStatus" role="status" aria-live="polite">게임 v13.6 · 서버 확인 전</div>
      <div id="hgc135Preview" class="hgc135-preview" hidden>
        <strong>복원 내용 미리보기</strong>
        <p id="hgc135PreviewSummary"></p>
        <p id="hgc135CurrentSummary"></p>
        <div class="hgc135-actions">
          <button id="hgc135Confirm" class="btn" type="button">이 파일로 복원하기</button>
          <button id="hgc135Cancel" class="btn alt" type="button">취소</button>
        </div>
      </div>`;
    backup.insertAdjacentElement('afterend', panel);
    $('#hgc135Confirm').addEventListener('click', commitRestore);
    $('#hgc135Cancel').addEventListener('click', cancelPreview);
    $('#hgc135Recover').addEventListener('click', restoreRecovery);
    $('#hgc135Panel h3').textContent = 'v13.6 · 안정성 · 기록 보호 · 배포 확인';
    $('#hgc135CheckRelease').addEventListener('click', checkRelease);
    $('#hgc135Refresh').addEventListener('click', () => {
      const target = new URL(location.href);
      target.searchParams.set('hgc_refresh', String(Date.now()));
      location.assign(target.href);
    });
    recoveryButtonState();
    checkRelease();
  };

  // Account download can replace every game save; keep a durable rollback first.
  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('[data-sync="download"]');
    if (!button || button.disabled) return;
    try {
      const records = readCurrent();
      if (!Object.values(records).some(value => value !== null)) return;
      const snapshot = {schema: 'hgc-recovery-1', savedAt: new Date().toISOString(), records};
      localStorage.setItem(RECOVERY_KEY, JSON.stringify(snapshot));
      if (!availableRecovery()) throw new Error('복원 지점 검증 실패');
      recoveryButtonState();
      status('계정 기록을 가져오기 전에 기존 기록의 복원 지점을 저장했습니다.');
    } catch (error) {
      event.preventDefault();
      event.stopImmediatePropagation();
      status('계정 기록 가져오기를 중단했습니다: '+error.message);
    }
  }, true);

  // Capture before the legacy file-input handler: previously it restored immediately.
  document.addEventListener('change', async (event) => {
    if (event.target?.id !== 'backupImport') return;
    event.stopImmediatePropagation();
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > MAX_BYTES) return status('복원 실패: 3MB 이하의 JSON 파일을 선택하세요.');
    try {
      openPreview(JSON.parse(await file.text()));
    } catch (error) {
      cancelPreview();
      status(`백업 검사 실패: ${error.message}`);
    }
  }, true);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, {once: true});
  } else {
    install();
  }
  window.HGCRecoveryGuard = Object.freeze({version: GAME_VERSION, validate, summary,
    availableRecovery, install, checkRelease});
})();
