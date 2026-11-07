// 雲端定時掃描，結果傳 Telegram。由 GitHub Actions 執行（.github/workflows/notify.yml）：
//   MODE=signals（每天日線收盤後）：新的進場訊號，以及今天收盤持有到期該出場的部位
//   MODE=exits（每小時）：持有中的部位碰到止損或止盈（同一筆只通知一次，記在 .state/alerted.json）
// 本機試跑：node scan.js（沒設定 TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID 時只印出訊息，不傳送）
// 其他環境變數：EXCHANGE（預設只看 Ourbit 有的幣；all＝不限）、SCAN（成交量前幾名，預設 100）、RR（盈虧比，預設 2）、TEST=true（沒有事件也傳一則摘要）
const fs = require('fs');
const S = require('./strategy.js');

const TF = '1d'; // 只有日線規則通過驗證
const MODE = process.env.MODE || 'signals';
const N = +(process.env.SCAN || 100);
const RR = +(process.env.RR || 2);
const TEST = process.env.TEST === 'true';
const PAGE = 'https://pagani951221-tech.github.io/crypto-signals/';
const STATE = '.state/alerted.json';
const pct = v => (v >= 0 ? '+' : '−') + Math.abs(v * 100).toFixed(1) + '%';
const price = v => v.toLocaleString('en-US', { maximumSignificantDigits: 6 });
const SIDE = d => d > 0 ? '做多' : '放空';
const FOOT = `\n\n頁面：${PAGE}\n歷史回測不保證未來獲利，這不是投資建議。`;

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

// 和網頁一樣：每個掃描的幣都抓完整歷史；資金費率只在出現放空訊號時才抓
async function load(sym, prices, ex) {
  try {
    const bars = await S.fetchBars(sym + 'USDT', TF);
    if (bars.length < 500) return null;
    return { sym, bars, ev: null, live: prices[sym] ?? bars.at(-1).c, runs: [1, -1].map(d => S.runRule(bars, d, S.fundingFn([]), ex)) };
  } catch { return null; }
}

