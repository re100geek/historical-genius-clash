'use strict';
/**
 * HGC standalone account server (Node >=20). No external npm dependencies.
 * Production requires HTTPS + persistent DATA_DIR (e.g. mounted disk).
 * Never commit data/accounts.json or cookies. Single-process JSON store.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = path.resolve(process.env.HGC_DATA_DIR || path.join(ROOT, 'data'));
const DB_FILE = path.join(DATA_DIR, 'accounts.json');
const SESSION_LIFETIME = 30 * 24 * 60 * 60 * 1000;
const COOKIE_NAME = 'hgc_session_v2';
const LOGIN_WINDOW = 15 * 60 * 1000;
const loginBuckets = new Map();
const sessions = new Map();

fs.mkdirSync(DATA_DIR, {recursive: true, mode: 0o700});
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({schema: 2, users: []}), {mode: 0o600, flag: 'wx'});

function loadStore() {
  const raw = fs.readFileSync(DB_FILE, 'utf8');
  const saved = JSON.parse(raw);
  if (saved.schema !== 2 || !Array.isArray(saved.users)) throw new Error('Unsupported database schema');
  return saved;
}
function saveStore(store) {
  const temporary = path.join(DATA_DIR, `.${crypto.randomBytes(6).toString('hex')}.tmp`);
  try {
    fs.writeFileSync(temporary, JSON.stringify(store), {mode: 0o600, flag: 'wx'});
    fs.renameSync(temporary, DB_FILE);
  } finally {try {fs.unlinkSync(temporary);} catch { /* already renamed */ }}
}
const store = loadStore();
const usernameRule = /^[\p{L}\p{N}_-]{3,20}$/u;
function passwordHash(password, salt) {
  return crypto.scryptSync(password, salt, 64, {N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024}).toString('hex');
}
function identity(username) {return username.normalize('NFC').toLowerCase();}
function isValidCredentials(username, password) {
  return typeof username === 'string' && usernameRule.test(username) &&
    typeof password === 'string' && password.length >= 10 && password.length <= 72;
}
function secureCookie(req) {
  const forwarded = req.headers['x-forwarded-proto'];
  return Boolean(req.socket.encrypted || (process.env.TRUST_PROXY === '1' && forwarded === 'https'));
}
function cookieValue(req) {
  const jar = req.headers.cookie || '';
  const found = jar.split(';').map(x => x.trim()).find(x => x.startsWith(COOKIE_NAME + '='));
  return found?.slice(COOKIE_NAME.length + 1) || '';
}
function activeSession(req) {
  const token = cookieValue(req);
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const digest = crypto.createHash('sha256').update(token).digest('hex');
  const session = sessions.get(digest);
  if (!session) return null;
  if (session.expires <= Date.now()) {sessions.delete(digest); return null;}
  const user = store.users.find(item => item.id === session.uid);
  return user ? {user, digest} : null;
}
function establishSession(req, res, user) {
  const token = crypto.randomBytes(32).toString('hex');
  const digest = crypto.createHash('sha256').update(token).digest('hex');
  sessions.set(digest, {uid: user.id, expires: Date.now() + SESSION_LIFETIME});
  const cookie = [`${COOKIE_NAME}=${token}`, 'Path=/api/auth', 'HttpOnly', 'SameSite=Strict', `Max-Age=${Math.floor(SESSION_LIFETIME / 1000)}`];
  if (secureCookie(req)) cookie.push('Secure');
  res.setHeader('Set-Cookie', cookie.join('; '));
}
function removeSession(req, res) {
  const existing = activeSession(req);
  if (existing) sessions.delete(existing.digest);
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/api/auth; HttpOnly; SameSite=Strict; Max-Age=0` + (secureCookie(req) ? '; Secure' : ''));
}
function send(res, status, payload) {
  res.writeHead(status, {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'});
  res.end(JSON.stringify(payload));
}
function fail(res, status, code) {return send(res, status, {error: code});}
function validOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return false;
  try {
    const u = new URL(origin);
    const host = req.headers.host;
    return host && u.host === host && ['http:', 'https:'].includes(u.protocol);
  } catch {return false;}
}
function throttle(ip, identifier) {
  const name = `${ip}|${identifier}`;
  const now = Date.now();
  const data = loginBuckets.get(name) || {at: now, used: 0};
  if (now - data.at > LOGIN_WINDOW) {data.at = now;data.used = 0;}
  data.used += 1;
  loginBuckets.set(name, data);
  // Also cap repeated tries from an address across many usernames.
  const global = loginBuckets.get(ip) || {at:now,used:0};
  if (now-global.at > LOGIN_WINDOW) {global.at=now;global.used=0;}
  global.used += 1;loginBuckets.set(ip,global);
  return data.used > 10 || global.used > 35;
}
async function readJson(req, maxBytes = 1000000) {
  const ctype = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (ctype !== 'application/json') throw Object.assign(new Error('Invalid type'), {status:415});
  let bytes = 0;
  const chunks = [];
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > maxBytes) throw Object.assign(new Error('Too large'), {status:413});
    chunks.push(chunk);
  }
  try {return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
  catch {throw Object.assign(new Error('Invalid JSON'), {status:400});}
}
function validateProfile(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const items = Object.entries(data);
  if (items.length > 48) return false;
  return items.every(([key, value]) => {
    if (!key.startsWith('historicalGeniusClash.') || key.length > 100 ||
      key === 'historicalGeniusClash.recoveryGuard.v1' || typeof value !== 'string' || value.length > 36000) return false;
    try {JSON.parse(value);return true;} catch {return false;}
  });
}
async function api(req, res, pathname) {
  if (req.method === 'GET' && pathname === '/api/auth/status') return send(res, 200, {available:true});
  if (req.method === 'GET' && pathname === '/api/auth/session') {
    const session = activeSession(req);
    return send(res, 200, {account:session ? {username:session.user.username} : null});
  }
  if (req.method === 'GET' && pathname === '/api/auth/profile') {
    const session = activeSession(req);
    return session ? send(res, 200, {revision:session.user.revision, data:session.user.data}) : fail(res,401,'LOGIN_REQUIRED');
  }
  if (req.method !== 'POST' && req.method !== 'PUT') return fail(res,405,'METHOD_NOT_ALLOWED');
  if (!validOrigin(req)) return fail(res,403,'INVALID_ORIGIN');
  let body;
  try {body = await readJson(req);} catch (error) {return fail(res,error.status||400,'INVALID_REQUEST');}
  if (pathname === '/api/auth/register' || pathname === '/api/auth/login') {
    const {username,password} = body || {};
    if (!isValidCredentials(username,password)) return fail(res,400,'INVALID_CREDENTIALS_FORMAT');
    const normalized = identity(username);
    if (throttle(req.socket.remoteAddress || 'unknown', normalized)) return fail(res,429,'TOO_MANY_REQUESTS');
    const found = store.users.find(user => user.normalized === normalized);
    if (pathname.endsWith('/register')) {
      if (found) return fail(res,409,'USERNAME_TAKEN');
      const salt = crypto.randomBytes(24).toString('hex');
      const user = {id:crypto.randomUUID(), username:username.normalize('NFC'), normalized, salt,
        passwordHash:passwordHash(password,salt), revision:0, data:{}};
      store.users.push(user);
      saveStore(store);
      establishSession(req,res,user);
      return send(res,201,{account:{username:user.username}});
    }
    const salted = found ? found.salt : 'f6ceac8cf6821d6ec8e9aaf0b738ee83e48dfe19f1f7cb67';
    const candidate = Buffer.from(passwordHash(password,salted),'hex');
    const original = found ? Buffer.from(found.passwordHash,'hex') : Buffer.alloc(64);
    if (!found || !crypto.timingSafeEqual(candidate, original)) return fail(res,401,'LOGIN_FAILED');
    establishSession(req,res,found);
    return send(res,200,{account:{username:found.username}});
  }
  if (pathname === '/api/auth/logout') {removeSession(req,res);return send(res,200,{ok:true});}
  if (pathname === '/api/auth/profile' && req.method === 'PUT') {
    const session = activeSession(req);
    if (!session) return fail(res,401,'LOGIN_REQUIRED');
    if (!Number.isSafeInteger(body?.revision) || !validateProfile(body?.data)) return fail(res,400,'INVALID_PROFILE');
    if (body.revision !== session.user.revision) return fail(res,409,'PROFILE_CONFLICT');
    session.user.data = body.data;
    session.user.revision += 1;
    saveStore(store);
    return send(res,200,{revision:session.user.revision});
  }
  return fail(res,404,'NOT_FOUND');
}

const server = http.createServer(async (req,res) => {
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('X-Frame-Options','DENY');
  const pathname = new URL(req.url, 'http://localhost').pathname;
  try {
    if (req.method === 'GET' && pathname === '/api/release') return send(res,200,{
      gameVersion:'14.3.2',protocolVersion:'10.3',features:[
        'account-local','online-arena','roster-17','tower-99','art-qa']});
    if (pathname.startsWith('/api/')) return await api(req,res,pathname);
    if (req.method !== 'GET' && req.method !== 'HEAD') return fail(res,405,'METHOD_NOT_ALLOWED');
    if (pathname === '/' || pathname === '/index.html') {
      const contents = fs.readFileSync(path.join(ROOT,'index.html'));
      res.writeHead(200, {'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-cache'});
      return req.method === 'HEAD' ? res.end() : res.end(contents);
    }
    if (pathname === '/health') return send(res,200,{status:'ok',online:'10.3',characters:17});

    return fail(res,404,'NOT_FOUND');
  } catch (error) {
    console.error('HGC server request failed:', error.message);
    return fail(res,500,'SERVER_ERROR');
  }
});
const onlineArena = require('./online-arena').attachOnlineArena(server);
if (require.main === module) server.listen(PORT, HOST, () => console.log(`HGC game and account server: http://${HOST}:${PORT}`));
module.exports = {server, onlineArena, validateProfile, isValidCredentials, loadStore, STORE_FILE:DB_FILE};
