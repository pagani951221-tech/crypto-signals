// 研究十一：台股規則的出場方式要不要改？（進場條件不變：52 週新高＋放量＋營收創 12 個月新高）
// 起因：2026 年大漲股裡最賺的幾筆都是「持有滿 60 天」出場，而跌破 50 日均線出場的常常已吐回一大段。
// 事先定好幾種出場、全部股票全部年份一起測，看 2021 年前與 2022 年起兩段是否都變好；只看大漲股會挑到運氣。
// 持有越久每筆平均自然越高，但資金被綁住、筆數變少，所以也看「每持有一天平均」。
// 用法：node research11.js 日線快取.json 營收快取.json（格式同 research9.js）
const fs = require('fs');
const S = require('./strategy.js');
const R = require('./tw-rule.js');

const VARIANTS = [
  ['現在：跌破 50 日均線、最多 60 天、止損 3 ATR', {}],
  ['最多 40 天', { hold: 40 }],
  ['最多 90 天', { hold: 90 }],
  ['最多 120 天', { hold: 120 }],
  ['不限天數（最多 250 天）', { hold: 250 }],
  ['跌破 20 日均線', { ma: 20 }],
  ['跌破 100 日均線', { ma: 100 }],
  ['不用均線，只有止損＋60 天', { ma: 0 }],
  ['從進場後最高收盤回落 3 ATR（取代均線）', { ma: 0, trail: 3 }],
  ['從進場後最高收盤回落 5 ATR（取代均線）', { ma: 0, trail: 5 }],
  ['止損 2 ATR', { sl: 2 }],
  ['止損 4 ATR', { sl: 4 }],
];

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
for (const [name, opt] of VARIANTS) {
  const tr = bars.flatMap(s => R.run(s.b, rev[s.code] || {}, opt).trades).filter(t => yearOf(t.t) >= 2016);
  const st = S.stats(tr), a = S.stats(tr.filter(t => t.T <= SPLIT)), b = S.stats(tr.filter(t => t.t >= SPLIT));
  const days = tr.reduce((s, t) => s + t.out - t.in + 1, 0), perDay = tr.reduce((s, t) => s + t.ret, 0) / days;
  const why = w => (tr.filter(t => t.why === w).length / tr.length * 100).toFixed(0) + '%';
  console.log(`${name}\n  ${st.n} 筆｜平均 ${f(st.avg)}｜勝率 ${(st.win * 100).toFixed(0)}%｜月 t ${monthT(tr).toFixed(1)}｜平均持有 ${(days / tr.length).toFixed(0)} 天｜每持有一天 ${f(perDay)}｜2021 前 ${f(a.avg)}（${a.n}）｜2022 起 ${f(b.avg)}（${b.n}）｜出場：止損 ${why('stop')} 均線 ${why('ma')} 到期 ${why('time')}`);
}
