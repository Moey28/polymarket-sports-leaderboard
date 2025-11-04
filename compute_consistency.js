// compute_consistency.js
// Generates placeholder consistency data for the Polymarket sports leaderboard.
// This version does not query any external APIs and simply writes an empty dataset.

import fs from "fs";

async function main() {
  const data = {
    generated_at: new Date().toISOString(),
    lookback_days: 0,
    markets_scanned: 0,
    rows: []
  };

  fs.mkdirSync("./data", { recursive: true });
  fs.writeFileSync("./data/consistency.json", JSON.stringify(data, null, 2));
  console.log(`Wrote ${data.rows.length} rows to ./data/consistency.json`);
}

main().catch((err) => {
  console.error(err);
});
