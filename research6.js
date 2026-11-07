// 研究六：資金費率套利（買現貨＋放空等量永續合約，不賭漲跌，賺每 8 小時的資金費）
// node research6.js   → 10 個主流幣，從合約上市到現在
// 簡化：不計現貨與合約價差（基差）變化、保證金占用與強平風險；每次進出（4 筆成交）扣 0.3%
const S = require('./strategy.js');
const ROUND = 0.003;   // 現貨買賣各 0.1%＋合約開平各 0.05%
const LOOK = 9;        // 用最近 9 次（3 天）資金費率的平均決定進出

function run(ev, enter, exit) {
  let on = false, sum = 0, trips = 0, held = 0, worst = 0, win30 = [];
  for (let i = LOOK; i < ev.length; i++) {
    const avg = ev.slice(i - LOOK, i).reduce((s, e) => s + e.r, 0) / LOOK; // 只看已發生的
    if (!on && avg > enter) { on = true; trips++; sum -= ROUND; }
    else if (on && avg < exit) on = false;
    if (on) { sum += ev[i].r; held++; win30.push(ev[i].r); if (win30.length > 90) win30.shift(); worst = Math.min(worst, win30.reduce((s, r) => s + r, 0)); }
  }
  const years = (ev.at(-1).t - ev[LOOK].t) / (365 * 864e5);
  return { yr: sum / years, held: held / (ev.length - LOOK), trips, worst };
}

(async () => {
  const all = await S.pool(S.BASKET, 5, async s => ({ s, ev: await S.fetchFunding(s + 'USDT') }));
  const pct = v => (v * 100).toFixed(1) + '%';
  const rules = [
    { name: '一直持有', enter: -Infinity, exit: -Infinity },
    { name: '費率 > 0 才持有', enter: 0, exit: 0 },
    { name: '費率 > 0.01% 進、< 0 出', enter: 0.0001, exit: 0 },
    { name: '費率 > 0.02% 進、< 0.005% 出', enter: 0.0002, exit: 0.00005 },
  ];
  for (const rule of rules) {
    const rows = all.filter(a => a.ev.length > 100).map(a => ({ 幣: a.s, ...run(a.ev, rule.enter, rule.exit) }));
    const avg = rows.reduce((s, r) => s + r.yr, 0) / rows.length;
    console.log(`\n${rule.name}：10 幣平均年化 ${pct(avg)}（未計基差與保證金成本）`);
    console.table(rows.map(r => ({ 幣: r.幣, 年化: pct(r.yr), 持有時間: pct(r.held), 進出次數: r.trips, 最差30天: pct(r.worst) })));
  }
  // 逐年：「費率 > 0.01% 進、< 0 出」在每一年的平均年化，看近期還剩多少
  const byYear = {};
  for (const a of all) for (let y = 2020; y <= 2026; y++) {
    const ev = a.ev.filter(e => new Date(e.t).getUTCFullYear() === y);
    if (ev.length > 100) (byYear[y] ||= []).push(run(ev, 0.0001, 0).yr);
  }
  console.log('\n逐年（費率 > 0.01% 進、< 0 出），10 幣平均年化：');
  console.log(Object.entries(byYear).map(([y, v]) => `${y}: ${pct(v.reduce((s, r) => s + r, 0) / v.length)}`).join('　'));
})();
