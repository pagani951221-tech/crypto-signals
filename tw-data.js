// 台股資料（Node 用；證交所、櫃買中心與 Yahoo 都不允許網頁直接讀）：股票清單、還原權息日線、台股成本
const TW_COST = 0.001425 * 2 + 0.003 + 0.002; // 手續費 0.1425%×2＋證交稅 0.3%＋滑價單邊 0.1%，一來一回約 0.785%
const ADJ = 0.003 - TW_COST; // strategy.js 的回測已扣加密貨幣成本 0.3%，加上這個差額就換成台股成本
const COMMON = /^[1-9]\d{3}$/; // 四碼、非 0 開頭＝普通股（排除 ETF、權證、特別股）

// 上市＋上櫃全部普通股（今天有成交的）；value＝今天成交金額（元）
async function universeAll() {
  const [twse, tpex] = await Promise.all([
    fetch('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL').then(r => r.json()),
    fetch('https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes').then(r => r.json()),
  ]);
  const list = [
    ...twse.filter(d => COMMON.test(d.Code) && +d.ClosingPrice > 0).map(d => ({ code: d.Code, name: d.Name.trim(), mkt: 'TW', value: +d.TradeValue })),
    ...tpex.filter(d => COMMON.test(d.SecuritiesCompanyCode) && +d.Close > 0).map(d => ({ code: d.SecuritiesCompanyCode, name: d.CompanyName.trim(), mkt: 'TWO', value: +d.TransactionAmount })),
  ];
  return [...new Map(list.map(s => [s.code, s])).values()].sort((a, b) => b.value - a.value);
}

// 上市市值前 n 大（研究七用）
async function universe(n = 150) {
  const [co, day] = await Promise.all([
    fetch('https://openapi.twse.com.tw/v1/opendata/t187ap03_L').then(r => r.json()),
    fetch('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL').then(r => r.json()),
  ]);
  const close = Object.fromEntries(day.map(d => [d.Code, +d.ClosingPrice]));
  return co.filter(c => /^\d{4}$/.test(c['公司代號']) && close[c['公司代號']] > 0)
    .map(c => ({ code: c['公司代號'], name: c['公司簡稱'], mkt: 'TW', cap: +c['已發行普通股數或TDR原股發行股數'] * close[c['公司代號']] }))
    .sort((a, b) => b.cap - a.cap).slice(0, n);
}

