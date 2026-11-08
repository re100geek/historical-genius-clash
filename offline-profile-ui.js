/* Dedicated local profile section; keep the remote /api/auth account UI unchanged. */
(() => {
  'use strict';
  const engine = window.HGCOfflineProfiles;
  if (!engine) return;
  function element(tag, attrs = {}, text = '') {
    const result = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) result.setAttribute(key, value);
    if (text) result.textContent = text;
    return result;
  }
  const panel = document.getElementById('accountPanel');
  if (!panel) return;
  const section = element('section', {id: 'hgcLocalProfiles', class: 'hgc-local-vault',
    'aria-labelledby': 'hgcLocalTitle'});
  section.innerHTML = `<h3 id="hgcLocalTitle">기기 내 로그인 · 오프라인 저장</h3>
    <p>서버 없이 이 브라우저에 프로필별 게임 진행도를 보관합니다. 다른 기기로 자동 동기화되지 않습니다. 브라우저 데이터를 지우면 기록이 사라질 수 있으므로 JSON 백업을 저장하세요.</p>
    <p class="hgc-local-alert">이 비밀번호는 같은 기기에서 프로필을 구분하는 용도입니다. 기기 자체의 보안이나 타인의 저장 데이터 접근을 완전히 막지는 못합니다.</p>
    <form id="hgcLocalForm"><label for="hgcLocalName">프로필 이름</label>
    <input id="hgcLocalName" autocomplete="off" minlength="2" maxlength="20" required placeholder="2~20자">
    <label for="hgcLocalPin">프로필 비밀번호</label>
    <input id="hgcLocalPin" type="password" minlength="8" maxlength="72" required autocomplete="new-password" placeholder="8자 이상">
    <div class="hgc-local-buttons"><button type="submit" id="hgcLocalCreate">새 프로필 만들기</button>
    <button type="button" id="hgcLocalImport">백업 가져오기</button></div></form>
    <div class="hgc-local-list" id="hgcLocalList" aria-label="기기에 저장된 프로필"></div>
    <div class="hgc-local-status" id="hgcLocalStatus" role="status" aria-live="polite"></div>
    <div class="hgc-local-member" id="hgcLocalMember" hidden>
      <h4 id="hgcLocalCurrent"></h4>
      <p id="hgcLocalSummary"></p><p id="hgcLocalSaved"></p>
      <div class="hgc-local-buttons">
        <button id="hgcLocalSave" type="button">지금 저장</button>
        <button id="hgcLocalExport" type="button">JSON 백업 내보내기</button>
        <button id="hgcLocalLogout" type="button">프로필 로그아웃</button>
      </div><div class="hgc-local-buttons" aria-label="바로 이동">
        <button type="button" data-quick="eraTab">시대 탐험</button>
        <button type="button" data-quick="towerTab">시련의 탑</button>
        <button type="button" data-quick="selectionTab">훈련·대전</button></div>
    </div>
    <input type="file" id="hgcLocalFile" accept="application/json,.json" hidden>`;
  panel.insertBefore(section, panel.firstChild);
  const get = id => section.querySelector('#' + id);
  const status = text => { get('hgcLocalStatus').textContent = text; };
  const activeName = () => engine.list().find(p => p.id === engine.currentId());
  function stats() {
    const raw = engine.capture();
    let gold = 0, owned = 0, tower = 0, era = '미시작';
    try {
      const data = JSON.parse(raw['historicalGeniusClash.goldAndSkins.v1'] || '{}');
      gold = Number(data.gold) || 0;
      owned = Array.isArray(data.owned) ? data.owned.length : 0;
    } catch { /* preserve UI in case of legacy values */ }
    try {
      const data = JSON.parse(raw['historicalGeniusClash.tower.v1'] || '{}');
      const items = data.progress || data.fighters || data;
      const floors = Object.values(items).map(x => Number(x?.floor || x?.highest || x?.current || x) || 0);
      tower = Math.max(0, ...floors);
    } catch { /* default */ }
    try {
      const data = JSON.parse(raw['historicalGeniusClash.eraExpedition.v1'] || '{}');
      if (data.active) era = '진행 중';
      else if (data.archive?.length || data.completed?.length || data.wins) era = '완료 기록 있음';
    } catch { /* default */ }
    return `골드 ${Math.max(0, Math.floor(gold))} · 장식 아이템 ${owned}개 · 탑 최대 ${tower}층 · 시대 탐험 ${era}`;
  }
  function render() {
    const active = activeName();
    get('hgcLocalForm').hidden = Boolean(active);
    get('hgcLocalList').hidden = Boolean(active);
    get('hgcLocalMember').hidden = !active;
    if (active) {
      get('hgcLocalCurrent').textContent = `현재 프로필 · ${active.name}`;
      get('hgcLocalSummary').textContent = stats();
      get('hgcLocalSaved').textContent = '이 기기 자동 저장 사용 중 · 브라우저를 종료하기 전에 백업을 권장합니다.';
    } else {
      get('hgcLocalList').replaceChildren();
      const profiles = engine.list();
      if (!profiles.length) get('hgcLocalList').append(element('p', {}, '아직 만든 프로필이 없습니다.'));
      profiles.forEach(profile => {
        const row = element('div', {class: 'hgc-local-entry'});
        const label = element('span', {}, `${profile.name} · ${new Date(profile.updatedAt).toLocaleString('ko-KR')}`);
        const btn = element('button', {type: 'button'}, '로그인');
        btn.addEventListener('click', () => run(async () => {
          const value = get('hgcLocalPin').value;
          if (!value) throw new Error('위에 비밀번호를 입력하세요.');
          await engine.login(profile.id, value);
          window.location.reload();
        }));
        row.append(label, btn);
        get('hgcLocalList').append(row);
      });
    }
  }
  let busy = false;
  async function run(action) {
    if (busy) return;
    if (window.HGCAccount?.state?.account) {
      status('서버 계정에 로그인 중입니다. 서버 계정에서 먼저 로그아웃하세요.');
      return;
    }
    busy = true;
    try {await action(); render();}
    catch (error) {status(error.message || '프로필 작업을 완료하지 못했습니다.');}
    finally { busy = false; }
  }
  get('hgcLocalForm').addEventListener('submit', event => {
    event.preventDefault();
    run(async () => {
      const profile = await engine.create(get('hgcLocalName').value, get('hgcLocalPin').value);
      status(`${profile.name} 프로필을 만들었습니다. 게임을 불러옵니다.`);
      window.location.reload();
    });
  });
  get('hgcLocalSave').addEventListener('click', () => run(async () => {
    engine.saveActive();
    status('게임 기록을 기기 프로필에 저장했습니다.');
  }));
  get('hgcLocalLogout').addEventListener('click', () => run(async () => {
    engine.logout();
    window.location.reload();
  }));
  get('hgcLocalExport').addEventListener('click', () => run(async () => {
    const payload = engine.exportCurrent();
    const file = new Blob([JSON.stringify(payload, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(file);
    const anchor = element('a', {href: url, download: 'HGC-' + Date.now() + '-backup.json'});
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 3000);
    status('백업 파일을 다운로드했습니다. 안전한 폴더에 보관하세요.');
  }));
  get('hgcLocalImport').addEventListener('click', () => get('hgcLocalFile').click());
  get('hgcLocalFile').addEventListener('change', event => run(async () => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 2_500_000) throw new Error('백업 파일은 2.5MB 이하여야 합니다.');
    const payload = JSON.parse(await file.text());
    await engine.importBackup(payload, get('hgcLocalName').value, get('hgcLocalPin').value);
    event.target.value = '';
    status('새 로컬 프로필에 백업을 가져왔습니다. 위에서 로그인하세요.');
  }));
  section.querySelectorAll('[data-quick]').forEach(button => {
    button.addEventListener('click', () => document.getElementById(button.dataset.quick)?.click());
  });
  let lastSignature = '';
  function autosave() {
    if (!engine.isActive()) return;
    try {
      const current = JSON.stringify(engine.capture());
      if (lastSignature === current) return;
      engine.saveActive();
      lastSignature = current;
      get('hgcLocalSaved').textContent = '자동 저장됨 · ' + new Date().toLocaleTimeString('ko-KR');
    } catch (error) {status('자동 저장 실패: ' + error.message + ' · JSON 백업을 이용하세요.');}
  }
  window.setInterval(autosave, 2500);
  window.addEventListener('pagehide', autosave);
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') autosave();
  });
  render();
})();
