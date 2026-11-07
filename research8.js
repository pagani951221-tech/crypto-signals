// 研究八：替台股找專用規則（上市＋上櫃全部普通股，只做多，台股成本約 0.785%）
// 幾類常見的股票策略、每類少量參數，避免挑到只是運氣好的組合：
//   趨勢突破（原規則、不同出場）、52 週新高＋放量、RSI(2) 超賣反彈、多頭拉回到布林下緣
// 每類都測「有／沒有大盤濾網」（加權指數在 200 均線上才進場）。
// 驗證：逐年滾動挑選——每年 1 月 1 日只用之前已結束的交易，挑 t 值最高的規則，記錄它當年的成績；
// 另外用 2016–2021 挑、2022 年起驗。進場當下近 20 天平均每天成交要 ≥ 1,000 萬元。
// 注意：只有現在還上市櫃的股票（下市的抓不到），做多的成績會偏高。
// 用法：node research8.js [本機快取.json]
const fs = require('fs');
const S = require('./strategy.js');
const { TW_COST, universeAll, bars } = require('./tw-data.js');

const MIN_LIQ = 1e7, WARM = 250;
const yearOf = t => new Date(t).getUTCFullYear();

async function load() {
  if (process.argv[2]) return JSON.parse(fs.readFileSync(process.argv[2])).map(s => ({ ...s, b: s.b.map(([t, o, h, l, c, val]) => ({ t, o, h, l, c, val })) }));
  const uni = await universeAll();
  return (await S.pool(uni, 6, async u => { try { const b = await bars(u.code, u.mkt); return b.length >= 500 ? { ...u, b } : null; } catch { return null; } })).filter(Boolean);
}
async function taiex() {
  const r = (await (await fetch('https://query1.finance.yahoo.com/v8/finance/chart/%5ETWII?range=10y&interval=1d', { headers: { 'User-Agent': 'Mozilla/5.0' } })).json()).chart.result[0];
  const day = t => new Date(t + 8 * 36e5).toISOString().slice(0, 10);
  const pts = r.timestamp.map((ts, i) => [ts * 1000, r.indicators.quote[0].close[i]]).filter(p => p[1] > 0);
  const ma = S.sma(pts.map(p => p[1]), 200);
  return { up: new Map(pts.map((p, i) => [day(p[0]), ma[i] != null && p[1] > ma[i]])), close: new Map(pts.map(p => [day(p[0]), p[1]])), day };
}

function prep(b) {
  const x = S.indicators(b), n = b.length;
  x.sma5 = S.sma(x.c, 5);
  x.liq = b.map((_, i) => i < 20 ? 0 : b.slice(i - 20, i).reduce((s, v) => s + v.val, 0) / 20);
  x.hh250 = b.map((_, i) => i < 250 ? null : Math.max(...b.slice(i - 250, i).map(v => v.h)));
  x.trend = Array.from({ length: n }, (_, i) => x.c[i] > x.sma200[i] && x.macd[i] > x.sig[i] && x.c[i] > x.hh20[i]);
  return x;
}

// 進場條件（第 i 根收盤成立，下一根開盤買）；edge＝只在條件剛成立那天進場
const ENTRY = {
  trend: { edge: true, f: (x, i) => x.trend[i] },
  high52: { edge: true, f: (x, i, b) => x.c[i] > x.hh250[i] && b[i].val > 2 * x.liq[i] },
  rsi2: { edge: false, f: (x, i) => x.c[i] > x.sma200[i] && x.rsi2[i] < 10 },
  rsi2s: { edge: false, f: (x, i) => x.c[i] > x.sma200[i] && x.rsi2[i] < 5 },
  bbdip: { edge: false, f: (x, i) => x.c[i] > x.sma200[i] && x.sma50[i] > x.sma200[i] && x.c[i] < x.sma20[i] - 2 * x.sd20[i] },
};

// 出場：sl／tp＝ATR 倍數（null＝不設）、hold＝最多持有幾天、xf＝收盤時的指標出場
const XF = { ma5: (x, i) => x.c[i] > x.sma5[i], ma20: (x, i) => x.c[i] > x.sma20[i], below50: (x, i) => x.c[i] < x.sma50[i] };
const BASE = [
  ['trend', '原規則：止損 3、止盈 6 ATR、20 天', { sl: 3, tp: 6, hold: 20 }],
  ['trend', '突破：止損 3、止盈 9 ATR、40 天', { sl: 3, tp: 9, hold: 40 }],
  ['trend', '突破：止損 3 ATR、跌破 50 均線出場、最多 60 天', { sl: 3, hold: 60, xf: 'below50' }],
  ['high52', '52 週新高＋放量：止損 3、止盈 6 ATR、20 天', { sl: 3, tp: 6, hold: 20 }],
  ['high52', '52 週新高＋放量：止損 3 ATR、跌破 50 均線、最多 60 天', { sl: 3, hold: 60, xf: 'below50' }],
  ['rsi2', 'RSI(2)<10 反彈：站上 5 均線出場、最多 10 天', { hold: 10, xf: 'ma5' }],
  ['rsi2', 'RSI(2)<10 反彈：止損 3 ATR、站上 5 均線、最多 10 天', { sl: 3, hold: 10, xf: 'ma5' }],
  ['rsi2s', 'RSI(2)<5 反彈：站上 5 均線出場、最多 10 天', { hold: 10, xf: 'ma5' }],
  ['bbdip', '多頭跌破布林下緣：站回 20 均線出場、最多 15 天', { hold: 15, xf: 'ma20' }],
  ['bbdip', '多頭跌破布林下緣：止損 3 ATR、站回 20 均線、最多 15 天', { sl: 3, hold: 15, xf: 'ma20' }],
];
const VARIANTS = BASE.flatMap(([e, name, ex]) => [{ e, name, ex, mkt: false }, { e, name: name + '＋大盤在 200 均線上', ex, mkt: true }]);

