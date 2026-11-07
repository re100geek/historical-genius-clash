'use strict';

const crypto = require('node:crypto');
const {promisify} = require('node:util');
const {createAccountStore} = require('./account-store');

const scrypt = promisify(crypto.scrypt);
const COOKIE_TTL = 7 * 24 * 60 * 60;
const MAX_ATTEMPTS = 6;
const WINDOW_MS = 15 * 60 * 1000;
const USERNAME_PATTERN = /^[a-z0-9_가-힣]{3,20}$/u;
const SESSION_COOKIE = 'hgc_session';
const attempts = new Map();

function respond(res, status, value, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    ...headers,
  });
  res.end(JSON.stringify(value));
}

function usernameOf(raw) {
  const value = typeof raw === 'string' ? raw.normalize('NFKC').trim().toLowerCase() : '';
  return USERNAME_PATTERN.test(value) ? value : null;
}

function goodPassword(value) {
  return typeof value === 'string' && value.length >= 10 && value.length <= 72 &&
    Buffer.byteLength(value, 'utf8') <= 128;
}

async function passwordHash(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64, {N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024});
  return `scrypt$32768$${salt}$${hash.toString('hex')}`;
}

async function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 4 || parts[0] !== 'scrypt' || parts[1] !== '32768') return false;
  const raw = Buffer.from(parts[3], 'hex');
  if (raw.length !== 64) return false;
  const actual = await scrypt(password, parts[2], raw.length,
    {N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024});
  return crypto.timingSafeEqual(actual, raw);
}

function sessionHash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function cookieName(secure) {
  return secure ? '__Host-hgc_session' : SESSION_COOKIE;
}

function sessionCookie(token, secure, expired = false) {
  const suffix = secure ? '; Secure' : '';
  return `${cookieName(secure)}=${token}; Path=/; HttpOnly; SameSite=Strict${suffix}; ` +
    `Max-Age=${expired ? 0 : COOKIE_TTL}`;
}

function readSessionCookie(req, secure) {
  const prefix = `${cookieName(secure)}=`;
  const value = (req.headers.cookie || '').split(';').map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  return value ? value.slice(prefix.length) : '';
}

async function readBody(req, limit) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > limit) {
      const error = new Error('REQUEST_TOO_LARGE');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const error = new Error('INVALID_JSON');
    error.status = 400;
    throw error;
  }
}

function allowOrigin(req) {
  if (req.method === 'GET') return true;
  const origin = req.headers.origin;
  if (!origin) return process.env.NODE_ENV !== 'production';
  try {
    const parsed = new URL(origin);
    return parsed.host === req.headers.host &&
      (parsed.protocol === 'https:' ||
        (process.env.NODE_ENV !== 'production' && parsed.protocol === 'http:'));
  } catch {
    return false;
  }
}

function limitAttempts(req, username) {
  const address = (req.socket.remoteAddress || 'unknown').slice(0, 60);
  const key = `${address}:${username}`;
  const now = Date.now();
  if (attempts.size > 5000) attempts.clear();
  const entry = attempts.get(key);
  if (!entry || entry.expires <= now) {
    attempts.set(key, {count: 1, expires: now + WINDOW_MS});
    return true;
  }
  entry.count += 1;
  return entry.count <= MAX_ATTEMPTS;
}

function clearAttempts(req, username) {
  attempts.delete(`${(req.socket.remoteAddress || 'unknown').slice(0, 60)}:${username}`);
}

function filterProfileKeys(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  if (entries.length > 24) return null;
  const result = {};
  for (const [key, content] of entries) {
    if (!/^historicalGeniusClash\.[a-z0-9_.-]{1,90}$/i.test(key) ||
        typeof content !== 'string' || content.length > 36000) return null;
    try { JSON.parse(content); } catch { return null; }
    result[key] = content;
  }
  if (Buffer.byteLength(JSON.stringify(result)) > 95000) return null;
  return result;
}

