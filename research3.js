// 研究三：滾動式驗證（walk-forward），含真實資金費率
// 每年 1/1 只用之前的資料，從 63 種進場 × 做多放空 × 5 組止損止盈中挑合併 t 值最高的規則，拿去跑下一整年
// node research3.js 1d BTC ETH …
const { indicators, candidates, backtest, stats, fetchBars, fundingFn, fetchFunding } = require('./strategy.js');
const EX = [{ sl: 1.5, tp: 3 }, { sl: 2, tp: 3 }, { sl: 2, tp: 4 }, { sl: 3, tp: 3 }, { sl: 3, tp: 4 }];
const FIXED = '多|3/4|站上 200 均線 ＋ MACD 在訊號線上 ＋ 突破前 20 根高點';

(async () => {
  const [tf, ...syms] = process.argv.slice(2);
  const pool = {};
  for (const sym of syms) {
    const [bars, ev] = await Promise.all([fetchBars(sym + 'USDT', tf), fetchFunding(sym + 'USDT')]);
    const x = indicators(bars), fund = fundingFn(ev);
    for (const c of candidates(x, bars.length)) for (const ex of EX)
      (pool[`${c.dir > 0 ? '多' : '空'}|${ex.sl}/${ex.tp}|${c.name}`] ||= []).push(...backtest(bars, x, c, ex, fund).trades);
  }
  const year = t => new Date(t).getUTCFullYear();
  const years = [...new Set(Object.values(pool).flat().map(t => year(t.t)))].sort();
  const pct = v => (v * 100).toFixed(2) + '%';
  const rows = [], wf = [], fx = [];
  for (const y of years.slice(2)) { // 至少要有兩年歷史才開始挑
    const cut = Date.UTC(y, 0, 1);
    let best = null;
    for (const [k, tr] of Object.entries(pool)) {
      const s = stats(tr.filter(t => t.t < cut));
      if (s.n >= 100 && s.avg > 0 && (!best || s.t > best.s.t)) best = { k, s };
    }
    const next = k => pool[k].filter(t => year(t.t) === y);
    const got = best ? next(best.k) : [], f = stats(next(FIXED));
    wf.push(...got); fx.push(...next(FIXED));
    const g = stats(got);
    rows.push({ 年: y, 當年選出的規則: best ? best.k : '無', 選時t: best ? best.s.t.toFixed(1) : '', 筆數: g.n, 勝率: pct(g.win), 平均每筆: pct(g.avg),
      固定規則_筆數: f.n, 固定規則_勝率: pct(f.win), 固定規則_平均: pct(f.avg) });
  }
  console.log(`\n${tf} 滾動式驗證`);
  console.table(rows);
  const a = stats(wf), b = stats(fx);
  console.log(`每年重挑：${a.n} 筆 勝率 ${pct(a.win)} 盈虧比 ${a.payoff.toFixed(2)} 平均 ${pct(a.avg)} t ${a.t.toFixed(1)}`);
  console.log(`固定規則：${b.n} 筆 勝率 ${pct(b.win)} 盈虧比 ${b.payoff.toFixed(2)} 平均 ${pct(b.avg)} t ${b.t.toFixed(1)}`);
})();
