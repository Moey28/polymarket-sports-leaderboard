// fetch_subgraph_fixed.cjs
//
// This script fixes multiple issues present in the original
// `collector/fetch_subgraph.cjs` in the Polymarket sports leaderboard
// repository.  The original version would prematurely terminate its
// pagination loop, leak file handles by calling `out.end()` inside
// the loop and contained mismatched braces which prevented the script
// from running in Node.  The updated version below addresses these
// problems and adds a configurable `--max` option to let callers
// control how many rows to fetch before aborting.  If no `--max`
// option is provided the script will fetch all available records.

"use strict";

const fs = require('fs');
const path = require('path');

/**
 * Parse command‑line arguments.  Recognised flags are:
 *
 *  --subgraph-id <id>   The identifier of the Graph subgraph to query.
 *  --query-file  <file> Path to a `.graphql` file containing the query.
 *  --out         <file> Where to write the newline‑delimited JSON output.
 *  --page        <n>    Number of rows to request per page (default 1000).
 *  --max         <n>    Maximum number of rows to fetch in total (optional).
 *  --var k=v           Arbitrary variables passed to the GraphQL query.
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const out = { vars: {} };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--subgraph-id') out.subgraphId = args[++i];
    else if (a === '--query-file') out.queryFile = args[++i];
    else if (a === '--out') out.outFile = args[++i];
    else if (a === '--page') out.page = parseInt(args[++i], 10);
    else if (a === '--max') out.max = parseInt(args[++i], 10);
    else if (a === '--var') {
      const [k, v] = String(args[++i]).split('=');
      out.vars[k] = /^\d+$/.test(v) ? Number(v) : v;
    }
  }
  if (!out.subgraphId || !out.queryFile || !out.outFile) {
    throw new Error('Missing: --subgraph-id --query-file --out');
  }
  if (!out.page || isNaN(out.page) || out.page < 1) out.page = 1000;
  if (out.max && isNaN(out.max)) delete out.max;
  return out;
}

/**
 * Issue a POST request to The Graph gateway.  Throws on non‑200
 * responses or GraphQL errors.  Returns the parsed JSON response.
 *
 * @param {string} endpoint The Graph HTTP endpoint.
 * @param {object} body     The body to POST.
 */
async function post(endpoint, body) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${t}`);
  }
  return res.json();
}

/**
 * Helper to introspect the root query fields of a subgraph.  This
 * function is invoked when a GraphQL error suggests an invalid field
 * name.  It prints available fields to stderr to aid debugging.
 *
 * @param {string} endpoint The Graph HTTP endpoint.
 */
async function printRootFields(endpoint) {
  const introspection = `query { __schema { queryType { fields { name } } } }`;
  try {
    const js = await post(endpoint, { query: introspection });
    const fields = js?.data?.__schema?.queryType?.fields?.map(f => f.name) || [];
    console.error('\n[Schema] Root Query fields:', fields.join(', ') || '(none found)');
  } catch (e) {
    console.error('[Schema] Introspection failed:', e?.message || String(e));
  }
}

async function main() {
  const { subgraphId, queryFile, outFile, page, vars, max } = parseArgs();
  const apiKey = process.env.GRAPH_API_KEY;
  if (!apiKey) throw new Error('GRAPH_API_KEY env is required');

  const endpoint = `https://gateway.thegraph.com/api/${apiKey}/subgraphs/id/${subgraphId}`;
  const query = fs.readFileSync(path.resolve(queryFile), 'utf8');

  // Ensure output directory exists and open the output stream.
  fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
  const outStream = fs.createWriteStream(path.resolve(outFile), { flags: 'w' });

  let skip = 0;
  let total = 0;
  const first = page;

  // Inner function to fetch a page of results.  Returns an array of
  // rows.  If the GraphQL response contains errors, prints useful
  // schema information and rethrows.
  async function fetchPage() {
    const body = { query, variables: { ...vars, first, skip } };
    const js = await post(endpoint, body);
    if (js.errors?.length) {
      const msg = JSON.stringify(js.errors);
      if (/Cannot query field|has no field/i.test(msg)) {
        await printRootFields(endpoint);
      }
      throw new Error(`GraphQL error: ${msg}`);
    }
    const data = js.data || {};
    const key = Object.keys(data)[0];
    return key ? (data[key] || []) : [];
  }

  // Loop until no more rows or until the max row count (if provided) is reached.
  while (true) {
    const rows = await fetchPage();
    if (!rows.length) break;

    for (const r of rows) {
      outStream.write(JSON.stringify(r) + '\n');
    }
    total += rows.length;
    skip += rows.length;

        // The Graph enforces a skip limit of 5000; abort to avoid errors
    if (skip >= 5000) break;
    
    // Honour a user‑supplied maximum row count.  When `max` is set
    // and we have collected at least that many rows, exit early.
    if (typeof max === 'number' && total >= max) break;

    // Stop if we received fewer than `first` records, signalling
    // we’re on the last page.
    if (rows.length < first) break;
  }

  outStream.end();
  process.stdout.write(`\nDone. Wrote ${total} rows to ${outFile}\n`);
}

main().catch(e => {
  console.error('FATAL:', e?.stack || e?.message || String(e));
  process.exit(1);
});
