// 台股專用規則（研究八選出）：收盤創 52 週新高、且當天成交金額是近 20 天平均的 2 倍以上，隔天開盤買進。
// 出場：盤中碰到止損（進場價 − 3 ATR）、收盤跌破 50 日均線、或持有滿 60 個交易日。
// 進場當下近 20 天平均每天成交要 ≥ 1,000 萬元，太小的股票價差與滑價會吃掉利潤。
const S = require('./strategy.js');
const { TW_COST } = require('./tw-data.js');

const MIN_LIQ = 1e7, HOLD = 60, SL = 3, WARM = 250;
const NAME = '收盤創 52 週新高 ＋ 成交金額放大到近 20 天平均的 2 倍以上';

function prep(b) {
  const x = S.indicators(b);
  x.liq = b.map((_, i) => i < 20 ? 0 : b.slice(i - 20, i).reduce((s, v) => s + v.val, 0) / 20);
  x.hh250 = b.map((_, i) => i < 250 ? null : Math.max(...b.slice(i - 250, i).map(v => v.h)));
  x.entry = b.map((v, i) => i >= WARM && x.c[i] > x.hh250[i] && v.val > 2 * x.liq[i]);
  return x;
}

// 和 strategy.js 的 backtest 同樣的格式：trades、state（wait／enter／hold）、pos
function run(b) {
  const x = prep(b), trades = [], last = b.length - 1;
  const open = (i, px) => ({ in: i + 1, px, stop: px - SL * x.atr[i], target: null });
  let p = null, state = 'wait';
  for (let i = WARM; i <= last; i++) {
    if (p) {
      const hs = b[i].l <= p.stop, ma = x.c[i] < x.sma50[i], time = i - p.in + 1 >= HOLD;
      const out = hs ? Math.min(b[i].o, p.stop) : ma || time ? b[i].c : null;
      if (out !== null) {
        trades.push({ in: p.in, out: i, t: b[p.in].t, T: b[i].t + 864e5, ret: out / p.px - 1 - TW_COST,
          why: hs ? 'stop' : ma ? 'ma' : 'time', px: p.px, stop: p.stop, target: null, exit: out });
        p = null;
      }
    }
    // 創新高要是「剛成立」：前一天不能也是訊號
    if (!p && x.entry[i] && !x.entry[i - 1] && x.liq[i] >= MIN_LIQ) {
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

module.exports = { MIN_LIQ, HOLD, SL, NAME, run, holdStats };

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
  console.log('tw-rule 自我檢查通過', r.trades[0]);
}
