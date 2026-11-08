// 研究二十二：加密貨幣規則跳過止損太遠（波動太大）的訊號、或收緊止損，虧損會不會變小、績效如何。
// 結論：採用止損距離 ≤ 20%（strategy.js 的 MAX_STOP）。用法：node research22.js
const S = require('./strategy.js');
const P = v => (v >= 0 ? '+' : '') + (v * 100).toFixed(2) + '%';
const sigs = x => { const a = x.c.map((c, i) => i >= 199 && c > x.sma200[i] && x.macd[i] > x.sig[i] && c > x.hh20[i]); return a.map((v, i) => v && !a[i - 1]); };
const V = [['現在：止損 3 ATR，不限距離', 3, 1], ['止損距離 ≤ 30% 才做', 3, 0.30], ['止損距離 ≤ 25% 才做', 3, 0.25], ['止損距離 ≤ 20% 才做', 3, 0.20], ['止損距離 ≤ 15% 才做', 3, 0.15], ['止損 2 ATR（止盈 4 ATR）', 2, 1], ['止損 2 ATR，距離 ≤ 20% 才做', 2, 0.20]];
(async () => {
  const scan = await S.topCoins(100, await S.ourbitCoins());
  const data = (await S.pool(scan, 8, async s => { try { const b = await S.fetchBars(s + 'USDT', '1d'); return b.length >= 500 ? { b, x: S.indicators(b) } : null; } catch { return null; } })).filter(Boolean);
  const SPLIT = Date.UTC(2022, 0, 1), Y1 = Date.now() - 365 * 864e5;
  for (const [name, sl, cap] of V) {
    const runs = data.map(({ b, x }) => { const sig = sigs(x).map((v, i) => v && sl * x.atr[i] / x.c[i] <= cap); return S.backtest(b, x, { dir: 1, sig }, { sl, tp: sl * 2 }); });
    const tr = runs.flatMap(r => r.trades), st = S.stats(tr), a = S.stats(tr.filter(t => t.T <= SPLIT)), b = S.stats(tr.filter(t => t.t >= SPLIT)), y = S.stats(tr.filter(t => t.t >= Y1)), wf = S.walkForward(runs);
    const R = tr.reduce((s, t) => s + t.ret / ((t.px - t.stop) / t.px), 0), loss = S.stats(tr.filter(t => t.ret <= 0));
    console.log(`${name}\n  ${st.n} 筆｜勝率 ${(st.win * 100).toFixed(1)}%｜平均 ${P(st.avg)}｜虧損單平均 ${P(loss.avg)}｜最差 ${P(st.worst)}｜總 ${R.toFixed(0)} R｜2021 前 ${P(a.avg)}｜2022 起 ${P(b.avg)}｜近 12 月 ${P(y.avg)}（${y.n}）｜滾動 ${wf.pass ? '通過' : '未通過'}`);
  }
})().catch(e => { console.error(e); process.exit(1); });