function run(stock, x, v, M) {
  const b = stock.b, E = ENTRY[v.e], ex = v.ex, out = [];
  let p = null;
  for (let i = WARM; i < b.length; i++) {
    if (p) {
      const held = i - p.in + 1;
      const hs = p.stop != null && b[i].l <= p.stop, ht = p.target != null && b[i].h >= p.target;
      const px = hs ? Math.min(b[i].o, p.stop) : ht ? Math.max(b[i].o, p.target)
        : (ex.xf && XF[ex.xf](x, i)) || held >= ex.hold ? b[i].c : null;
      if (px != null) {
        const ret = px / p.px - 1 - TW_COST;
        const m0 = M.close.get(M.day(b[p.in].t)), m1 = M.close.get(M.day(b[i].t));
        out.push({ t: b[p.in].t, T: b[i].t + 864e5, ret, ex: m0 && m1 ? ret - (m1 / m0 - 1) : ret, held });
        p = null;
      }
    }
    if (!p && i + 1 < b.length && E.f(x, i, b) && (!E.edge || !E.f(x, i - 1, b)) && x.liq[i] >= MIN_LIQ && (!v.mkt || M.up.get(M.day(b[i].t)))) {
      const px = b[i + 1].o, a = x.atr[i];
      p = { in: i + 1, px, stop: ex.sl ? px - ex.sl * a : null, target: ex.tp ? px + ex.tp * a : null };
    }
  }
  return out;
}

// 依進場月份平均：同一個月很多檔一起進場的交易高度相關，用月份當樣本的 t 值比較誠實
function monthT(tr) {
  const g = {};
  for (const t of tr) { const k = new Date(t.t).toISOString().slice(0, 7); (g[k] ||= []).push(t.ret); }
  const m = Object.values(g).map(a => a.reduce((s, v) => s + v, 0) / a.length);
  const avg = m.reduce((s, v) => s + v, 0) / m.length, sd = Math.sqrt(m.reduce((s, v) => s + (v - avg) ** 2, 0) / (m.length - 1));
  return sd ? avg / sd * Math.sqrt(m.length) : 0;
}

(async () => {
  const [data, M] = await Promise.all([load(), taiex()]);
  console.log(`${data.length} 檔，成本一來一回 ${(TW_COST * 100).toFixed(3)}%`);
  const res = VARIANTS.map(v => ({ v, tr: [] }));
  for (const s of data) {
    const x = prep(s.b);
    res.forEach(r => r.tr.push(...run(s, x, r.v, M)));
  }
  const f = v => (v >= 0 ? '+' : '') + (v * 100).toFixed(2) + '%';
  const years = [...new Set(res[0].tr.map(t => yearOf(t.t)))].sort().filter(y => y >= 2017);
  console.log('\n每條規則的全部歷史（平均每筆｜扣大盤後｜勝率｜筆數｜t 值｜月份 t｜平均持有天數），以及逐年平均每筆：');
  for (const r of res) {
    const st = S.stats(r.tr), xs = r.tr.reduce((s, t) => s + t.ex, 0) / r.tr.length, hd = r.tr.reduce((s, t) => s + t.held, 0) / r.tr.length;
    r.st = st;
    console.log(`${r.v.name}\n  ${f(st.avg)}｜${f(xs)}｜${(st.win * 100).toFixed(0)}%｜${st.n}｜t ${st.t.toFixed(1)}｜月 t ${monthT(r.tr).toFixed(1)}｜${hd.toFixed(1)} 天`);
    console.log('  ' + years.map(y => `${y} ${f(S.stats(r.tr.filter(t => yearOf(t.t) === y)).avg)}`).join('  '));
  }

  // 逐年滾動挑選
  console.log('\n逐年滾動挑選（每年只看之前的資料，挑 t 值最高、至少 100 筆、平均 > 0 的規則）：');
  const oos = [];
  for (const y of years) {
    const cut = Date.UTC(y, 0, 1);
    const best = res.map(r => ({ r, st: S.stats(r.tr.filter(t => t.T <= cut)) })).filter(o => o.st.n >= 100 && o.st.avg > 0)
      .sort((a, b) => b.st.t - a.st.t)[0];
    if (!best) { console.log(`  ${y}：沒有規則夠格，不交易`); continue; }
    const tr = best.r.tr.filter(t => yearOf(t.t) === y);
    oos.push(...tr);
    console.log(`  ${y}：${best.r.v.name}（之前 t ${best.st.t.toFixed(1)}）→ 當年 ${f(S.stats(tr).avg)}／${tr.length} 筆`);
  }
  const o = S.stats(oos);
  console.log(`  滾動合計：${o.n} 筆，平均每筆 ${f(o.avg)}，勝率 ${(o.win * 100).toFixed(0)}%，t ${o.t.toFixed(1)}，月份 t ${monthT(oos).toFixed(1)}`);

  // 前段挑、後段驗
  const SPLIT = Date.UTC(2022, 0, 1);
  const ranked = res.map(r => ({ r, a: S.stats(r.tr.filter(t => t.T <= SPLIT)), b: S.stats(r.tr.filter(t => t.t >= SPLIT)) })).sort((p, q) => q.a.t - p.a.t);
  console.log('\n2016–2021 挑、2022 年起驗（依前段 t 值排序）：');
  for (const { r, a, b } of ranked) console.log(`  前段 ${f(a.avg)} t ${a.t.toFixed(1)}｜後段 ${f(b.avg)} t ${b.t.toFixed(1)} ${b.n} 筆｜${r.v.name}`);
})().catch(e => { console.error(e); process.exit(1); });
