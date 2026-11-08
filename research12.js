// 研究十二：漲停買不到、跌停賣不掉，會讓台股規則的回測差多少？
// 規則是「放量創新高，隔天開盤買」，隔天常一開盤就漲停。回測原本假設一定買得到開盤價。
// 一字漲停（整天最低價都在漲停價）視為買不到；一字跌停、或收盤出場時收在跌停，視為賣不掉，順延到第一個沒鎖跌停的交易日開盤賣。
// 開盤漲停但盤中有打開的，仍假設以開盤價（漲停價）買到；實際排隊可能只成交一部分，所以這裡是樂觀估計。
// 處置股（分盤撮合）沒有歷史資料，沒有模擬。
// 用法：node research12.js 日線快取.json 營收快取.json（格式同 research9.js）
const fs = require('fs');
const S = require('./strategy.js');
const R = require('./tw-rule.js');

const yearOf = t => new Date(t).getUTCFullYear();
function monthT(tr) {
  const g = {};
  for (const t of tr) { const k = new Date(t.t).toISOString().slice(0, 7); (g[k] ||= []).push(t.ret); }
  const m = Object.values(g).map(a => a.reduce((s, v) => s + v, 0) / a.length);
  const avg = m.reduce((s, v) => s + v, 0) / m.length, sd = Math.sqrt(m.reduce((s, v) => s + (v - avg) ** 2, 0) / (m.length - 1));
  return sd ? avg / sd * Math.sqrt(m.length) : 0;
}

const bars = JSON.parse(fs.readFileSync(process.argv[2])).map(s => ({ code: s.code, b: s.b.map(([t, o, h, l, c, val]) => ({ t, o, h, l, c, val })) }));
const rev = JSON.parse(fs.readFileSync(process.argv[3]));
const f = v => (v >= 0 ? '+' : '') + (v * 100).toFixed(2) + '%';
const SPLIT = Date.UTC(2022, 0, 1);

// 原本規則的每筆進場：隔天開盤漲多少
const base = bars.flatMap(s => R.run(s.b, rev[s.code] || {}).trades.map(t => ({ ...t, b: s.b }))).filter(t => yearOf(t.t) >= 2016);
const gap = base.map(t => t.b[t.in].o / t.b[t.in - 1].c - 1);
const share = fn => (gap.filter(fn).length / gap.length * 100).toFixed(1) + '%';
console.log(`原本 ${base.length} 筆進場，隔天開盤：漲停 ${share(g => g >= 0.095)}｜漲 5% 以上 ${share(g => g >= 0.05)}｜開低 ${share(g => g < 0)}`);
const lockedIn = base.filter(t => t.b[t.in].l >= t.b[t.in - 1].c * 1.095);
console.log(`其中一字漲停（整天買不到）${lockedIn.length} 筆（${(lockedIn.length / base.length * 100).toFixed(1)}%），這些交易原本平均 ${f(S.stats(lockedIn).avg)}`);
const openLimit = base.filter(t => t.b[t.in].o >= t.b[t.in - 1].c * 1.095 && !lockedIn.includes(t));
console.log(`開盤漲停但盤中有打開 ${openLimit.length} 筆，平均 ${f(S.stats(openLimit).avg)}（假設買到，實際可能只成交一部分）\n`);

for (const [name, opt] of [['原本（一定買得到、賣得掉）', {}], ['一字漲停就放棄，跌停賣不掉順延', { fill: 'skip' }], ['一字漲停就順延到隔天開盤追，跌停賣不掉順延', { fill: 'chase' }]]) {
  const runs = bars.map(s => R.run(s.b, rev[s.code] || {}, opt));
  const tr = runs.flatMap(r => r.trades).filter(t => yearOf(t.t) >= 2016);
  const lk = runs.reduce((a, r) => (a.in += r.lock.in, a.out += r.lock.out, a), { in: 0, out: 0 });
  const st = S.stats(tr), a = S.stats(tr.filter(t => t.T <= SPLIT)), b = S.stats(tr.filter(t => t.t >= SPLIT));
  console.log(`${name}\n  ${st.n} 筆｜平均 ${f(st.avg)}｜勝率 ${(st.win * 100).toFixed(0)}%｜月 t ${monthT(tr).toFixed(1)}｜2021 前 ${f(a.avg)}（${a.n}）｜2022 起 ${f(b.avg)}（${b.n}）｜碰到一字漲停 ${lk.in} 次、賣不掉 ${lk.out} 次`);
  console.log('  ' + [...new Set(tr.map(t => yearOf(t.t)))].sort().map(y => `${y} ${f(S.stats(tr.filter(t => yearOf(t.t) === y)).avg)}`).join('  '));
}
