const express = require("express");
const session = require("express-session");
const path = require("path");
const bodyParser = require("body-parser");
const fs = require("fs");

const app = express();

// =====================
// 1. STATIC FILE CONFIG
// =====================
const publicPath = path.join(__dirname, "public");
app.use(express.static(publicPath));   // 静态文件目录

// 默认首页跳转到 login.html
app.get("/", (req, res) => {
    res.sendFile(path.join(publicPath, "login.html"));
});

// =====================
// 2. SESSION CONFIG
// =====================
app.use(
    session({
        secret: process.env.SESSION_SECRET || "nexbit_secret",
        resave: false,
        saveUninitialized: true,
        cookie: {
            maxAge: 86400000
        }
    })
);

// =====================
// 3. JSON + FORM PARSER
// =====================
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// =====================
// 4. AUTH MIDDLEWARE
// =====================

// 登录保护
function requireAdmin(req, res, next) {
    if (!req.session || !req.session.admin) {
        return res.redirect("/login.html");
    }
    next();
}

// =====================
// 5. LOAD DATABASE JSON
// =====================

const dbPath = path.join(__dirname, "database.json");
function loadDB() {
    return JSON.parse(fs.readFileSync(dbPath, "utf8"));
}
function saveDB(data) {
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
}

// =====================
// 6. LOGIN API
// =====================

app.post("/api/login", (req, res) => {
    const { username, password } = req.body;

    const db = loadDB();
    const admin = db.admins.find(a => a.username === username && a.password === password);

    if (!admin) return res.json({ success: false, message: "账号或密码错误" });

    req.session.admin = admin.username;

    res.json({ success: true });
});

// =====================
// 7. PROTECTED PAGES
// =====================

app.get("/admin-new.html", requireAdmin, (req, res) => {
    res.sendFile(path.join(publicPath, "admin-new.html"));
});

app.get("/admins.html", requireAdmin, (req, res) => {
    res.sendFile(path.join(publicPath, "admins.html"));
});

app.get("/dashboard-brand.html", requireAdmin, (req, res) => {
    res.sendFile(path.join(publicPath, "dashboard-brand.html"));
});

// =====================
// 8. TELEGRAM BOTS FIX
// =====================

// 解决 409 错误：强制设定 long polling 单实例
const { Telegraf } = require("telegraf");

// Market Bot
if (process.env.BOT_TOKEN) {
    const MarketBot = new Telegraf(process.env.BOT_TOKEN);
    MarketBot.launch({
        polling: {
            timeout: 60,
            interval: 500
        }
    }).then(() => {
        console.log("[MarketBot] 已启动");
    }).catch(err => {
        console.log("[MarketBot 启动错误] ", err.message);
    });
}

// Admin Bot
if (process.env.ADMIN_BOT_TOKEN) {
    const AdminBot = new Telegraf(process.env.ADMIN_BOT_TOKEN);
    AdminBot.launch({
        polling: {
            timeout: 60,
            interval: 500
        }
    }).then(() => {
        console.log("[AdminBot] 已启动");
    }).catch(err => {
        console.log("[AdminBot 启动错误] ", err.message);
    });
}

// =====================
// 9. START SERVER
// =====================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Nexbit 后台运行在端口: ${PORT}`);
});
