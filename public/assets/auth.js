
// Simple client-side auth for a static admin UI.
// Stores users in localStorage under "nexbit_users" as JSON: [{username, passwordHash_hex}]
// password hashing uses SubtleCrypto SHA-256 - works in modern browsers.
async function sha256Hex(text) {
  const enc = new TextEncoder();
  const data = enc.encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

async function getUsers() {
  const raw = localStorage.getItem('nexbit_users');
  if (raw) return JSON.parse(raw);
  try {
    const resp = await fetch('../data/users.json');
    if (resp.ok) {
      const arr = await resp.json();
      localStorage.setItem('nexbit_users', JSON.stringify(arr));
      return arr;
    }
  } catch(e){}
  const defaultUsers = [{username:'admin', passwordHash:'8e42cd0b395d455a26e9944201b53b063027f37d9c8d6b9f81b32f0e164c2208'}];
  localStorage.setItem('nexbit_users', JSON.stringify(defaultUsers));
  return defaultUsers;
}

async function saveUsers(users) {
  localStorage.setItem('nexbit_users', JSON.stringify(users));
}

async function checkLogin(username, password) {
  const users = await getUsers();
  const h = await sha256Hex(password);
  return users.find(u => u.username === username && u.passwordHash === h);
}

function setSession(username) {
  localStorage.setItem('nexbit_session', JSON.stringify({username, ts:Date.now()}));
}

function clearSession() {
  localStorage.removeItem('nexbit_session');
}

function getSession() {
  const s = localStorage.getItem('nexbit_session');
  return s ? JSON.parse(s) : null;
}

function requireLogin(redirectToLogin=true) {
  const s = getSession();
  if (!s) {
    if (redirectToLogin) location.href = 'login.html';
    return false;
  }
  return true;
}
