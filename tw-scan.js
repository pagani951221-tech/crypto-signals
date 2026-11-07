// 台股（實驗性）：每個交易日收盤後計算，寫入 tw.json 給網頁，並傳 Telegram。由 .github/workflows/tw.yml 執行。
// 本機：node tw-scan.js（沒設定 Telegram 時只印出訊息）；TEST=true 沒有事件也傳一則摘要
// 規則與加密貨幣相同（只做多、止損 3 ATR、止盈 6 ATR、最多 20 個交易日），成本改用台股的手續費與證交稅
const fs = require('fs');
const S = require('./strategy.js');
const { send } = require('./telegram.js');
const { TW_COST, ADJ, universe, bars, addWeekdays } = require('./tw-data.js');

const N = 150, EX = S.exitFor(2), PAGE = 'https://pagani951221-tech.github.io/crypto-signals/';
const pct = v => (v >= 0 ? '+' : '−') + Math.abs(v * 100).toFixed(1) + '%';
const price = v => +v.toPrecision(5);
const r4 = v => +v.toPrecision(6);
const day = t => new Date(t).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric' });
const CLOSE = 4.5 * 36e5; // 09:00 開盤到 13:30 收盤
// stats 的 Infinity 存成 JSON 會變 null，先換掉
const clean = st => ({ ...st, payoff: Number.isFinite(st.payoff) ? st.payoff : null });

(async () => {
  const uni = await universe(N);
  const data = (await S.pool(uni, 4, async u => {
    try { const b = await bars(u.code); return b.length >= 500 ? { ...u, b } : null; } catch { return null; }
  })).filter(Boolean);
  for (const d of data) {
    const r = S.runRule(d.b, 1, S.fundingFn([]), EX);
    r.trades = r.trades.map(t => ({ ...t, ret: t.ret + ADJ }));
    r.own = S.stats(r.trades);
    d.r = r;
  }
  const val = S.walkForward(data.map(d => d.r));
  const on = new Set(val.rows.filter(r => r.on).map(r => r.y));
  const trs = data.flatMap(d => d.r.trades).filter(t => on.has(new Date(t.t).getUTCFullYear()));
  const rs = trs.map(t => t.ret / (Math.abs(t.px - t.stop) / t.px));
  const lastT = Math.max(...data.map(d => d.b.at(-1).t));

  const stocks = data.map(d => {
    const { b, r } = d, p = r.pos;
    const o = { code: d.code, name: d.name, close: price(b.at(-1).raw), lastT: b.at(-1).t, state: r.state,
      own: { n: r.own.n, win: r.own.win, avg: r.own.avg, worst: r.own.worst, payoff: Number.isFinite(r.own.payoff) ? r.own.payoff : null } };
    // 還原權息價與實際價只在過去不同；最新一根相同，所以進場、止損、止盈直接用
    if (p) {
      const entryT = p.in < b.length ? b[p.in].t : addWeekdays(b.at(-1).t, 1);
      o.pos = { px: price(p.px), stop: price(p.stop), target: price(p.target), t: entryT,
        held: p.in < b.length ? b.length - p.in : null, deadline: addWeekdays(entryT, S.MAX_HOLD - 1) + CLOSE };
    }
    const t = r.trades.at(-1);
    if (t && t.out === b.length - 1) o.closed = { why: t.why, px: price(t.px), exit: price(t.exit), stop: price(t.stop), target: price(t.target) };
    // 有部位的才附 K 線（160 根）給網頁畫圖，檔案才不會太大
    if (p && val.pass && S.coinOk(r.own)) {
      const ma = S.sma(b.map(x => x.c), 200);
      o.chart = b.slice(-160).map((x, i) => [x.t, r4(x.o), r4(x.h), r4(x.l), r4(x.c), ma[b.length - 160 + i] == null ? null : r4(ma[b.length - 160 + i])]);
    }
    return o;
  });

  fs.writeFileSync('tw.json', JSON.stringify({
    updated: new Date().toISOString(), lastT, n: data.length, cost: TW_COST, rr: 2,
    val: { pass: val.pass, rows: val.rows.map(r => ({ ...r, st: clean(r.st) })), wf: clean(val.wf), recent: clean(val.recent), total: clean(val.total),
      avgR: rs.length ? rs.reduce((s, v) => s + v, 0) / rs.length : 0, hold: S.holdStats(trs) },
    stocks,
  }) + '\n');
  const live = stocks.filter(s => s.pos && S.coinOk(s.own) && val.pass);
  console.log(`台股：${data.length} 檔；規則${val.pass ? '通過' : '未通過'}；新訊號 ${live.filter(s => s.state === 'enter').length}、持有中 ${live.filter(s => s.state === 'hold').length}`);

  // Telegram：只在今天有新收盤資料時傳（國定假日資料不會更新，避免重複通知）
  const fresh = day(lastT) === day(Date.now());
  const test = process.env.TEST === 'true';
  if (!val.pass || (!fresh && !test)) return;
  const name = s => `${s.name}（${s.code}）`;
  const entries = live.filter(s => s.state === 'enter');
  const exits = stocks.filter(s => s.closed && S.coinOk(s.own));
  const blocks = [
    ...entries.map(s => [`${name(s)}　做多`,
      `參考進場 ${s.pos.px}（今天收盤），明天開盤附近買進`,
      `止損 ${s.pos.stop}（${pct(s.pos.stop / s.pos.px - 1)}）`,
      `止盈 ${s.pos.target}（${pct(s.pos.target / s.pos.px - 1)}）`,
      `預計持有：通常 ${val.pass ? S.holdStats(trs).med : '—'} 個交易日，最晚約 ${day(s.pos.deadline)} 收盤出場`,
      `本股歷史 ${s.own.n} 筆，勝率 ${(s.own.win * 100).toFixed(0)}%，平均每筆 ${pct(s.own.avg)}`].join('\n')),
    ...exits.map(s => `${name(s)}　做多部位（進場 ${s.closed.px}）\n`
      + (s.closed.why === 'time' ? `持有滿 ${S.MAX_HOLD} 個交易日，規則以今天收盤 ${s.closed.exit} 出場。`
        : `今天碰到${s.closed.why === 'stop' ? '止損' : '止盈'} ${s.closed.why === 'stop' ? s.closed.stop : s.closed.target}，照規則出場。`)),
  ];
  if (!blocks.length && !test) return;
  const head = test ? `測試訊息：台股通知正常。\n今天新的進場訊號 ${entries.length} 檔、出場 ${exits.length} 檔。` : '台股（實驗性）收盤：今天要處理的事';
  await send([head, ...blocks].join('\n\n')
    + `\n\n台股是實驗性質：規則只在 2024 年起通過驗證，每筆平均只比成本多一點。\n頁面：${PAGE}\n歷史回測不保證未來獲利，這不是投資建議。`);
})().catch(e => { console.error(e); process.exit(1); });
