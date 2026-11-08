// 研究二十一：加密貨幣規則（日線做多）出訊號後，等回調再進場會不會比較好？
// 訊號不變（站上 200 均線＋MACD 在訊號線上＋突破前 20 根高點），只改進場方式。事先定好幾種掛單：
//   訊號收盤價下方 0.5／1／1.5 ATR、回到被突破的前高、回到 20 日均線。等 5 或 10 根，沒回調就放棄這筆。
// 成交：最低價碰到掛單價才算，跳空低開用開盤價。保守處理：成交當根也碰到止損就算止損，成交當根不算止盈。
// 止損止盈：預設從實際成交價算（距離和原規則相同）；「價位不變」是止損止盈仍在原本的價格，回調買進的盈虧比因此變好。
// 成本和原規則相同（一來一回 0.3%，掛單手續費其實可能更低，這裡不算這個好處）。
// 用法：node research21.js
const S = require('./strategy.js');

const COST = 0.003, SL = 3, TP = 6, HOLD = S.MAX_HOLD, WARM = 199, SPLIT = Date.UTC(2022, 0, 1);
const signals = x => { const all = x.c.map((c, i) => i >= WARM && c > x.sma200[i] && x.macd[i] > x.sig[i] && c > x.hh20[i]); return all.map((v, i) => v && !all[i - 1]); };

// 從第 a 根（進場根）開始持有到出場；a 根以 from 為第一根檢查的 K 線
function hold(b, p, from) {
  for (let i = from; i < b.length; i++) {
    const stop = b[i].l <= p.stop, tgt = b[i].h >= p.target;
    const out = stop ? Math.min(b[i].o, p.stop) : tgt ? p.target : i - p.in + 1 >= HOLD ? b[i].c : null;
    if (out !== null) return { ...p, out: i, t: b[p.in].t, T: b[i].t + 864e5, ret: out / p.px - 1 - COST, r: (out / p.px - 1 - COST) / ((p.px - p.stop) / p.px), exit: out };
  }
  return null; // 還沒出場，不計入
}
const market = (b, x, i) => { const px = b[i + 1].o; return hold(b, { in: i + 1, px, stop: px - SL * x.atr[i], target: px + TP * x.atr[i] }, i + 1); };

function run(b, x, sig, v) {
  const trades = []; let missed = 0, offered = 0; const missT = [];
  for (let i = WARM + 1; i < b.length - 1; i++) {
    if (!sig[i]) continue;
    offered++;
    if (v.mode === 'market') { const t = market(b, x, i); if (!t) break; trades.push(t); i = t.out - 1; continue; } // 出場當根如果又有訊號可以接著進場，和 backtest 相同
    let fill = -1, lim = 0;
    for (let k = i + 1; k <= Math.min(i + v.w, b.length - 1); k++) { lim = v.lim(b, x, i, k); if (b[k].l <= lim) { fill = k; break; } }
    if (fill < 0) {
      missed++; const t = i + v.w < b.length ? market(b, x, i) : null; if (t) missT.push(t);
      i += v.w - 1; continue;
    }
    const px = Math.min(b[fill].o, lim), base = v.fixed ? b[i].c : px;
    const p = { in: fill, px, stop: base - SL * x.atr[i], target: base + TP * x.atr[i] };
    let t;
    if (b[fill].l <= p.stop) t = { ...p, out: fill, t: b[fill].t, T: b[fill].t + 864e5, ret: p.stop / px - 1 - COST, r: (p.stop / px - 1 - COST) / ((px - p.stop) / px), exit: p.stop };
    else t = hold(b, p, fill + 1);
    if (!t) break;
    trades.push(t); i = t.out - 1;
  }
  return { trades, missed, offered, missT };
}

