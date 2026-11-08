// 台股專用規則（研究八選出）：收盤創 52 週新高、且當天成交金額是近 20 天平均的 2 倍以上，隔天開盤買進。
// 出場：盤中碰到止損（進場價 − 3 ATR）、收盤跌破 50 日均線、或持有滿 60 個交易日。
// 進場當下近 20 天平均每天成交要 ≥ 1,000 萬元，太小的股票價差與滑價會吃掉利潤。
// 營收濾網（研究九）：當下已公布的最新月營收要創 12 個月新高。M 月營收最晚 M+1 月 10 日公布，11 日起才算數。
const S = require('./strategy.js');
const { TW_COST } = require('./tw-data.js');

const MIN_LIQ = 1e7, HOLD = 60, SL = 3, WARM = 250;
const NAME = '收盤創 52 週新高 ＋ 成交金額放大到近 20 天平均的 2 倍以上 ＋ 最新月營收創 12 個月新高';

const ymAdd = (ym, k) => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m - 1 + k, 1)).toISOString().slice(0, 7); };
// 日期 t（台灣時間）當下已公布的最新營收月份
const latestYm = t => { const d = new Date(t + 8 * 36e5); return ymAdd(d.toISOString().slice(0, 7), d.getUTCDate() >= 11 ? -1 : -2); };
// rev＝這檔股票的 { 'YYYY-MM': [營收, 年增%] }；沒資料回傳 null
function features(rev, t) {
  if (!rev) return null;
  const ym = latestYm(t), cur = rev[ym];
  if (!cur || !(cur[0] > 0)) return null;
  const sum = (k0, n) => { let s = 0; for (let k = 0; k < n; k++) { const v = rev[ymAdd(ym, k0 - k)]; if (!v || v[0] == null) return null; s += v[0]; } return s; };
  const a = sum(0, 3), b = sum(-12, 3);
  const prev = Array.from({ length: 11 }, (_, k) => rev[ymAdd(ym, -1 - k)]?.[0]);
  return { ym, rev: cur[0], yoy1: cur[1], yoy3: a && b > 0 ? (a / b - 1) * 100 : null, high12: prev.every(v => v != null) && cur[0] >= Math.max(...prev) };
}

function prep(b) {
  const x = S.indicators(b);
  x.liq = b.map((_, i) => i < 20 ? 0 : b.slice(i - 20, i).reduce((s, v) => s + v.val, 0) / 20);
  x.hh250 = b.map((_, i) => i < 250 ? null : Math.max(...b.slice(i - 250, i).map(v => v.h)));
  x.entry = b.map((v, i) => i >= WARM && x.c[i] > x.hh250[i] && v.val > 2 * x.liq[i]);
  return x;
}

// 和 strategy.js 的 backtest 同樣的格式：trades、state（wait／enter／hold）、pos
// rev 不傳（undefined）＝不用營收濾網，研究對照用；傳了但沒資料＝不進場
// opt（研究十一用，平常不傳）：hold 最多持有天數、sl 止損 ATR 倍數、ma 跌破幾日均線出場（0＝不用）、trail 從進場後最高收盤回落幾 ATR 出場（0＝不用）
function run(b, rev, opt = {}) {
  const { hold = HOLD, sl = SL, ma: maN = 50, trail = 0 } = opt;
  const x = prep(b), trades = [], last = b.length - 1;
  const maLine = maN === 50 ? x.sma50 : maN ? x.c.map((_, i) => i < maN - 1 ? NaN : x.c.slice(i - maN + 1, i + 1).reduce((a, v) => a + v, 0) / maN) : null;
  const open = (i, px) => ({ in: i + 1, px, stop: px - sl * x.atr[i], target: null, top: px });
  let p = null, state = 'wait';
  for (let i = WARM; i <= last; i++) {
    if (p) {
      const hs = b[i].l <= p.stop, time = i - p.in + 1 >= hold;
      p.top = Math.max(p.top, x.c[i]);
      const ma = (maLine && x.c[i] < maLine[i]) || (trail > 0 && x.c[i] < p.top - trail * x.atr[i]);
      const out = hs ? Math.min(b[i].o, p.stop) : ma || time ? b[i].c : null;
      if (out !== null) {
        trades.push({ in: p.in, out: i, t: b[p.in].t, T: b[i].t + 864e5, ret: out / p.px - 1 - TW_COST,
          why: hs ? 'stop' : ma ? 'ma' : 'time', px: p.px, stop: p.stop, target: null, exit: out });
        p = null;
      }
    }
    // 創新高要是「剛成立」：前一天不能也是訊號
    if (!p && x.entry[i] && !x.entry[i - 1] && x.liq[i] >= MIN_LIQ && (rev === undefined || features(rev, b[i].t)?.high12)) {
      if (i === last) { state = 'enter'; p = open(i, b[i].c); }
      else p = open(i, b[i + 1].o);
    }
  }
  if (p && state !== 'enter') state = 'hold';
  return { trades, state, pos: p, x };
}

// 持有天數：整體與各種出場方式的中位數
function holdStats(trades) {
  const med = a => { if (!a.length) return null; const s = [...a].sort((p, q) => p - q), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const len = t => t.out - t.in + 1, by = w => trades.filter(t => t.why === w);
  return { n: trades.length, med: med(trades.map(len)), stop: med(by('stop').map(len)), ma: med(by('ma').map(len)),
    timeShare: trades.length ? by('time').length / trades.length : 0 };
}

module.exports = { MIN_LIQ, HOLD, SL, NAME, run, holdStats, features, latestYm, ymAdd };

// node tw-rule.js：用一段假資料檢查進場、跌破 50 均線出場
if (require.main === module) {
  const assert = require('assert');
  const b = [];
  for (let i = 0; i < 400; i++) {
    const c = i < 300 ? 100 + Math.sin(i / 5) : i < 330 ? 102 + (i - 300) : 131 - (i - 330) * 2;
    b.push({ t: i * 864e5, o: c, h: c + 0.5, l: c - 0.5, c, val: i === 300 ? 1e9 : 2e8 });
  }
  const r = run(b);
  assert.strictEqual(r.trades.length, 1);
  assert.strictEqual(r.trades[0].in, 301);
  assert.strictEqual(r.trades[0].why, 'ma');
  assert(r.trades[0].ret > 0);
  // 營收：11 日起才用上個月；創 12 個月新高才進場
  assert.strictEqual(latestYm(Date.UTC(2024, 2, 10, 12)), '2024-01');
  assert.strictEqual(latestYm(Date.UTC(2024, 2, 11, 12)), '2024-02');
  const t300 = b[300].t; // 1970-10-28 → 最新可用 1970-09
  const ok = {}; for (let k = 0; k < 13; k++) ok[ymAdd('1970-09', -k)] = [k === 0 ? 200 : 100, 10];
  assert.strictEqual(features(ok, t300).high12, true);
  assert.strictEqual(run(b, ok).trades.length, 1);
  assert.strictEqual(run(b, { ...ok, '1970-09': [50, -10] }).trades.length, 0);
  assert.strictEqual(run(b, {}).trades.length, 0);
  console.log('tw-rule 自我檢查通過', r.trades[0]);
}
