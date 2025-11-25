// ===============================
// Nexbit 完整可运行 server.js
// ===============================

// 基础模块
const express = require("express");
const cors = require("cors");
const session = require("express-session");
const path = require("path");
const bodyParser = require("body-parser");

// Telegram Bot (如果你项目里不用，可以删除)
const { Telegraf } = require("telegraf");

// 环境变量
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// ============= 中间件 =============
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(
    session({
        secret: process.env.SESSION_SECRET || "default_secret_key",
        resave: false,
        saveUninitialized: true,
        cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 } // 7 天
    })
);

// ============= 静态后台文件（你发的 public.zip） =============
app.use(express.static(path.join(__dirname, "public")));


// ============= 后台路由 =============
app.get("/", (req, res) => {
    return res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.get("/admin", (req, res) => {
    return res.sendFile(path.join(__dirname, "public", "admin-new.html"));
});


// ============= 示例 API 接口 =============
app.get("/api/status", (req, res) => {
    res.json({ status: "running", time: new Date() });
});


// ============= Telegram Bot（自动启用环境变量） =============
if (process.env.BOT_TOKEN) {
    const bot = new Telegraf(process.env.BOT_TOKEN);

    bot.start((ctx) => ctx.reply("Bot started successfully."));
    bot.on("text", (ctx) => ctx.reply("收到: " + ctx.message.text));

    bot.launch();
    console.log("Telegram bot started...");
}


// ============= 启动服务器 =============
app.listen(PORT, () =>
    console.log(`Server running on port ${PORT}`)
);
