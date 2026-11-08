// 台股（實驗性）：每個交易日收盤後計算，寫入 tw.json 給網頁，並傳 Telegram。由 .github/workflows/tw.yml 執行。
// 本機：node tw-scan.js（沒設定 Telegram 時只印出訊息）；TEST=true 沒有事件也傳一則摘要
// 範圍：上市＋上櫃全部普通股。規則是台股專用的（見 tw-rule.js、研究八），和加密貨幣不同
const fs = require('fs');
const S = require('./strategy.js');
const R = require('./tw-rule.js');
const { send } = require('./telegram.js');
const { TW_COST, universeAll, bars, revenue, flows, disposals, attention, taiex, addWeekdays } = require('./tw-data.js');

const REV = '.state/tw-rev.json';
const LOG = 'tw-log.json'; // 上線後真實發出的訊號，只新增不改寫（規則以後改了，舊紀錄也不會被重算） // 月營收歷史，由 Actions 快取保存，每天只補抓缺的月份

const PAGE = 'https://pagani951221-tech.github.io/crypto-signals/';
const pct = v => (v >= 0 ? '+' : '−') + Math.abs(v * 100).toFixed(1) + '%';
const price = v => +v.toPrecision(5);
const r4 = v => +v.toPrecision(6);
const day = t => new Date(t).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric' });
const CLOSE = 4.5 * 36e5; // 09:00 開盤到 13:30 收盤
// stats 的 Infinity 存成 JSON 會變 null，先換掉
const clean = st => ({ ...st, payoff: Number.isFinite(st.payoff) ? st.payoff : null });

// 月營收：讀快取，補抓缺的月份；最近 3 個月一律重抓（公司會更正）
async function loadRevenue() {
  let db = {};
  try { db = JSON.parse(fs.readFileSync(REV)); } catch {}
  const have = new Set(Object.values(db).flatMap(o => Object.keys(o))), want = [];
  for (let ym = '2015-01', end = R.latestYm(Date.now()); ym <= end; ym = R.ymAdd(ym, 1)) want.push(ym);
  const months = want.filter((ym, i) => !have.has(ym) || i >= want.length - 3);
  console.log(`月營收：補抓 ${months.length} 個月`);
  for (const [code, m] of Object.entries(await revenue(months))) db[code] = { ...db[code], ...m };
  fs.mkdirSync('.state', { recursive: true });
  fs.writeFileSync(REV, JSON.stringify(db));
  return db;
}

