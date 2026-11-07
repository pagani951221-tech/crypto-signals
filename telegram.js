// 傳 Telegram 訊息（scan.js、tw-scan.js 共用）。沒設定 TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID 時只印出訊息。
async function send(text) {
  const token = (process.env.TELEGRAM_BOT_TOKEN || '').trim(), chat = (process.env.TELEGRAM_CHAT_ID || '').trim(); // 複製時常多帶空白或換行
  if (!token || !chat) { console.log('（沒有設定 Telegram，只印出訊息）\n\n' + text); return; }
  const api = (m, body) => fetch(`https://api.telegram.org/bot${token}/${m}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}),
  });
  const res = await api('sendMessage', { chat_id: chat, text, disable_web_page_preview: true });
  if (res.ok) { console.log('已傳送 Telegram 通知'); return; }
  const why = await res.text();
  // 診斷：記錄是公開的，所以只印機器人帳號與「對不對得上」，不印聊天 ID
  const me = await api('getMe').then(r => r.json()).catch(() => ({}));
  const up = await api('getUpdates').then(r => r.json()).catch(() => ({}));
  const chats = [...new Set((up.result || []).map(u => String((u.message || u.my_chat_member || {}).chat?.id)).filter(x => x !== 'undefined'))];
  console.log(`診斷：金鑰對應的機器人是 @${me.result?.username ?? '（金鑰無效）'}；它最近收到 ${chats.length} 個聊天的訊息；`
    + `填的聊天 ID 是 ${/^-?\d+$/.test(chat) ? `${chat.length} 位數字` : '不是純數字'}，${chats.includes(chat) ? '和收到的訊息對得上' : '和收到的訊息對不上'}。`);
  throw new Error(`Telegram 傳送失敗：HTTP ${res.status} ${why}`);
}

module.exports = { send };