// 今天這根還沒收盤的日 K（最高、最低）
async function today(sym) {
  const res = await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${sym}USDT&interval=1d&limit=1`);
  const [k] = await res.json();
  return { h: +k[2], l: +k[3] };
}

const posLine = (sym, d, p) => `${sym}　${SIDE(d)}部位（進場 ${price(p.px)}）`;
const entryT = (it, p) => p.in < it.bars.length ? it.bars[p.in].t : it.bars.at(-1).t + 864e5;

(async () => {
  const ex = S.exitFor(RR);
  const prices = await S.allPrices();
  let scan;
  try { scan = await S.topCoins(N, process.env.EXCHANGE === 'all' ? null : await S.ourbitCoins()); } catch { scan = S.BASKET.slice(); }
  const items = (await S.pool(scan, 8, s => load(s, prices, ex))).filter(Boolean);
  // 掃描到的所有幣一起驗證
  const val = { 1: S.walkForward(items.map(i => i.runs[0])), [-1]: S.walkForward(items.map(i => i.runs[1])) };
  // 和網頁的格子一致：規則通過、本幣歷史不虧、在掃描名單內
  const live = items.filter(it => scan.includes(it.sym)).flatMap(it => it.runs.filter(r => val[r.dir].pass && S.coinOk(r.own)).map(r => ({ it, r })));
  const weak = [1, -1].some(d => val[d].pass && val[d].recent.n >= 10 && val[d].recent.avg <= 0)
    ? '\n\n注意：規則最近 12 個月是虧的，近期效果轉弱。' : '';
  console.log(`模式 ${MODE}：掃描 ${items.length} 個幣；做多規則${val[1].pass ? '通過' : '未通過'}、放空規則${val[-1].pass ? '通過' : '未通過'}`);

  if (MODE === 'signals') {
    // 新的進場訊號：最新 K 線剛出訊號、價格還沒跑掉
    const sigs = [];
    for (const { it, r } of live) {
      if (r.state !== 'enter' || S.freshness(r.pos, r.dir, it.live) !== 'ok') continue;
      if (r.dir < 0 && !(it.ev ?? await S.fetchFunding(it.sym + 'USDT').catch(() => [])).length) continue; // 沒有合約不能放空
      sigs.push({ it, r });
    }
    // 持有到期：規則在剛收盤的這根 K 線以收盤價出場
    const due = live.filter(({ it, r }) => { const t = r.trades.at(-1); return t && t.out === it.bars.length - 1 && t.why === 'time'; });
    console.log(`新訊號 ${sigs.length} 個，持有到期 ${due.length} 個`);
    if (!sigs.length && !due.length && !TEST) return;
    const blocks = [
      ...sigs.map(({ it, r }) => [`${it.sym}　日線${SIDE(r.dir)}`,
        `參考進場 ${price(r.pos.px)}（即時 ${price(it.live)}）`,
        `止損 ${price(r.pos.stop)}（${pct(r.pos.stop / r.pos.px - 1)}）`,
        `止盈 ${price(r.pos.target)}（${pct(r.pos.target / r.pos.px - 1)}）`,
        `本幣歷史 ${r.own.n} 筆，勝率 ${(r.own.win * 100).toFixed(0)}%，平均每筆 ${pct(r.own.avg)}`].join('\n')),
      ...due.map(({ it, r }) => { const t = r.trades.at(-1); return `${posLine(it.sym, r.dir, t)}\n持有滿 ${S.MAX_HOLD} 根 K 線，規則以收盤價 ${price(t.exit)} 出場（${pct(r.dir * (t.exit / t.px - 1))}）。還沒出場的請現在出場。`; }),
    ];
    const head = TEST ? `測試訊息：通知正常。\n今天新的進場訊號 ${sigs.length} 個、持有到期 ${due.length} 個。` : '日線收盤：今天要處理的事';
    await send([head, ...blocks].join('\n\n') + (sigs.length ? weak + '\n\n建議倉位請在頁面填本金計算。' : '') + FOOT);
    return;
  }

  // MODE === 'exits'：持有中的部位碰到止損或止盈
  let alerted = {};
  try { alerted = JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch {}
  const events = [];
  // 1) 還在跑的部位（含今天剛進場的）：看今天這根日 K 的高低點
  const open = live.filter(({ r }) => r.pos && (r.state === 'hold' || r.state === 'enter'));
  for (const { it, r } of open) {
    const day = await today(it.sym).catch(() => null);
    if (!day) continue;
    const d = r.dir, p = r.pos;
    const hitStop = d > 0 ? day.l <= p.stop : day.h >= p.stop, hitTarget = d > 0 ? day.h >= p.target : day.l <= p.target;
    if (hitStop || hitTarget) events.push({ it, d, p, why: hitStop ? 'stop' : 'target', t: entryT(it, p) }); // 兩邊都碰到時當作先止損（和回測一致）
  }
  // 2) 剛收盤時才確認出場的（例如收盤前最後一小時才碰到）：最後一根已收盤 K 線以止損或止盈出場
  for (const { it, r } of live) {
    const t = r.trades.at(-1);
    if (t && t.out === it.bars.length - 1 && t.why !== 'time') events.push({ it, d: r.dir, p: t, why: t.why, t: t.t });
  }
  const fresh = events.filter(e => !alerted[`${e.it.sym}|${e.d}|${e.t}`]);
  console.log(`持有中 ${open.length} 個部位，碰到止損止盈 ${events.length} 個，其中新的 ${fresh.length} 個`);
  if (fresh.length || TEST) {
    const blocks = fresh.map(({ it, d, p, why }) => {
      const lvl = why === 'stop' ? p.stop : p.target;
      return `${posLine(it.sym, d, p)}\n已碰到${why === 'stop' ? '止損' : '止盈'} ${price(lvl)}（${pct(d * (lvl / p.px - 1))}），照規則出場。即時價 ${price(it.live)}。`;
    });
    const head = TEST
      ? `測試訊息：出場提醒正常。\n目前追蹤 ${open.length} 個持有中的部位${open.length ? `：${open.map(o => o.it.sym).join('、')}` : ''}；新的出場提醒 ${fresh.length} 個。`
      : '出場提醒';
    await send([head, ...blocks].join('\n\n') + FOOT);
  }
  // 記住已通知的，保留 60 天
  for (const e of fresh) alerted[`${e.it.sym}|${e.d}|${e.t}`] = Date.now();
  for (const k of Object.keys(alerted)) if (Date.now() - alerted[k] > 60 * 864e5) delete alerted[k];
  fs.mkdirSync('.state', { recursive: true });
  fs.writeFileSync(STATE, JSON.stringify(alerted));
})().catch(e => { console.error(e); process.exit(1); });
