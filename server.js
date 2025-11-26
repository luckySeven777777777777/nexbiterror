// ------------------------------
// Nexbit Fullstack Final Server
// ------------------------------

const express = require("express");
const session = require("express-session");
const path = require("path");
const fs = require("fs");

const { checkAuth, login, logout } = require("./auth");
const nexbitAPI = require("./nexbit-api");

const app = express();

// ------------------------------
// Middlewares
// ------------------------------

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
    session({
        secret: process.env.SESSION_SECRET || "nexbit_session_secret",
        resave: false,
        saveUninitialized: true,
        cookie: { maxAge: 24 * 60 * 60 * 1000 }
    })
);

// ------------------------------
// Serve Frontend (STATIC FILES)
// ------------------------------

app.use(express.static(path.join(__dirname, "public"), {
    extensions: ['html']   // 自动补 .html
}));

// 默认主页 → public/index.html
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public/index.html"));
});

// ------------------------------
// Auth APIs
// ------------------------------

app.post("/api/login", login);
app.get("/api/logout", logout);

// ------------------------------
// Protected Pages
// ------------------------------

app.get("/dashboard", checkAuth, (req, res) => {
    res.sendFile(path.join(__dirname, "public/dashboard-brand.html"));
});

app.get("/admins", checkAuth, (req, res) => {
    res.sendFile(path.join(__dirname, "public/admins.html"));
});

// ------------------------------
// Nexbit Back-end APIs
// ------------------------------

app.get("/api/users", checkAuth, (req, res) => {
    const data = nexbitAPI.getUsers();
    res.json(data);
});

app.post("/api/user/update", checkAuth, (req, res) => {
    const result = nexbitAPI.updateUser(req.body);
    res.json(result);
});

app.get("/api/admins", checkAuth, (req, res) => {
    const data = nexbitAPI.getAdmins();
    res.json(data);
});

app.post("/api/admin/add", checkAuth, (req, res) => {
    const result = nexbitAPI.addAdmin(req.body);
    res.json(result);
});

app.post("/api/admin/delete", checkAuth, (req, res) => {
    const result = nexbitAPI.deleteAdmin(req.body);
    res.json(result);
});

// 余额（加钱 / 扣钱）
app.post("/api/balance/update", checkAuth, (req, res) => {
    const result = nexbitAPI.updateBalance(req.body);
    res.json(result);
});

// 后端推送通知
app.post("/api/notify", checkAuth, async (req, res) => {
    const { text } = req.body;
    const status = await nexbitAPI.sendAdminNotify(text);
    res.json(status);
});

// ------------------------------
// 404 Catch
// ------------------------------

app.use((req, res) => {
    res.status(404).send("Not Found");
});

// ------------------------------
// Start Server
// ------------------------------

const PORT = process.env.PORT || 3006;

app.listen(PORT, () => {
    console.log(`🚀 Nexbit Backend running on port ${PORT}`);
});
