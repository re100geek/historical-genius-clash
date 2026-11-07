/* Historical Genius Clash account UI. Compatible with the game's single-file HTML. */
(() => {
  'use strict';

  const API = '/api/auth';
  const STORAGE_PREFIX = 'historicalGeniusClash.';
  const state = {account: null, revision: 0, hasProfile: false, available: false};
  const $ = (selector) => document.querySelector(selector);

  const overlay = document.createElement('div');
  overlay.className = 'hgc-account-overlay hgc-account-inline';
  overlay.hidden = false;
  overlay.innerHTML = `
    <section class="hgc-account-dialog" role="region"
      aria-labelledby="hgcAccountTitle" aria-describedby="hgcAccountHelp">
      <header class="hgc-account-head">
        <span>HGC · PLAYER ACCOUNT</span>
        <button type="button" class="hgc-account-close" aria-label="게임 화면으로 돌아가기">게임으로 돌아가기</button>
      </header>
      <div class="hgc-account-emblem" aria-hidden="true">HGC</div>
      <h2 id="hgcAccountTitle">계정 연결</h2>
      <p id="hgcAccountHelp" class="hgc-account-subtitle">계정을 만들어 다른 기기에서도 기록을 불러오세요.</p>
      <p class="hgc-account-status" role="status" aria-live="polite"></p>
      <div class="hgc-account-auth">
        <div class="hgc-account-tabs" role="group" aria-label="계정 방법">
          <button type="button" data-mode="login" aria-pressed="true">로그인</button>
          <button type="button" data-mode="register" aria-pressed="false">회원가입</button>
        </div>
        <form class="hgc-account-form">
          <label for="hgcAccountUsername">게임 아이디</label>
          <input id="hgcAccountUsername" name="username" autocomplete="username" maxlength="20" minlength="3"
            placeholder="영문·숫자·한글·_ / 3~20자" required>
          <label for="hgcAccountPassword">비밀번호</label>
          <div class="hgc-password-row">
            <input id="hgcAccountPassword" name="password" type="password" minlength="10" maxlength="72"
              autocomplete="current-password" placeholder="10자 이상" required>
            <button type="button" class="hgc-show-password" aria-label="비밀번호 보기">보기</button>
          </div>
          <p class="hgc-register-info" hidden>이메일·전화번호 없이 게임 아이디로 가입합니다. 비밀번호를 안전하게 보관하세요.</p>
          <button class="hgc-account-primary" type="submit">로그인</button>
        </form>
      </div>
      <div class="hgc-account-member" hidden>
        <div class="hgc-welcome">접속 중: <strong class="hgc-current-username"></strong></div>
        <p>계정 데이터는 이 기기의 기록과 별도로 저장됩니다. 필요한 방향을 직접 선택하세요.</p>
        <div class="hgc-account-sync">
          <button type="button" data-sync="upload">이 기기 기록을 계정에 저장</button>
          <button type="button" data-sync="download">계정 기록을 이 기기로 가져오기</button>
        </div>
        <p class="hgc-sync-caption">다른 기기 기록을 가져오면 해당 기기의 기존 기록이 바뀝니다.</p>
        <button type="button" class="hgc-account-logout">로그아웃</button>
      </div>
      <footer class="hgc-account-foot">계정 연결 없이도 게스트로 모든 기존 게임 모드를 플레이할 수 있습니다.</footer>
    </section>`;

  const accountTab = document.getElementById('accountTab');
  const accountMount = document.getElementById('hgcAccountMount');
  if (!accountTab || !accountMount) throw new Error('Account tab mount not found');
  accountMount.append(overlay);

  const statusEl = $('.hgc-account-status');
  const dialog = $('.hgc-account-dialog');
  const form = $('.hgc-account-form');
  const usernameInput = $('#hgcAccountUsername');
  const passwordInput = $('#hgcAccountPassword');
  const authArea = $('.hgc-account-auth');
  const memberArea = $('.hgc-account-member');
  let mode = 'login';
  let pending = false;

  const errors = {
    DATABASE_NOT_CONFIGURED: '서버 데이터베이스 연결이 필요합니다. 게스트 플레이는 계속 가능합니다.',
    USERNAME_TAKEN: '이미 사용 중인 아이디입니다.',
    INVALID_CREDENTIALS_FORMAT: '아이디는 3~20자, 비밀번호는 10~72자로 입력하세요.',
    LOGIN_FAILED: '아이디 또는 비밀번호가 올바르지 않습니다.',
    TOO_MANY_REQUESTS: '로그인을 여러 번 시도했습니다. 잠시 후 다시 이용하세요.',
    LOGIN_REQUIRED: '다시 로그인해 주세요.',
    PROFILE_CONFLICT: '다른 기기에서 계정 기록이 바뀌었습니다. 기록을 다시 확인하세요.',
  };

  function message(text, failure = false) {
    statusEl.textContent = text;
    statusEl.classList.toggle('is-error', failure);
  }

  async function request(path, method = 'GET', body) {
    const options = {method, credentials: 'same-origin', headers: {Accept: 'application/json'}};
    if (body !== undefined) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    const response = await fetch(`${API}${path}`, options);
    const result = await response.json();
    if (!response.ok) {
      const error = new Error(errors[result.error] || '계정 서비스에 연결할 수 없습니다.');
      error.code = result.error;
      throw error;
    }
    return result;
  }

  function selectMode(next) {
    mode = next;
    for (const button of overlay.querySelectorAll('[data-mode]')) {
      button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
    }
    $('.hgc-register-info').hidden = mode !== 'register';
    passwordInput.autocomplete = mode === 'register' ? 'new-password' : 'current-password';
    $('.hgc-account-primary').textContent = mode === 'register' ? '무료 회원가입' : '로그인';
    message('');
  }

  function updateAccount(account) {
    state.account = account;
    accountTab.textContent = account ? `계정 · ${account.username}` : '로그인 · 계정';
    $('#accountIdentity').textContent = account ? account.username : 'GUEST';
    authArea.hidden = Boolean(account);
    memberArea.hidden = !account;
    if (account) $('.hgc-current-username').textContent = account.username;
    passwordInput.value = '';
  }

  async function refresh() {
    try {
      const service = await request('/status');
      state.available = service.available;
      if (!state.available) {
        message('현재 서버는 계정 데이터베이스 연결 전입니다. 게스트 모드를 이용할 수 있습니다.');
        updateAccount(null);
        return;
      }
      const session = await request('/session');
      updateAccount(session.account);
      if (session.account) {
        const profile = await request('/profile');
        state.revision = profile.revision;
        state.hasProfile = Object.keys(profile.data || {}).length > 0;
      }
    } catch {
      message('계정 서버에 연결할 수 없습니다. 게임은 게스트로 이용할 수 있습니다.', true);
      updateAccount(null);
    }
  }

  function open() {
    accountTab.click();
    overlay.querySelector(state.account ? '.hgc-account-logout' : '#hgcAccountUsername').focus();
  }

  function close() {
    const selectionTab = document.getElementById('selectionTab');
    selectionTab.click();
    selectionTab.focus();
  }

  function collectLocal() {
    const data = {};
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key || !key.startsWith(STORAGE_PREFIX)) continue;
      const value = localStorage.getItem(key);
      if (value && value.length <= 36000) {
        try { JSON.parse(value); data[key] = value; } catch { /* Skip non-JSON values. */ }
      }
    }
    return data;
  }

  async function saveToAccount() {
    const data = collectLocal();
    if (!Object.keys(data).length) {
      message('현재 기기에 저장된 게임 기록이 없습니다.');
      return;
    }
    const warning = state.hasProfile ?
      '계정에 저장된 이전 기록을 현재 기기 기록으로 교체합니다. 계속할까요?' :
      '현재 기기의 게임 기록을 계정에 저장할까요?';
    if (!window.confirm(warning)) return;
    const profile = await request('/profile', 'PUT', {revision: state.revision, data});
    state.revision = profile.revision;
    state.hasProfile = true;
    message('계정에 저장했습니다. 이제 다른 기기에서 기록을 가져올 수 있습니다.');
  }

  async function loadFromAccount() {
    const profile = await request('/profile');
    if (!Object.keys(profile.data || {}).length) {
      message('계정에 저장된 기록이 없습니다. 먼저 기기에서 기록을 업로드하세요.');
      return;
    }
    if (!window.confirm('이 기기의 게임 기록을 계정 기록으로 교체하고 게임을 다시 시작할까요?')) return;
    // Validate the entire snapshot first. Back up all existing game keys before replacing.
    const original = {};
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(STORAGE_PREFIX)) original[key] = localStorage.getItem(key);
    }
    for (const [key, value] of Object.entries(profile.data)) {
      if (!key.startsWith(STORAGE_PREFIX) || typeof value !== 'string') {
        throw new Error('서버 데이터 형식 오류');
      }
      JSON.parse(value);
    }
    try {
      for (const key of Object.keys(original)) localStorage.removeItem(key);
      for (const [key, value] of Object.entries(profile.data)) localStorage.setItem(key, value);
    } catch (error) {
      for (const key of Object.keys(profile.data)) localStorage.removeItem(key);
      for (const [key, value] of Object.entries(original)) localStorage.setItem(key, value);
      throw error;
    }
    window.location.reload();
  }

  async function run(action) {
    if (pending) return;
    pending = true;
    overlay.querySelectorAll('button').forEach((button) => {button.disabled = true;});
    try {
      await action();
    } catch (error) {
      message(error.message || '요청을 처리하지 못했습니다.', true);
    } finally {
      pending = false;
      overlay.querySelectorAll('button').forEach((button) => {button.disabled = false;});
    }
  }

  $('.hgc-account-close').addEventListener('click', close);
  overlay.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {event.preventDefault(); close();}
  });
  overlay.querySelectorAll('[data-mode]').forEach((button) => {
    button.addEventListener('click', () => selectMode(button.dataset.mode));
  });
  $('.hgc-show-password').addEventListener('click', () => {
    passwordInput.type = passwordInput.type === 'password' ? 'text' : 'password';
    $('.hgc-show-password').textContent = passwordInput.type === 'password' ? '보기' : '숨기기';
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    run(async () => {
      const account = await request(mode === 'register' ? '/register' : '/login', 'POST',
        {username: usernameInput.value, password: passwordInput.value});
      updateAccount(account.account);
      const profile = await request('/profile');
      state.revision = profile.revision;
      state.hasProfile = Object.keys(profile.data || {}).length > 0;
      message(`로그인 완료 · ${account.account.username}`);
    });
  });
  $('.hgc-account-logout').addEventListener('click', () => {
    run(async () => {
      await request('/logout', 'POST');
      updateAccount(null);
      state.hasProfile = false;
      state.revision = 0;
      message('로그아웃했습니다. 이 기기의 게임 기록은 유지됩니다.');
    });
  });
  overlay.querySelectorAll('[data-sync]').forEach((button) => {
    button.addEventListener('click', () => {
      run(() => button.dataset.sync === 'upload' ? saveToAccount() : loadFromAccount());
    });
  });

  refresh();
  window.HGCAccount = Object.freeze({open, refresh, get state() {
    return {account: state.account, revision: state.revision, available: state.available};
  }});
})();