// Yahoo 約 10 年日線，依還原收盤價把開高低收一起還原（除權息當天才不會被誤判成暴跌）
// mkt：TW＝上市、TWO＝上櫃。t＝當天 09:00（台灣），T＝當天收盤後；val＝成交金額（元）
// 被限流（429）時等一下再試
async function bars(code, mkt = 'TW') {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${code}.${mkt}?range=10y&interval=1d`, { headers: { 'User-Agent': 'Mozilla/5.0' } }).catch(() => null);
    if (res && res.ok) {
      const r = (await res.json()).chart.result[0], q = r.indicators.quote[0], adj = r.indicators.adjclose[0].adjclose;
      const out = [];
      r.timestamp.forEach((ts, i) => {
        if ([q.open[i], q.high[i], q.low[i], q.close[i], adj[i]].some(v => v == null || !(v > 0))) return;
        const k = adj[i] / q.close[i], t = ts * 1000;
        out.push({ t, o: q.open[i] * k, h: q.high[i] * k, l: q.low[i] * k, c: adj[i], raw: q.close[i], val: (q.volume[i] || 0) * q.close[i], T: t + 864e5 - 1 });
      });
      return out;
    }
    if (attempt >= 3 || (res && res.status !== 429 && res.status < 500)) throw new Error(`${code}：Yahoo 回應 ${res ? res.status : '網路錯誤'}`);
    await new Promise(r => setTimeout(r, 5000 * (attempt + 1)));
  }
}

// 月營收：公開資訊觀測站每月彙總表（上市 sii＋上櫃 otc；_0＝國內公司、_1＝外國公司 KY）。months＝['YYYY-MM', …]
// 回傳 { 代號: { 'YYYY-MM': [當月營收（千元）, 去年同月增減 %] } }；還沒公布的月份頁面不存在，略過
async function revenue(months) {
  const dec = new TextDecoder('big5');
  const num = s => { const v = +s.replace(/[,\s]/g, ''); return s.trim() && Number.isFinite(v) ? v : null; };
  const db = {}, jobs = months.flatMap(ym => ['sii', 'otc'].flatMap(mkt => [0, 1].map(k => [ym, mkt, k])));
  const one = async ([ym, mkt, kind]) => {
    const [y, m] = ym.split('-').map(Number);
    const url = `https://mopsov.twse.com.tw/nas/t21/${mkt}/t21sc03_${y - 1911}_${m}_${kind}.html`;
    let html = null;
    for (let a = 0; a < 4 && html == null; a++) {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }).catch(() => null);
      if (r && r.ok) html = dec.decode(await r.arrayBuffer());
      else if (r && r.status === 404) html = '';
      else await new Promise(z => setTimeout(z, 3000 * (a + 1)));
    }
    if (html == null) throw new Error(`讀不到月營收：${url}`);
    // 欄位：當月營收、上月營收、去年當月營收、上月比較%、去年同月%、累計…（<td> 有大小寫混用）
    for (const k of html.matchAll(/<tr align=right><td align=center>\s*(\d{4})\s*<\/td><td align=left>[^<]*<\/td>((?:<td[^>]*>[^<]*<\/td>){9})/gi)) {
      const c = [...k[2].matchAll(/<td[^>]*>([^<]*)<\/td>/gi)].map(x => x[1]);
      (db[k[1]] ||= {})[ym] = [num(c[0]), num(c[4])];
    }
  };
  // 同時抓 4 頁
  let i = 0;
  await Promise.all([0, 1, 2, 3].map(async () => { while (i < jobs.length) await one(jobs[i++]); }));
  return db;
}

// 三大法人買賣超（上市 T86＋上櫃 dailyTrade）某一天：{ 代號: [外資, 投信, 自營商] 淨買股數 }；還沒公布（約下午 4 點）回傳 null
// 研究十：當進場濾網沒有讓回測變好，所以只在網頁上顯示參考
async function flows(date) { // date：'YYYY-MM-DD'
  const n = s => +String(s).replace(/,/g, '') || 0, ua = { headers: { 'User-Agent': 'Mozilla/5.0' } };
  const get = url => fetch(url, ua).then(r => r.json()).catch(() => ({}));
  const [a, b] = await Promise.all([
    get(`https://www.twse.com.tw/rwd/zh/fund/T86?date=${date.replace(/-/g, '')}&selectType=ALLBUT0999&response=json`),
    get(`https://www.tpex.org.tw/www/zh-tw/insti/dailyTrade?type=Daily&sect=EW&date=${date.replace(/-/g, '/')}&response=json`),
  ]);
  const t = (b.tables || []).find(t => t.data && t.data.length);
  if (a.stat !== 'OK' || !t) return null;
  const rows = [...a.data.map(r => [r[0], n(r[4]) + n(r[7]), n(r[10]), n(r[11])]),
    ...t.data.map(r => t.fields.length === 16 ? [r[0], n(r[4]), n(r[7]), n(r[8])] : [r[0], n(r[4]), n(r[13]), n(r[22])])];
  return Object.fromEntries(rows.map(r => [r[0].trim(), r.slice(1)]).filter(r => COMMON.test(r[0])));
}

