// 研究：止損／止盈（以 ATR 計）怎麼配，勝率與盈虧比的取捨在哪裡最划算
// node research.js 1d BTC ETH …
const { indicators, candidates, backtest, fetchBars } = require('./strategy.js');

const SL = [1, 1.5, 2, 3], TP = [0.5, 1, 1.5, 2, 3, 4];
const IS_RATIO = 0.7, WARMUP = 200;

function sum(tr) {
  const n = tr.length, w = tr.filter(r => r > 0), l = tr.filter(r => r <= 0);
  const aw = w.length ? w.reduce((s, v) => s + v, 0) / w.length : 0;
  const al = l.length ? -l.reduce((s, v) => s + v, 0) / l.length : 0;
  const avg = n ? tr.reduce((s, v) => s + v, 0) / n : 0;
  const sd = n > 1 ? Math.sqrt(tr.reduce((s, v) => s + (v - avg) ** 2, 0) / (n - 1)) : 0;
  return { n, win: n ? w.length / n : 0, payoff: al ? aw / al : 0, avg, t: sd ? avg / sd * Math.sqrt(n) : 0 };
}

(async () => {
  const [tf, ...syms] = process.argv.slice(2);
  const all = {}, honest = {}; // key = `${dir}|${sl}|${tp}`
  for (const sym of syms) {
    const bars = await fetchBars(sym + 'USDT', tf), x = indicators(bars);
    const split = WARMUP + Math.floor((bars.length - WARMUP) * IS_RATIO);
    const cands = candidates(x, bars.length);
    for (const sl of SL) for (const tp of TP) for (const dir of [1, -1]) {
      const key = `${dir}|${sl}|${tp}`;
      let best = null;
      for (const c of cands.filter(c => c.dir === dir)) {
        const tr = backtest(bars, x, c, { sl, tp }).trades;
        (all[key] ||= []).push(...tr.map(t => t.ret));
        const is = sum(tr.filter(t => t.in < split).map(t => t.ret));
        if (is.n >= 20 && is.avg > 0 && (!best || is.t > best.is.t)) best = { is, oos: tr.filter(t => t.in >= split).map(t => t.ret) };
      }
      // 誠實測試：只用前段挑出 t 值最高的那一個，看它在後段的真實表現
      if (best) (honest[key] ||= []).push(...best.oos);
    }
  }
  const pct = v => (v * 100).toFixed(2);
  for (const dir of [1, -1]) {
    const rows = [];
    for (const sl of SL) for (const tp of TP) {
      const key = `${dir}|${sl}|${tp}`, a = sum(all[key] || []), h = sum(honest[key] || []);
      rows.push({ 止損: sl, 止盈: tp, 設定盈虧比: (tp / sl).toFixed(2), 損益兩平勝率: pct(sl / (sl + tp)) + '%',
        全部_勝率: pct(a.win) + '%', 全部_實際盈虧比: a.payoff.toFixed(2), 全部_平均每筆: pct(a.avg) + '%',
        挑選後_後段筆數: h.n, 挑選後_勝率: pct(h.win) + '%', 挑選後_平均每筆: pct(h.avg) + '%', 挑選後_t: h.t.toFixed(2) });
    }
    console.log(`\n${tf} ${dir > 0 ? '做多' : '放空'}`);
    console.table(rows);
  }
})();
