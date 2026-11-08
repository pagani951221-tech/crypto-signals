// 研究二十：保本出場改成「盤中碰到成本價，而且收盤前一小時仍在成本價以下才賣」會怎樣？
// 日線看不到 12:30 的價格，回測用「碰到且收盤仍在成本價以下，以收盤價賣」近似（研究二十另用 30 分 K 檢查這個近似準不準）。
// 和研究十八、十九的「盤中碰到就賣」比較，都搭配保本出場後再創新高就重新進場。
// 用法：node research20.js 日線快取.json 營收快取.json
const fs = require('fs');
const S = require('./strategy.js');
const R = require('./tw-rule.js');

const day = t => new Date(t + 8 * 36e5).toISOString().slice(0, 10);
const yearOf = t => new Date(t).getUTCFullYear();
const sma = (a, n, i) => { if (i < n - 1) return NaN; let s = 0; for (let k = i - n + 1; k <= i; k++) s += a[k]; return s / n; };

(async () => {
  const bars = JSON.parse(fs.readFileSync(process.argv[2])).map(s => ({ code: s.code, b: s.b.map(([t, o, h, l, c, val]) => ({ t, o, h, l, c, val })) }));
  const rev = JSON.parse(fs.readFileSync(process.argv[3]));
  // 大盤
  const j = await (await fetch('https://query1.finance.yahoo.com/v8/finance/chart/%5ETWII?range=10y&interval=1d', { headers: { 'User-Agent': 'Mozilla/5.0' } })).json();
  const q = j.chart.result[0], ix = q.timestamp.map((t, i) => [day(t * 1000), q.indicators.quote[0].close[i]]).filter(r => r[1] != null);
  const ic = ix.map(r => r[1]), M = {};
  ix.forEach(([d], i) => { M[d] = { c: ic[i], m20: sma(ic, 20, i), m50: sma(ic, 50, i), m200: sma(ic, 200, i), hi20: Math.max(...ic.slice(Math.max(0, i - 19), i + 1)), r20: i >= 20 ? ic[i] / ic[i - 20] - 1 : 0 }; });
  // 市場寬度
  const up = {}, tot = {};
  for (const s of bars) { const c = s.b.map(x => x.c); s.b.forEach((x, i) => { if (i < 49) return; const d = day(x.t); tot[d] = (tot[d] || 0) + 1; if (x.c > sma(c, 50, i)) up[d] = (up[d] || 0) + 1; }); }
  const breadth = d => tot[d] ? (up[d] || 0) / tot[d] : 0.5;
  const mk = (b, i) => M[day(b[i].t)];

  const V = [
    ['現在：止損 3 ATR、跌破 50 日均線、最多 60 天', () => ({})],
    ['曾賺 10%，盤中碰到成本就賣＋再創新高重新進場', () => ({ be: 0.10, reenter: 'high' })],
    ['曾賺 10%，碰到且收盤仍在成本以下才賣＋再創新高重新進場', () => ({ be: 0.10, beAt: 'close', reenter: 'high' })],
    ['曾賺 15%，盤中碰到成本就賣＋再創新高重新進場', () => ({ be: 0.15, reenter: 'high' })],
    ['曾賺 15%，碰到且收盤仍在成本以下才賣＋再創新高重新進場', () => ({ be: 0.15, beAt: 'close', reenter: 'high' })],
    ['曾賺 20%，碰到且收盤仍在成本以下才賣＋再創新高重新進場', () => ({ be: 0.20, beAt: 'close', reenter: 'high' })],
  ];

  // 帳戶模擬（同研究十三：最多 10 檔、每檔總資產 1/10、訊號太多時隨機挑）
  const dates = bars.find(s => s.code === '2330').b.map(x => day(x.t));
  const di = Object.fromEntries(dates.map((d, i) => [d, i]));
  function account(trs, seeds = 20) {
    const byDay = dates.map(() => []);
    for (const t of trs) byDay[t.a].push(t);
    const res = [];
    for (let seed = 1; seed <= seeds; seed++) {
      let x = seed, cash = 1, open = [], peak = 1, mdd = 0, v = 1;
      const rand = () => (x = (x * 1664525 + 1013904223) % 4294967296) / 4294967296;
      for (let d = 0; d < dates.length; d++) {
        for (const p of open.filter(p => p.t.z < d)) cash += p.amt * (1 + p.t.ret);
        open = open.filter(p => p.t.z >= d); // 前一天以前出場的才把錢拿回來（當天進當天出的也會在隔天結算，不會卡住名額）
        for (const t of byDay[d].filter(t => !open.some(p => p.t.code === t.code)).sort(() => rand() - 0.5)) {
          if (open.length >= 10 || cash <= 1e-9) break;
          const amt = Math.min(v / 10, cash); cash -= amt; open.push({ t, amt, last: t.px });
        }
        for (const p of open) if (p.t.close[d] != null) p.last = p.t.close[d];
        v = cash + open.reduce((s, p) => s + p.amt * p.last / p.t.px, 0);
        peak = Math.max(peak, v); mdd = Math.min(mdd, v / peak - 1);
      }
      res.push({ cagr: v ** (245 / dates.length) - 1, mdd });
    }
    const med = a => [...a].sort((p, q) => p - q)[a.length >> 1];
    return { cagr: med(res.map(r => r.cagr)), mdd: med(res.map(r => r.mdd)) };
  }
  const f = v => (v >= 0 ? '+' : '') + (v * 100).toFixed(2) + '%', p1 = v => (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '%';
  for (const [name, mkOpt] of V) {
    const tr = [];
    for (const s of bars) for (const t of R.run(s.b, rev[s.code] || {}, mkOpt(s.b)).trades) {
      const a = di[day(s.b[t.in].t)], z = di[day(s.b[t.out].t)];
      const close = {}; for (let k = t.in; k <= t.out; k++) close[di[day(s.b[k].t)]] = s.b[k].c;
      tr.push({ ...t, code: s.code, a, z, close });
    }
    const st = S.stats(tr), A = S.stats(tr.filter(t => yearOf(t.t) < 2022)), B = S.stats(tr.filter(t => yearOf(t.t) >= 2022));
    const reT = S.stats(tr.filter(t => t.re)), beT = S.stats(tr.filter(t => t.why === 'be'));
    const acc = account(tr), y26 = S.stats(tr.filter(t => yearOf(t.t) === 2026));
    console.log(`${name}\n  ${st.n} 筆｜平均 ${f(st.avg)}｜2021 前 ${f(A.avg)}｜2022 起 ${f(B.avg)}｜2026 ${f(y26.avg)}｜帳戶（10 檔）年化 ${p1(acc.cagr)}、最大回落 ${p1(acc.mdd)}${beT.n ? `｜保本出場 ${beT.n} 筆、平均 ${f(beT.avg)}` : ''}${reT.n ? `｜重新進場 ${reT.n} 筆、平均 ${f(reT.avg)}` : ''}`);
  }
})().catch(e => { console.error(e); process.exit(1); });
