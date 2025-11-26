const express = require("express");
const cors = require("cors");
const session = require("express-session");
const path = require("path");
const fs = require("fs");
const bodyParser = require("body-parser");
require("dotenv").config();
const { Telegraf } = require("telegraf");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(
    session({
        secret: process.env.SESSION_SECRET || "default_secret_key",
        resave: false,
        saveUninitialized: true,
        cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
    })
);

// ============= Load local DB =============
const DB_PATH = path.join(__dirname, "database.json");

function loadDB() {
    if (!fs.existsSync(DB_PATH)) {
        fs.writeFileSync(DB_PATH, JSON.stringify({ admins: [], users: [] }, null, 2));
    }
    return JSON.parse(fs.readFileSync(DB_PATH));
}

function saveDB(db) {
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

// ============= Static Admin Panel =============
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "login.html"));
});

// ============= Auth =============
app.post("/auth/login", (req, res) => {
    const { username, password } = req.body;
    const db = loadDB();

    const admin = db.admins.find(a => a.username === username && a.password === password);

    if (!admin) return res.status(401).json({ success: false, message: "Login failed" });

    req.session.logged = true;
    req.session.username = username;

    res.json({ success: true });
});

app.get("/auth/logout", (req, res) => {
    req.session.destroy(() => {
        res.redirect("/");
    });
});

// Middleware for admin routes
function requireLogin(req, res, next) {
    if (!req.session.logged) return res.redirect("/");
    next();
}

// ============= Admin APIs =============
app.get("/admin/list", requireLogin, (req, res) => {
    const db = loadDB();
    res.json(db.admins);
});

app.post("/admin/add", requireLogin, (req, res) => {
    const { username, password } = req.body;

    const db = loadDB();

    if (db.admins.find(a => a.username === username)) {
        return res.json({ success: false, message: "Admin exists" });
    }

    db.admins.push({ username, password });
    saveDB(db);

    res.json({ success: true });
});

app.post("/admin/remove", requireLogin, (req, res) => {
    const { username } = req.body;

    let db = loadDB();
    db.admins = db.admins.filter(a => a.username !== username);
    saveDB(db);

    res.json({ success: true });
});

// ============= Example Setting API =============
app.get("/settings/info", requireLogin, (req, res) => {
    res.json({ version: "1.0.0", status: "running" });
});

// ============= Telegram Bot =============
if (process.env.BOT_TOKEN) {
    const bot = new Telegraf(process.env.BOT_TOKEN);

    bot.start(ctx => ctx.reply("Bot is running."));
    bot.on("text", ctx => ctx.reply("Received: " + ctx.message.text));

    bot.launch();
    console.log("Telegram bot started");
}

// ============= Error Handling =============
app.use((err, req, res, next) => {
    console.error("SERVER ERROR:", err);
    res.status(500).json({ success: false, message: "Internal Server Error" });
});

// ============= Start Server =============
app.listen(PORT, () => {
    console.log("Server running on port " + PORT);
});
