// 研究十四：少了下市股票，回測會偏高多少？（倖存者偏差）
// Yahoo 抓不到下市股票，所以改用證交所 MI_INDEX、櫃買中心 otc 每日全部股票收盤行情（2017 年起，含後來下市的）自己組日線。
// 這份資料沒有還原權息（除息日看起來像下跌），下市與仍上市的股票用同一份資料比，差多少就是下市股票造成的。
// 公開資訊觀測站的月營收彙總表是現在重新產生的，查不到下市公司，所以只能測「不加營收濾網」的版本。
// 下市時還持有的部位，以最後一天收盤結算。
// 用法：node research14.js 行情資料夾（內含 twse/、tpex/，每天一檔 { 代號: [開, 高, 低, 收, 成交金額, 名稱] }）
const fs = require('fs');
const S = require('./strategy.js');
const R = require('./tw-rule.js');
const { TW_COST } = require('./tw-data.js');

const dir = process.argv[2];
const files = {};
for (const m of ['twse', 'tpex']) for (const f of fs.readdirSync(`${dir}/${m}`)) (files[f.slice(0, 10)] ||= []).push(`${dir}/${m}/${f}`);
const dates = Object.keys(files).sort();
const bars = {}, names = {};
for (const d of dates) {
  const t = Date.parse(d + 'T01:00:00Z');
  for (const f of files[d]) for (const [c, v] of Object.entries(JSON.parse(fs.readFileSync(f)))) {
    if (!(v[0] > 0 && v[1] > 0 && v[2] > 0)) continue;
    (bars[c] ||= []).push({ t, o: v[0], h: v[1], l: v[2], c: v[3], val: v[4] }); names[c] = v[5];
  }
}
const lastT = Date.parse(dates.at(-1) + 'T01:00:00Z');
const yearOf = t => new Date(t).getUTCFullYear();
const res = { alive: [], dead: [] }, deadInfo = [];
for (const [c, b] of Object.entries(bars)) {
  if (b.length < 300) continue;
  const dead = b.at(-1).t < lastT - 10 * 864e5;
  const r = R.run(b);
  const tr = [...r.trades];
  if (dead && r.pos && r.pos.in < b.length) tr.push({ t: b[r.pos.in].t, T: b.at(-1).t, ret: b.at(-1).c / r.pos.px - 1 - TW_COST, why: 'delist' });
  res[dead ? 'dead' : 'alive'].push(...tr);
  if (dead) deadInfo.push({ c, n: tr.length, last: new Date(b.at(-1).t).toISOString().slice(0, 10) });
}
const f = v => (v >= 0 ? '+' : '') + (v * 100).toFixed(2) + '%';
const line = (name, tr) => { const s = S.stats(tr), a = S.stats(tr.filter(t => yearOf(t.t) < 2022)), b = S.stats(tr.filter(t => yearOf(t.t) >= 2022));
  console.log(`${name}\n  ${s.n} 筆｜平均 ${f(s.avg)}｜勝率 ${(s.win * 100).toFixed(0)}%｜t ${s.t.toFixed(1)}｜2021 前 ${f(a.avg)}（${a.n}）｜2022 起 ${f(b.avg)}（${b.n}）`);
  console.log('  ' + [...new Set(tr.map(t => yearOf(t.t)))].sort().map(y => `${y} ${f(S.stats(tr.filter(t => yearOf(t.t) === y)).avg)}`).join('  ')); };
console.log(`${dates[0]}～${dates.at(-1)}，${Object.keys(bars).length} 檔，其中下市（最後交易日早於 10 天前）${deadInfo.length} 檔，有交易的 ${deadInfo.filter(d => d.n).length} 檔\n`);
console.log('規則不加營收濾網（下市公司沒有營收資料），日線未還原權息：');
line('只有目前仍上市櫃的股票（現在回測的情況）', res.alive);
line('加上已下市的股票', [...res.alive, ...res.dead]);
line('下市股票自己的交易', res.dead);
const dl = res.dead.filter(t => t.why === 'delist');
console.log(`  其中下市時還持有、以最後收盤結算的 ${dl.length} 筆，平均 ${f(S.stats(dl).avg)}`);