// 處置股公告（上市 punish、上櫃 disposal）：from、to＝'YYYY-MM-DD'（公布日期範圍）。回傳 [{ code, start, end, minutes, all }]，日期 YYYY-MM-DD
// 研究十五：進場時已是處置股不需要避開（擋掉反而變差），所以只用來提醒撮合方式與預收款券
async function disposals(from, to) {
  const roc = s => (String(s).match(/\d{2,3}\/\d{1,2}\/\d{1,2}/g) || []).map(x => { const [y, m, d] = x.split('/').map(Number); return `${y + 1911}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`; });
  const D = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  const cn = t => /^\d+$/.test(t) ? +t : t.includes('十') ? (D[t.split('十')[0]] ?? 1) * 10 + (D[t.split('十')[1]] ?? 0) : D[t] ?? null;
  const mins = s => { const m = String(s).match(/每([一二三四五六七八九十\d]+)分鐘/); return m ? cn(m[1]) : null; };
  const ua = { headers: { 'User-Agent': 'Mozilla/5.0' } }, get = url => fetch(url, ua).then(r => r.json()).catch(() => ({}));
  const [a, b] = await Promise.all([
    get(`https://www.twse.com.tw/rwd/zh/announcement/punish?startDate=${from.replace(/-/g, '')}&endDate=${to.replace(/-/g, '')}&response=json`),
    get(`https://www.tpex.org.tw/www/zh-tw/bulletin/disposal?startDate=${from.replace(/-/g, '/')}&endDate=${to.replace(/-/g, '/')}&response=json`),
  ]);
  const rows = [
    ...(a.data || []).map(r => [r[2], r[6], r[8]]),
    ...(b.tables?.[0]?.data || []).map(r => [r[2], r[5], r[8]]),
  ].map(([c, p, t]) => { const [st, en] = roc(p); return { code: String(c).trim(), start: st, end: en || st, minutes: mins(t), all: !/單筆達[十１0-9一二三四五六七八九]+交易單位/.test(t) }; }); // all：每筆委託都要預收款券
  return rows.filter(r => COMMON.test(r.code) && r.start);
}

// 注意股公告（上市 notice、上櫃 attention）：from、to＝'YYYY-MM-DD'。回傳 { 代號: ['YYYY-MM-DD', …] }
// 研究十六：注意股的訊號歷史上反而比較好，所以只用來提醒（注意次數累積會變處置股）
async function attention(from, to) {
  const roc = s => { const m = String(s).match(/(\d{2,3})[./](\d{1,2})[./](\d{1,2})/); return m ? `${+m[1] + 1911}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : null; };
  const ua = { headers: { 'User-Agent': 'Mozilla/5.0' } }, get = url => fetch(url, ua).then(r => r.json()).catch(() => ({}));
  const [a, b] = await Promise.all([
    get(`https://www.twse.com.tw/rwd/zh/announcement/notice?querytype=1&startDate=${from.replace(/-/g, '')}&endDate=${to.replace(/-/g, '')}&response=json`),
    get(`https://www.tpex.org.tw/www/zh-tw/bulletin/attention?startDate=${from.replace(/-/g, '/')}&endDate=${to.replace(/-/g, '/')}&response=json`),
  ]);
  const db = {};
  for (const [c, d] of [...(a.data || []).map(r => [r[1], r[5]]), ...(b.tables?.[0]?.data || []).map(r => [r[1], r[5]])]) {
    const code = String(c).trim(), dt = roc(d);
    if (COMMON.test(code) && dt) (db[code] ||= new Set()).add(dt);
  }
  return Object.fromEntries(Object.entries(db).map(([c, v]) => [c, [...v].sort()]));
}

// 往後數 n 個交易日（只跳過週末，沒扣國定假日，所以是「約」）
function addWeekdays(t, n) {
  let x = t;
  while (n > 0) { x += 864e5; const w = new Date(x + 8 * 36e5).getUTCDay(); if (w !== 0 && w !== 6) n--; }
  return x;
}

module.exports = { TW_COST, ADJ, universe, universeAll, bars, revenue, flows, disposals, attention, addWeekdays };
