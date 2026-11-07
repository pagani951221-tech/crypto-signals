// 研究九：台股規則（tw-rule.js）加上月營收濾網，會不會更好？
// 月營收來自公開資訊觀測站每月彙總表；M 月營收最晚 M+1 月 10 日公布，所以 11 日起才拿來用（不偷看未來）。
// 濾網事先定好、只測幾種，避免挑到運氣：最新月營收年增 > 0 ／ > 20%、近 3 個月營收年增 > 0 ／ > 20%、最新月營收創 12 個月新高。
// 用法：node research9.js 日線快取.json 營收快取.json（日線可用 tw-data.js 的 bars、營收用 revenue 下載後存檔；格式見下）
//   日線：[{ code, b: [[t, o, h, l, c, 成交金額], …] }]；營收：{ code: { 'YYYY-MM': [當月營收, 年增%] } }
// 注意：彙總表是現在重新產生的版本，事後更正過的營收會混進來；只有目前仍上市櫃的股票。
const fs = require('fs');
const S = require('./strategy.js');
const R = require('./tw-rule.js');

const yearOf = t => new Date(t).getUTCFullYear();
const { features } = R;

function monthT(tr) {
  const g = {};
  for (const t of tr) { const k = new Date(t.t).toISOString().slice(0, 7); (g[k] ||= []).push(t.ret); }
  const m = Object.values(g).map(a => a.reduce((s, v) => s + v, 0) / a.length);
  const avg = m.reduce((s, v) => s + v, 0) / m.length, sd = Math.sqrt(m.reduce((s, v) => s + (v - avg) ** 2, 0) / (m.length - 1));
  return sd ? avg / sd * Math.sqrt(m.length) : 0;
}

const FILTERS = [
  ['不加濾網（現在的規則）', () => true],
  ['有營收資料', f => !!f],
  ['最新月營收年增 > 0', f => f && f.yoy1 > 0],
  ['最新月營收年增 > 20%', f => f && f.yoy1 > 20],
  ['近 3 個月營收年增 > 0', f => f && f.yoy3 > 0],
  ['近 3 個月營收年增 > 20%', f => f && f.yoy3 > 20],
  ['最新月營收創 12 個月新高', f => f && f.high12],
  ['近 3 個月年增 > 0 且創 12 個月新高', f => f && f.yoy3 > 0 && f.high12],
  ['（對照）近 3 個月營收年減', f => f && f.yoy3 != null && f.yoy3 <= 0],
];

const bars = JSON.parse(fs.readFileSync(process.argv[2])), rev = JSON.parse(fs.readFileSync(process.argv[3]));
// 先跑不加濾網的規則，再依進場前一天（訊號日）的營收分組；最後一段是把濾網放進規則裡實際跑（擋掉的訊號不佔用部位）
const all = [], inRule = [];
for (const s of bars) {
  const b = s.b.map(([t, o, h, l, c, val]) => ({ t, o, h, l, c, val }));
  for (const t of R.run(b).trades) all.push({ ...t, f: features(rev[s.code], b[t.in - 1].t) });
  inRule.push(...R.run(b, rev[s.code] || {}).trades);
}
const tr = all.filter(t => yearOf(t.t) >= 2016);
const f = v => (v >= 0 ? '+' : '') + (v * 100).toFixed(2) + '%';
const SPLIT = Date.UTC(2022, 0, 1);
const years = [...new Set(tr.map(t => yearOf(t.t)))].sort();
console.log(`${tr.length} 筆交易（2016 年起），${tr.filter(t => t.f).length} 筆有營收資料\n`);
for (const [name, fn] of FILTERS) {
  const x = tr.filter(t => fn(t.f)), st = S.stats(x), a = S.stats(x.filter(t => t.T <= SPLIT)), b = S.stats(x.filter(t => t.t >= SPLIT));
  console.log(`${name}\n  ${st.n} 筆｜平均 ${f(st.avg)}｜勝率 ${(st.win * 100).toFixed(0)}%｜t ${st.t.toFixed(1)}｜月 t ${monthT(x).toFixed(1)}｜2021 前 ${f(a.avg)}（${a.n}）｜2022 起 ${f(b.avg)}（${b.n}）`);
  console.log('  ' + years.map(y => `${y} ${f(S.stats(x.filter(t => yearOf(t.t) === y)).avg)}`).join('  '));
}
const x = inRule.filter(t => yearOf(t.t) >= 2016), st = S.stats(x), a = S.stats(x.filter(t => t.T <= SPLIT)), b = S.stats(x.filter(t => t.t >= SPLIT));
console.log(`
實際規則（tw-rule.js，營收濾網放在規則裡）
  ${st.n} 筆｜平均 ${f(st.avg)}｜勝率 ${(st.win * 100).toFixed(0)}%｜t ${st.t.toFixed(1)}｜月 t ${monthT(x).toFixed(1)}｜2021 前 ${f(a.avg)}（${a.n}）｜2022 起 ${f(b.avg)}（${b.n}）`);
console.log('  ' + years.map(y => `${y} ${f(S.stats(x.filter(t => yearOf(t.t) === y)).avg)}`).join('  '));
