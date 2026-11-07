// 指標、進場條件、止損止盈回測、跨幣合併驗證、倉位計算。瀏覽器與 Node 共用。
// node strategy.js        → 自我檢查
// node strategy.js 1d     → 用真實 K 線跑一次合併驗證並印出各幣狀態
// 規則怎麼來的：research.js（止損止盈網格）與 research2.js（同一規則在 10 個幣上合併驗證）

const FEE = 0.001;    // 單邊手續費
const SLIP = 0.0005;  // 單邊滑價
const COST = 2 * (FEE + SLIP);
// 放空用 Binance 合約的真實資金費率；合約上市前（或該幣沒有合約）改用每 8 小時扣 0.01% 的保守假設
const FUND = 0.0001;
const H8 = 288e5;     // 8 小時（毫秒），資金費率結算週期
const WARMUP = 200;   // 200 均線需要的暖機根數
const MAX_HOLD = 20;  // 止損止盈都沒碰到時，最多持有幾根 K 線
const MAX_K = 3;      // research 腳本最多組合幾個條件
// 研究選出的規則：做多版是主策略，放空版是鏡像對照組。止損 3 ATR，止盈＝止損 × 盈虧比
// 盈虧比預設 2、最低 1.5（research4.js：設 2 倍時實際盈虧比約 1.5，設 1.5 倍實際只有約 1.3）
const MIN_RR = 1.5, DEFAULT_RR = 2;
const RULE = { ids: [0, 2, 3], ex: { sl: 3, tp: 3 * DEFAULT_RR } };
const exitFor = rr => ({ sl: RULE.ex.sl, tp: RULE.ex.sl * Math.max(MIN_RR, +rr || DEFAULT_RR) });
// 合併驗證固定用這 10 個幣，結果不隨使用者清單改變
const BASKET = ['BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'DOGE', 'ADA', 'AVAX', 'LINK', 'TRX'];
const TF = {
  '1d': { label: '日線', pages: 4, ms: 864e5 },
  '4h': { label: '4 小時', pages: 10, ms: 144e5 },
  '1h': { label: '1 小時', pages: 15, ms: 36e5 },
  '15m': { label: '15 分鐘', pages: 70, ms: 9e5 }, // 約 2 年，滾動驗證至少要跨一個年度
};

function sma(a, n) {
  const out = Array(a.length).fill(null);
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i];
    if (i >= n) sum -= a[i - n];
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

function ema(a, n) {
  const k = 2 / (n + 1), out = [a[0]];
  for (let i = 1; i < a.length; i++) out.push(a[i] * k + out[i - 1] * (1 - k));
  return out;
}

function rsi(c, n) { // Wilder
  const out = Array(c.length).fill(null);
  let g = 0, l = 0;
  for (let i = 1; i < c.length; i++) {
    const d = c[i] - c[i - 1], up = Math.max(d, 0), dn = Math.max(-d, 0);
    if (i <= n) { g += up / n; l += dn / n; }
    else { g = (g * (n - 1) + up) / n; l = (l * (n - 1) + dn) / n; }
    if (i >= n) out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  }
  return out;
}

// 前 n 根（不含當根）的極值，避免偷看當根
function prior(a, n, fn) {
  return a.map((_, i) => (i < n ? null : fn(...a.slice(i - n, i))));
}

function indicators(b) {
  const c = b.map(x => x.c), h = b.map(x => x.h), l = b.map(x => x.l);
  const sma20 = sma(c, 20);
  const sd20 = c.map((_, i) => i < 19 ? null
    : Math.sqrt(c.slice(i - 19, i + 1).reduce((s, v) => s + (v - sma20[i]) ** 2, 0) / 20));
  const e12 = ema(c, 12), e26 = ema(c, 26);
  const macd = c.map((_, i) => e12[i] - e26[i]);
  const tr = b.map((v, i) => i ? Math.max(v.h - v.l, Math.abs(v.h - c[i - 1]), Math.abs(v.l - c[i - 1])) : v.h - v.l);
  return {
    c, sma20, sma50: sma(c, 50), sma200: sma(c, 200), sd20,
    rsi2: rsi(c, 2), rsi14: rsi(c, 14), macd, sig: ema(macd, 9), atr: sma(tr, 14),
    hh20: prior(h, 20, Math.max), ll20: prior(l, 20, Math.min),
  };
}

// 每個條件都有做多版與放空版（d = 1 做多、-1 放空），只看第 i 根收盤後已知的資料
const CONDS = [
  { long: '站上 200 均線', short: '跌破 200 均線', f: (x, i, d) => d * (x.c[i] - x.sma200[i]) > 0 },
  { long: '均線多頭排列', short: '均線空頭排列',
    f: (x, i, d) => d * (x.sma50[i] - x.sma200[i]) > 0 && d * (x.c[i] - x.sma50[i]) > 0 },
  { long: 'MACD 在訊號線上', short: 'MACD 在訊號線下', f: (x, i, d) => d * (x.macd[i] - x.sig[i]) > 0 },
  { long: '突破前 20 根高點', short: '跌破前 20 根低點', f: (x, i, d) => d > 0 ? x.c[i] > x.hh20[i] : x.c[i] < x.ll20[i] },
  { long: 'RSI(2) 低於 10', short: 'RSI(2) 高於 90', f: (x, i, d) => d > 0 ? x.rsi2[i] < 10 : x.rsi2[i] > 90 },
  { long: 'RSI(14) 低於 30', short: 'RSI(14) 高於 70', f: (x, i, d) => d > 0 ? x.rsi14[i] < 30 : x.rsi14[i] > 70 },
  { long: '跌破布林下軌', short: '突破布林上軌', f: (x, i, d) => d * (x.c[i] - (x.sma20[i] - d * 2 * x.sd20[i])) < 0 },
];

const condOn = (x, n, dir) => CONDS.map(c => Array.from({ length: n }, (_, i) => i >= WARMUP - 1 && c.f(x, i, dir)));
const ruleName = (ids, dir) => ids.map(j => dir > 0 ? CONDS[j].long : CONDS[j].short).join(' ＋ ');

// ids 裡的條件同時成立；訊號＝「剛成立」的那一根
function makeCand(on, ids, dir) {
  const all = on[0].map((_, i) => ids.every(j => on[j][i]));
  return { dir, k: ids.length, name: ruleName(ids, dir), sig: all.map((v, i) => v && !all[i - 1]) };
}

// research 用：7 個條件任選 1～MAX_K 個（7＋21＋35＝63 種），做多放空各一份
function candidates(x, n) {
  const out = [];
  for (const dir of [1, -1]) {
    const on = condOn(x, n, dir);
    for (let m = 1; m < 1 << CONDS.length; m++) {
      const ids = CONDS.map((_, j) => j).filter(j => m >> j & 1);
      if (ids.length <= MAX_K) out.push(makeCand(on, ids, dir));
    }
  }
  return out;
}

// ev＝依時間排序的 [{t, r}]；回傳函式算空單在 [t0, t1) 期間的資金費收入（正＝空方收錢）
function fundingFn(ev) {
  const pre = [0];
  for (const e of ev) pre.push(pre.at(-1) + e.r);
  const first = ev.length ? ev[0].t : Infinity;
  const idx = t => { let lo = 0, hi = ev.length; while (lo < hi) { const m = lo + hi >> 1; if (ev[m].t < t) lo = m + 1; else hi = m; } return lo; };
  return (t0, t1) => pre[idx(t1)] - pre[idx(t0)] - FUND * Math.max(0, Math.min(t1, first) - t0) / H8;
}
const NO_FUNDING = fundingFn([]);

// 第 i 根收盤出訊號 → 第 i+1 根開盤進場，止損止盈用訊號當根的 ATR 算
// state: enter（最新一根剛出訊號，pos 是建議的進場／止損／止盈）/ hold / wait
// shortcut: 盤中碰到止損止盈時，資金費率算到該根收盤（最多多算一根 K 線），要更精確需用更小週期資料
function backtest(b, x, cand, ex, fund = NO_FUNDING) {
  const trades = [], last = b.length - 1, d = cand.dir, barMs = b[1].t - b[0].t;
  const open = (i, px) => ({ in: i + 1, px, stop: px - d * ex.sl * x.atr[i], target: px + d * ex.tp * x.atr[i] });
  let p = null, state = 'wait';
  for (let i = WARMUP; i <= last; i++) {
    if (p) {
      const hitStop = d > 0 ? b[i].l <= p.stop : b[i].h >= p.stop;
      const hitTarget = d > 0 ? b[i].h >= p.target : b[i].l <= p.target;
      // 同一根同時碰到兩邊時當作先止損（保守）；跳空開在止損外就用開盤價成交
      const out = hitStop ? (d > 0 ? Math.min(b[i].o, p.stop) : Math.max(b[i].o, p.stop))
        : hitTarget ? p.target
        : i - p.in + 1 >= MAX_HOLD ? b[i].c : null;
      if (out !== null) {
        const f = d < 0 ? fund(b[p.in].t, b[i].t + barMs) : 0;
        trades.push({ in: p.in, out: i, t: b[p.in].t, T: b[i].t + barMs, ret: d * (out / p.px - 1) - COST + f,
          why: hitStop ? 'stop' : hitTarget ? 'target' : 'time', px: p.px, stop: p.stop, target: p.target, exit: out });
        p = null;
      }
    }
    if (!p && cand.sig[i]) {
      if (i === last) { state = 'enter'; p = open(i, b[i].c); }
      else p = open(i, b[i + 1].o);
    }
  }
  if (p && state !== 'enter') state = 'hold';
  return { trades, state, pos: p };
}

// payoff＝實際盈虧比（平均獲利 ÷ 平均虧損）；be＝在這個盈虧比下不賺不賠所需的勝率
function stats(tr) {
  const r = tr.map(t => t.ret), n = r.length;
  const avg = n ? r.reduce((s, v) => s + v, 0) / n : 0;
  const sd = n > 1 ? Math.sqrt(r.reduce((s, v) => s + (v - avg) ** 2, 0) / (n - 1)) : 0;
  const w = r.filter(v => v > 0), l = r.filter(v => v <= 0);
  const aw = w.length ? w.reduce((s, v) => s + v, 0) / w.length : 0;
  const al = l.length ? -l.reduce((s, v) => s + v, 0) / l.length : 0;
  const payoff = al ? aw / al : Infinity;
  return {
    n, avg, payoff, be: 1 / (1 + payoff),
    win: n ? w.length / n : 0,
    t: sd ? avg / sd * Math.sqrt(n) : 0, // t 值：平均報酬相對於波動有多穩，約 2 以上才不太像運氣
    worst: n ? Math.min(...r) : 0,
  };
}

// 一個幣、一個方向跑主規則
function runRule(bars, dir, fund, ex = RULE.ex) {
  const x = indicators(bars);
  const cand = makeCand(condOn(x, bars.length, dir), RULE.ids, dir);
  const r = backtest(bars, x, cand, ex, fund);
  return { dir, name: cand.name, ...r, own: stats(r.trades) };
}

const yearOf = t => new Date(t).getUTCFullYear();

// 滾動式驗證（多個幣同方向合併）：每年 1/1 只看當時已結束的交易，
// 合併至少 50 筆、平均為正、t≥2 才「允許」當年交易；只有允許年份的交易算進滾動成績。
// 現在要給訊號：用到目前為止的全部交易也要允許，且滾動成績要賺（至少 30 筆、t≥1）
function walkForward(runs) {
  const all = runs.flatMap(r => r.trades);
  const gate = cut => { const s = stats(all.filter(t => t.T <= cut)); return s.n >= 50 && s.avg > 0 && s.t >= 2; };
  const years = [...new Set(all.map(t => yearOf(t.t)))].sort();
  const rows = years.map(y => ({ y, on: gate(Date.UTC(y, 0, 1)), st: stats(all.filter(t => yearOf(t.t) === y)) }));
  const on = new Set(rows.filter(r => r.on).map(r => r.y));
  const wf = stats(all.filter(t => on.has(yearOf(t.t))));
  return { rows, wf, total: stats(all), recent: stats(all.filter(t => t.t >= Date.now() - 365 * 864e5)),
    pass: gate(Infinity) && wf.n >= 30 && wf.avg > 0 && wf.t >= 1 };
}

// 規則通過合併驗證後，個別幣自己的歷史也不能是虧的
const coinOk = own => own.n < 10 || own.avg > 0;

// 固定風險倉位：打到止損時剛好虧本金的 riskPct
function sizing(capital, riskPct, entry, stop) {
  const qty = capital * riskPct / Math.abs(entry - stop);
  return { qty, value: qty * entry, loss: capital * riskPct, lev: qty * entry / capital };
}

// 訊號出現後價格又動了多少：stop / target（已碰到，作廢）、late（已走完一半止盈距離，不追）、ok
function freshness(pos, d, live) {
  if (d * (live - pos.stop) <= 0) return 'stop';
  if (d * (live - pos.target) >= 0) return 'target';
  return d * (live - pos.px) / Math.abs(pos.target - pos.px) > 0.5 ? 'late' : 'ok';
}

const API = 'https://data-api.binance.vision/api/v3';

async function klines(symbol, tf, q) {
  // 代號不存在時 Binance 回的錯誤沒有 CORS 標頭，瀏覽器只會丟出網路錯誤
  const res = await fetch(`${API}/klines?symbol=${symbol}&interval=${tf}&limit=1000${q}`).catch(() => null);
  if (!res || !res.ok) throw new Error(`${symbol}：取不到資料，請確認代號是否正確（Binance 現貨、以 USDT 計價）或網路是否正常`);
  return (await res.json()).map(v => ({ t: v[0], o: +v[1], h: +v[2], l: +v[3], c: +v[4], v: +v[5], tb: +v[9], T: v[6] }));
}

// 已收盤的 K 線記在記憶體裡；之後只補抓最後一根之後的（自動更新時不必重抓整段歷史）
const barCache = {};
async function fetchBars(symbol, tf = '1d', pages = TF[tf].pages) {
  const key = `${symbol}|${tf}`, old = barCache[key];
  let bars;
  const fresh = old && await klines(symbol, tf, `&startTime=${old.at(-1).t + 1}`);
  if (fresh && fresh.length < 1000) bars = old.concat(fresh);
  else {
    bars = [];
    let end;
    for (let p = 0; p < pages; p++) {
      const k = await klines(symbol, tf, end ? `&endTime=${end}` : '');
      if (!k.length) break;
      bars = k.concat(bars);
      if (k.length < 1000) break;
      end = k[0].t - 1;
    }
  }
  if (bars.length && bars.at(-1).T > Date.now()) bars.pop(); // 丟掉還沒收盤的 K 線
  if (bars.length) barCache[key] = bars;
  return bars;
}

// 資金費率歷史（每 8 小時一筆），記在記憶體裡，之後只補抓新的；沒有合約時回傳空陣列
const fundCache = {};
async function fetchFunding(symbol) {
  const ev = fundCache[symbol] ||= [];
  for (let p = 0; p < 20; p++) {
    const start = ev.length ? ev.at(-1).t + 1 : 1;
    const res = await fetch(`https://fapi.binance.com/fapi/v1/fundingRate?symbol=${symbol}&limit=1000&startTime=${start}`).catch(() => null);
    if (!res || !res.ok) break;
    const k = await res.json();
    if (!Array.isArray(k)) break;
    ev.push(...k.map(v => ({ t: v.fundingTime, r: +v.fundingRate })));
    if (k.length < 1000) break;
  }
  return ev;
}

// 最多 n 個請求同時進行，避免一次打太多被交易所限流
async function pool(list, n, fn) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < list.length) { const k = i++; out[k] = await fn(list[k]); } }));
  return out;
}

