//--------------------------------------------------
// server.js — Railway 可运行 + 静态页面 + 双机器人
//--------------------------------------------------

const express = require("express");
const path = require("path");
const fs = require("fs");
const cors = require("cors");

// =======================
//  初始化 Express
// =======================
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// =======================
//  静态文件：public 目录
// =======================
const PUBLIC_DIR = path.join(__dirname, "public");
app.use(express.static(PUBLIC_DIR));

// 让所有 HTML 都能直接访问
app.get("/", (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, "login.html"));
});

// =======================
//   载入数据库 JSON
// =======================
const DB_FILE = path.join(__dirname, "database.json");
function loadDB() {
    try {
        return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
    } catch (e) {
        console.log("⚠ database.json 读取失败，已使用空对象");
        return {};
    }
}
function saveDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// =======================
//   API 示例（自行替换）
// =======================
app.post("/api/login", (req, res) => {
    const { username, password } = req.body;
    const db = loadDB();
    if (!db.users) return res.status(400).json({ ok: false });

    const user = db.users.find(
        u => u.username === username && u.password === password
    );

    if (user) return res.json({ ok: true });
    else return res.status(401).json({ ok: false });
});

// ===============================================================
//  两个 Telegram Bot 同时运行（AdminBot + MarketBot）
// ===============================================================
const TelegramBot = require("node-telegram-bot-api");

// 从 Railway 环境变量中取（推荐）
// 在 Railway → Variables 设置： ADMIN_BOT_TOKEN / MARKET_BOT_TOKEN
const ADMIN_BOT_TOKEN = process.env.ADMIN_BOT_TOKEN || "YOUR_ADMIN_BOT_TOKEN";
const MARKET_BOT_TOKEN = process.env.MARKET_BOT_TOKEN || "YOUR_MARKET_BOT_TOKEN";

console.log("🤖 准备启动 Telegram Bot...");

// ---- Admin Bot -------------------------------------------------
let adminBot = null;
if (ADMIN_BOT_TOKEN && ADMIN_BOT_TOKEN !== "YOUR_ADMIN_BOT_TOKEN") {
    adminBot = new TelegramBot(ADMIN_BOT_TOKEN, { polling: true });

    adminBot.on("message", (msg) => {
        adminBot.sendMessage(msg.chat.id, "AdminBot 正常运行中");
    });

    console.log("✔ AdminBot 已启动");
} else {
    console.log("⚠ 未设置 ADMIN_BOT_TOKEN，AdminBot 未启动");
}

// ---- Market Bot ------------------------------------------------
let marketBot = null;
if (MARKET_BOT_TOKEN && MARKET_BOT_TOKEN !== "YOUR_MARKET_BOT_TOKEN") {
    marketBot = new TelegramBot(MARKET_BOT_TOKEN, { polling: true });

    marketBot.on("message", (msg) => {
        marketBot.sendMessage(msg.chat.id, "MarketBot 正常运行中");
    });

    console.log("✔ MarketBot 已启动");
} else {
    console.log("⚠ 未设置 MARKET_BOT_TOKEN，MarketBot 未启动");
}

// =======================
//  Railway 的端口支持
// =======================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
    console.log(`🌐 http://localhost:${PORT}`);
});
