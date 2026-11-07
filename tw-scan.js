// 台股（實驗性）：每個交易日收盤後計算，寫入 tw.json 給網頁，並傳 Telegram。由 .github/workflows/tw.yml 執行。
// 本機：node tw-scan.js（沒設定 Telegram 時只印出訊息）；TEST=true 沒有事件也傳一則摘要
// 範圍：上市＋上櫃全部普通股。規則是台股專用的（見 tw-rule.js、研究八），和加密貨幣不同
const fs = require('fs');
const S = require('./strategy.js');
const R = require('./tw-rule.js');
const { send } = require('./telegram.js');
const { TW_COST, universeAll, bars, addWeekdays } = require('./tw-data.js');

const PAGE = 'https://pagani951221-tech.github.io/crypto-signals/';
const pct = v => (v >= 0 ? '+' : '−') + Math.abs(v * 100).toFixed(1) + '%';
const price = v => +v.toPrecision(5);
const r4 = v => +v.toPrecision(6);
const day = t => new Date(t).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric' });
const CLOSE = 4.5 * 36e5; // 09:00 開盤到 13:30 收盤
// stats 的 Infinity 存成 JSON 會變 null，先換掉
const clean = st => ({ ...st, payoff: Number.isFinite(st.payoff) ? st.payoff : null });

