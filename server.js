// server.js - Nexbit full API with SQLite + dual Telegram bots (market + admin)
// Save to project root as server.js
// Install deps: npm install express sqlite3 bcrypt express-session uuid node-telegram-bot-api

const fs = require('fs');
const path = require('path');
const express = require('express');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const TelegramBot = require('node-telegram-bot-api');

// --------- Load config (database.json optional) ----------
let cfg = {};
const cfgPath = path.join(__dirname, 'database.json');
if (fs.existsSync(cfgPath)) {
  try { cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8') || '{}'); }
  catch (e) { console.warn('Invalid database.json, ignoring', e && e.message); cfg = {}; }
}
const PORT = process.env.PORT || cfg.port || 3006;
const SESSION_SECRET = process.env.SESSION_SECRET || cfg.sessionSecret || 'nexbit_session_secret_change_me';

// Bot tokens: Bot A = market push (existing), Bot B = admin notifications (new)
const BOT_A_TOKEN = process.env.BOT_A_TOKEN || process.env.BOT_TOKEN || cfg.botA || cfg.marketBotToken || cfg.telegramBotToken || '';
const BOT_B_TOKEN = process.env.ADMIN_BOT_TOKEN || process.env.BOT_B_TOKEN || cfg.botB || cfg.adminBotToken || '';
// admin chat id(s) - string or comma separated
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || process.env.TELEGRAM_ADMIN_CHAT_ID || cfg.telegramAdminChatId || cfg.adminChatId || '';

// --------- Init Telegram bots (send only, no polling) ----------
let marketBot = null;
let adminBot = null;
if (BOT_A_TOKEN && BOT_A_TOKEN.indexOf('PUT_') === -1) {
  try {
    marketBot = new TelegramBot(BOT_A_TOKEN, { polling: false });
    console.log('[bot] Market push bot ready');
  } catch (e) { console.warn('[bot] market bot init failed', e && e.message); marketBot = null; }
} else {
  console.log('[bot] Market bot not configured (BOT_A_TOKEN)');
}
if (BOT_B_TOKEN && BOT_B_TOKEN.indexOf('PUT_') === -1) {
  try {
    adminBot = new TelegramBot(BOT_B_TOKEN, { polling: false });
    console.log('[bot] Admin bot ready');
  } catch (e) { console.warn('[bot] admin bot init failed', e && e.message); adminBot = null; }
} else {
  console.log('[bot] Admin bot not configured (ADMIN_BOT_TOKEN)');
}

// Helper senders
async function sendMarketPush(text) {
  if (!marketBot) return;
  try {
    if (!ADMIN_CHAT_ID) return;
    // allow comma separated chat ids
    for (const id of (ADMIN_CHAT_ID || '').toString().split(',').map(x=>x.trim()).filter(Boolean)) {
      await marketBot.sendMessage(id, text);
    }
  } catch (e) { console.warn('market push failed', e && e.message); }
}
async function sendAdminNotify(text) {
  if (!adminBot) return;
  try {
    for (const id of (ADMIN_CHAT_ID || '').toString().split(',').map(x=>x.trim()).filter(Boolean)) {
      await adminBot.sendMessage(id, text);
    }
  } catch (e) { console.warn('admin notify failed', e && e.message); }
}
async function sendAdminNotifyTo(chatId, text) {
  if (!adminBot) return;
  try { await adminBot.sendMessage(chatId, text); } catch (e) { console.warn('admin notify failed', e && e.message); }
}

// --------- App & DB ----------
const app = express();
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
const DB_PATH = path.join(DATA_DIR, 'nexbit.sqlite3');

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false }));

// serve static public (important!)
app.use(express.static(path.join(__dirname, 'public')));

// session
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 3600 * 1000 }
}));

// sqlite helpers
const db = new sqlite3.Database(DB_PATH);
function run(sql, params) { return new Promise((res, rej) => db.run(sql, params || [], function (err) { if (err) rej(err); else res(this); })); }
function all(sql, params) { return new Promise((res, rej) => db.all(sql, params || [], (e, r) => e ? rej(e) : res(r))); }
function get(sql, params) { return new Promise((res, rej) => db.get(sql, params || [], (e, r) => e ? rej(e) : res(r))); }

