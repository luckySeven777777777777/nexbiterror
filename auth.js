// public/assets/auth.js
console.log('[auth] loaded');

// 保存 token
function saveToken(token) {
  localStorage.setItem("nexbit_token", token);
}

// 取得 token
function getToken() {
  return localStorage.getItem("nexbit_token");
}

// 删除 token（退出登录）
function clearToken() {
  localStorage.removeItem("nexbit_token");
}

// 保存登录用户名（可选）
function saveUser(u){
  localStorage.setItem('nexbit_user', u);
}
function getUser(){ return localStorage.getItem('nexbit_user'); }

// 前端全局封装 fetch（自动带 token）
async function api(url, options = {}) {
  const token = getToken();
  if (!options.headers) options.headers = {};
  // JSON 默认
  options.headers["Content-Type"] = "application/json";
  if (token) {
    options.headers["Authorization"] = "Bearer " + token;
  }
  const res = await fetch(url, options);

  // token 过期或未登录 → 重定向登录
  if (res.status === 401) {
    clearToken();
    window.location.href = "/login.html";
    return { ok: false, message: 'unauthorized' };
  }

  // 尝试返回 json
  try {
    return await res.json();
  } catch (e) { return {}; }
}

// 没有 token → 强制跳登录
function requireLogin() {
  const token = getToken();
  if (!token) {
    console.warn("[auth] no token → redirect login");
    window.location.href = "/login.html";
  }
}
