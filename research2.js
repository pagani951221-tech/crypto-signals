// 研究二：同一條規則套在所有幣上合併驗證（比每個幣各挑一個更不容易挑到運氣）
// node research2.js 1d BTC ETH …
const { indicators, candidates, backtest, fetchBars } = require('./strategy.js');
const EX = [{ sl: 1.5, tp: 3 }, { sl: 2, tp: 3 }, { sl: 2, tp: 4 }, { sl: 3, tp: 3 }, { sl: 3, tp: 4 }];
const WARMUP = 200, IS_RATIO = 0.7;

function sum(r) {
  const n = r.length, avg = n ? r.reduce((s, v) => s + v, 0) / n : 0;
  const sd = n > 1 ? Math.sqrt(r.reduce((s, v) => s + (v - avg) ** 2, 0) / (n - 1)) : 0;
  const w = r.filter(v => v > 0), l = r.filter(v => v <= 0);
  const payoff = l.length && w.length ? (w.reduce((s, v) => s + v, 0) / w.length) / (-l.reduce((s, v) => s + v, 0) / l.length) : 0;
  return { n, win: n ? w.length / n : 0, payoff, avg, t: sd ? avg / sd * Math.sqrt(n) : 0 };
}

(async () => {
  const [tf, ...syms] = process.argv.slice(2);
  const pool = {};
  for (const sym of syms) {
    const bars = await fetchBars(sym + 'USDT', tf), x = indicators(bars);
    const split = WARMUP + Math.floor((bars.length - WARMUP) * IS_RATIO);
    for (const c of candidates(x, bars.length)) for (const ex of EX) {
      const k = `${c.dir > 0 ? '多' : '空'}|${ex.sl}/${ex.tp}|${c.name}`, p = pool[k] ||= { is: [], oos: [] };
      for (const t of backtest(bars, x, c, ex).trades) (t.in < split ? p.is : p.oos).push(t.ret);
    }
  }
  const pct = v => (v * 100).toFixed(2) + '%';
  const rows = Object.entries(pool).map(([k, p]) => ({ k, is: sum(p.is), oos: sum(p.oos) }))
    .filter(r => r.is.n >= 100 && r.is.avg > 0).sort((a, b) => b.is.t - a.is.t);
  for (const d of ['多', '空']) {
    const top = rows.filter(r => r.k.startsWith(d)).slice(0, 12);
    console.log(`\n${tf} ${d === '多' ? '做多' : '放空'}：前段合併 t 值前 12 名（前段 n≥100、平均>0 的共 ${rows.filter(r => r.k.startsWith(d)).length} 條）`);
    console.table(top.map(r => ({ 規則: r.k.slice(2), 前_筆數: r.is.n, 前_勝率: pct(r.is.win), 前_盈虧比: r.is.payoff.toFixed(2), 前_平均: pct(r.is.avg), 前_t: r.is.t.toFixed(1),
      後_筆數: r.oos.n, 後_勝率: pct(r.oos.win), 後_盈虧比: r.oos.payoff.toFixed(2), 後_平均: pct(r.oos.avg), 後_t: r.oos.t.toFixed(1) })));
  }
})();