// init schema
async function initDB(){
  await run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    role TEXT,
    email TEXT,
    is_super INTEGER DEFAULT 0,
    twofa_enabled INTEGER DEFAULT 0,
    twofa_secret TEXT,
    created_at TEXT
  )`);
  await run(`CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    wallet TEXT,
    agent_of INTEGER,
    balance REAL DEFAULT 0,
    level TEXT,
    last_activity TEXT,
    created_at TEXT
  )`);
  await run(`CREATE TABLE IF NOT EXISTS deposits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT,
    member_id INTEGER,
    wallet TEXT,
    amount REAL,
    currency TEXT,
    status TEXT,
    ip TEXT,
    timestamp TEXT,
    raw TEXT
  )`);
  await run(`CREATE TABLE IF NOT EXISTS withdrawals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT,
    member_id INTEGER,
    wallet TEXT,
    amount REAL,
    currency TEXT,
    status TEXT,
    ip TEXT,
    timestamp TEXT,
    raw TEXT
  )`);
  await run(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT,
    user TEXT,
    amount REAL,
    status TEXT,
    timestamp TEXT,
    raw TEXT
  )`);
  await run(`CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT)`);
  // default super admin if no users
  const cnt = await get('SELECT COUNT(*) as c FROM users');
  if (cnt && cnt.c === 0) {
    const hash = await bcrypt.hash('444721', 10);
    await run('INSERT INTO users (username, password, role, is_super, created_at) VALUES (?,?,?,?,?)',
      ['admin', hash, 'admin', 1, new Date().toISOString()]);
    console.log('Default super admin created: admin / 444721');
  }
}
initDB().catch(e=>console.error('DB init error', e && e.message));

// ---------- AUTH middleware ----------
function requireAuth(req, res, next) {
  if (req.session && req.session.user && req.session.user.id) return next();
  return res.status(401).json({ ok:false, message:'请先登录' });
}
function requireSuper(req, res, next) {
  if (req.session && req.session.user && req.session.user.is_super) return next();
  return res.status(403).json({ ok:false, message:'需要超级管理员权限' });
}

// ---------- API: auth ----------
app.post('/api/login', async (req, res) => {
  try {
    const { username, password, twofa } = req.body || {};
    if (!username || !password) return res.json({ ok:false, message:'缺少用户名或密码' });
    const u = await get('SELECT id, username, password, role, is_super, twofa_enabled, twofa_secret FROM users WHERE username=?', [username]);
    if (!u) return res.json({ ok:false, message:'账号或密码错误' });
    const match = await bcrypt.compare(String(password), u.password);
    if (!match) return res.json({ ok:false, message:'账号或密码错误' });
    // check 2fa if enabled (simple placeholder: compare provided code with stored secret)
    if (u.twofa_enabled) {
      if (!twofa || twofa !== u.twofa_secret) return res.json({ ok:false, message:'2FA 验证失败' });
    }
    req.session.user = { id: u.id, username: u.username, role: u.role, is_super: u.is_super ? 1 : 0 };
    req.session.token = uuidv4();
    // notify via admin bot
    try { await sendAdminNotify(`🔐 管理员登录: ${u.username}\nIP: ${req.ip}\n时间: ${new Date().toLocaleString()}`); } catch(e){ console.warn('sendLoginNotify failed', e && e.message) }
    return res.json({ ok:true, user: req.session.user, token: req.session.token });
  } catch (e) { console.error(e); return res.status(500).json({ ok:false, message:'服务器错误' }); }
});

app.post('/api/logout', (req, res) => {
  if (req.session) req.session.destroy(()=>res.json({ ok:true }));
  else res.json({ ok:true });
});
app.get('/api/me', (req, res) => {
  if (req.session && req.session.user) return res.json({ ok:true, user: req.session.user });
  return res.status(401).json({ ok:false });
});

// ---------- Admin users ----------
app.get('/api/admins/list', requireAuth, requireSuper, async (req, res) => {
  try {
    const rows = await all('SELECT id, username, role, email, is_super, created_at, twofa_enabled FROM users ORDER BY id DESC');
    res.json({ ok:true, users: rows });
  } catch (e) { res.status(500).json({ ok:false, message: e.message }); }
});

