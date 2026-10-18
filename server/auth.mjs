import { Router } from 'express';
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { HttpError } from './validation.mjs';

const derive = promisify(scrypt);
const SESSION_MS = 12 * 60 * 60 * 1000;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function equal(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const first = Buffer.from(a), second = Buffer.from(b);
  return first.length === second.length && timingSafeEqual(first, second);
}
function hashToken(token) { return createHash('sha256').update(token).digest('hex'); }
function passwordInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.password !== 'string' || body.password.length < 12 || body.password.length > 256) {
    throw new HttpError(400, 'A senha deve conter entre 12 e 256 caracteres.');
  }
  return body.password;
}
async function passwordHash(password) {
  const salt = randomBytes(16);
  const key = await derive(password, salt, 64, SCRYPT);
  return `scrypt$32768$8$1$${salt.toString('base64')}$${key.toString('base64')}`;
}
async function passwordMatches(password, encoded) {
  if (typeof password !== 'string' || password.length > 256 || !encoded) return false;
  const [algorithm, n, r, p, saltText, keyText, extra] = encoded.split('$');
  if (algorithm !== 'scrypt' || n !== '32768' || r !== '8' || p !== '1' || extra !== undefined) return false;
  const salt = Buffer.from(saltText || '', 'base64'), expected = Buffer.from(keyText || '', 'base64');
  if (salt.length !== 16 || expected.length !== 64) return false;
  const actual = await derive(password, salt, 64, SCRYPT);
  return timingSafeEqual(actual, expected);
}
export function isLoopback(hostname) {
  if (typeof hostname !== 'string') return false;
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return host === 'localhost' || host === '::1' || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) || /^::ffff:127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
}

