// 研究十六：注意股（公布注意交易資訊）對台股規則的影響
// 放量創新高的當天常被列為注意股；注意次數累積（例如連續 3 天、10 天內 6 天）就會變成處置股。
// 注意股名單收盤後才公布：雲端 14:40 算訊號時只知道前一天以前的，訊號當天的名單要到隔天開盤前才看得到。
// 比較：訊號當天是不是注意股、訊號前 10 個交易日（不含當天）被注意幾次，以及把條件放進規則實際跑的結果。
// 用法：node research16.js 日線快取.json 營收快取.json 注意股.json（{ 代號: ['YYYY-MM-DD', …] }）
const fs = require('fs');
const S = require('./strategy.js');
const R = require('./tw-rule.js');

const [, , barsPath, revPath, notePath] = process.argv;
const day = t => new Date(t + 8 * 36e5).toISOString().slice(0, 10);
const yearOf = t => new Date(t).getUTCFullYear();
const note = Object.fromEntries(Object.entries(JSON.parse(fs.readFileSync(notePath))).map(([c, a]) => [c, new Set(a)]));
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
const all = [], skipSig = [], skipPrior = [];
for (const s of bars) {
  const N = note[s.code] || new Set(), b = s.b;
  const att = i => N.has(day(b[i].t)), prior = i => { let n = 0; for (let k = Math.max(0, i - 10); k < i; k++) n += att(k); return n; };
  for (const t of R.run(b, rev[s.code] || {}).trades) {
    if (yearOf(t.t) < 2017) continue;
    const i = t.in - 1; // 訊號日
    all.push({ ...t, sig: att(i), prior: prior(i) });
  }
  // skip 收到的是進場日；訊號日＝進場日前一天
  skipSig.push(...R.run(b, rev[s.code] || {}, { skip: j => att(j - 1) }).trades.filter(t => yearOf(t.t) >= 2017));
  skipPrior.push(...R.run(b, rev[s.code] || {}, { skip: j => prior(j - 1) >= 3 }).trades.filter(t => yearOf(t.t) >= 2017));
}
console.log(`${all.length} 筆交易（2017 年起）\n`);
line('全部（現在的規則）', all);
line('訊號當天是注意股', all.filter(t => t.sig));
line('訊號當天不是注意股', all.filter(t => !t.sig));
line('訊號前 10 天沒被注意過', all.filter(t => t.prior === 0));
line('訊號前 10 天被注意 1～2 次', all.filter(t => t.prior >= 1 && t.prior <= 2));
line('訊號前 10 天被注意 3 次以上', all.filter(t => t.prior >= 3));
line('實際跑：訊號當天是注意股就不買', skipSig);
line('實際跑：訊號前 10 天被注意 3 次以上就不買', skipPrior);