app.post('/api/admins/add', requireAuth, requireSuper, async (req, res) => {
  try {
    const { username, password, role='admin', email, is_super=0 } = req.body || {};
    if (!username || !password) return res.status(400).json({ ok:false, message:'缺少参数' });
    const hash = await bcrypt.hash(String(password), 10);
    await run('INSERT INTO users (username,password,role,email,is_super,created_at) VALUES (?,?,?,?,?,?)', [username, hash, role, email||null, is_super?1:0, new Date().toISOString()]);
    try { await sendAdminNotify(`🧑‍💼 新管理员已创建: ${username} (by ${req.session.user.username})`); } catch(e){}
    res.json({ ok:true });
  } catch (e) {
    if (e && e.message && e.message.indexOf('UNIQUE')!==-1) return res.json({ ok:false, message:'用户名已存在' });
    res.status(500).json({ ok:false, message: e.message });
  }
});

app.post('/api/admins/delete', requireAuth, requireSuper, async (req, res) => {
  try {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ ok:false });
    await run('DELETE FROM users WHERE id=?', [Number(id)]);
    res.json({ ok:true });
  } catch (e) { res.status(500).json({ ok:false, message: e.message }); }
});

app.post('/api/admins/changepwd', requireAuth, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body || {};
    if (!oldPassword || !newPassword) return res.status(400).json({ ok:false });
    const u = await get('SELECT id, password FROM users WHERE id=?', [req.session.user.id]);
    const match = await bcrypt.compare(String(oldPassword), u.password);
    if (!match) return res.json({ ok:false, message:'旧密码错误' });
    const hash = await bcrypt.hash(String(newPassword), 10);
    await run('UPDATE users SET password=? WHERE id=?', [hash, req.session.user.id]);
    res.json({ ok:true });
  } catch (e) { res.status(500).json({ ok:false, message: e.message }); }
});

// ---------- Members ----------
app.get('/api/members', requireAuth, async (req, res) => {
  try {
    const rows = await all('SELECT id, name, wallet, agent_of, balance, level, last_activity, created_at FROM members ORDER BY id DESC LIMIT 1000');
    res.json({ ok:true, members: rows });
  } catch (e) { res.status(500).json({ ok:false, message: e.message }); }
});

app.post('/api/members/add', requireAuth, requireSuper, async (req, res) => {
  try {
    const { name, wallet, agent_of } = req.body || {};
    await run('INSERT INTO members (name,wallet,agent_of,created_at) VALUES (?,?,?,?)', [name||null, wallet||null, agent_of||null, new Date().toISOString()]);
    res.json({ ok:true });
  } catch (e) { res.status(500).json({ ok:false, message:e.message }); }
});

// ---------- Deposits/Withdrawals/Orders ----------
app.get('/proxy/deposits', requireAuth, async (req, res) => {
  try {
    const rows = await all('SELECT d.*, m.name as member_name FROM deposits d LEFT JOIN members m ON m.id=d.member_id ORDER BY timestamp DESC LIMIT 2000');
    res.json(rows);
  } catch (e) { console.error(e); res.status(500).json({ ok:false, message:e.message }); }
});

app.get('/proxy/withdrawals', requireAuth, async (req, res) => {
  try {
    const rows = await all('SELECT w.*, m.name as member_name FROM withdrawals w LEFT JOIN members m ON m.id=w.member_id ORDER BY timestamp DESC LIMIT 2000');
    res.json(rows);
  } catch (e) { console.error(e); res.status(500).json({ ok:false, message:e.message }); }
});

app.get('/proxy/transactions', requireAuth, async (req, res) => {
  try {
    const d = await all('SELECT id, order_id, member_id, wallet, amount, currency, status, timestamp, "recharge" as type FROM deposits ORDER BY timestamp DESC LIMIT 2000');
    const w = await all('SELECT id, order_id, member_id, wallet, amount, currency, status, timestamp, "withdraw" as type FROM withdrawals ORDER BY timestamp DESC LIMIT 2000');
    const o = await all('SELECT id, order_id, user as member_id, NULL as wallet, amount, NULL as currency, status, timestamp, "order" as type FROM orders ORDER BY timestamp DESC LIMIT 2000');
    const merged = [...d, ...w, ...o].sort((a,b)=> (new Date(b.timestamp||0) - new Date(a.timestamp||0)));
    res.json(merged);
  } catch (e) { console.error(e); res.status(500).json({ ok:false, message:e.message }); }
});

