// 雲端定時掃描：有新的進場訊號就傳 Telegram。由 GitHub Actions 每天日線收盤後執行（.github/workflows/notify.yml）。
// 本機試跑：node scan.js（沒設定 TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID 時只印出訊息，不傳送）
// 可調環境變數：TF（週期，預設 1d）、SCAN（成交量前幾名，預設 100）、RR（盈虧比，預設 2）、TEST=true（沒有訊號也傳一則測試訊息）
const S = require('./strategy.js');

const TF = process.env.TF || '1d';
const N = +(process.env.SCAN || 100);
const RR = +(process.env.RR || 2);
const PAGE = 'https://pagani951221-tech.github.io/crypto-signals/';
const pct = v => (v >= 0 ? '+' : '−') + Math.abs(v * 100).toFixed(1) + '%';
const price = v => v.toLocaleString('en-US', { maximumSignificantDigits: 6 });

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

// 和網頁一樣：驗證用的 10 個幣抓完整歷史與資金費率，其餘只抓最近 3000 根
async function load(sym, prices, ex) {
  const full = S.BASKET.includes(sym);
  try {
    const [bars, ev] = await Promise.all([S.fetchBars(sym + 'USDT', TF, full ? S.TF[TF].pages : Math.min(3, S.TF[TF].pages)),
      full ? S.fetchFunding(sym + 'USDT').catch(() => []) : null]);
    if (bars.length < 500) return null;
    const fund = S.fundingFn(ev || []);
    return { sym, ev, live: prices[sym] ?? bars.at(-1).c, runs: [1, -1].map(d => S.runRule(bars, d, fund, ex)) };
  } catch { return null; }
}

(async () => {
  const ex = S.exitFor(RR);
  const prices = await S.allPrices();
  let scan;
  try { scan = await S.topCoins(N); } catch { scan = S.BASKET.slice(); }
  const items = (await S.pool([...new Set([...S.BASKET, ...scan])], 8, s => load(s, prices, ex))).filter(Boolean);
  const basket = items.filter(i => S.BASKET.includes(i.sym));
  const val = { 1: S.walkForward(basket.map(i => i.runs[0])), [-1]: S.walkForward(basket.map(i => i.runs[1])) };

  // 只通知「最新 K 線剛出訊號、價格還沒跑掉、本幣歷史不虧」的幣，和網頁上綠色／紅色的格子一致
  const sigs = [];
  for (const it of items) {
    if (!scan.includes(it.sym)) continue;
    for (const r of it.runs) {
      if (!val[r.dir].pass || r.state !== 'enter' || !S.coinOk(r.own) || S.freshness(r.pos, r.dir, it.live) !== 'ok') continue;
      if (r.dir < 0 && !(it.ev ?? await S.fetchFunding(it.sym + 'USDT').catch(() => [])).length) continue; // 沒有合約不能放空
      sigs.push({ it, r });
    }
  }
  const label = S.TF[TF].label;
  console.log(`${label}：掃描 ${items.length} 個幣；做多規則${val[1].pass ? '通過' : '未通過'}、放空規則${val[-1].pass ? '通過' : '未通過'}；新訊號 ${sigs.length} 個`);

  const test = process.env.TEST === 'true';
  if (!sigs.length && !test) return;
  const blocks = sigs.map(({ it, r }) => {
    const p = r.pos, o = r.own;
    return [`${it.sym}　${label}${r.dir > 0 ? '做多' : '放空'}`,
      `參考進場 ${price(p.px)}（即時 ${price(it.live)}）`,
      `止損 ${price(p.stop)}（${pct(p.stop / p.px - 1)}）`,
      `止盈 ${price(p.target)}（${pct(p.target / p.px - 1)}）`,
      `本幣歷史 ${o.n} 筆，勝率 ${(o.win * 100).toFixed(0)}%，平均每筆 ${pct(o.avg)}`].join('\n');
  });
  const weak = [1, -1].some(d => val[d].pass && val[d].recent.n >= 10 && val[d].recent.avg <= 0)
    ? '\n\n注意：規則最近 12 個月是虧的，近期效果轉弱。' : '';
  const head = test
    ? `測試訊息：Telegram 通知設定成功。\n目前${label}有 ${sigs.length} 個新的進場訊號。`
    : `${label}新的進場訊號（${sigs.length} 個）`;
  await send([head, ...blocks].join('\n\n') + weak
    + `\n\n建議倉位請在頁面填本金計算：${PAGE}\n歷史回測不保證未來獲利，這不是投資建議。`);
})().catch(e => { console.error(e); process.exit(1); });
