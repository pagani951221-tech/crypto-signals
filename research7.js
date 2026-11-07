// 研究七：同一套規則能不能用在台股（上市市值前 150 大，約等於台灣 50＋中型 100）
// node research7.js
// 資料：證交所開放資料（股數、收盤價）、Yahoo Finance 還原權息日線（約 10 年）。只做多。
// 成本：手續費 0.1425%×2＋證交稅 0.3%＋滑價單邊 0.1%＝一來一回約 0.785%
const S = require('./strategy.js');
const TW_COST = 0.001425 * 2 + 0.003 + 0.002;
const ADJ = 0.003 - TW_COST; // strategy.js 的回測已扣加密貨幣成本 0.3%，換成台股成本
const N = 150;
const pct = v => (v >= 0 ? '+' : '') + (v * 100).toFixed(2) + '%';

async function universe() {
  const [co, day] = await Promise.all([
    fetch('https://openapi.twse.com.tw/v1/opendata/t187ap03_L').then(r => r.json()),
    fetch('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL').then(r => r.json()),
  ]);
  const close = Object.fromEntries(day.map(d => [d.Code, +d.ClosingPrice]));
  return co.filter(c => /^\d{4}$/.test(c['公司代號']) && close[c['公司代號']] > 0)
    .map(c => ({ code: c['公司代號'], name: c['公司簡稱'], cap: +c['已發行普通股數或TDR原股發行股數'] * close[c['公司代號']] }))
    .sort((a, b) => b.cap - a.cap).slice(0, N);
}

// Yahoo 日線，依還原收盤價把開高低收一起還原（除權息當天才不會被誤判成暴跌）
async function bars(code) {
  const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${code}.TW?range=10y&interval=1d`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const r = (await res.json()).chart.result[0], q = r.indicators.quote[0], adj = r.indicators.adjclose[0].adjclose;
  const out = [];
  r.timestamp.forEach((ts, i) => {
    if ([q.open[i], q.high[i], q.low[i], q.close[i], adj[i]].some(v => v == null || !(v > 0))) return;
    const k = adj[i] / q.close[i], t = ts * 1000;
    out.push({ t, o: q.open[i] * k, h: q.high[i] * k, l: q.low[i] * k, c: adj[i], T: t + 864e5 - 1 });
  });
  return out;
}

const line = (label, w) => `${label}：全部 ${w.total.n} 筆 勝率 ${(w.total.win * 100).toFixed(0)}% 平均 ${pct(w.total.avg)} t ${w.total.t.toFixed(1)}｜`
  + `滾動 ${w.wf.n} 筆 平均 ${w.wf.n ? pct(w.wf.avg) : '—'} t ${w.wf.t.toFixed(1)}｜近 12 月 ${w.recent.n} 筆 ${pct(w.recent.avg)}｜${w.pass ? '通過' : '未通過'}`;

(async () => {
  const uni = await universe();
  console.log(`上市市值前 ${uni.length} 大：${uni.slice(0, 12).map(u => u.name).join('、')}…`);
  const data = (await S.pool(uni, 4, async u => { try { const b = await bars(u.code); return b.length >= 500 ? { ...u, b } : null; } catch { return null; } })).filter(Boolean);
  console.log(`取得 ${data.length} 檔，平均 ${Math.round(data.reduce((s, d) => s + d.b.length, 0) / data.length)} 根日線`);
  const twCost = runs => runs.map(r => ({ ...r, trades: r.trades.map(t => ({ ...t, ret: t.ret + ADJ })) }));

  // 1) 原規則與幾組出場
  console.log('\n【原規則：站上 200 均線＋MACD 在訊號線上＋突破前 20 根高點，做多】');
  for (const ex of [{ sl: 3, tp: 6 }, { sl: 3, tp: 4.5 }, { sl: 2, tp: 4 }, { sl: 2, tp: 6 }]) {
    const w = S.walkForward(twCost(data.map(d => S.runRule(d.b, 1, S.fundingFn([]), ex))));
    console.log(line(`止損 ${ex.sl}／止盈 ${ex.tp} ATR`, w));
    if (ex.tp === 6 && ex.sl === 3) console.log('   逐年：' + w.rows.map(r => `${r.y}${r.on ? '' : '(不允許)'} ${r.st.n ? pct(r.st.avg) : '—'}/${r.st.n}`).join('  '));
  }

  // 2) 每年用之前的資料，從 63 種做多條件 × 4 組出場重新挑一次（滾動式選規則，和研究三相同）
  console.log('\n【每年重挑規則（63 種條件 × 4 組出場，只做多）】');
  const EX = [{ sl: 2, tp: 4 }, { sl: 2, tp: 6 }, { sl: 3, tp: 4.5 }, { sl: 3, tp: 6 }];
  const pool = {};
  for (const d of data) {
    const x = S.indicators(d.b);
    for (const c of S.candidates(x, d.b.length).filter(c => c.dir > 0)) for (const ex of EX)
      (pool[`${ex.sl}/${ex.tp}|${c.name}`] ||= []).push(...S.backtest(d.b, x, c, ex).trades.map(t => ({ ...t, ret: t.ret + ADJ })));
  }
  const year = t => new Date(t).getUTCFullYear();
  const years = [...new Set(Object.values(pool).flat().map(t => year(t.t)))].sort().slice(2);
  const picked = [];
  for (const y of years) {
    const cut = Date.UTC(y, 0, 1);
    let best = null;
    for (const [k, tr] of Object.entries(pool)) {
      const s = S.stats(tr.filter(t => t.T <= cut));
      if (s.n >= 100 && s.avg > 0 && (!best || s.t > best.s.t)) best = { k, s };
    }
    const got = best ? pool[best.k].filter(t => year(t.t) === y) : [];
    picked.push(...got);
    const g = S.stats(got);
    console.log(`${y}：${best ? best.k : '沒有前段賺錢的規則'}　→ 當年 ${g.n} 筆 平均 ${g.n ? pct(g.avg) : '—'}`);
  }
  const a = S.stats(picked);
  console.log(`每年重挑合計：${a.n} 筆 勝率 ${(a.win * 100).toFixed(0)}% 平均 ${pct(a.avg)} t ${a.t.toFixed(1)}`);

  // 3) 對照：同期間買進持有（每檔第 200 根到最後，平均年化）
  const bh = data.map(d => { const s = d.b[200], e = d.b.at(-1); return Math.pow(e.c / s.c, 365 * 864e5 / (e.t - s.t)) - 1; });
  console.log(`\n對照：這 ${data.length} 檔買進持有，平均年化 ${pct(bh.reduce((s, v) => s + v, 0) / bh.length)}（今天的大型股回頭看，會高估）`);
})();
