// Collect fills (trades) for Polymarket sports markets
// Run locally later with: node collect_trades.js <marketId>
// If no marketId is given, it prints the first 20 sports markets to pick from.

const ENDPOINT =
  "https://api.goldsky.com/c/polymarket/gn/subgraphs/id/QmXr8pFkk7uQLqBD1FarPfKz6Lv9C9U2GehjeoRnj5LNui";

// Node 18+ has fetch globally. If you run on older Node, install node-fetch and import it.

async function gql(query, variables = {}) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors, null, 2));
  return json.data;
}

async function listSportsMarkets(limit = 20) {
  const query = `
    query ($first:Int!, $skip:Int!) {
      markets(
        where: { category: "Sports" }
        first: $first
        skip: $skip
        orderBy: createdAt
        orderDirection: desc
      ) {
        id
        slug
        question
      }
    }
  `;
  const data = await gql(query, { first: limit, skip: 0 });
  return data.markets || [];
}

async function getFillsForMarket(marketId, pageSize = 500) {
  // Paginates through all fills for a market (ascending by time)
  const query = `
    query ($marketId: String!, $first:Int!, $skip:Int!) {
      fills(
        where: { market: $marketId }
        first: $first
        skip: $skip
        orderBy: timestamp
        orderDirection: asc
      ) {
        id
        timestamp
        amount
        price
        side
        user { id }
        transactionHash
      }
    }
  `;

  let all = [];
  let skip = 0;
  // safety cap to avoid accidental infinite loops
  const MAX_PAGES = 2000;

  for (let i = 0; i < MAX_PAGES; i++) {
    const data = await gql(query, {
      marketId,
      first: pageSize,
      skip,
    });
    const page = data.fills || [];
    if (page.length === 0) break;
    all = all.concat(page);
    skip += page.length;
    if (page.length < pageSize) break;
  }
  return all;
}

// --- CLI helper when you run locally ---
// node collect_trades.js <marketId>
async function main() {
  const marketId = process.argv[2];

  if (!marketId) {
    const mkts = await listSportsMarkets(20);
    console.log("\nPick a marketId to fetch fills for (use one of these):\n");
    mkts.forEach((m, i) =>
      console.log(`${String(i + 1).padStart(2, " ")}. ${m.id}  |  ${m.slug}  |  ${m.question}`)
    );
    console.log(
      `\nExample to run locally:\n  node collect_trades.js ${mkts[0]?.id || "<marketId>"}\n`
    );
    return;
  }

  console.log("Fetching fills for market:", marketId);
  const fills = await getFillsForMarket(marketId);
  console.log(`Fetched ${fills.length} fills.`);

  // If you run this locally, uncomment the block below to save a JSON file into /data/
  // (On GitHub web editor this won’t execute; we’ll run locally later.)
  /*
  import fs from "fs";
  const outPath = `./data/${marketId}.fills.json`;
  fs.writeFileSync(outPath, JSON.stringify(fills, null, 2));
  console.log("Saved to", outPath);
  */

  // Show a tiny preview in console
  console.log("\nSample (first 3):");
  console.log(fills.slice(0, 3));
}

if (import.meta?.url ? process.argv[1] === new URL(import.meta.url).pathname : true) {
  // Fallback allows running in CJS too
  main().catch((e) => {
    console.error("Error:", e.message);
    process.exit(1);
  });
}
