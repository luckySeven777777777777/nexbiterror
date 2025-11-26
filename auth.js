// 保存登录 token
function saveToken(token) {
    localStorage.setItem("admin_token", token);
}

// 获取 token
function getToken() {
    return localStorage.getItem("admin_token");
}

// 删除 token（登出）
function clearToken() {
    localStorage.removeItem("admin_token");
}

// 检查用户是否已登录（没有 token 就跳登录页）
function ensureLoggedIn() {
    const token = getToken();
    if (!token) {
        window.location.href = "/login.html";
        return false;
    }
    return token;
}

// ajax 请求封装（自动附带 token）
async function apiRequest(url, options = {}) {
    const token = getToken();

    const headers = options.headers || {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(url, { ...options, headers });

    if (!res.ok) {
        if (res.status === 401) {
            clearToken();
            window.location.href = "/login.html";
        }
        throw new Error(await res.text());
    }

    return res.json();
}