// 成交量前 n 名：排除穩定幣、黃金與槓桿代幣，並要求至少 18 個月歷史（新上市的股票代幣等資料不夠回測）
const NOT_COIN = /^(USDC|FDUSD|TUSD|USDP|DAI|BUSD|EUR|EURI|AEUR|TRY|BRL|USD1|USDE|USDS|PYUSD|RLUSD|RWUSD|BFUSD|XUSD|U|PAXG|XAUT|WBTC|WBETH|BETH)$/;
async function topCoins(n = 30, allow = null) { // allow：只留這個集合裡的幣（例如某交易所買得到的）
  const res = await fetch(`${API}/ticker/24hr`).catch(() => null);
  if (!res || !res.ok) throw new Error('取不到成交量排行');
  const ranked = (await res.json()).filter(t => t.symbol.endsWith('USDT'))
    .map(t => ({ b: t.symbol.slice(0, -4), v: +t.quoteVolume }))
    .filter(t => /^[A-Z0-9]{1,15}$/.test(t.b) && !NOT_COIN.test(t.b) && !/(UP|DOWN|BULL|BEAR)$/.test(t.b) && (!allow || allow.has(t.b)))
    .sort((a, b) => b.v - a.v).slice(0, n + 60);
  const months = await pool(ranked, 8, t => fetch(`${API}/klines?symbol=${t.b}USDT&interval=1M&limit=18`).then(r => r.ok ? r.json() : []).catch(() => []));
  return ranked.filter((t, i) => months[i].length >= 18).slice(0, n).map(t => t.b);
}