(async () => {
  const [uni, rev] = await Promise.all([universeAll(), loadRevenue()]);
  let done = 0;
  const data = (await S.pool(uni, 6, async u => {
    if (++done % 200 === 0) console.log(`讀取中 ${done} / ${uni.length}`);
    try { const b = await bars(u.code, u.mkt); return b.length >= 500 ? { ...u, b } : null; } catch { return null; }
  })).filter(Boolean);
  // 最近 5 個已公布的交易日法人買賣超（今天的下午 4 點才出來，14:40 跑時通常拿不到）
  const ref = data.find(d => d.code === '2330') || data[0], ymd = t => new Date(t + 8 * 36e5).toISOString().slice(0, 10);
  const fl = [];
  for (const x of ref.b.slice(-7).reverse()) { if (fl.length === 5) break; const f = await flows(ymd(x.t)); if (f) fl.push([ymd(x.t), f]); }
  console.log(`法人買賣超：${fl.map(f => f[0]).join('、') || '讀不到'}`);
  // 處置股：最近一個月公布、今天以後仍有效（含明天才開始）的處置
  const today = ymd(Date.now()), dispOf = {};
  for (const d of (await disposals(ymd(Date.now() - 31 * 864e5), today).catch(() => [])).filter(d => d.end >= today).sort((a, b) => a.start.localeCompare(b.start)))
    dispOf[d.code] = [d.start, d.end, d.minutes, d.all ? 1 : 0];
  console.log(`處置股：${Object.keys(dispOf).length} 檔`);
  // 注意股：最近 10 個交易日（含今天，若已公布）被公布注意幾次
  const d10 = ymd(ref.b.at(-10).t), attOf = await attention(d10, today).catch(() => ({}));
  console.log(`注意股：最近 10 個交易日有 ${Object.keys(attOf).length} 檔`);
  // 大盤與市場寬度（研究十七：轉弱就出場並沒有比較好，所以只顯示給人參考）
  const avg = (a, n) => a.slice(-n).reduce((s, v) => s + v, 0) / n;
  let market = null;
  try {
    const ix = (await taiex()).map(x => x.c), live = data.filter(d => d.b.length >= 50);
    market = { c: Math.round(ix.at(-1)), m20: Math.round(avg(ix, 20)), m50: Math.round(avg(ix, 50)), m200: Math.round(avg(ix, 200)),
      off: +(ix.at(-1) / Math.max(...ix.slice(-60)) - 1).toFixed(4), r20: +(ix.at(-1) / ix.at(-21) - 1).toFixed(4),
      breadth: +(live.filter(d => d.b.at(-1).c > avg(d.b.map(x => x.c), 50)).length / live.length).toFixed(3) };
  } catch (e) { console.log('讀不到加權指數', e.message); }
  console.log('大盤：', JSON.stringify(market));
  const flowOf = code => { const v = fl.map(f => f[1][code]).filter(Boolean); return v.length ? [0, 1, 2].map(j => Math.round(v.reduce((s, x) => s + x[j], 0) / 1000)) : null; };
  for (const d of data) {
    const last20 = d.b.slice(-20);
    d.liq = last20.reduce((s, x) => s + x.val, 0) / last20.length;
    d.ok = d.liq >= R.MIN_LIQ;
    d.r = R.run(d.b, rev[d.code] || {}); // 沒有營收資料的不會進場
    d.f = R.features(rev[d.code], Date.now());
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
    const f5 = flowOf(d.code);
    if (f5) o.flow = f5;
    if (attOf[d.code]) o.att = [attOf[d.code].length, attOf[d.code].at(-1)]; // [最近 10 個交易日被注意次數, 最後一次日期]
    if (dispOf[d.code]) o.disp = dispOf[d.code]; // [起, 迄, 每幾分鐘撮合, 是否每筆都要預收款券] // 最近 5 個交易日外資、投信、自營商淨買（張）
    if (d.f) o.rev = [d.f.ym, d.f.yoy1, d.f.high12 ? 1 : 0]; // 最新已公布月營收：月份、年增 %、是否創 12 個月新高
    // 還原權息價與實際價只在過去不同；最新一根相同，所以進場、止損、50 日均線直接用
    // 部位資料（規則本身與保本設定的版本共用）
    const posOf = p => {
      const entryT = p.in < b.length ? b[p.in].t : addWeekdays(b.at(-1).t, 1);
      const q = { px: price(p.px), stop: price(p.stop), target: null, ma: price(ma50.at(-1)), t: entryT,
        held: p.in < b.length ? b.length - p.in : null, deadline: addWeekdays(entryT, R.HOLD - 1) + CLOSE };
      if (p.beOn) { q.beOn = true; q.bePx = price(p.bePx); }
      // 保本線今天才啟動：今天以前的最高收盤還沒到門檻、今天到了（Telegram 提醒用）
      if (p.beOn && p.in < b.length - 1 && Math.max(...b.slice(p.in, -1).map(x => x.c)) < p.px * (1 + p.beLv)) q.beToday = true;
      if (p.re) { q.re = true; q.reTop = price(p.reTop); }
      if (p.in < b.length) { // 轉弱檢查（只給人參考）：收在 20 日均線下、離持有期間最高收盤多遠、近 20 天比大盤強弱
        const cs = b.map(x => x.c), top = Math.max(...cs.slice(p.in));
        q.weak = { below20: cs.at(-1) < avg(cs, 20), off: +(cs.at(-1) / top - 1).toFixed(4), rs: market ? +(cs.at(-1) / cs.at(-21) - 1 - market.r20).toFixed(4) : null };
      }
      return q;
    };
    if (p) o.pos = posOf(p);
    // 網頁「保本出場」設定的各級版本（研究十八～二十）：曾賺到門檻後，盤中碰到成本價且收盤仍在成本以下就出場（近似「收盤前一小時仍在線下」）；保本出場後 60 天內再創新高就重新進場
    for (const lv of [0.1, 0.15, 0.2, 0.3]) {
      const v = R.run(b, rev[d.code] || {}, { be: lv, beAt: 'close', reenter: 'high' }), lt = v.trades.at(-1);
      const closed = lt && lt.out === b.length - 1 ? { why: lt.why, px: price(lt.px), exit: price(lt.exit), stop: price(lt.stop), t: b[lt.in].t } : null;
      if (!v.pos && !v.re && !closed) continue;
      (o.be ||= {})[lv] = { state: v.state, ...(v.pos ? { pos: posOf(v.pos) } : {}), ...(v.re ? { re: { top: price(v.re.top), left: v.re.until - (b.length - 1) } } : {}), ...(closed ? { closed } : {}) };
    }
    // 今天有進場訊號（原規則或任一保本版本）：附上進場與止損的理由
    if (r.state === 'enter' || Object.values(o.be || {}).some(v => v.state === 'enter')) {
      const L = b.length - 1, x = r.x;
      o.why = { hi: price(x.hh250[L]), val: Math.round(b[L].val / 1e6), avg: Math.round(x.liq[L] / 1e6), x: +(b[L].val / x.liq[L]).toFixed(1), atr: +x.atr[L].toPrecision(3), sl: R.SL };
    }
    const t = r.trades.at(-1);
    if (t && t.out === b.length - 1) o.closed = { why: t.why, px: price(t.px), exit: price(t.exit), stop: price(t.stop) };
    // 有部位的才附 K 線（160 根＋50 日均線）給網頁畫圖，檔案才不會太大
    if (p && val.pass && S.coinOk(r.own) && d.ok)
      o.chart = b.slice(-160).map((x, i) => [x.t, r4(x.o), r4(x.h), r4(x.l), r4(x.c), r4(ma50[b.length - 160 + i])]);
    return o;
  });

  // 今年回顧：漲幅前 30 名（還原權息、含息），規則有沒有抓到；只是檢查規則，不是選股建議
  const Y = new Date(lastT + 8 * 36e5).getUTCFullYear(), yr = t => new Date(t + 8 * 36e5).getUTCFullYear();
  const ytdAll = data.map(d => {
    const { b, r } = d, x = r.x, i0 = b.findLastIndex(v => yr(v.t) < Y);
    if (i0 < 0 || i0 === b.length - 1) return null;
    const tr = r.trades.filter(t => t.in > i0), p = r.pos && r.pos.in > i0 ? r.pos : null;
    let why = null; // 沒進場的原因
    if (!tr.length && !p) {
      const sig = []; for (let i = i0 + 1; i < b.length; i++) if (x.entry[i] && !x.entry[i - 1]) sig.push(i);
      const carry = r.trades.some(t => t.in <= i0 && t.out > i0) || (r.pos && r.pos.in <= i0);
      why = carry ? 'carry' : !sig.length ? 'nohigh' : sig.every(i => x.liq[i] < R.MIN_LIQ) ? 'liq' : 'rev';
    }
    return { code: d.code, name: d.name, mkt: d.mkt, ret: b.at(-1).c / b[i0].c - 1, n: tr.length,
      real: tr.length ? tr.reduce((a, t) => a * (1 + t.ret), 1) - 1 : null, open: p ? b.at(-1).c / p.px - 1 : null, why };
  }).filter(Boolean).sort((a, b) => b.ret - a.ret);
  const dbl = ytdAll.filter(o => o.ret >= 1);
  const ytd = { y: Y, n: ytdAll.length, dbl: dbl.length, dblCaught: dbl.filter(o => !o.why).length,
    top: ytdAll.slice(0, 30).map(o => [o.code, o.name, o.mkt, +o.ret.toFixed(4), o.n, o.real == null ? null : +o.real.toFixed(4), o.open == null ? null : +o.open.toFixed(4), o.why]) };
  console.log(`今年回顧：${ytd.n} 檔，漲一倍以上 ${ytd.dbl} 檔，規則今年有進場 ${ytd.dblCaught} 檔`);

  fs.writeFileSync('tw.json', JSON.stringify({
    updated: new Date().toISOString(), lastT, n: data.length, nValid: data.filter(d => d.ok).length, minLiq: R.MIN_LIQ, cost: TW_COST,
    flowDays: fl.map(f => f[0]).reverse(), market,
    ytd,
    rule: { name: R.NAME, sl: R.SL, hold: R.HOLD },
    val: { pass: val.pass, rows: val.rows.map(r => ({ ...r, st: clean(r.st) })), wf: clean(val.wf), recent: clean(val.recent), total: clean(val.total),
      avgR: rs.length ? rs.reduce((s, v) => s + v, 0) / rs.length : 0, hold },
    stocks,
  }) + '\n');
  const live = stocks.filter(s => s.pos && S.coinOk(s.own) && !s.illiquid && val.pass);

  // 真實紀錄：訊號日記下參考價，下一個交易日補上實際開盤價，規則出場時記下出場價。用實際價格（不含之後的股息）
  let log; try { log = JSON.parse(fs.readFileSync(LOG)); } catch { log = { start: ymd(lastT), open: [], closed: [] }; }
  const byCode = Object.fromEntries(data.map(d => [d.code, d]));
  const real = (b, i, v) => price(v * b[i].raw / b[i].c);
  for (const o of [...log.open]) {
    const d = byCode[o.code], b = d?.b, iS = b ? b.findIndex(x => ymd(x.t) === o.sig) : -1;
    if (iS < 0) continue;
    if (o.px == null && iS + 1 < b.length) { o.inDate = ymd(b[iS + 1].t); o.px = real(b, iS + 1, b[iS + 1].o); }
    if (o.px == null) continue;
    const t = d.r.trades.find(t => t.in === iS + 1);
    const done = t ? { outDate: ymd(b[t.out].t), exit: real(b, t.out, t.exit), why: t.why }
      : d.r.pos && d.r.pos.in === iS + 1 ? null : { outDate: ymd(b.at(-1).t), exit: price(b.at(-1).raw), why: 'other' }; // 規則改了或資料修正，用最新收盤結算
    if (!done) continue;
    log.open.splice(log.open.indexOf(o), 1);
    log.closed.push({ ...o, ...done, ret: +(done.exit / o.px - 1 - TW_COST).toFixed(4) });
  }
  for (const s of live.filter(s => s.state === 'enter')) {
    const sig = ymd(s.lastT);
    if (!log.open.some(o => o.code === s.code && o.sig === sig)) log.open.push({ code: s.code, name: s.name, mkt: s.mkt, sig, ref: s.close, stop: s.pos.stop });
  }
  fs.writeFileSync(LOG, JSON.stringify(log, null, 1) + '\n');
  const cl = log.closed;
  const liveRec = { start: log.start, n: cl.length, win: cl.length ? cl.filter(t => t.ret > 0).length / cl.length : 0,
    avg: cl.length ? cl.reduce((a, t) => a + t.ret, 0) / cl.length : 0,
    open: log.open.map(o => ({ ...o, now: byCode[o.code] ? price(byCode[o.code].b.at(-1).raw) : null })), closed: cl.slice(-50).reverse() };
  const twj = JSON.parse(fs.readFileSync('tw.json'));
  twj.live = liveRec;
  fs.writeFileSync('tw.json', JSON.stringify(twj) + '\n');
  console.log(`真實紀錄（${log.start} 起）：已出場 ${cl.length} 筆、持有中 ${log.open.length} 筆`);
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
  // 進場理由：為什麼是今天
  const money = v => v >= 100 ? `${(v / 100).toFixed(1)} 億` : `${(v * 100).toLocaleString()} 萬`;
  const whyLines = s => {
    const w = s.why;
    if (s.pos.re) return [`為什麼今天進場：之前照保本設定出場，今天收盤 ${s.close} 超過前一段最高收盤 ${s.pos.reTop}，代表又回到多頭`];
    if (!w) return [];
    return [`為什麼今天進場：`,
      `・今天收盤 ${s.close} 創 52 週新高（前 52 週最高 ${w.hi}，還原權息價）`,
      `・今天成交 ${money(w.val)}元，是近 20 天平均（${money(w.avg)}元）的 ${w.x} 倍，有大量資金買進`,
      ...(s.rev ? [`・${s.rev[0]} 月營收創 12 個月新高（年增 ${s.rev[1] == null ? '—' : pct(s.rev[1] / 100)}），基本面也在變好`] : [])];
  };
  // Telegram 用的保本設定（Actions 變數 TW_BE，例如 0.1＝曾賺 10%）：有設定時，進出場改照保本版本（含保本出場、再創新高重新進場）
  const BE = process.env.TW_BE ? +process.env.TW_BE : 0;
  const ok = s => S.coinOk(s.own) && !s.illiquid;
  const view = BE ? stocks.map(s => { const v = s.be?.[BE]; return { ...s, state: v?.state ?? 'wait', pos: v?.pos ?? null, closed: v?.closed ?? null }; }) : stocks;
  const entries = view.filter(s => s.state === 'enter' && s.pos && ok(s) && val.pass);
  // 開始用保本設定的那天記在 tw-log.json；只通知你收到過進場訊息的部位（和原規則同一筆，或開始後才進場的）
  if (BE && log.beSince == null) { log.beSince = ymd(lastT); log.beSwitch = true; }
  if (!BE) delete log.beSince;
  fs.writeFileSync(LOG, JSON.stringify(log, null, 1) + '\n');
  const main = code => stocks.find(x => x.code === code);
  const known = s => !BE || s.closed.px === main(s.code)?.pos?.px || s.closed.px === main(s.code)?.closed?.px || ymd(s.closed.t) >= log.beSince;
  const exits = view.filter(s => s.closed && ok(s) && known(s));
  const armed = BE ? view.filter(s => s.pos?.beToday && ok(s)) : [];
  // 第一次改用保本設定：原規則還持有、但照保本設定早已出場的，提醒一次
  const gone = BE && log.beSwitch ? stocks.filter(s => s.pos && s.state === 'hold' && ok(s) && !view.find(v => v.code === s.code)?.pos) : [];
  const WHY = { stop: s => `今天碰到止損 ${s.closed.stop}，照規則出場。`, ma: s => `今天收盤 ${s.closed.exit} 跌破 50 日均線，照規則出場。`,
    time: s => `持有滿 ${R.HOLD} 個交易日，規則以今天收盤 ${s.closed.exit} 出場。`,
    be: s => `今天盤中跌到保本線，收盤 ${s.closed.exit} 仍在線下：照你的保本設定出場（12:30 時若已在線下應已賣出；若當時還在線上，可以等明天再看）。之後 60 個交易日內收盤再創前一段新高，會再通知重新進場。` };
  const blocks = [
    ...entries.map(s => [`${name(s)}　做多${s.pos.re ? '（保本出場後再創新高，重新進場）' : ''}`,
      `參考進場 ${s.pos.px}（今天收盤），明天開盤附近買進；若一字漲停整天買不到就放棄這筆`,
      ...whyLines(s),
      `止損 ${s.pos.stop}（${pct(s.pos.stop / s.pos.px - 1)}），盤中碰到就出場`,
      `為什麼止損在這裡：進場價 − ${s.why?.sl ?? R.SL} 倍 ATR（近 14 天平均每天波動約 ${s.why?.atr ?? '—'} 元）。留 3 倍正常波動的空間，平常震盪不會洗掉你；真的跌到這裡，代表這次突破失敗`,
      `沒有固定止盈：收盤跌破 50 日均線（目前 ${s.pos.ma}）就出場，讓大漲的股票可以一直抱`,
      ...(s.att && !s.disp ? [`注意股：最近 10 個交易日被注意 ${s.att[0]} 次（再累積可能變成處置股，改為分盤撮合、要先存錢）`] : []),
      ...(s.disp ? [`處置股（到 ${s.disp[1].slice(5).replace('-', '/')}）：約每 ${s.disp[2] ?? '幾'} 分鐘撮合一次，${s.disp[3] ? '每筆買進都要先把錢存進券商' : '單筆 10 張或當天累積 30 張以上要先把錢存進券商'}；成交價可能和開盤價差比較多`] : []),
      `新聞：https://tw.stock.yahoo.com/quote/${s.code}.${s.mkt}/news`,
      `預計持有：通常 ${hold.med} 個交易日，最晚約 ${day(s.pos.deadline)} 收盤出場`,
      `本股歷史 ${s.own.n} 筆，勝率 ${(s.own.win * 100).toFixed(0)}%，平均每筆 ${pct(s.own.avg)}`].join('\n')),
    ...exits.map(s => `${name(s)}　做多部位（進場 ${s.closed.px}）\n` + WHY[s.closed.why](s)),
    ...(gone.length ? [`改用保本設定（曾賺 ${BE * 100}%）：以下持股照原規則還在持有，但照保本設定之前已經跌回成本出場，請自己決定要不要賣：\n` + gone.map(s => `${name(s)} 收盤 ${s.close}`).join('\n')] : []),
    ...armed.map(s => `${name(s)}　保本線啟動\n持有期間已賺到 ${BE * 100}% 以上，保本線 ${s.pos.bePx}（成本含交易成本）。之後盤中跌到這裡，而且 12:30 仍在線下就賣。`),
  ];
  if (!blocks.length && !test) return;
  const head = (test ? `測試訊息：台股通知正常。\n今天新的進場訊號 ${entries.length} 檔、出場 ${exits.length} 檔。` : '台股（實驗性）收盤：今天要處理的事')
    + (BE ? `\n（照你的保本設定：曾賺 ${BE * 100}% 後跌回成本就賣）` : '');
  const mkt = market ? `大盤：加權指數 ${market.c.toLocaleString()}，離 60 日高點 ${pct(market.off)}，${market.c < market.m50 ? '在 50 日均線之下（轉弱）' : '在 50 日均線之上'}；規則不因大盤出場，擔心可以自己減碼` : null;
  await send([head, ...(mkt ? [mkt] : []), ...blocks].join('\n\n')
    + `\n\n台股是實驗性質：勝率約三成，靠少數大賺的單撐起平均，連續停損很正常。\n頁面：${PAGE}\n歷史回測不保證未來獲利，這不是投資建議。`);
  if (log.beSwitch) { delete log.beSwitch; fs.writeFileSync(LOG, JSON.stringify(log, null, 1) + '\n'); }
})().catch(e => { console.error(e); process.exit(1); });
