// bot.js - Telegram helper (use env vars or database.json)
const TelegramBot = require('node-telegram-bot-api');

const BOT_TOKEN = process.env.ADMIN_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || '';
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || process.env.TELEGRAM_ADMIN_CHAT_ID || '';

let bot = null;
if (BOT_TOKEN && BOT_TOKEN.indexOf('PUT_') === -1) {
  // use polling=false so it only sends messages (no getUpdates conflict if you have multiple bots)
  bot = new TelegramBot(BOT_TOKEN, { polling: false });
  console.log('[bot] Telegram bot started');
} else {
  console.warn('[bot] Telegram bot token not set. Bot disabled.');
}

// helper functions
async function sendLoginNotify(username, ip) {
  if (!bot || !ADMIN_CHAT_ID) return;
  try {
    const msg = `🔐 管理员登录：${username}\nIP: ${ip || 'unknown'}\n时间: ${new Date().toLocaleString()}`;
    await bot.sendMessage(ADMIN_CHAT_ID, msg);
  } catch (e) { console.error('[bot] sendLoginNotify fail', e && e.message); }
}

async function sendDepositNotify(orderId, amount, currency, member) {
  if (!bot || !ADMIN_CHAT_ID) return;
  try {
    const msg = `💰 新充值订单\nID: ${orderId}\n会员: ${member||'unknown'}\n金额: ${amount} ${currency}\n时间: ${new Date().toLocaleString()}`;
    await bot.sendMessage(ADMIN_CHAT_ID, msg);
  } catch (e) { console.error('[bot] sendDepositNotify fail', e && e.message); }
}

async function sendWithdrawRequest(orderId, amount, currency, member) {
  if (!bot || !ADMIN_CHAT_ID) return;
  try {
    const msg = `🏧 新提款请求\nID: ${orderId}\n会员: ${member||'unknown'}\n金额: ${amount} ${currency}\n时间: ${new Date().toLocaleString()}`;
    await bot.sendMessage(ADMIN_CHAT_ID, msg);
  } catch (e) { console.error('[bot] sendWithdrawRequest fail', e && e.message); }
}

async function sendRiskAlert(text) {
  if (!bot || !ADMIN_CHAT_ID) return;
  try {
    await bot.sendMessage(ADMIN_CHAT_ID, `⚠️ 风控报警:\n${text}`);
  } catch (e) { console.error('[bot] sendRiskAlert fail', e && e.message); }
}

async function sendAdminAction(actor, action, details) {
  if (!bot || !ADMIN_CHAT_ID) return;
  try {
    const txt = `🛠 管理操作\n管理员: ${actor}\n操作: ${action}\n详情: ${details}\n时间: ${new Date().toLocaleString()}`;
    await bot.sendMessage(ADMIN_CHAT_ID, txt);
  } catch (e) { console.error('[bot] sendAdminAction fail', e && e.message); }
}

module.exports = {
  botInstance: bot,
  sendLoginNotify,
  sendDepositNotify,
  sendWithdrawRequest,
  sendRiskAlert,
  sendAdminAction
};