export async function createAuth({ db, allowedOrigins, adminToken = '', dashboardPassword = '', authDisabled = false, allowLocalSetup = false, now = Date.now }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS dashboard_auth (
      id INTEGER PRIMARY KEY CHECK(id = 1), password_hash TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS dashboard_sessions (
      token_hash TEXT PRIMARY KEY, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS dashboard_session_expiry ON dashboard_sessions(expires_at);
  `);
  const storedHash = () => db.prepare('SELECT password_hash FROM dashboard_auth WHERE id = 1').get()?.password_hash;
  if (dashboardPassword) {
    passwordInput({ password: dashboardPassword });
    if (!await passwordMatches(dashboardPassword, storedHash())) {
      const encoded = await passwordHash(dashboardPassword);
      db.prepare('INSERT INTO dashboard_auth (id, password_hash, created_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET password_hash = excluded.password_hash, created_at = excluded.created_at').run(encoded, now());
      // A deployment password change also revokes sessions made with the previous credential.
      db.prepare('DELETE FROM dashboard_sessions').run();
    }
  }
  db.prepare('DELETE FROM dashboard_sessions WHERE expires_at <= ?').run(now());
  const failures = new Map();
  let setupInProgress = false;
  const configured = () => Boolean(storedHash() || adminToken);
  const mode = () => storedHash() ? 'password' : adminToken ? 'token' : 'setup';
  function bearer(req) {
    const header = req.get('Authorization');
    if (typeof header !== 'string' || header.length > 4096) return null;
    return /^Bearer ([^\s]+)$/.exec(header)?.[1] || null;
  }
  function authenticated(req) {
    if (authDisabled) return true;
    const token = bearer(req);
    if (!token) return false;
    if (adminToken && equal(token, adminToken)) return true;
    const hash = hashToken(token);
    const session = db.prepare('SELECT expires_at FROM dashboard_sessions WHERE token_hash = ?').get(hash);
    if (!session) return false;
    if (session.expires_at <= now()) {
      db.prepare('DELETE FROM dashboard_sessions WHERE token_hash = ?').run(hash);
      return false;
    }
    return true;
  }
  function localSetupRequest(req, requireOrigin = true) {
    if (!allowLocalSetup || authDisabled || configured() || !isLoopback(req.socket.remoteAddress) || !isLoopback(req.hostname)) return false;
    if (Object.keys(req.headers).some((name) => name.toLowerCase() === 'forwarded' || name.toLowerCase().startsWith('x-forwarded-'))) return false;
    const origin = req.get('Origin');
    if (!origin) return !requireOrigin;
    try {
      const url = new URL(origin);
      return allowedOrigins.has(origin) && ['http:', 'https:'].includes(url.protocol) && isLoopback(url.hostname);
    } catch { return false; }
  }
  function peer(req) { return req.socket.remoteAddress || 'unknown'; }
  function checkRate(req, res) {
    const record = failures.get(peer(req));
    if (!record || record.until <= now()) { failures.delete(peer(req)); return false; }
    if (record.count < MAX_FAILURES) return false;
    res.set('Retry-After', String(Math.ceil((record.until - now()) / 1000)));
    res.status(429).json({ error: 'Muitas tentativas. Aguarde 15 minutos antes de tentar novamente.' });
    return true;
  }
  function failed(req) {
    const key = peer(req), previous = failures.get(key);
    if (!previous || previous.until <= now()) failures.set(key, { count: 1, until: now() + ATTEMPT_WINDOW_MS });
    else previous.count += 1;
    if (failures.size > 1000) {
      for (const [name, value] of failures) if (value.until <= now()) failures.delete(name);
      while (failures.size > 1000) failures.delete(failures.keys().next().value);
    }
  }
  function issueSession(req) {
    const token = randomBytes(32).toString('hex');
    const expires = now() + SESSION_MS;
    db.prepare('DELETE FROM dashboard_sessions WHERE expires_at <= ?').run(now());
    db.prepare('INSERT INTO dashboard_sessions (token_hash, created_at, expires_at) VALUES (?, ?, ?)').run(hashToken(token), now(), expires);
    failures.delete(peer(req));
    return { token, expiresAt: new Date(expires).toISOString() };
  }
  const router = Router();
  router.get('/status', (req, res) => res.json({ configured: configured(), authenticated: authenticated(req), setupAllowed: localSetupRequest(req, false), mode: mode() }));
  router.post('/setup', async (req, res) => {
    if (configured() || setupInProgress) throw new HttpError(409, 'A senha de acesso já foi configurada. Entre com sua senha.');
    if (!localSetupRequest(req)) throw new HttpError(403, 'A criação de senha por HTTP está indisponível. Configure DASHBOARD_PASSWORD no ambiente privado do servidor.');
    if (checkRate(req, res)) return;
    let password;
    try { password = passwordInput(req.body); } catch (error) { failed(req); throw error; }
    setupInProgress = true;
    try {
      const encoded = await passwordHash(password);
      db.prepare('INSERT INTO dashboard_auth (id, password_hash, created_at) VALUES (1, ?, ?)').run(encoded, now());
      res.status(201).json(issueSession(req));
    } finally { setupInProgress = false; }
  });
  router.post('/login', async (req, res) => {
    if (checkRate(req, res)) return;
    // Reserve the attempt before async scrypt so parallel requests cannot bypass the limit.
    failed(req);
    const body = req.body;
    let valid = false;
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      if (typeof body.token === 'string' && body.token.length <= 4096 && adminToken) valid = equal(body.token, adminToken);
      if (!valid && typeof body.password === 'string') valid = await passwordMatches(body.password, storedHash());
    }
    if (!valid) throw new HttpError(401, 'Credencial inválida. Verifique a senha e tente novamente.');
    res.json(issueSession(req));
  });
  router.post('/logout', (req, res) => {
    if (!authenticated(req)) throw new HttpError(401, 'Sua sessão expirou. Entre novamente.');
    const token = bearer(req);
    if (token) db.prepare('DELETE FROM dashboard_sessions WHERE token_hash = ?').run(hashToken(token));
    res.sendStatus(204);
  });
  return { router, authenticated, configured, mode, enforced: !authDisabled };
}
