const express = require("express");
const session = require("express-session");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const auth = require("./auth");
const nexbit = require("./nexbit-api");

const app = express();

// ---- SESSION ----
app.use(
    session({
        secret: process.env.SESSION_SECRET || "nexbit_session_secret",
        resave: false,
        saveUninitialized: false,
        cookie: { maxAge: 24 * 60 * 60 * 1000 }
    })
);

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ---- STATIC FILES ----
app.use(express.static(path.join(__dirname, "public")));

// ------------------ AUTH ROUTES ------------------
app.post("/api/login", auth.login);
app.get("/api/logout", auth.logout);
app.get("/api/me", auth.requireAuth, auth.me);

// ------------------ ADMIN ROUTES ------------------
app.get("/api/admins", auth.requireAuth, (req, res) => {
    const db = JSON.parse(fs.readFileSync("./database.json"));
    res.json({ success: true, admins: db.admins });
});

app.post("/api/admins/add", auth.requireAuth, (req, res) => {
    const db = JSON.parse(fs.readFileSync("./database.json"));
    const { username, password, role } = req.body;

    if (!username || !password) {
        return res.json({ success: false, message: "Missing fields" });
    }

    db.admins.push({
        id: Date.now(),
        username,
        password,
        role: role || "admin"
    });

    fs.writeFileSync("./database.json", JSON.stringify(db, null, 2));
    res.json({ success: true });
});

// ------------------ TELEGRAM API ROUTE ------------------
app.post("/api/send", auth.requireAuth, nexbit.sendMessage);

// ------------------ FALLBACK ROUTE ------------------
app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ------------------ START SERVER ------------------
const PORT = process.env.PORT || 3006;
app.listen(PORT, () => console.log("Server running on port " + PORT));
