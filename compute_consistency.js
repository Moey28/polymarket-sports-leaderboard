// compute_consistency.js
// Aggregates per-wallet "consistency" from recent sports markets by counting trades.
// This is a first version: purely activity-based (not win rate yet).

import { listSportsMarkets, getFillsForMarket } from "./collect.js";
import fs from "fs";

const MAX_MARKETS = 30;         // recent sports markets to scan
const LOOKBACK_DAYS = 30;       // only count last 30 days of fills
const OUTPATH = "./data/consistency.json";

function cutoffTs(days) {
  return Math.floor(Date.now() / 1000) - days * 86400;
}

async function main() {
  const markets = await listSportsMarkets(MAX_MARKETS, 0);
  const since = cutoffTs(LOOKBACK_DAYS);

  const byWallet = new Map();

  for (const m of markets) {
    const fills = await getFillsForMarket(m.id, 500);
    for (const f of fills) {
      if (!f?.user?.id) continue;
      if (Number(f.timestamp) < since) continue;

      const w = f.user.id.toLowerCase();
      const cur = byWallet.get(w) || { wallet: w, trades: 0, markets: new Set(), lastTs: 0 };
      cur.trades += 1;
      cur.markets.add(m.id);
      cur.lastTs = Math.max(cur.lastTs, Number(f.timestamp));
      byWallet.set(w, cur);
    }
  }

  // shape + sort (most active first)
  const rows = Array.from(byWallet.values()).map(r => ({
    wallet: r.wallet,
    trades_30d: r.trades,
    distinct_markets_30d: r.markets.size,
    last_trade_ts: r.lastTs
  })).sort((a,b) => b.trades_30d - a.trades_30d);

  fs.mkdirSync("./data", { recursive: true });
  fs.writeFileSync(OUTPATH, JSON.stringify({
    generated_at: new Date().toISOString(),
    lookback_days: LOOKBACK_DAYS,
    markets_scanned: markets.length,
    rows
  }, null, 2));

  console.log(`Wrote ${rows.length} rows → ${OUTPATH}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
