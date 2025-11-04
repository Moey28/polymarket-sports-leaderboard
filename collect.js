// collect.js — helpers shared by other scripts (ESM)
export const ENDPOINT =
  "https://api.goldsky.com/c/polymarket/gn/subgraphs/id/QmXr8pFkk7uQLqBD1FarPfKz6Lv9C9U2GehjeoRnj5LNui";

export async function gql(query, variables = {}) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors, null, 2));
  return json.data;
}

export async function listSportsMarkets(limit = 50, skip = 0) {
  const query = `
    query ($first:Int!, $skip:Int!) {
      markets(
        where: { category: "Sports" }
        first: $first
        skip: $skip
        orderBy: createdAt
        orderDirection: desc
      ) { id slug question }
    }
  `;
  const data = await gql(query, { first: limit, skip });
  return data.markets ?? [];
}

export async function getFillsForMarket(marketId, pageSize = 500) {
  const query = `
    query ($marketId: String!, $first:Int!, $skip:Int!) {
      fills(
        where: { market: $marketId }
        first: $first
        skip: $skip
        orderBy: timestamp
        orderDirection: asc
      ) {
        id timestamp amount price side user { id } transactionHash
      }
    }
  `;
  let all = [], skip = 0;
  for (let i = 0; i < 2000; i++) {
    const page = (await gql(query, { marketId, first: pageSize, skip })).fills ?? [];
    if (page.length === 0) break;
    all.push(...page);
    skip += page.length;
    if (page.length < pageSize) break;
  }
  return all;
}