function createAuthApi(options = {}) {
  const store = options.store === undefined ? createAccountStore(options.env || process.env) : options.store;
  const secure = (options.env || process.env).NODE_ENV === 'production';
  let initialized;

  function ready() {
    if (!store) return Promise.resolve(false);
    if (!initialized) initialized = store.init().then(() => true).catch((error) => {
      console.error('[accounts] Storage initialization failed:', error.message);
      initialized = null;
      throw error;
    });
    return initialized;
  }

  async function currentUser(req) {
    const token = readSessionCookie(req, secure);
    if (!/^[0-9a-f]{64}$/.test(token)) return null;
    const user = await store.findSession(sessionHash(token));
    return user ? {id: user.id, username: user.username} : null;
  }

  async function issueSession(res, user) {
    const token = crypto.randomBytes(32).toString('hex');
    await store.createSession({hash: sessionHash(token), userId: user.id,
      expiresAt: Date.now() + COOKIE_TTL * 1000});
    respond(res, 200, {ok: true, account: {id: user.id, username: user.username}},
      {'Set-Cookie': sessionCookie(token, secure)});
  }

  async function handle(req, res) {
    try {
      if (!allowOrigin(req)) {
        respond(res, 403, {error: 'ORIGIN_REJECTED'});
        return;
      }
      const route = new URL(req.url, 'http://localhost').pathname;
      if (route === '/api/auth/status' && req.method === 'GET') {
        respond(res, 200, {available: Boolean(store), persistent: Boolean((options.env || process.env).DATABASE_URL),
          accountRequired: false});
        return;
      }
      if (!store) {
        respond(res, 503, {error: 'DATABASE_NOT_CONFIGURED'});
        return;
      }
      await ready();
      if (route === '/api/auth/session' && req.method === 'GET') {
        respond(res, 200, {account: await currentUser(req)});
        return;
      }
      if (route === '/api/auth/logout' && req.method === 'POST') {
        const token = readSessionCookie(req, secure);
        if (/^[0-9a-f]{64}$/.test(token)) await store.removeSession(sessionHash(token));
        respond(res, 200, {ok: true}, {'Set-Cookie': sessionCookie('', secure, true)});
        return;
      }
      if (route === '/api/auth/register' && req.method === 'POST') {
        const body = await readBody(req, 8192);
        const username = usernameOf(body.username);
        if (!username || !goodPassword(body.password)) {
          respond(res, 400, {error: 'INVALID_CREDENTIALS_FORMAT'});
          return;
        }
        if (!limitAttempts(req, username)) {
          respond(res, 429, {error: 'TOO_MANY_REQUESTS'}, {'Retry-After': '900'});
          return;
        }
        if (await store.byUsername(username)) {
          respond(res, 409, {error: 'USERNAME_TAKEN'});
          return;
        }
        const user = {id: crypto.randomUUID(), username,
          passwordHash: await passwordHash(body.password)};
        if (!await store.createUser(user)) {
          respond(res, 409, {error: 'USERNAME_TAKEN'});
          return;
        }
        clearAttempts(req, username);
        await issueSession(res, user);
        return;
      }
      if (route === '/api/auth/login' && req.method === 'POST') {
        const body = await readBody(req, 8192);
        const username = usernameOf(body.username);
        if (!username || !goodPassword(body.password)) {
          respond(res, 401, {error: 'LOGIN_FAILED'});
          return;
        }
        if (!limitAttempts(req, username)) {
          respond(res, 429, {error: 'TOO_MANY_REQUESTS'}, {'Retry-After': '900'});
          return;
        }
        const user = await store.byUsername(username);
        if (!user || !await verifyPassword(body.password, user.passwordHash)) {
          respond(res, 401, {error: 'LOGIN_FAILED'});
          return;
        }
        clearAttempts(req, username);
        await issueSession(res, user);
        return;
      }
      const user = await currentUser(req);
      if (!user) {
        respond(res, 401, {error: 'LOGIN_REQUIRED'});
        return;
      }
      if (route === '/api/auth/profile' && req.method === 'GET') {
        const profile = await store.getProfile(user.id);
        respond(res, 200, {account: user, revision: profile.revision, data: profile.data});
        return;
      }
      if (route === '/api/auth/profile' && req.method === 'PUT') {
        const body = await readBody(req, 105000);
        const revision = body.revision;
        const data = filterProfileKeys(body.data);
        if (!Number.isInteger(revision) || revision < 0 || !data) {
          respond(res, 400, {error: 'INVALID_PROFILE'});
          return;
        }
        const updated = await store.saveProfile(user.id, revision, data);
        if (!updated) {
          respond(res, 409, {error: 'PROFILE_CONFLICT'});
          return;
        }
        respond(res, 200, {ok: true, revision: updated.revision});
        return;
      }
      respond(res, 404, {error: 'NOT_FOUND'});
    } catch (error) {
      if (error.status) {
        respond(res, error.status, {error: error.message});
      } else {
        console.error('[accounts] Request failed:', error.message);
        respond(res, 503, {error: 'ACCOUNT_SERVICE_UNAVAILABLE'});
      }
    }
  }

  return {handle, ready};
}

module.exports = {createAuthApi, usernameOf, filterProfileKeys,
  passwordHash, verifyPassword};
