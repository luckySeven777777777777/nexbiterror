// public/nexbit-api.js - Full-featured client bindings for Nexbit Admin
// Save as public/nexbit-api.js and include it at the end of your admin pages.
// Provides: login, logout, me, admins CRUD, members CRUD, deposits, withdrawals, orders, settings, backup, bot control, change password, 2FA placeholders.

(function(){
  const API = {};

  const JSON_HEADERS = {'Content-Type':'application/json'};

  async function fetchJson(url, opts = {}) {
    opts.credentials = opts.credentials || 'include';
    if (!opts.headers) opts.headers = {};
    // merge headers
    opts.headers = Object.assign({}, opts.headers, opts.headers || {});
    try {
      const res = await fetch(url, opts);
      const j = await (res.headers.get('content-type')||'').includes('application/json') ? res.json() : null;
      if (!res.ok) {
        throw j && j.message ? j : { message: j && j.message ? j.message : `HTTP ${res.status}` };
      }
      return j === null ? {} : j;
    } catch (err) {
      console.error('fetchJson error', url, err);
      throw err;
    }
  }

  // Simple UI helpers
  function el(id) { return document.getElementById(id); }
  function q(sel) { return document.querySelector(sel); }
  function qAll(sel) { return Array.from(document.querySelectorAll(sel)); }

  function toast(msg, type='info', timeout=3000) {
    // simple alert fallback if no toast container
    try {
      let box = el('nexbit-toast');
      if (!box) {
        box = document.createElement('div');
        box.id = 'nexbit-toast';
        box.style = 'position:fixed;right:20px;bottom:20px;z-index:99999;max-width:320px;';
        document.body.appendChild(box);
      }
      const item = document.createElement('div');
      item.innerText = msg;
      item.style = 'background:#222;color:#fff;padding:10px;margin-top:8px;border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,.2);';
      if (type==='error') item.style.background = '#b00020';
      if (type==='success') item.style.background = '#007a3d';
      box.appendChild(item);
      setTimeout(()=>{ item.style.opacity = '0'; setTimeout(()=>item.remove(),400); }, timeout);
    } catch(e){ alert(msg); }
  }

  function confirmAsync(message){
    return Promise.resolve(window.confirm(message));
  }

  // Basic API wrappers
  API.login = async (username, password) => {
    return fetchJson('/api/login', { method:'POST', headers: JSON_HEADERS, body: JSON.stringify({username,password}) });
  };
  API.logout = async () => fetchJson('/api/logout', { method:'POST', headers: JSON_HEADERS });
  API.me = async () => fetchJson('/api/me');

  // Admins
  API.listAdmins = async () => fetchJson('/api/users');
  API.createAdmin = async (username,password,role='admin',email=null,is_super=0) => fetchJson('/api/users', { method:'POST', headers: JSON_HEADERS, body: JSON.stringify({username,password,role,email,is_super}) });
  API.deleteAdmin = async (id) => fetchJson(`/api/users/${id}`, { method:'DELETE' });

  // Members
  API.listMembers = async () => fetchJson('/api/members');
  API.createMember = async (payload) => fetchJson('/api/members', { method:'POST', headers: JSON_HEADERS, body: JSON.stringify(payload) });
  API.deleteMember = async (id) => fetchJson(`/api/members/${id}`, { method:'DELETE' });

  // Deposits
  API.listDeposits = async () => fetchJson('/api/deposits');
  API.createDeposit = async (payload) => fetchJson('/api/deposits', { method:'POST', headers: JSON_HEADERS, body: JSON.stringify(payload) });
  API.setDepositStatus = async (id, status) => fetchJson(`/api/deposits/${id}/status`, { method:'POST', headers: JSON_HEADERS, body: JSON.stringify({status}) });

  // Withdrawals
  API.listWithdrawals = async () => fetchJson('/api/withdrawals');
  API.createWithdrawal = async (payload) => fetchJson('/api/withdrawals', { method:'POST', headers: JSON_HEADERS, body: JSON.stringify(payload) });
  API.setWithdrawalStatus = async (id, status) => fetchJson(`/api/withdrawals/${id}/status`, { method:'POST', headers: JSON_HEADERS, body: JSON.stringify({status}) });

  // Orders
  API.listOrders = async () => fetchJson('/api/orders');
  API.createOrder = async (payload)=> fetchJson('/api/orders', { method:'POST', headers: JSON_HEADERS, body: JSON.stringify(payload) });

  // Bot
  API.botStatus = async ()=> fetchJson('/api/bot/status');
  API.botStart = async ()=> fetchJson('/api/bot/start', { method:'POST' });
  API.botStop = async ()=> fetchJson('/api/bot/stop', { method:'POST' });

  // Settings & Backup
  API.getSettings = async ()=> fetchJson('/api/settings');
  API.saveSettings = async (s)=> fetchJson('/api/settings', { method:'POST', headers: JSON_HEADERS, body: JSON.stringify(s) });
  API.backupNow = async ()=> fetchJson('/api/backup', { method:'POST' });

  // Passwords / 2FA
  API.changeLoginPassword = async (oldP,newP) => fetchJson('/api/change-login-password', { method:'POST', headers: JSON_HEADERS, body: JSON.stringify({oldPassword:oldP,newPassword:newP}) });
  API.sendResetEmail = async (email) => fetchJson('/api/send-reset-email', { method:'POST', headers: JSON_HEADERS, body: JSON.stringify({email}) });

  // ---------- rendering helpers ----------
  function renderTable(containerId, columns, rows, options = {}) {
    const container = el(containerId);
    if(!container){ console.warn('renderTable no container', containerId); return; }
    // clear
    container.innerHTML = '';
    const table = document.createElement('table');
    table.style = 'width:100%;border-collapse:collapse;';
    // header
    const thead = document.createElement('thead');
    const htr = document.createElement('tr');
    columns.forEach(c => {
      const th = document.createElement('th');
      th.innerText = c.label || c.key;
      th.style = 'text-align:left;padding:8px;border-bottom:1px solid rgba(0,0,0,.08);';
      htr.appendChild(th);
    });
    thead.appendChild(htr);
    table.appendChild(thead);
    // body
    const tbody = document.createElement('tbody');
    rows.forEach(row => {
      const tr = document.createElement('tr');
      columns.forEach(col => {
        const td = document.createElement('td');
        td.style = 'padding:8px;border-bottom:1px solid rgba(0,0,0,.03);';
        let v = row[col.key];
        if (col.render) {
          td.appendChild(col.render(row));
        } else {
          td.innerText = v === undefined || v === null ? '' : String(v);
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.appendChild(table);
  }

  function makeButton(text, onClick, small=false){
    const b = document.createElement('button');
    b.innerText = text;
    b.className = 'nexbit-btn';
    b.style = 'margin-right:6px;padding:6px 10px;border-radius:6px;border:0;background:#0aa;color:#fff;cursor:pointer';
    if(small) b.style.padding='4px 8px';
    b.addEventListener('click', onClick);
    return b;
  }

  // ---------- UI-specific actions ----------
  async function loadWelcome(){
    try{
      const me = await API.me();
      if(me && me.success){
        const w = el('welcome-user');
        if(w) w.innerText = '欢迎, ' + me.user.username;
      } else {
        // redirect to login if not authenticated (optional)
        // location.href = '/login.html';
      }
    }catch(e){ console.warn('loadWelcome error', e); }
  }

  // Admin List render
  async function loadAdmins(){
    try{
      const r = await API.listAdmins();
      if(!r || !r.success) return toast('加载管理员失败', 'error');
      const cols = [
        { key:'id', label:'ID' },
        { key:'username', label:'用户名' },
        { key:'role', label:'角色' },
        { key:'email', label:'邮箱' },
        { key:'is_super', label:'超级' },
        { key:'created_at', label:'创建时间' },
        { key:'actions', label:'操作', render: (row) => {
          const wrap = document.createElement('div');
          const del = makeButton('删除', async ()=>{
            if (!await confirmAsync('确定删除管理员 '+row.username+' ?')) return;
            try{ await API.deleteAdmin(row.id); toast('已删除'); loadAdmins(); } catch(e){ toast('删除失败: '+(e.message||e),'error'); }
          }, true);
          wrap.appendChild(del);
          return wrap;
        }}
      ];
      // flatten data to ensure keys exist
      const rows = r.users.map(u=>({
        id:u.id, username:u.username, role:u.role, email:u.email||'', is_super:u.is_super?1:0, created_at:u.created_at||''
      }));
      renderTable('admin-list', cols, rows);
    }catch(e){ toast('加载管理员异常: '+(e.message||e),'error'); }
  }

  // Members
  async function loadMembers(){
    try{
      const r = await API.listMembers();
      if(!r || !r.success) return toast('加载会员失败','error');
      const cols = [
        { key:'id', label:'ID' },
        { key:'name', label:'姓名' },
        { key:'email', label:'邮箱' },
        { key:'balance', label:'余额' },
        { key:'created_at', label:'创建时间' },
        { key:'actions', label:'操作', render:(row)=>{
            const d = document.createElement('div');
            const del = makeButton('删除', async ()=>{ if(await confirmAsync('删除会员?')){ await API.deleteMember(row.id); loadMembers(); } }, true);
            d.appendChild(del);
            return d;
        } }
      ];
      renderTable('members-list', cols, r.members || []);
    }catch(e){ toast('加载会员失败: '+e.message,'error'); }
  }

  // Deposits
  async function loadDeposits(){
    try{
      const r = await API.listDeposits();
      if(!r || !r.success) return toast('加载充值失败','error');
      const cols = [
        { key:'id', label:'ID' },
        { key:'member_name', label:'会员' },
        { key:'amount', label:'金额' },
        { key:'status', label:'状态' },
        { key:'created_at', label:'时间' },
        { key:'actions', label:'操作', render:(row)=>{
            const d = document.createElement('div');
            const ok = makeButton('通过', async ()=>{ await API.setDepositStatus(row.id,'approved'); toast('已通过'); loadDeposits(); }, true);
            const rej = makeButton('拒绝', async ()=>{ await API.setDepositStatus(row.id,'rejected'); toast('已拒绝'); loadDeposits(); }, true);
            d.appendChild(ok); d.appendChild(rej); return d;
        } }
      ];
      renderTable('deposits-list', cols, r.deposits || []);
    }catch(e){ toast('加载充值异常: '+e.message,'error'); }
  }

  // Withdrawals
  async function loadWithdrawals(){
    try{
      const r = await API.listWithdrawals();
      if(!r || !r.success) return toast('加载提现失败','error');
      const cols = [
        { key:'id', label:'ID' },
        { key:'member_name', label:'会员' },
        { key:'amount', label:'金额' },
        { key:'status', label:'状态' },
        { key:'created_at', label:'时间' },
        { key:'actions', label:'操作', render:(row)=>{
          const d = document.createElement('div');
          const ok = makeButton('通过', async ()=>{ await API.setWithdrawalStatus(row.id,'approved'); toast('已通过'); loadWithdrawals(); }, true);
          const rej = makeButton('拒绝', async ()=>{ await API.setWithdrawalStatus(row.id,'rejected'); toast('已拒绝'); loadWithdrawals(); }, true);
          d.appendChild(ok); d.appendChild(rej); return d;
        } }
      ];
      renderTable('withdrawals-list', cols, r.withdrawals || []);
    }catch(e){ toast('加载提现异常: '+e.message,'error'); }
  }

  // Orders
  async function loadOrders(){
    try{
      const r = await API.listOrders();
      if(!r || !r.success) return toast('加载订单失败','error');
      const cols = [
        { key:'id', label:'ID' },
        { key:'user', label:'用户' },
        { key:'amount', label:'金额' },
        { key:'status', label:'状态' },
        { key:'created_at', label:'时间' }
      ];
      renderTable('orders-list', cols, r.orders || []);
    }catch(e){ toast('加载订单异常: '+e.message,'error'); }
  }

  // Bot status & control
  async function loadBotStatus(){
    try{
      const r = await API.botStatus();
      if(!r || !r.success) return;
      const s = r.bot;
      const elStatus = el('bot-status');
      if(elStatus) elStatus.innerText = s.running ? '运行中' : '已停止';
      const last = el('bot-last-action');
      if(last) last.innerText = s.last_action || '';
    }catch(e){ console.warn('bot status error', e); }
  }

  // Settings load/save
  async function loadSettingsToUI(){
    try{
      const r = await API.getSettings();
      if(!r || !r.success) return;
      const s = r.settings || {};
      // Example: if you have <input id="site-title" />
      if(el('site-title')) el('site-title').value = s.siteTitle || '';
      // extend as needed
    }catch(e){ console.warn('loadSettingsToUI error', e); }
  }
  async function saveSettingsFromUI(){
    try{
      const payload = {};
      if(el('site-title')) payload.siteTitle = el('site-title').value;
      await API.saveSettings(payload);
      toast('保存成功','success');
    }catch(e){ toast('保存失败: '+(e.message||e),'error'); }
  }

  // Change login password
  async function changeLoginPassword(oldP, newP){
    try{
      const r = await API.changeLoginPassword(oldP,newP);
      if(r && r.success) toast('登录密码已修改','success');
      else toast('修改失败: '+(r.message||''),'error');
    }catch(e){ toast('修改失败: '+(e.message||e),'error'); }
  }

  // 2FA placeholders
  async function setup2FA(){
    toast('开始 2FA 流程（占位）');
    // front-side example: show QR or token prompt
    // real implementation should call API endpoints for 2FA setup
    // e.g. const r = await fetch('/api/2fa/setup') ...
  }
  async function enable2FA(token){
    toast('启用 2FA（占位）');
  }
  async function disable2FA(token){
    toast('禁用 2FA（占位）');
  }

  // Backup now
  async function backupNow(){
    try{
      const r = await API.backupNow();
      if(r && r.success) toast('备份完成: '+(r.file||''));
      else toast('备份失败','error');
    }catch(e){ toast('备份错误: '+(e.message||e),'error'); }
  }

  // Logout
  async function doLogout(){
    try{
      await API.logout();
      // clear UI state
      window.location.href = '/login.html';
    }catch(e){ toast('登出失败: '+(e.message||e),'error'); }
  }

  // Auto bind buttons by conventional IDs (if present)
  function autoBindUI(){
    // login form id=loginForm with username/password named inputs
    const loginForm = el('loginForm');
    if(loginForm){
      loginForm.addEventListener('submit', async (e)=>{
        e.preventDefault();
        const u = loginForm.querySelector('input[name="username"]').value;
        const p = loginForm.querySelector('input[name="password"]').value;
        try{
          const r = await API.login(u,p);
          if(r && r.success) { toast('登录成功','success'); location.href = '/index.html'; }
          else toast('登录失败: '+(r.message||''),'error');
        }catch(err){ toast('登录异常: '+(err.message||err),'error'); }
      });
    }

    // Admin list button -> id=btn-admin-list; container id=admin-list
    const bAdmin = el('btn-admin-list');
    if(bAdmin) bAdmin.addEventListener('click', loadAdmins);
    // Members
    const bMembers = el('btn-members-list'); if(bMembers) bMembers.addEventListener('click', loadMembers);
    const bDeposits = el('btn-deposits-list'); if(bDeposits) bDeposits.addEventListener('click', loadDeposits);
    const bWithdrawals = el('btn-withdrawals-list'); if(bWithdrawals) bWithdrawals.addEventListener('click', loadWithdrawals);
    const bOrders = el('btn-orders-list'); if(bOrders) bOrders.addEventListener('click', loadOrders);

    // Bot
    const bBotStart = el('btn-bot-start'); if(bBotStart) bBotStart.addEventListener('click', async ()=>{ await API.botStart(); loadBotStatus(); toast('Bot started'); });
    const bBotStop = el('btn-bot-stop'); if(bBotStop) bBotStop.addEventListener('click', async ()=>{ await API.botStop(); loadBotStatus(); toast('Bot stopped'); });
    const bBackup = el('btn-backup-now'); if(bBackup) bBackup.addEventListener('click', backupNow);

    // change password form: id=changePwdForm with inputs oldPassword/newPassword/confirmPassword
    const changePwdForm = el('changePwdForm');
    if(changePwdForm){
      changePwdForm.addEventListener('submit', async (e)=>{
        e.preventDefault();
        const oldP = changePwdForm.querySelector('input[name=oldPassword]').value;
        const newP = changePwdForm.querySelector('input[name=newPassword]').value;
        const c = changePwdForm.querySelector('input[name=confirmPassword]').value;
        if(newP !== c){ toast('确认密码不一致','error'); return; }
        await changeLoginPassword(oldP,newP);
      });
    }

    // logout buttons
    qAll('.btn-logout').forEach(b=>b.addEventListener('click', doLogout));

    // if index has welcome-user, load me
    if(el('welcome-user')) loadWelcome();

    // if admin list container present, load immediately
    if(el('admin-list')) loadAdmins();
    if(el('members-list')) loadMembers();
    if(el('deposits-list')) loadDeposits();
    if(el('withdrawals-list')) loadWithdrawals();
    if(el('orders-list')) loadOrders();
    if(el('bot-status')) loadBotStatus();
    if(el('site-title')) loadSettingsToUI();
  }

  // Expose small helper for manual use
  window.Nexbit = {
    API,
    loadAdmins,
    loadMembers,
    loadDeposits,
    loadWithdrawals,
    loadOrders,
    loadBotStatus,
    backupNow,
    changeLoginPassword,
    setup2FA,
    enable2FA,
    disable2FA,
    toast
  };

  // DOM ready
  document.addEventListener('DOMContentLoaded', autoBindUI);

})();
