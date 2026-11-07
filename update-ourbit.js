// 更新 ourbit.json：Ourbit 買得到的幣（USDT 計價）。網頁讀這個檔，因為 Ourbit 的 API 不允許網頁直接讀。
// 由 .github/workflows/ourbit.yml 每週執行；本機：node update-ourbit.js
const fs = require('fs');
const { ourbitCoins } = require('./strategy.js');
(async () => {
  const coins = [...await ourbitCoins()].sort();
  if (coins.length < 100) throw new Error(`只拿到 ${coins.length} 個幣，可能是 API 異常，不更新`);
  fs.writeFileSync('ourbit.json', JSON.stringify({ updated: new Date().toISOString().slice(0, 10), coins }) + '\n');
  console.log(`ourbit.json：${coins.length} 個幣`);
})().catch(e => { console.error(e); process.exit(1); });
