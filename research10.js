// 研究十：台股規則（tw-rule.js，含營收濾網）再加三大法人買賣超，會不會更好？
// 法人資料：證交所 T86（上市）、櫃買中心 dailyTrade（上櫃），2018 年起每天的外資、投信、自營商淨買股數。
// 法人資料約下午 4 點才公布，雲端 14:40 算訊號時拿不到當天的，所以只用「訊號日前一天為止」的資料。
// 濾網事先定好、只測幾種：外資 5 日買超、投信 5 日買超、投信 5 日內至少 3 天買超、外資投信同步買超、三大法人 20 日買超、投信 20 日買超；
// 以及反過來的對照組。
// 用法：node research10.js 日線快取.json 營收快取.json 法人資料夾（內含 twse/、tpex/，每天一檔 { 代號: [外資, 投信, 自營] }）
const fs = require('fs');
const S = require('./strategy.js');
const R = require('./tw-rule.js');

const [, , barsPath, revPath, flowDir] = process.argv;
const yearOf = t => new Date(t).getUTCFullYear();
const day = t => new Date(t + 8 * 36e5).toISOString().slice(0, 10);
const START = '2018-02-01'; // 留一個月給 20 日視窗

const flows = {}; // flows[代號][日期] = [外資, 投信, 自營]
for (const src of ['twse', 'tpex']) for (const f of fs.readdirSync(`${flowDir}/${src}`)) {
  const d = f.slice(0, 10), j = JSON.parse(fs.readFileSync(`${flowDir}/${src}/${f}`));
  for (const [c, v] of Object.entries(j)) (flows[c] ||= {})[d] = v;
}

// 第 i 根（訊號日）之前 n 個交易日的法人淨買合計與買超天數；沒資料的日子當 0
function window(fl, b, i, n) {
  const s = [0, 0, 0], up = [0, 0, 0];
  for (let k = i - n; k < i; k++) { const v = fl?.[day(b[k].t)]; if (v) v.forEach((x, j) => { s[j] += x; if (x > 0) up[j]++; }); }
  return { s, up };
}
function features(fl, b, i) {
  const w5 = window(fl, b, i, 5), w20 = window(fl, b, i, 20);
  return { f5: w5.s[0], t5: w5.s[1], tUp5: w5.up[1], all20: w20.s[0] + w20.s[1] + w20.s[2], t20: w20.s[1] };
}
const FILTERS = [
  ['不加濾網（現在的規則）', () => true],
  ['外資 5 日買超', f => f.f5 > 0],
  ['投信 5 日買超', f => f.t5 > 0],
  ['投信 5 日內至少 3 天買超', f => f.tUp5 >= 3],
  ['外資、投信 5 日都買超', f => f.f5 > 0 && f.t5 > 0],
  ['三大法人 20 日買超', f => f.all20 > 0],
  ['投信 20 日買超', f => f.t20 > 0],
  ['（對照）外資 5 日賣超', f => f.f5 < 0],
  ['（對照）三大法人 20 日賣超', f => f.all20 < 0],
];

function monthT(tr) {
  const g = {};
  for (const t of tr) { const k = new Date(t.t).toISOString().slice(0, 7); (g[k] ||= []).push(t.ret); }
  const m = Object.values(g).map(a => a.reduce((s, v) => s + v, 0) / a.length);
  const avg = m.reduce((s, v) => s + v, 0) / m.length, sd = Math.sqrt(m.reduce((s, v) => s + (v - avg) ** 2, 0) / (m.length - 1));
  return sd ? avg / sd * Math.sqrt(m.length) : 0;
}

const bars = JSON.parse(fs.readFileSync(barsPath)), rev = JSON.parse(fs.readFileSync(revPath));
const tr = [];
for (const s of bars) {
  const b = s.b.map(([t, o, h, l, c, val]) => ({ t, o, h, l, c, val }));
  for (const t of R.run(b, rev[s.code] || {}).trades) if (day(t.t) >= START) tr.push({ ...t, f: features(flows[s.code], b, t.in - 1) });
}
const f = v => (v >= 0 ? '+' : '') + (v * 100).toFixed(2) + '%';
const SPLIT = Date.UTC(2022, 0, 1);
const years = [...new Set(tr.map(t => yearOf(t.t)))].sort();
console.log(`${tr.length} 筆交易（${START} 起），${Object.keys(flows).length} 檔有法人資料\n`);
for (const [name, fn] of FILTERS) {
  const x = tr.filter(t => fn(t.f)), st = S.stats(x), a = S.stats(x.filter(t => t.T <= SPLIT)), b = S.stats(x.filter(t => t.t >= SPLIT));
  console.log(`${name}\n  ${st.n} 筆｜平均 ${f(st.avg)}｜勝率 ${(st.win * 100).toFixed(0)}%｜t ${st.t.toFixed(1)}｜月 t ${monthT(x).toFixed(1)}｜2021 前 ${f(a.avg)}（${a.n}）｜2022 起 ${f(b.avg)}（${b.n}）`);
  console.log('  ' + years.map(y => `${y} ${f(S.stats(x.filter(t => yearOf(t.t) === y)).avg)}`).join('  '));
}