// create deposit/withdraw (UI usage)
app.post('/proxy/recharge', requireAuth, async (req, res) => {
  try {
    const p = req.body || {};
    const orderId = 'R' + Date.now();
    const ts = new Date().toISOString();
    await run('INSERT INTO deposits (order_id, member_id, wallet, amount, currency, status, ip, timestamp, raw) VALUES (?,?,?,?,?,?,?,?,?)',
      [orderId, p.member||null, p.wallet||null, Number(p.amount||0), p.currency||'BRL', p.status||'pending', req.ip, ts, JSON.stringify(p)]);
    try{ await sendMarketPush(`💳 新充值: ${orderId} ${p.amount} ${p.currency}`); } catch(e){}
    try{ await sendAdminNotify(`💳 新充值: ${orderId}\n金额: ${p.amount} ${p.currency}\n会员: ${p.member||'unknown'}\nIP: ${req.ip}`); } catch(e){}
    res.json({ ok:true, orderId });
  } catch (e) { console.error(e); res.status(500).json({ ok:false, message: e.message }); }
});

app.post('/proxy/withdraw', requireAuth, async (req, res) => {
  try {
    const p = req.body || {};
    const orderId = 'W' + Date.now();
    const ts = new Date().toISOString();
    await run('INSERT INTO withdrawals (order_id, member_id, wallet, amount, currency, status, ip, timestamp, raw) VALUES (?,?,?,?,?,?,?,?,?)',
      [orderId, p.member||null, p.wallet||null, Number(p.amount||0), p.currency||'BRL', p.status||'pending', req.ip, ts, JSON.stringify(p)]);
    try{ await sendAdminNotify(`🧾 新提款请求: ${orderId}\n金额: ${p.amount} ${p.currency}\n会员: ${p.member||'unknown'}`); } catch(e){}
    res.json({ ok:true, orderId });
  } catch (e) { console.error(e); res.status(500).json({ ok:false, message: e.message }); }
});

// update deposit/withdraw status (super admin)
app.post('/api/deposits/:id/status', requireAuth, requireSuper, async (req, res) => {
  try {
    const id = Number(req.params.id), status = req.body.status;
    await run('UPDATE deposits SET status=? WHERE id=?', [status, id]);
    try{ await sendAdminNotify(`🔁 充值订单 ${id} 状态已改为 ${status} by ${req.session.user.username}`); }catch(e){}
    res.json({ ok:true });
  } catch (e) { res.status(500).json({ ok:false, message:e.message }); }
});
app.post('/api/withdrawals/:id/status', requireAuth, requireSuper, async (req, res) => {
  try {
    const id = Number(req.params.id), status = req.body.status;
    await run('UPDATE withdrawals SET status=? WHERE id=?', [status, id]);
    if (status && status.toString().toLowerCase()==='failed') {
      try{ await sendAdminNotify(`❌ 提现失败: id=${id} by ${req.session.user.username}`); }catch(e){}
    } else {
      try{ await sendAdminNotify(`🔁 提现 ${id} 状态已改为 ${status} by ${req.session.user.username}`); }catch(e){}
    }
    res.json({ ok:true });
  } catch (e) { res.status(500).json({ ok:false, message:e.message }); }
});

// ---------- Amount adjust endpoints (super admin) ----------
app.post('/api/deposits/:id/adjust', requireAuth, requireSuper, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { amount, reason } = req.body || {};
    if (amount === undefined) return res.status(400).json({ ok:false, message:'缺少 amount' });
    await run('UPDATE deposits SET amount=? WHERE id=?', [Number(amount), id]);
    await run('INSERT INTO orders (order_id, user, amount, status, timestamp, raw) VALUES (?,?,?,?,?,?)',
      [`ADJ-D-${id}-${Date.now()}`, req.session.user.username, Number(amount), 'adjust', new Date().toISOString(), JSON.stringify({reason})]);
    try{ await sendAdminNotify(`🔧 充值调整 id:${id} amount:${amount} by ${req.session.user.username}`); }catch(e){}
    res.json({ ok:true });
  } catch (e) { res.status(500).json({ ok:false, message:e.message }); }
});

app.post('/api/withdrawals/:id/adjust', requireAuth, requireSuper, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { amount, reason } = req.body || {};
    if (amount === undefined) return res.status(400).json({ ok:false, message:'缺少 amount' });
    await run('UPDATE withdrawals SET amount=? WHERE id=?', [Number(amount), id]);
    await run('INSERT INTO orders (order_id, user, amount, status, timestamp, raw) VALUES (?,?,?,?,?,?)',
      [`ADJ-W-${id}-${Date.now()}`, req.session.user.username, Number(amount), 'adjust', new Date().toISOString(), JSON.stringify({reason})]);
    try{ await sendAdminNotify(`🔧 提现调整 id:${id} amount:${amount} by ${req.session.user.username}`); }catch(e){}
    res.json({ ok:true });
  } catch (e) { res.status(500).json({ ok:false, message:e.message }); }
});

