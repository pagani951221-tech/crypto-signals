// 研究五：量價與資金費率反向策略，能不能在短週期（4 小時、1 小時、15 分鐘）贏過成本
// node research5.js 1h [頁數]   → 10 個主流幣合併；前 70% 挑、後 30% 驗；兩種成本各算一次
const S = require('./strategy.js');
const [tf, pagesArg] = process.argv.slice(2);
const pages = +(pagesArg || S.TF[tf].pages);
const WARMUP = 200, IS_RATIO = 0.7;
const COST_NOW = 0.003, COST_MAKER = 0.0008; // 目前：單邊 0.1% 手續費＋0.05% 滑價；掛單：單邊 0.02%＋0.02%
const EXITS = [];
for (const sl of [1, 1.5, 2]) for (const rr of [1.5, 2, 3]) EXITS.push({ sl, tp: sl * rr });

function feats(bars, ev) {
  const x = S.indicators(bars), n = bars.length;
  const v = bars.map(b => b.v), c = x.c;
  const vAvg = S.sma(v, 20);
  const buy = bars.map(b => b.v ? b.tb / b.v : 0.5), buy3 = S.sma(buy, 3);
  // 滾動 24 根的成交量加權均價與價格標準差
  const vwap = [], vstd = [];
  for (let i = 0; i < n; i++) {
    if (i < 23) { vwap.push(null); vstd.push(null); continue; }
    let pv = 0, vv = 0;
    for (let k = i - 23; k <= i; k++) { const tp = (bars[k].h + bars[k].l + c[k]) / 3; pv += tp * v[k]; vv += v[k]; }
    const m = vv ? pv / vv : c[i];
    vwap.push(m);
    vstd.push(Math.sqrt(c.slice(i - 23, i + 1).reduce((s, y) => s + (y - m) ** 2, 0) / 24));
  }
  // 能量潮（OBV）與前 20 根最高
  const obv = [0];
  for (let i = 1; i < n; i++) obv.push(obv[i - 1] + Math.sign(c[i] - c[i - 1]) * v[i]);
  const obvHi = obv.map((_, i) => i < 20 ? null : Math.max(...obv.slice(i - 20, i)));
  const obvLo = obv.map((_, i) => i < 20 ? null : Math.min(...obv.slice(i - 20, i)));
  // 每根收盤時「最近 3 次」資金費率的平均
  const fund = [];
  let j = 0;
  for (let i = 0; i < n; i++) {
    while (j < ev.length && ev[j].t <= bars[i].T) j++;
    fund.push(j >= 3 ? (ev[j - 1].r + ev[j - 2].r + ev[j - 3].r) / 3 : null);
  }
  return { ...x, v, vAvg, buy3, vwap, vstd, obv, obvHi, obvLo, fund, bars };
}

// d = 1 做多、-1 放空
const CONDS = [
  ['爆量長紅／長黑（量 > 3 倍均量、順著 K 棒方向）', (x, i, d) => x.v[i] > 3 * x.vAvg[i] && d * (x.c[i] - x.bars[i].o) > 0],
  ['爆量且收在高／低點（量 > 2 倍、收在 K 棒頂／底 20%）', (x, i, d) => {
    const b = x.bars[i], r = b.h - b.l; if (!r || x.v[i] < 2 * x.vAvg[i]) return false;
    return d > 0 ? (x.c[i] - b.l) / r > 0.8 : (b.h - x.c[i]) / r > 0.8; }],
  ['主動買／賣盤連 3 根 > 60%，且順著 20 均線', (x, i, d) => (d > 0 ? x.buy3[i] > 0.6 : x.buy3[i] < 0.4) && d * (x.c[i] - x.sma20[i]) > 0],
  ['偏離成交量加權均價 2 個標準差（反向）', (x, i, d) => x.vwap[i] != null && x.vstd[i] > 0 && d * (x.vwap[i] - x.c[i]) > 2 * x.vstd[i]],
  ['能量潮先創 20 根新高／低，價格還沒跟上', (x, i, d) => x.obvHi[i] != null && (d > 0 ? x.obv[i] > x.obvHi[i] && x.c[i] <= x.hh20[i] : x.obv[i] < x.obvLo[i] && x.c[i] >= x.ll20[i])],
  ['趨勢中縮量回檔（站上 50 均線、跌破 20 均線、量 < 0.7 倍）', (x, i, d) => d * (x.c[i] - x.sma50[i]) > 0 && d * (x.c[i] - x.sma20[i]) < 0 && x.v[i] < 0.7 * x.vAvg[i]],
  ['資金費率極端（反向）：多頭付費 > 0.05% 就空，空頭付費 > 0.03% 就多', (x, i, d) => x.fund[i] != null && (d > 0 ? x.fund[i] < -0.0003 : x.fund[i] > 0.0005)],
  ['資金費率順向：費率 > 0.02% 且站上 20 均線就多（反之空）', (x, i, d) => x.fund[i] != null && (d > 0 ? x.fund[i] > 0.0002 && x.c[i] > x.sma20[i] : x.fund[i] < -0.0001 && x.c[i] < x.sma20[i])],
];

