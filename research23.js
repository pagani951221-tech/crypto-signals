// 研究二十三：加密貨幣規則的持有上限從 20 根拉長（或縮短）會怎樣？
// 訊號、止損 3 ATR、止盈 6 ATR、止損距離 ≤ 20% 都不變，只改最多持有幾根。持有越久每筆平均自然越高，所以也看「每持有一天賺幾 R」。
// 用法：node research23.js
const S = require('./strategy.js');
const COST = 0.003, SL = 3, TP = 6, CAP = 0.2, SPLIT = Date.UTC(2022, 0, 1), Y1 = Date.now() - 365 * 864e5;
const signals = x => { const a = x.c.map((c, i) => i >= 199 && c > x.sma200[i] && x.macd[i] > x.sig[i] && c > x.hh20[i]); return a.map((v, i) => v && !a[i - 1]); };

function run(b, x, sig, hold, cap) {
  const trades = [];
  for (let i = 200; i < b.length - 1; i++) {
    if (!sig[i] || SL * x.atr[i] / x.c[i] > cap) continue;
    const px = b[i + 1].o, stop = px - SL * x.atr[i], target = px + TP * x.atr[i];
    let t = null;
    for (let k = i + 1; k < b.length && !t; k++) {
      const s = b[k].l <= stop, g = b[k].h >= target, out = s ? Math.min(b[k].o, stop) : g ? target : k - i >= hold ? b[k].c : null;
      if (out !== null) t = { in: i + 1, out: k, t: b[i + 1].t, T: b[k].t + 864e5, ret: out / px - 1 - COST, r: (out / px - 1 - COST) / ((px - stop) / px), why: s ? 'stop' : g ? 'target' : 'time', px, stop };
    }
    if (!t) break; // 還沒出場，不計入
    trades.push(t); i = t.out - 1; // 出場當根又有訊號可以接著進場，和 backtest 相同
  }
  return { trades };
}

(async () => {
  const scan = await S.topCoins(100, await S.ourbitCoins());
  const data = (await S.pool(scan, 8, async s => { try { const b = await S.fetchBars(s + 'USDT', '1d'); return b.length >= 500 ? { b, x: S.indicators(b) } : null; } catch { return null; } })).filter(Boolean);
  const official = data.flatMap(d => S.runRule(d.b, 1, S.fundingFn([]), S.exitFor(2), Infinity).trades);
  const mine = data.flatMap(d => run(d.b, d.x, signals(d.x), S.MAX_HOLD, Infinity).trades);
  require('assert').strictEqual(mine.length, official.length, `${mine.length} 筆和網站回測 ${official.length} 筆不同`);
  require('assert').ok(Math.abs(S.stats(mine).avg - S.stats(official).avg) < 1e-9, '平均和網站回測不同');
  const f = v => (v >= 0 ? '+' : '') + (v * 100).toFixed(2) + '%';
  console.log(`${data.length} 個幣，基準和網站回測一致（${mine.length} 筆）\n`);
  for (const h of [10, 20, 30, 40, 60, 90, 180]) {
    const runs = data.map(d => run(d.b, d.x, signals(d.x), h, CAP)), tr = runs.flatMap(r => r.trades), st = S.stats(tr);
    const a = S.stats(tr.filter(t => t.T <= SPLIT)), b = S.stats(tr.filter(t => t.t >= SPLIT)), y = S.stats(tr.filter(t => t.t >= Y1)), wf = S.walkForward(runs);
    const R = tr.reduce((s, t) => s + t.r, 0), days = tr.reduce((s, t) => s + t.out - t.in + 1, 0), w = k => (tr.filter(t => t.why === k).length / tr.length * 100).toFixed(0);
    console.log(`最多 ${h} 根\n  ${st.n} 筆｜勝率 ${(st.win * 100).toFixed(1)}%｜平均 ${f(st.avg)}｜t ${st.t.toFixed(1)}｜總 ${R.toFixed(0)} R｜平均持有 ${(days / tr.length).toFixed(0)} 根｜每持有 100 根賺 ${(R / days * 100).toFixed(1)} R｜2021 前 ${f(a.avg)}｜2022 起 ${f(b.avg)}｜近 12 月 ${f(y.avg)}（${y.n}）｜止損 ${w('stop')}% 止盈 ${w('target')}% 到期 ${w('time')}%｜滾動 ${wf.pass ? '通過' : '未通過'} ${f(wf.wf.avg)}`);
  }
  // 好處是不是集中在少數年份或少數大贏家
  const yr = t => new Date(t.t).getUTCFullYear(), res = Object.fromEntries([20, 30, 40].map(h => [h, data.flatMap(d => run(d.b, d.x, signals(d.x), h, CAP).trades)]));
  console.log('\n逐年平均（筆數）：20 根｜30 根｜40 根');
  for (const y of [...new Set(res[20].map(yr))].sort()) console.log(`${y}  ` + [20, 30, 40].map(h => { const a = res[h].filter(t => yr(t) === y); return `${f(S.stats(a).avg)}（${a.length}）`; }).join('｜'));
  for (const h of [20, 30, 40]) { const a = [...res[h]].sort((p, q) => q.ret - p.ret).slice(Math.ceil(res[h].length * 0.01)), old = res[h].filter(t => yr(t) <= 2024); console.log(`${h} 根：拿掉前 1% 大贏家 ${f(S.stats(a).avg)}｜只算 2024 年以前 ${f(S.stats(old).avg)}（t ${S.stats(old).t.toFixed(1)}）`); }
})().catch(e => { console.error(e); process.exit(1); });
