// ==========================
//      NEXBIT 服务版 SERVER
// ==========================

const express = require("express");
const session = require("express-session");
const path = require("path");
const fs = require("fs");
const bodyParser = require("body-parser");
const cors = require("cors");

// 环境变量
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================
//      MIDDLEWARE
// ==========================
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// session
app.use(
  session({
    secret: process.env.SESSION_SECRET || "nexbit_default_secret",
    resave: false,
    saveUninitialized: true,
  })
);

// ==========================
//      静态资源
// ==========================
app.use("/public", express.static(path.join(__dirname, "public")));
app.use("/assets", express.static(path.join(__dirname, "public/assets")));

// ==========================
//      登录验证
// ==========================
function requireLogin(req, res, next) {
  if (!req.session.loggedIn) return res.redirect("/login");
  next();
}

// ==========================
//      页面路由
// ==========================

// 登录页
app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "public/login.html"));
});

// 登录提交
app.post("/login", (req, res) => {
  const { username, password } = req.body;

  const admin = JSON.parse(fs.readFileSync("database.json"));

  if (username === admin.username && password === admin.password) {
    req.session.loggedIn = true;
    return res.redirect("/admin");
  }

  res.send("<h3>登录失败，账号或密码错误</h3>");
});

// 管理后台首页
app.get("/admin", requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, "public/admins.html"));
});

// 其它页面
app.get("/dashboard", requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, "public/dashboard-brand.html"));
});

app.get("/admin-new", requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, "public/admin-new.html"));
});

// ==========================
//      API 示例
// ==========================

app.get("/api/user", requireLogin, (req, res) => {
  const admin = JSON.parse(fs.readFileSync("database.json"));
  res.json({ username: admin.username });
});

// ==========================
//      ROOT → 自动跳转 login
// ==========================
app.get("/", (req, res) => {
  res.redirect("/login");
});

// ==========================
//      启动服务器
// ==========================
app.listen(PORT, () => {
  console.log("Nexbit service running on port:", PORT);
});