// Ourbit 買得到的幣（USDT 計價）。Ourbit 的 API 不允許網頁直接讀，所以網頁讀倉庫裡每週更新的 ourbit.json；Node 直接讀 API
async function ourbitCoins() {
  if (typeof window === 'undefined') {
    const info = await (await fetch('https://api.ourbit.com/api/v3/exchangeInfo')).json();
    return new Set(info.symbols.filter(s => s.quoteAsset === 'USDT' && s.status === 'ENABLED').map(s => s.baseAsset));
  }
  const res = await fetch('ourbit.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error('取不到 Ourbit 幣種清單');
  return new Set((await res.json()).coins);
}

// 全部交易對的即時價，一次請求；回傳 { BTC: 76000, ... }（只取 USDT 計價）
async function allPrices() {
  const res = await fetch(`${API}/ticker/price`);
  if (!res.ok) throw new Error('取不到即時價');
  return Object.fromEntries((await res.json()).filter(t => t.symbol.endsWith('USDT')).map(t => [t.symbol.slice(0, -4), +t.price]));
}

async function livePrice(symbol) {
  const res = await fetch(`${API}/ticker/price?symbol=${symbol}`);
  if (!res.ok) throw new Error(`${symbol}：取不到即時價`);
  return +(await res.json()).price;
}

if (typeof module !== 'undefined') {
  module.exports = { sma, ema, rsi, indicators, candidates, makeCand, backtest, stats, runRule, walkForward, sizing, freshness, coinOk, exitFor,
    fetchBars, fundingFn, fetchFunding, allPrices, topCoins, ourbitCoins, pool, BASKET, TF, MAX_HOLD };

  if (require.main === module) (async () => {
    const assert = require('assert');
    const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, `${a} != ${b}`);
    assert.deepStrictEqual(sma([1, 2, 3, 4], 2), [null, 1.5, 2.5, 3.5]);
    assert.strictEqual(rsi([1, 2, 3, 4, 5], 2).at(-1), 100);
    assert.strictEqual(rsi([5, 4, 3, 2, 1], 2).at(-1), 0);
    assert.deepStrictEqual([1, 2, 3].map(k => candidates({}, 0).filter(c => c.dir > 0 && c.k === k).length), [7, 21, 35]);
    const on = [[1, 1, 0, 1], [0, 1, 1, 1]];
    assert.deepStrictEqual(makeCand(on, [0, 1], 1).sig, [false, true, false, true]); // 只在「剛同時成立」那根出訊號
    // 日線、平盤 100、ATR 固定 1、止損 2／止盈 2；第 200 根出訊號 → 第 201 根開盤 100 進場
    const flat = () => Array.from({ length: 230 }, (_, i) => ({ t: i * 864e5, o: 100, h: 100.5, l: 99.5, c: 100 }));
    const x = { atr: Array(230).fill(1) }, ex = { sl: 2, tp: 2 };
    const run = (b, dir, at = 200) => backtest(b, x, { dir, sig: b.map((_, i) => i === at) }, ex);
    const fund3d = FUND * 9; // 放空持有 3 天 = 9 次資金費率
    let b = flat(); b[203].h = 103;                       // 做多碰到止盈 102
    let r = run(b, 1); assert.deepStrictEqual([r.trades[0].in, r.trades[0].out], [201, 203]); near(r.trades[0].ret, 0.02 - COST);
    b = flat(); b[203].h = 103; b[203].l = 97;            // 同一根兩邊都碰 → 算止損 98
    near(run(b, 1).trades[0].ret, -0.02 - COST);
    b = flat(); b[203].o = 95; b[203].l = 94;             // 跳空跌破止損 → 開盤價 95 成交
    near(run(b, 1).trades[0].ret, -0.05 - COST);
    b = flat(); b[203].l = 97;                            // 放空碰到止盈 98，扣資金費率
    near(run(b, -1).trades[0].ret, 0.02 - COST - fund3d);
    b = flat(); b[203].h = 103;                           // 放空碰到止損 102
    near(run(b, -1).trades[0].ret, -0.02 - COST - fund3d);
    r = run(flat(), 1); assert.strictEqual(r.trades[0].out, 220); near(r.trades[0].ret, -COST); // 滿 20 根出場
    assert.strictEqual(r.trades[0].why, 'time');
    b = flat(); b[203].h = 103; assert.strictEqual(run(b, 1).trades[0].why, 'target');
    b = flat(); b[203].l = 97; assert.strictEqual(run(b, 1).trades[0].why, 'stop');
    r = run(flat(), 1, 229); assert.deepStrictEqual([r.state, r.pos.stop, r.pos.target], ['enter', 98, 102]);
    r = run(flat(), -1, 225); assert.deepStrictEqual([r.state, r.pos.stop, r.pos.target], ['hold', 102, 98]);
    const s = stats([{ ret: 0.1 }, { ret: 0.1 }, { ret: -0.05 }]);
    near(s.payoff, 2); near(s.be, 1 / 3); near(s.win, 2 / 3);
    const z = sizing(1000, 0.01, 100, 98);
    assert.deepStrictEqual([z.qty, z.value, z.loss, z.lev], [5, 500, 10, 0.5]);
    const L = { px: 100, stop: 98, target: 102 }, S = { px: 100, stop: 102, target: 98 };
    assert.deepStrictEqual([97.9, 102.1, 101.5, 100.5].map(v => freshness(L, 1, v)), ['stop', 'target', 'late', 'ok']);
    assert.deepStrictEqual([102, 97.5, 98.9, 101].map(v => freshness(S, -1, v)), ['stop', 'target', 'late', 'ok']);
    assert.deepStrictEqual([exitFor(2), exitFor(1.2), exitFor(''), exitFor(3)].map(e => e.tp / e.sl), [2, 1.5, 2, 3]);
    assert.deepStrictEqual([coinOk({ n: 5, avg: -1 }), coinOk({ n: 10, avg: -1 }), coinOk({ n: 10, avg: 0.01 })], [true, false, true]);
    // 資金費率：區間含頭不含尾；合約上市前每 8 小時扣 FUND
    const ff = fundingFn([{ t: 10 * H8, r: 0.001 }, { t: 11 * H8, r: -0.0005 }]);
    near(ff(10 * H8, 11 * H8), 0.001); near(ff(9 * H8, 12 * H8), 0.0005 - FUND); near(ff(0, 5 * H8), -5 * FUND);
    b = flat(); b[203].l = 97;                            // 放空持有第 201～203 天，期間收到 9 次 +0.02% 資金費
    const ev = Array.from({ length: 230 * 3 }, (_, k) => ({ t: k * H8, r: 0.0002 }));
    near(backtest(b, x, { dir: -1, sig: b.map((_, i) => i === 200) }, ex, fundingFn(ev)).trades[0].ret, 0.02 - COST + 9 * 0.0002);
    // 滾動式驗證：2020 年之前沒有交易 → 2020 不允許；2020 的 60 筆賺錢 → 2021 允許
    const tr = (y, k) => Array.from({ length: k }, (_, j) => ({ t: Date.UTC(y, 1, 1), T: Date.UTC(y, 2, 1), ret: j % 2 ? 0.02 : 0.001 }));
    const w = walkForward([{ trades: [...tr(2020, 60), ...tr(2021, 40)] }]);
    assert.deepStrictEqual([w.rows.map(r => r.on), w.wf.n, w.total.n, w.pass], [[false, true], 40, 100, true]);
    console.log('self-check ok');

    const tf = process.argv[2];
    if (!tf) return;
    const pct = v => (v * 100).toFixed(2) + '%';
    const data = await Promise.all(BASKET.map(async s => {
      const [bars, ev] = await Promise.all([fetchBars(s + 'USDT', tf), fetchFunding(s + 'USDT')]);
      return { s, bars, fund: fundingFn(ev) };
    }));
    const row = st => `${st.n} 筆 勝率 ${pct(st.win)} 盈虧比 ${st.payoff.toFixed(2)} 兩平勝率 ${pct(st.be)} 平均 ${pct(st.avg)} t ${st.t.toFixed(1)}`;
    for (const dir of [1, -1]) {
      const runs = data.map(({ s, bars, fund }) => ({ s, ...runRule(bars, dir, fund) })), w = walkForward(runs);
      console.log(`\n${TF[tf].label} ${dir > 0 ? '做多' : '放空'}：${runs[0].name}  ${w.pass ? '通過' : '未通過'}`);
      for (const r of w.rows) console.log(`  ${r.y} ${r.on ? '允許' : '不允許'}  ${row(r.st)}`);
      console.log(`  滾動合計 ${row(w.wf)}\n  全部歷史 ${row(w.total)}`);
      for (const r of runs) console.log(`  ${r.s.padEnd(5)} ${r.state.padEnd(5)} 本幣 ${row(r.own)}${coinOk(r.own) ? '' : '  ← 本幣虧損，跳過'}`);
    }
  })();
}
