// 研究十三：用有限資金照台股規則操作，整個帳戶會是什麼樣子？
// 「平均每筆」看不出帳戶會虧多深、多久才回來。這裡模擬：同時最多持有 N 檔，每檔用當時總資產的 1/N（現金不夠就用剩下的），
// 同一天訊號比空位多時隨機挑（跑 50 次看運氣差多少）；成交用研究十二的方式（一字漲停買不到、跌停賣不掉順延），成本已扣。
// 對照：同期間買進持有 0050（還原權息）。
// 用法：node research13.js 日線快取.json 營收快取.json
const fs = require('fs');
const R = require('./tw-rule.js');
const { bars: yahoo } = require('./tw-data.js');

const START = '2016-01-04';
const day = t => new Date(t + 8 * 36e5).toISOString().slice(0, 10);
const all = JSON.parse(fs.readFileSync(process.argv[2])), rev = JSON.parse(fs.readFileSync(process.argv[3]));
const dates = all.find(s => s.code === '2330').b.map(r => day(r[0])).filter(d => d >= START);
const di = Object.fromEntries(dates.map((d, i) => [d, i]));

// 每筆交易：進場日、出場日、進場價、每天收盤（算市值用）、報酬（已扣成本）
const trades = [];
for (const s of all) {
  const b = s.b.map(([t, o, h, l, c, val]) => ({ t, o, h, l, c, val }));
  for (const t of R.run(b, rev[s.code] || {}, { fill: 'skip' }).trades) {
    const a = di[day(b[t.in].t)], z = di[day(b[t.out].t)];
    if (a == null || z == null) continue;
    const close = {}; for (let k = t.in; k <= t.out; k++) if (di[day(b[k].t)] != null) close[di[day(b[k].t)]] = b[k].c;
    trades.push({ code: s.code, a, z, px: t.px, ret: t.ret, close });
  }
}
const byDay = dates.map(() => []); for (const t of trades) byDay[t.a].push(t);

function rng(seed) { return () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296; }
function sim(N, seed, from = 0) {
  const rand = rng(seed + 1);
  let cash = 1, open = [], peak = 1, mdd = 0, uw = 0, longUw = 0, taken = 0, offered = 0, streak = 0, worstStreak = 0;
  const eq = [];
  for (let d = from; d < dates.length; d++) {
    // 先出場（出場價已含成本），再用開盤進場
    for (const p of open.filter(p => p.t.z < d)) { cash += p.amt * (1 + p.t.ret); streak = p.t.ret < 0 ? streak + 1 : 0; worstStreak = Math.max(worstStreak, streak); }
    open = open.filter(p => p.t.z >= d); // 前一天以前出場的才把錢拿回來（當天進當天出的也會在隔天結算，不會卡住名額）
    const value = () => cash + open.reduce((s, p) => s + p.amt * ((p.t.close[d] ?? p.last) / p.t.px), 0);
    const cand = byDay[d].filter(t => !open.some(p => p.t.code === t.code)).sort(() => rand() - 0.5);
    offered += cand.length;
    const total = eq.length ? eq.at(-1) : 1;
    for (const t of cand) {
      if (open.length >= N || cash <= 1e-9) break;
      const amt = Math.min(total / N, cash);
      cash -= amt; open.push({ t, amt, last: t.px }); taken++;
    }
    for (const p of open) if (p.t.close[d] != null) p.last = p.t.close[d];
    const v = value(); eq.push(v);
    if (v > peak) { peak = v; uw = 0; } else { uw++; longUw = Math.max(longUw, uw); }
    mdd = Math.min(mdd, v / peak - 1);
  }
  const yrs = (eq.length - 1) / 245;
  const byYear = {}; eq.forEach((v, i) => { byYear[dates[from + i].slice(0, 4)] = v; });
  let prev = 1; const yearRet = Object.entries(byYear).map(([y, v]) => { const r = v / prev - 1; prev = v; return [y, r]; });
  return { cagr: eq.at(-1) ** (1 / yrs) - 1, final: eq.at(-1), mdd, longUw, taken, offered, worstStreak, yearRet };
}
const pct = v => (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '%';
const med = a => [...a].sort((x, y) => x - y)[a.length >> 1];

(async () => {
  const etf = (await yahoo('0050', 'TW')).filter(x => day(x.t) >= START);
  const etfFrom = from => { const e = etf.filter(x => day(x.t) >= dates[from]); let pk = 0, mdd = 0; for (const x of e) { pk = Math.max(pk, x.c); mdd = Math.min(mdd, x.c / pk - 1); }
    return { cagr: (e.at(-1).c / e[0].c) ** (245 / (e.length - 1)) - 1, mdd }; };
  console.log(`${trades.length} 筆交易（${START} 起）\n`);
  for (const [label, from] of [['2016 年起（全部年份）', 0], ['2021 年起（滾動驗證允許交易的年份）', dates.findIndex(d => d >= '2021-01-01')]]) {
    const e = etfFrom(from);
    console.log(`【${label}】0050 買進持有：年化 ${pct(e.cagr)}｜最大回落 ${pct(e.mdd)}`);
    for (const N of [5, 10, 20]) {
      const rs = Array.from({ length: 50 }, (_, k) => sim(N, k, from));
      const c = rs.map(r => r.cagr).sort((a, b) => a - b);
      console.log(`  最多 ${N} 檔：年化 ${pct(med(c))}（運氣最差 ${pct(c[2])}～最好 ${pct(c[47])}）｜最大回落 ${pct(med(rs.map(r => r.mdd)))}（最差 ${pct(Math.min(...rs.map(r => r.mdd)))}）｜最久 ${med(rs.map(r => r.longUw))} 個交易日沒創新高｜最多連虧 ${med(rs.map(r => r.worstStreak))} 筆｜做到訊號的 ${(med(rs.map(r => r.taken / r.offered)) * 100).toFixed(0)}%`);
      const yr = rs[0].yearRet.map(([y], i) => `${y} ${pct(med(rs.map(r => r.yearRet[i][1])))}`);
      console.log('    逐年（中位數）：' + yr.join('  '));
    }
  }
})().catch(e => { console.error(e); process.exit(1); });