(async () => {
  const uni = await universeAll();
  let done = 0;
  const data = (await S.pool(uni, 6, async u => {
    if (++done % 200 === 0) console.log(`讀取中 ${done} / ${uni.length}`);
    try { const b = await bars(u.code, u.mkt); return b.length >= 500 ? { ...u, b } : null; } catch { return null; }
  })).filter(Boolean);
  for (const d of data) {
    const last20 = d.b.slice(-20);
    d.liq = last20.reduce((s, x) => s + x.val, 0) / last20.length;
    d.ok = d.liq >= R.MIN_LIQ;
    d.r = R.run(d.b);
    d.r.own = S.stats(d.r.trades);
  }
  // 進場時成交量不足的已在規則裡排除，所以全部股票的交易一起驗證
  const val = S.walkForward(data.map(d => d.r));
  const on = new Set(val.rows.filter(r => r.on).map(r => r.y));
  const trs = data.flatMap(d => d.r.trades).filter(t => on.has(new Date(t.t).getUTCFullYear()));
  const rs = trs.map(t => t.ret / (Math.abs(t.px - t.stop) / t.px));
  const hold = R.holdStats(trs);
  const lastT = Math.max(...data.map(d => d.b.at(-1).t));

  const stocks = data.map(d => {
    const { b, r } = d, p = r.pos, ma50 = r.x.sma50;
    const r3 = v => +v.toFixed(4);
    const o = { code: d.code, name: d.name, mkt: d.mkt, close: price(b.at(-1).raw), lastT: b.at(-1).t, state: r.state, liq: Math.round(d.liq / 1e4),
      own: { n: r.own.n, win: r3(r.own.win), avg: r3(r.own.avg), worst: r3(r.own.worst), payoff: Number.isFinite(r.own.payoff) ? r3(r.own.payoff) : null } };
    if (!d.ok) o.illiquid = true;
    // 還原權息價與實際價只在過去不同；最新一根相同，所以進場、止損、50 日均線直接用
    if (p) {
      const entryT = p.in < b.length ? b[p.in].t : addWeekdays(b.at(-1).t, 1);
      o.pos = { px: price(p.px), stop: price(p.stop), target: null, ma: price(ma50.at(-1)), t: entryT,
        held: p.in < b.length ? b.length - p.in : null, deadline: addWeekdays(entryT, R.HOLD - 1) + CLOSE };
    }
    const t = r.trades.at(-1);
    if (t && t.out === b.length - 1) o.closed = { why: t.why, px: price(t.px), exit: price(t.exit), stop: price(t.stop) };
    // 有部位的才附 K 線（160 根＋50 日均線）給網頁畫圖，檔案才不會太大
    if (p && val.pass && S.coinOk(r.own) && d.ok)
      o.chart = b.slice(-160).map((x, i) => [x.t, r4(x.o), r4(x.h), r4(x.l), r4(x.c), r4(ma50[b.length - 160 + i])]);
    return o;
  });

  fs.writeFileSync('tw.json', JSON.stringify({
    updated: new Date().toISOString(), lastT, n: data.length, nValid: data.filter(d => d.ok).length, minLiq: R.MIN_LIQ, cost: TW_COST,
    rule: { name: R.NAME, sl: R.SL, hold: R.HOLD },
    val: { pass: val.pass, rows: val.rows.map(r => ({ ...r, st: clean(r.st) })), wf: clean(val.wf), recent: clean(val.recent), total: clean(val.total),
      avgR: rs.length ? rs.reduce((s, v) => s + v, 0) / rs.length : 0, hold },
    stocks,
  }) + '\n');
  const live = stocks.filter(s => s.pos && S.coinOk(s.own) && !s.illiquid && val.pass);
  const f2 = v => (v * 100).toFixed(2) + '%';
  console.log(`驗證：全部 ${val.total.n} 筆 平均 ${f2(val.total.avg)} t ${val.total.t.toFixed(1)}｜滾動 ${val.wf.n} 筆 平均 ${f2(val.wf.avg)} t ${val.wf.t.toFixed(1)}｜近 12 月 ${f2(val.recent.avg)}`);
  console.log('逐年：' + val.rows.map(r => `${r.y}${r.on ? '' : '(不允許)'} ${f2(r.st.avg)}/${r.st.n}`).join('  '));
  console.log(`持有：通常 ${hold.med} 天（止損 ${hold.stop}、跌破均線 ${hold.ma}，${(hold.timeShare * 100).toFixed(0)}% 到期）`);
  console.log(`台股：${data.length} 檔；規則${val.pass ? '通過' : '未通過'}；新訊號 ${live.filter(s => s.state === 'enter').length}、持有中 ${live.filter(s => s.state === 'hold').length}`);

  // Telegram：只在今天有新收盤資料時傳（國定假日資料不會更新，避免重複通知）
  const fresh = day(lastT) === day(Date.now());
  const test = process.env.TEST === 'true';
  if (!val.pass || (!fresh && !test)) return;
  const name = s => `${s.name}（${s.code}）`;
  const entries = live.filter(s => s.state === 'enter');
  const exits = stocks.filter(s => s.closed && S.coinOk(s.own) && !s.illiquid);
  const WHY = { stop: s => `今天碰到止損 ${s.closed.stop}，照規則出場。`, ma: s => `今天收盤 ${s.closed.exit} 跌破 50 日均線，照規則出場。`,
    time: s => `持有滿 ${R.HOLD} 個交易日，規則以今天收盤 ${s.closed.exit} 出場。` };
  const blocks = [
    ...entries.map(s => [`${name(s)}　做多`,
      `參考進場 ${s.pos.px}（今天收盤），明天開盤附近買進`,
      `止損 ${s.pos.stop}（${pct(s.pos.stop / s.pos.px - 1)}），盤中碰到就出場`,
      `沒有固定止盈：收盤跌破 50 日均線（目前 ${s.pos.ma}）就出場`,
      `預計持有：通常 ${hold.med} 個交易日，最晚約 ${day(s.pos.deadline)} 收盤出場`,
      `本股歷史 ${s.own.n} 筆，勝率 ${(s.own.win * 100).toFixed(0)}%，平均每筆 ${pct(s.own.avg)}`].join('\n')),
    ...exits.map(s => `${name(s)}　做多部位（進場 ${s.closed.px}）\n` + WHY[s.closed.why](s)),
  ];
  if (!blocks.length && !test) return;
  const head = test ? `測試訊息：台股通知正常。\n今天新的進場訊號 ${entries.length} 檔、出場 ${exits.length} 檔。` : '台股（實驗性）收盤：今天要處理的事';
  await send([head, ...blocks].join('\n\n')
    + `\n\n台股是實驗性質：勝率約三成，靠少數大賺的單撐起平均，連續停損很正常。\n頁面：${PAGE}\n歷史回測不保證未來獲利，這不是投資建議。`);
})().catch(e => { console.error(e); process.exit(1); });
