// collect_fixed.js — improved GraphQL helpers for the Polymarket sports leaderboard
//
// This module refactors the original `collect.js` to support a more
// flexible GraphQL pagination strategy and to query the correct field
// name for order fills.  The existing repository used a `fills`
// field which no longer exists on the subgraph.  According to the
// project’s GraphQL documents, the correct collection is
// `orderFilleds`.  This updated module exposes three functions:
//
//   * `gql` – generic GraphQL POST helper with error handling.
//   * `listSportsMarkets` – fetches sports markets with optional
//      pagination parameters.
//   * `getOrderFillsForMarket` – retrieves all fills for a market by
//      repeatedly querying `orderFilleds`.  Accepts optional page
//      size and maximum rows.

export const ENDPOINT =
  "https://api.goldsky.com/c/polymarket/gn/subgraphs/id/QmXr8pFkk7uQLqBD1FarPFkz6Lv9C9U2GehjeoRnj5LNui";

/**
 * Low‑level GraphQL helper.  Posts a query to the configured
 * ENDPOINT and returns the `data` property of the JSON response.
 * Throws an error when the response contains GraphQL errors.
 *
 * @param {string} query     The GraphQL document to execute.
 * @param {object} variables Variables to supply to the query.
 */
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

/**
 * List sports markets.  Because Goldsky paginates results this
 * function accepts `limit` and `skip` parameters which map to the
 * GraphQL `first` and `skip` arguments.  Increasing `limit` will
 * reduce the number of round trips.  If you need to fetch all
 * markets, call this repeatedly with increasing `skip`.
 *
 * @param {number} limit Number of markets to fetch (default 50).
 * @param {number} skip  Number of markets to skip (default 0).
 */
export async function listSportsMarkets(limit = 50, skip = 0) {
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
  const data = await gql(query, { first: limit, skip });
  return data.markets ?? [];
}

/**
 * Fetch all order fills for a given market by repeatedly querying the
 * `orderFilleds` collection.  This version accepts an optional
 * `pageSize` which controls how many rows are fetched per request
 * (default 500) and an optional `maxRows` which caps the total
 * number of fills returned.  When `maxRows` is omitted the function
 * will fetch all available fills.
 *
 * @param {string} marketId  The market identifier.
 * @param {number} pageSize  Number of fills per page (default 500).
 * @param {number} maxRows   Maximum total fills to fetch (optional).
 */
export async function getOrderFillsForMarket(marketId, pageSize = 500, maxRows) {
  const query = `
    query ($marketId: String!, $first:Int!, $skip:Int!) {
      orderFilleds(
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
  // Loop until fewer than pageSize results are returned or until
  // maxRows is reached (if provided).
  while (true) {
    const res = await gql(query, { marketId, first: pageSize, skip });
    const page = res?.orderFilleds ?? [];
    if (page.length === 0) break;
    all.push(...page);
    skip += page.length;
    if (typeof maxRows === 'number' && all.length >= maxRows) {
      all = all.slice(0, maxRows);
      break;
    }
    if (page.length < pageSize) break;
  }
  return all;
}