function stats(r) {
  const n = r.length, avg = n ? r.reduce((s, v) => s + v, 0) / n : 0;
  const sd = n > 1 ? Math.sqrt(r.reduce((s, v) => s + (v - avg) ** 2, 0) / (n - 1)) : 0;
  return { n, avg, win: n ? r.filter(v => v > 0).length / n : 0, t: sd ? avg / sd * Math.sqrt(n) : 0 };
}

(async () => {
  const data = await S.pool(S.BASKET, 5, async s => {
    const [bars, ev] = await Promise.all([S.fetchBars(s + 'USDT', tf, pages), S.fetchFunding(s + 'USDT').catch(() => [])]);
    return { s, bars, ev };
  });
  const pool = {};
  for (const { bars, ev } of data) {
    if (bars.length < 1000) continue;
    const x = feats(bars, ev), fund = S.fundingFn(ev), split = WARMUP + Math.floor((bars.length - WARMUP) * IS_RATIO);
    for (const [ci, [name, f]] of CONDS.entries()) for (const d of [1, -1]) {
      const on = bars.map((_, i) => i >= WARMUP - 1 && f(x, i, d));
      const cand = { dir: d, sig: on.map((v, i) => v && !on[i - 1]) };
      for (const ex of EXITS) {
        const k = `${ci}|${d}|${ex.sl}/${ex.tp}`;
        const p = pool[k] ||= { name, d, ex, is: [], oos: [] };
        for (const t of S.backtest(bars, x, cand, ex, fund).trades) (t.in < split ? p.is : p.oos).push(t.ret);
      }
    }
  }
  const span = data.map(d => d.bars.length).sort((a, b) => a - b)[0];
  console.log(`\n${S.TF[tf].label}，每幣約 ${span} 根以上，10 個主流幣合併；${Object.keys(pool).length} 種組合`);
  for (const [label, adj] of [['目前成本（單邊 0.15%）', 0], ['掛單成本（單邊 0.04%）', COST_NOW - COST_MAKER]]) {
    const rows = Object.values(pool).map(p => ({ p, is: stats(p.is.map(r => r + adj)), oos: stats(p.oos.map(r => r + adj)) }))
      .filter(r => r.is.n >= 100).sort((a, b) => b.is.t - a.is.t);
    const pct = v => (v * 100).toFixed(2) + '%';
    const okOos = rows.slice(0, 10).filter(r => r.is.t >= 2 && r.oos.n >= 30 && r.oos.avg > 0 && r.oos.t >= 1).length;
    console.log(`\n${label}：前段 t 值最高的 10 種裡，後段也賺（t≥1）的有 ${okOos} 種`);
    console.table(rows.slice(0, 10).map(r => ({ 條件: r.p.name.slice(0, 22), 方向: r.p.d > 0 ? '多' : '空', 出場: `${r.p.ex.sl}/${r.p.ex.tp}`,
      前_筆數: r.is.n, 前_勝率: pct(r.is.win), 前_平均: pct(r.is.avg), 前_t: r.is.t.toFixed(1),
      後_筆數: r.oos.n, 後_勝率: pct(r.oos.win), 後_平均: pct(r.oos.avg), 後_t: r.oos.t.toFixed(1) })));
  }
})();
