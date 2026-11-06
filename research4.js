// 研究四：盈虧比（止盈 ÷ 止損）至少 1.5 時，止損該放多遠；主規則做多，逐年滾動驗證，含真實資金費率
// node research4.js 1d BTC ETH …
const { runRule, walkForward, fetchBars, fundingFn, fetchFunding } = require('./strategy.js');
const SL = [1.5, 2, 2.5, 3], RR = [1.33, 1.5, 2, 2.5, 3];

(async () => {
  const [tf, ...syms] = process.argv.slice(2);
  const data = await Promise.all(syms.map(async s => {
    const [bars, ev] = await Promise.all([fetchBars(s + 'USDT', tf), fetchFunding(s + 'USDT')]);
    return { bars, fund: fundingFn(ev) };
  }));
  const pct = v => (v * 100).toFixed(2) + '%', rows = [];
  for (const sl of SL) for (const rr of RR) {
    const ex = { sl, tp: +(sl * rr).toFixed(2) };
    const w = walkForward(data.map(d => runRule(d.bars, 1, d.fund, ex)));
    rows.push({ 止損ATR: sl, 止盈ATR: ex.tp, 設定盈虧比: rr, 通過: w.pass ? '是' : '否',
      滾動_筆數: w.wf.n, 滾動_勝率: pct(w.wf.win), 實際盈虧比: w.wf.payoff.toFixed(2), 兩平勝率: pct(w.wf.be),
      平均每筆: pct(w.wf.avg), t: w.wf.t.toFixed(1), 近12月平均: pct(w.recent.avg), 最差單筆: pct(w.total.worst) });
  }
  console.table(rows);
})();
