'use strict';

/** Server-side account storage. PostgreSQL for deployments, JSON file for local development. */
const fs = require('node:fs');
const path = require('node:path');

class LocalAccountStore {
  constructor(filename) {
    this.filename = path.resolve(filename);
    this.data = {users: [], sessions: [], profiles: []};
    if (fs.existsSync(this.filename)) {
      this.data = JSON.parse(fs.readFileSync(this.filename, 'utf8'));
    }
  }

  async init() {}

  save() {
    fs.mkdirSync(path.dirname(this.filename), {recursive: true});
    const temp = `${this.filename}.${process.pid}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(this.data), {mode: 0o600, flag: 'w'});
    fs.renameSync(temp, this.filename);
  }

  async byUsername(username) {
    return this.data.users.find((user) => user.username === username) || null;
  }

  async createUser(user) {
    if (await this.byUsername(user.username)) return false;
    this.data.users.push({...user});
    this.save();
    return true;
  }

  async createSession(session) {
    this.data.sessions.push({...session});
    this.save();
  }

  async findSession(hash) {
    const session = this.data.sessions.find((item) => item.hash === hash);
    if (!session || session.expiresAt <= Date.now()) return null;
    return this.data.users.find((user) => user.id === session.userId) || null;
  }

  async removeSession(hash) {
    this.data.sessions = this.data.sessions.filter((session) => session.hash !== hash);
    this.save();
  }

  async getProfile(userId) {
    return this.data.profiles.find((item) => item.userId === userId) ||
      {userId, revision: 0, data: {}};
  }

  async saveProfile(userId, revision, data) {
    const previous = await this.getProfile(userId);
    if (previous.revision !== revision) return null;
    const value = {userId, revision: revision + 1, data};
    this.data.profiles = this.data.profiles.filter((entry) => entry.userId !== userId);
    this.data.profiles.push(value);
    this.save();
    return value;
  }
}

class PostgresAccountStore {
  constructor(connectionString) {
    // This package is only loaded for DATABASE_URL deployments.
    const {Pool} = require('pg');
    this.pool = new Pool({connectionString, max: 5, connectionTimeoutMillis: 5000});
  }

  async init() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS hgc_users (
        id UUID PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS hgc_sessions (
        hash CHAR(64) PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES hgc_users(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL
      );
      CREATE TABLE IF NOT EXISTS hgc_profiles (
        user_id UUID PRIMARY KEY REFERENCES hgc_users(id) ON DELETE CASCADE,
        revision INTEGER NOT NULL DEFAULT 0,
        data JSONB NOT NULL DEFAULT '{}'::jsonb
      );
    `);
  }

  async byUsername(username) {
    const result = await this.pool.query(
      'SELECT id, username, password_hash FROM hgc_users WHERE username = $1', [username]);
    const user = result.rows[0];
    return user ? {id: user.id, username: user.username, passwordHash: user.password_hash} : null;
  }

  async createUser(user) {
    const result = await this.pool.query(
      `INSERT INTO hgc_users (id,username,password_hash) VALUES ($1,$2,$3)
       ON CONFLICT (username) DO NOTHING RETURNING id`,
      [user.id, user.username, user.passwordHash]);
    return result.rowCount === 1;
  }

  async createSession(session) {
    await this.pool.query(
      'INSERT INTO hgc_sessions (hash,user_id,expires_at) VALUES ($1,$2,$3)',
      [session.hash, session.userId, new Date(session.expiresAt)]);
  }

  async findSession(hash) {
    const result = await this.pool.query(
      `SELECT u.id,u.username FROM hgc_sessions s JOIN hgc_users u ON u.id=s.user_id
       WHERE s.hash=$1 AND s.expires_at>NOW()`, [hash]);
    return result.rows[0] || null;
  }

  async removeSession(hash) {
    await this.pool.query('DELETE FROM hgc_sessions WHERE hash=$1', [hash]);
  }

  async getProfile(userId) {
    const result = await this.pool.query(
      'SELECT revision,data FROM hgc_profiles WHERE user_id=$1', [userId]);
    return result.rowCount ? {userId, ...result.rows[0]} :
      {userId, revision: 0, data: {}};
  }

  async saveProfile(userId, revision, data) {
    const content = JSON.stringify(data);
    const updated = await this.pool.query(
      `UPDATE hgc_profiles SET revision=revision+1,data=$3::jsonb
       WHERE user_id=$1 AND revision=$2 RETURNING revision,data`,
      [userId, revision, content]);
    if (updated.rowCount) return {userId, ...updated.rows[0]};
    if (revision !== 0) return null;
    const inserted = await this.pool.query(
      `INSERT INTO hgc_profiles (user_id,revision,data) VALUES ($1,1,$2::jsonb)
       ON CONFLICT (user_id) DO NOTHING RETURNING revision,data`,
      [userId, content]);
    return inserted.rowCount ? {userId, ...inserted.rows[0]} : null;
  }
}

function createAccountStore(env = process.env) {
  if (env.DATABASE_URL) return new PostgresAccountStore(env.DATABASE_URL);
  if (env.NODE_ENV !== 'production' || env.AUTH_LOCAL_FILE === '1') {
    if (env.NODE_ENV === 'production') {
      throw new Error('File-backed accounts are not allowed in production. Configure DATABASE_URL.');
    }
    return new LocalAccountStore(env.AUTH_DATA_FILE || path.join(process.cwd(), '.data', 'accounts.json'));
  }
  return null;
}

module.exports = {createAccountStore, LocalAccountStore, PostgresAccountStore};
