/**
 * server.js - Nexbit minimal full backend (SQLite + Telegram bots)
 *
 * Requirements:
 *   npm i express sqlite3 bcrypt express-session uuid node-telegram-bot-api
 *
 * How it works (summary):
 * - Reads database.json if present (or uses env vars)
 * - Initializes SQLite database with tables if not exist
 * - Serves static files from ./public
 * - Provides /api/* endpoints: /api/login, /api/logout, /api/me, /api/admins, /api/users, /api/adjust, /api/request-2fa
 * - Creates two Telegram bots (marketBot, adminBot) when tokens available
 * - Periodic monitor looks for pending deposits/withdrawals and notifies adminBot on failure / suspicious behavior
 */

const fs = require('fs');
const path = require('path');
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const session = require('express-session');
const { v4: uuidv4 } = require('uuid');
const TelegramBot = require('node-telegram-bot-api');

// ---------- read config from database.json or env ----------
const configPath = path.join(__dirname, 'database.json');
let fileConfig = {};
try {
  if (fs.existsSync(configPath)) {
    fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
} catch (err) {
  console.warn('Invalid database.json, ignoring or use env variables', err.message);
}

const PORT = process.env.PORT || fileConfig.port || 3006;
const SESSION_SECRET = process.env.SESSION_SECRET || fileConfig.sessionSecret || 'nexbit_session_secret_default';
const BOT_A_TOKEN = process.env.BOT_TOKEN || fileConfig.telegramBotToken || ''; // market push bot
const BOT_B_TOKEN = process.env.ADMIN_BOT_TOKEN || fileConfig.adminBotToken || ''; // admin notification bot
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || fileConfig.telegramAdminChatId || (fileConfig.telegramChatId || '');

// ---------- ensure data dir and sqlite file ----------
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
const DB_FILE = path.join(__dirname, 'nexbit.sqlite3');

// ---------- init sqlite database ----------
const db = new sqlite3.Database(DB_FILE);

function initDb() {
  // admins (for backend login)
  db.run(`CREATE TABLE IF NOT EXISTS admins (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE,
    password TEXT,
    email TEXT,
    isSuper INTEGER DEFAULT 0,
    twoFAEnabled INTEGER DEFAULT 0,
    twoFASecret TEXT,
    twoFACode TEXT,
    twoFAExpires INTEGER
  )`);

  // members (users)
  db.run(`CREATE TABLE IF NOT EXISTS members (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE,
    email TEXT,
    balance REAL DEFAULT 0,
    agent_id TEXT,
    created_at INTEGER
  )`);

  // transactions (generic record)
  db.run(`CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    member_id TEXT,
    kind TEXT, -- deposit/withdraw/adjust
    amount REAL,
    status TEXT,
    note TEXT,
    created_at INTEGER
  )`);

  // deposits
  db.run(`CREATE TABLE IF NOT EXISTS deposits (
    id TEXT PRIMARY KEY,
    member_id TEXT,
    amount REAL,
    status TEXT,
    created_at INTEGER
  )`);

  // withdrawals
  db.run(`CREATE TABLE IF NOT EXISTS withdrawals (
    id TEXT PRIMARY KEY,
    member_id TEXT,
    amount REAL,
    status TEXT,
    created_at INTEGER
  )`);

  // agents
  db.run(`CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    name TEXT,
    commission REAL DEFAULT 0
  )`);

  // logs
  db.run(`CREATE TABLE IF NOT EXISTS logs (
    id TEXT PRIMARY KEY,
    level TEXT,
    message TEXT,
    meta TEXT,
    created_at INTEGER
  )`);

  // settings
  db.run(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )`);

  // ensure default admin exists
  db.get(`SELECT COUNT(*) AS c FROM admins`, (err, row) => {
    if (err) {
      console.error('db select admins error', err);
      return;
    }
    if (row && row.c === 0) {
      const defaultPassword = '444721';
      bcrypt.hash(defaultPassword, 10).then(hash => {
        const id = uuidv4();
        db.run(`INSERT INTO admins (id, username, password, email, isSuper) VALUES (?, ?, ?, ?, ?)`,
          [id, 'admin', hash, 'admin@example.com', 1], err2 => {
            if (err2) console.error('insert default admin err', err2);
            else console.log('Created default admin: admin / 444721');
          });
      });
    }
  });
}

initDb();

// ---------- Telegram bots init ----------
let marketBot = null;
let adminBot = null;

function safeCreateBot(token, name) {
  if (!token) {
    console.warn(`${name} token not configured`);
    return null;
  }
  try {
    const bot = new TelegramBot(token, { polling: true });
    bot.on('polling_error', (err) => {
      console.error(`${name} polling_error`, err && err.code ? { code: err.code, message: err.message } : err);
    });
    bot.on('message', (msg) => {
      // basic handling: log incoming messages to DB
      console.log(`[${name}] incoming from ${msg.chat.id}: ${msg.text}`);
    });
    console.log(`${name} started`);
    return bot;
  } catch (e) {
    console.error(`Failed to start ${name}`, e.message || e);
    return null;
  }
}

marketBot = safeCreateBot(BOT_A_TOKEN, 'MarketBot');
adminBot = safeCreateBot(BOT_B_TOKEN, 'AdminBot');

// helper to notify admin
function notifyAdmin(text, options = {}) {
  const chatId = ADMIN_CHAT_ID || fileConfig.telegramAdminChatId;
  if (!adminBot || !chatId) {
    console.warn('Admin bot or chat id not configured, skip notify:', text);
    return;
  }
  try {
    adminBot.sendMessage(chatId.toString(), text, options).catch(e => {
      console.error('adminBot sendMessage error', e.message || e);
    });
  } catch (e) {
    console.error('notifyAdmin error', e);
  }
}

// helper: market push
function marketPush(text) {
  if (!marketBot) return;
  const chatId = fileConfig.marketPushChatId || fileConfig.MARKET_PUSH_CHAT_ID || ADMIN_CHAT_ID;
  if (!chatId) return;
  marketBot.sendMessage(chatId.toString(), text).catch(e => {
    console.error('marketBot send error', e.message || e);
  });
}

// ---------- Express app ----------
const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false }));

// static front-end (public)
app.use(express.static(path.join(__dirname, 'public')));

// session
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 3600 * 1000 }
}));

// simple auth middleware
function requireAuth(req, res, next) {
  if (req.session && req.session.admin && req.session.admin.id) return next();
  res.status(401).json({ error: 'unauthorized' });
}

// ---------- API endpoints ----------

// login: body { username, password, twofa (optional) }
app.post('/api/login', (req, res) => {
  const { username, password, twofa } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'missing fields' });

  db.get(`SELECT * FROM admins WHERE username = ?`, [username], (err, admin) => {
    if (err) return res.status(500).json({ error: 'db error' });
    if (!admin) return res.status(401).json({ error: 'invalid credentials' });

    bcrypt.compare(password, admin.password).then(match => {
      if (!match) return res.status(401).json({ error: 'invalid credentials' });

      // if twoFAEnabled require code validation
      if (admin.twoFAEnabled) {
        if (!twofa) return res.status(403).json({ error: '2fa_required' });
        // check code and expiry
        if (!admin.twoFACode || !admin.twoFAExpires || Date.now() > admin.twoFAExpires) {
          return res.status(403).json({ error: '2fa_expired_or_not_sent' });
        }
        if (twofa !== admin.twoFACode) {
          return res.status(403).json({ error: '2fa_invalid' });
        }
      }

      // success -> set session
      req.session.admin = {
        id: admin.id,
        username: admin.username,
        email: admin.email,
        isSuper: !!admin.isSuper
      };
      // clear twoFACode after used
      db.run(`UPDATE admins SET twoFACode = NULL, twoFAExpires = NULL WHERE id = ?`, [admin.id]);
      res.json({ ok: true, admin: req.session.admin });
      notifyAdmin(`管理员 ${admin.username} 已登录（${new Date().toLocaleString()}）`);
    }).catch(err2 => {
      console.error('bcrypt compare err', err2);
      res.status(500).json({ error: 'internal' });
    });
  });
});

// request 2FA: generate code and send to admin via adminBot
// body: { username } - admin username requests 2fa
app.post('/api/request-2fa', (req, res) => {
  const { username } = req.body || {};
  if (!username) return res.status(400).json({ error: 'missing username' });
  db.get(`SELECT * FROM admins WHERE username = ?`, [username], (err, admin) => {
    if (err || !admin) return res.status(404).json({ error: 'admin not found' });

    const code = (Math.floor(100000 + Math.random() * 900000)).toString(); // 6-digit
    const expireAt = Date.now() + (5 * 60 * 1000); // 5 minutes
    db.run(`UPDATE admins SET twoFACode = ?, twoFAExpires = ? WHERE id = ?`, [code, expireAt, admin.id], (uerr) => {
      if (uerr) return res.status(500).json({ error: 'db' });
      // send via adminBot
      const chatId = ADMIN_CHAT_ID || fileConfig.telegramAdminChatId;
      if (adminBot && chatId) {
        adminBot.sendMessage(chatId.toString(), `你的后台一次性验证码：${code}（有效期 5 分钟）`).catch(e => {
          console.error('adminBot send 2fa err', e);
        });
      } else {
        console.warn('adminBot not configured to send 2fa');
      }
      res.json({ ok: true, message: '2fa_sent' });
    });
  });
});

// logout
app.post('/api/logout', requireAuth, (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

// me
app.get('/api/me', (req, res) => {
  if (!req.session || !req.session.admin) return res.json({ admin: null });
  res.json({ admin: req.session.admin });
});

// Admin list (require auth)
app.get('/api/admins', requireAuth, (req, res) => {
  db.all(`SELECT id, username, email, isSuper, twoFAEnabled FROM admins`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'db' });
    res.json({ admins: rows });
  });
});

// Users (members)
app.get('/api/members', requireAuth, (req, res) => {
  db.all(`SELECT * FROM members ORDER BY created_at DESC LIMIT 200`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'db' });
    res.json({ members: rows });
  });
});

// create/update member
app.post('/api/members', requireAuth, (req, res) => {
  const m = req.body;
  if (!m || !m.username) return res.status(400).json({ error: 'missing username' });
  const id = m.id || uuidv4();
  const now = Date.now();
  if (m.id) {
    db.run(`UPDATE members SET username = ?, email = ?, balance = ?, agent_id = ? WHERE id = ?`,
      [m.username, m.email || '', m.balance || 0, m.agent_id || null, id], (err) => {
        if (err) return res.status(500).json({ error: 'db' });
        res.json({ ok: true, id });
      });
  } else {
    db.run(`INSERT INTO members (id, username, email, balance, agent_id, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, m.username, m.email || '', m.balance || 0, m.agent_id || null, now], (err) => {
        if (err) return res.status(500).json({ error: 'db' });
        res.json({ ok: true, id });
      });
  }
});