const V = [
  ['現在：隔天開盤買', { mode: 'market' }],
  ['回調 0.5 ATR，等 5 根', { w: 5, lim: (b, x, i) => b[i].c - 0.5 * x.atr[i] }],
  ['回調 1 ATR，等 5 根', { w: 5, lim: (b, x, i) => b[i].c - x.atr[i] }],
  ['回調 1 ATR，等 10 根', { w: 10, lim: (b, x, i) => b[i].c - x.atr[i] }],
  ['回調 1.5 ATR，等 10 根', { w: 10, lim: (b, x, i) => b[i].c - 1.5 * x.atr[i] }],
  ['回到被突破的前高，等 5 根', { w: 5, lim: (b, x, i) => x.hh20[i] }],
  ['回到被突破的前高，等 10 根', { w: 10, lim: (b, x, i) => x.hh20[i] }],
  ['回到 20 日均線，等 10 根', { w: 10, lim: (b, x, i, k) => x.sma20[k - 1] }],
  ['回調 0.5 ATR，等 5 根（止損止盈價位不變）', { w: 5, fixed: true, lim: (b, x, i) => b[i].c - 0.5 * x.atr[i] }],
  ['回調 1 ATR，等 10 根（止損止盈價位不變）', { w: 10, fixed: true, lim: (b, x, i) => b[i].c - x.atr[i] }],
];

(async () => {
  let scan; try { scan = await S.topCoins(100, await S.ourbitCoins()); } catch (e) { console.log('取不到排行，用主流幣', e.message); scan = S.BASKET; }
  const data = (await S.pool(scan, 8, async s => { try { const b = await S.fetchBars(s + 'USDT', '1d'); return b.length >= 500 ? { s, b, x: S.indicators(b) } : null; } catch { return null; } })).filter(Boolean);
  // 檢查：「隔天開盤買」要和網站用的 backtest 完全一樣
  const ex = S.exitFor(2), official = data.flatMap(d => S.runRule(d.b, 1, S.fundingFn([]), ex).trades);
  const mine = data.flatMap(d => run(d.b, d.x, signals(d.x), V[0][1]).trades);
  require('assert').strictEqual(mine.length, official.length, `隔天開盤買 ${mine.length} 筆，和網站回測 ${official.length} 筆不同`);
  require('assert').ok(Math.abs(S.stats(mine).avg - S.stats(official).avg) < 1e-9, '平均和網站回測不同');
  console.log(`${data.length} 個幣；網站回測 ${official.length} 筆、平均 ${(S.stats(official).avg * 100).toFixed(2)}%\n`);
  const f = v => (v >= 0 ? '+' : '') + (v * 100).toFixed(2) + '%';
  for (const [name, v] of V) {
    const rs = data.map(d => run(d.b, d.x, signals(d.x), v)), tr = rs.flatMap(r => r.trades);
    const st = S.stats(tr), a = S.stats(tr.filter(t => t.T <= SPLIT)), b = S.stats(tr.filter(t => t.t >= SPLIT)), wf = S.walkForward(rs);
    const R = tr.reduce((s, t) => s + t.r, 0), offered = rs.reduce((s, r) => s + r.offered, 0), missed = rs.reduce((s, r) => s + r.missed, 0), mt = rs.flatMap(r => r.missT);
    console.log(`${name}\n  ${st.n} 筆｜成交率 ${(tr.length / (tr.length + missed) * 100).toFixed(0)}%｜勝率 ${(st.win * 100).toFixed(1)}%｜平均 ${f(st.avg)}｜t ${st.t.toFixed(1)}｜盈虧比 ${st.payoff.toFixed(2)}｜總 ${R.toFixed(0)} R（每筆 ${(R / tr.length).toFixed(3)} R）｜2021 前 ${f(a.avg)}｜2022 起 ${f(b.avg)}｜滾動 ${wf.pass ? '通過' : '未通過'} ${f(wf.wf.avg)}${mt.length ? `｜沒回調錯過的 ${mt.length} 筆若照原方式買平均 ${f(S.stats(mt).avg)}` : ''}`);
  }
})().catch(e => { console.error(e); process.exit(1); });
