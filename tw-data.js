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

// 往後數 n 個交易日（只跳過週末，沒扣國定假日，所以是「約」）
function addWeekdays(t, n) {
  let x = t;
  while (n > 0) { x += 864e5; const w = new Date(x + 8 * 36e5).getUTCDay(); if (w !== 0 && w !== 6) n--; }
  return x;
}

module.exports = { TW_COST, ADJ, universe, universeAll, bars, addWeekdays };