// adjust amount (credit/debit) - body { member_id, amount, reason }
app.post('/api/adjust', requireAuth, (req, res) => {
  const { member_id, amount, reason } = req.body || {};
  if (!member_id || typeof amount !== 'number') return res.status(400).json({ error: 'missing' });

  db.get(`SELECT * FROM members WHERE id = ?`, [member_id], (err, mem) => {
    if (err || !mem) return res.status(404).json({ error: 'member not found' });
    const newBalance = (mem.balance || 0) + amount;
    db.run(`UPDATE members SET balance = ? WHERE id = ?`, [newBalance, member_id], (uerr) => {
      if (uerr) return res.status(500).json({ error: 'db' });
      const txId = uuidv4();
      const now = Date.now();
      db.run(`INSERT INTO transactions (id, member_id, kind, amount, status, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [txId, member_id, 'adjust', amount, 'done', reason || '', now]);
      // notify admin via adminBot
      notifyAdmin(`余额调整: 会员 ${mem.username} (${member_id}) 改变 ${amount >= 0 ? '+' : ''}${amount}，新余额 ${newBalance}。原因: ${reason || '无'}`);
      res.json({ ok: true, newBalance });
    });
  });
});

// admin actions: force withdrawal mark failed / success (for testing)
app.post('/api/withdrawals/:id/mark', requireAuth, (req, res) => {
  const id = req.params.id;
  const { status } = req.body;
  if (!id || !status) return res.status(400).json({ error: 'missing fields' });
  db.run(`UPDATE withdrawals SET status = ? WHERE id = ?`, [status, id], (err) => {
    if (err) return res.status(500).json({ error: 'db' });
    // notify admin
    notifyAdmin(`提款 ${id} 状态已被管理员设置为 ${status}`);
    res.json({ ok: true });
  });
});

// simple endpoint for creating fake deposit/withdraw for testing
app.post('/api/test-deposit', requireAuth, (req, res) => {
  const { member_id, amount } = req.body || {};
  if (!member_id || typeof amount !== 'number') return res.status(400).json({ error: 'missing' });
  const id = uuidv4();
  const now = Date.now();
  db.run(`INSERT INTO deposits (id, member_id, amount, status, created_at) VALUES (?, ?, ?, ?, ?)`,
    [id, member_id, amount, 'pending', now], (err) => {
      if (err) return res.status(500).json({ error: 'db' });
      res.json({ ok: true, id });
    });
});

// debug route to list deposits/withdrawals
app.get('/api/monitor', requireAuth, (req, res) => {
  db.all(`SELECT * FROM deposits ORDER BY created_at DESC LIMIT 50`, [], (err, depRows) => {
    if (err) depRows = [];
    db.all(`SELECT * FROM withdrawals ORDER BY created_at DESC LIMIT 50`, [], (err2, wRows) => {
      if (err2) wRows = [];
      res.json({ deposits: depRows, withdrawals: wRows });
    });
  });
});

// ---------- Monitoring logic (polling deposit/withdraw tables) ----------

function monitorLoop() {
  // check pending deposits and auto-complete (simulation)
  db.all(`SELECT * FROM deposits WHERE status = 'pending' LIMIT 10`, [], (err, rows) => {
    if (err) return console.error('monitor deposits err', err);
    rows.forEach(dep => {
      // example policy: if deposit exists longer than 10s -> mark done and credit
      const age = Date.now() - (dep.created_at || 0);
      if (age > 10 * 1000) {
        // credit user
        db.get(`SELECT * FROM members WHERE id = ?`, [dep.member_id], (e, mem) => {
          if (!mem) {
            // if member missing, mark deposit failed
            db.run(`UPDATE deposits SET status = 'failed' WHERE id = ?`, [dep.id]);
            notifyAdmin(`Deposit ${dep.id} failed: member ${dep.member_id} not found`);
            return;
          }
          const newBal = (mem.balance || 0) + (dep.amount || 0);
          db.run(`UPDATE members SET balance = ? WHERE id = ?`, [newBal, mem.id]);
          db.run(`UPDATE deposits SET status = 'done' WHERE id = ?`, [dep.id]);
          db.run(`INSERT INTO transactions (id, member_id, kind, amount, status, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [uuidv4(), mem.id, 'deposit', dep.amount || 0, 'done', `auto-credit deposit ${dep.id}`, Date.now()]);
          marketPush && marketPush(`市场通知: 会员 ${mem.username} 收到充值 ${dep.amount}，新余额 ${newBal}`);
        });
      }
    });
  });

  // check withdrawals with status 'processing' -> if stuck, mark failed and notify
  db.all(`SELECT * FROM withdrawals WHERE status = 'processing' LIMIT 20`, [], (err, rows) => {
    if (err) return console.error('monitor withdrawals err', err);
    rows.forEach(w => {
      const age = Date.now() - (w.created_at || 0);
      // if processing over threshold (e.g., 60s) -> mark failed and notify
      if (age > 60 * 1000) {
        db.run(`UPDATE withdrawals SET status = 'failed' WHERE id = ?`, [w.id]);
        notifyAdmin(`提款 ${w.id} 处理超时，已标记为 FAILED（可能无法提款）`);
      }
    });
  });
}

// start monitor every 10s
setInterval(monitorLoop, 10 * 1000);

// ---------- Basic logging helper ----------
function appLog(level, message, meta) {
  const id = uuidv4();
  db.run(`INSERT INTO logs (id, level, message, meta, created_at) VALUES (?, ?, ?, ?, ?)`,
    [id, level, message, JSON.stringify(meta || {}), Date.now()]);
  console.log(`[${level}] ${message}`);
}

// ---------- start server ----------
app.listen(PORT, () => {
  console.log(`NexbitService (full) running at http://localhost:${PORT}`);
  // startup messages
  if (adminBot) {
    notifyAdmin('管理员机器人已配置并启动（后台通知）');
  } else {
    console.warn('管理员机器人未配置 (ADMIN_BOT_TOKEN)');
  }
  if (marketBot) {
    marketPush('市场推送机器人已准备就绪');
  } else {
    console.warn('市场推送机器人未配置 (BOT_TOKEN)');
  }
  appLog('info', 'Server started', { port: PORT });
});
