// 研究十五：處置股（分盤撮合、要預收款券）對台股規則的影響
// 放量創新高的股票常常已經或即將被列為處置股。處置期間每 5～60 分鐘才撮合一次，買進要先把錢放進券商。
// 資料：證交所 punish、櫃買中心 disposal 公告（2017 年起），每筆處置的起迄日。
// 比較：進場日已在處置中、持有期間才被處置、都沒有，三組的報酬；以及「進場日在處置中就不買」放進規則實際跑的結果。
// 用法：node research15.js 日線快取.json 營收快取.json 處置公告.json（[{ code, start, end }]，日期 YYYY-MM-DD）
const fs = require('fs');
const S = require('./strategy.js');
const R = require('./tw-rule.js');

const [, , barsPath, revPath, dispPath] = process.argv;
const day = t => new Date(t + 8 * 36e5).toISOString().slice(0, 10);
const yearOf = t => new Date(t).getUTCFullYear();
const disp = {};
for (const d of JSON.parse(fs.readFileSync(dispPath))) (disp[d.code] ||= []).push(d);
const under = (code, d) => (disp[code] || []).some(p => p.start <= d && d <= p.end);
const startsIn = (code, a, b) => (disp[code] || []).some(p => p.start > a && p.start <= b);

function monthT(tr) {
  const g = {};
  for (const t of tr) { const k = new Date(t.t).toISOString().slice(0, 7); (g[k] ||= []).push(t.ret); }
  const m = Object.values(g).map(a => a.reduce((s, v) => s + v, 0) / a.length);
  const avg = m.reduce((s, v) => s + v, 0) / m.length, sd = Math.sqrt(m.reduce((s, v) => s + (v - avg) ** 2, 0) / (m.length - 1));
  return sd ? avg / sd * Math.sqrt(m.length) : 0;
}
const f = v => (v >= 0 ? '+' : '') + (v * 100).toFixed(2) + '%';
const line = (name, tr) => { const s = S.stats(tr), a = S.stats(tr.filter(t => yearOf(t.t) < 2022)), b = S.stats(tr.filter(t => yearOf(t.t) >= 2022));
  console.log(`${name}\n  ${s.n} 筆｜平均 ${f(s.avg)}｜勝率 ${(s.win * 100).toFixed(0)}%｜月 t ${monthT(tr).toFixed(1)}｜2021 前 ${f(a.avg)}（${a.n}）｜2022 起 ${f(b.avg)}（${b.n}）`); };

const bars = JSON.parse(fs.readFileSync(barsPath)).map(s => ({ code: s.code, b: s.b.map(([t, o, h, l, c, val]) => ({ t, o, h, l, c, val })) }));
const rev = JSON.parse(fs.readFileSync(revPath));
const all = [], skipped = [];
for (const s of bars) {
  for (const t of R.run(s.b, rev[s.code] || {}).trades) {
    if (yearOf(t.t) < 2017) continue;
    const din = day(s.b[t.in].t), dout = day(s.b[t.out].t);
    all.push({ ...t, sigDisp: under(s.code, day(s.b[t.in - 1].t)), inDisp: under(s.code, din), later: startsIn(s.code, din, dout) });
  }
  // 把「進場日在處置中就不買」放進規則：被擋掉的訊號不佔用部位
  skipped.push(...R.run(s.b, rev[s.code] || {}, { skip: i => under(s.code, day(s.b[i].t)) }).trades.filter(t => yearOf(t.t) >= 2017));
}
console.log(`${all.length} 筆交易（2017 年起，處置公告從 2017 年開始）\n`);
line('全部（現在的規則）', all);
line('進場日已經是處置股', all.filter(t => t.inDisp));
line('進場時不是，持有期間才被處置', all.filter(t => !t.inDisp && t.later));
line('整段都沒有處置', all.filter(t => !t.inDisp && !t.later));
line('實際跑：進場日在處置中就不買', skipped);