// ---------- Settings ----------
app.get('/api/settings/get', requireAuth, requireSuper, async (req, res) => {
  try {
    const rows = await all('SELECT k,v FROM settings');
    const out = {};
    rows.forEach(r => { try{ out[r.k] = JSON.parse(r.v); }catch(e){ out[r.k]=r.v; }});
    res.json({ ok:true, settings: out });
  } catch (e) { res.status(500).json({ ok:false, message:e.message }); }
});

app.post('/api/settings/update', requireAuth, requireSuper, async (req, res) => {
  try {
    const body = req.body || {};
    for (const k of Object.keys(body)) {
      await run('INSERT OR REPLACE INTO settings (k,v) VALUES (?,?)', [k, JSON.stringify(body[k])]);
    }
    res.json({ ok:true });
  } catch (e) { res.status(500).json({ ok:false, message:e.message }); }
});

// ---------- 2FA placeholders ----------
app.get('/api/2fa/setup', requireAuth, async (req, res) => {
  // For demo: generate simple secret and enable (in prod use real TOTP)
  const secret = uuidv4().slice(0,8);
  await run('UPDATE users SET twofa_secret=?, twofa_enabled=1 WHERE id=?', [secret, req.session.user.id]);
  try{ await sendAdminNotify(`🔐 2FA 已启用 for ${req.session.user.username}`); }catch(e){}
  res.json({ ok:true, secret, qr: `2FA-SECRET:${secret}` });
});
app.post('/api/2fa/disable', requireAuth, async (req, res) => {
  await run('UPDATE users SET twofa_secret=NULL, twofa_enabled=0 WHERE id=?', [req.session.user.id]);
  try{ await sendAdminNotify(`🔐 2FA 已禁用 for ${req.session.user.username}`); }catch(e){}
  res.json({ ok:true });
});

// ---------- System alerts endpoint ----------
app.post('/api/alert', requireAuth, requireSuper, async (req, res) => {
  const { text } = req.body || {};
  if (!text) return res.status(400).json({ ok:false });
  try { await sendAdminNotify(`⚠️ 系统警报:\n${text}`); } catch(e){}
  res.json({ ok:true });
});

// ---------- Fallback ----------
app.use((req, res) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/proxy')) return res.status(404).json({ ok:false, message: 'not found' });
  return res.status(404).send('Not Found');
});

// ---------- Monitor: frequent deposits alert ----------
const MONITOR_INTERVAL_SEC = 20; // how often to check in seconds
async function monitorFrequentDeposits() {
  try {
    const rows = await all('SELECT k,v FROM settings');
    const S = {};
    rows.forEach(r => { try{ S[r.k]=JSON.parse(r.v);}catch(e){ S[r.k]=r.v;} });
    const threshold = (S.tgThresholdCount) || 5;
    const windowSec = (S.tgWindowSeconds) || 3600;
    const since = new Date(Date.now() - windowSec*1000).toISOString();
    const recent = await all('SELECT COUNT(*) as c FROM deposits WHERE timestamp >= ?', [since]);
    const c = (recent && recent[0] && recent[0].c) ? recent[0].c : 0;
    if (c >= threshold) {
      await sendAdminNotify(`🚨 监测到短时充值异常: ${c} 笔，阈值 ${threshold}，窗口 ${windowSec}s`);
    }
    // also scan failed withdrawals and notify
    const failed = await all('SELECT id,order_id,member_id,amount,timestamp FROM withdrawals WHERE status="failed" AND timestamp >= ?', [since]);
    if (failed && failed.length>0) {
      await sendAdminNotify(`❌ 检测到 ${failed.length} 条近期提现失败记录`);
    }
  } catch (e) { console.warn('monitor error', e && e.message); }
}
setInterval(monitorFrequentDeposits, MONITOR_INTERVAL_SEC*1000);

// ---------- Start server ----------
app.listen(PORT, () => {
  console.log(`NexbitService (full) running at http://localhost:${PORT}`);
  if (adminBot) console.log('Telegram admin bot configured');
  if (marketBot) console.log('Telegram market bot configured');
});
