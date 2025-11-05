'use strict';

const fs = require('fs');
const path = require('path');

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { vars: {} };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--subgraph-id') out.subgraphId = args[++i];
    else if (a === '--query-file') out.queryFile = args[++i];
    else if (a === '--out') out.outFile = args[++i];
    else if (a === '--page') out.page = parseInt(args[++i], 10);
    else if (a === '--var') {
      const [k, v] = String(args[++i]).split('=');
      out.vars[k] = /^\d+$/.test(v) ? Number(v) : v;
    }
  }
  if (!out.subgraphId || !out.queryFile || !out.outFile) {
    throw new Error('Missing: --subgraph-id --query-file --out');
  }
  if (!out.page || isNaN(out.page) || out.page < 1) out.page = 1000;
  return out;
}

async function post(endpoint, body) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(()=>'');
    throw new Error(`HTTP ${res.status}: ${t}`);
  }
  return res.json();
}

async function printRootFields(endpoint) {
  const introspection = `
    query {
      __schema {
        queryType { name fields { name } }
      }
    }`;
  try {
    const js = await post(endpoint, { query: introspection });
    const fields = js?.data?.__schema?.queryType?.fields?.map(f => f.name) || [];
    console.error('\n[Schema] Root Query fields:', fields.join(', ') || '(none found)');
  } catch (e) {
    console.error('[Schema] Introspection failed:', e?.message || String(e));
  }
}

async function main() {
  const { subgraphId, queryFile, outFile, page, vars } = parseArgs();
  const apiKey = process.env.GRAPH_API_KEY;
  if (!apiKey) throw new Error('GRAPH_API_KEY env is required');

  const endpoint = `https://gateway.thegraph.com/api/${apiKey}/subgraphs/id/${subgraphId}`;
  const query = fs.readFileSync(path.resolve(queryFile), 'utf8');

  fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
  const out = fs.createWriteStream(path.resolve(outFile), { flags: 'w' });

  let skip = 0;
  let total = 0;
  const first = page;

  async function fetchPage() {
    const body = { query, variables: { ...vars, first, skip } };
    const js = await post(endpoint, body);
    if (js.errors?.length) {
      const msg = JSON.stringify(js.errors);
      // If the field name is wrong, help by printing available root fields
      if (/Cannot query field|has no field/i.test(msg)) {
        await printRootFields(endpoint);
      }
      throw new Error(`GraphQL error: ${msg}`);
    }
    const data = js.data || {};
    const key = Object.keys(data)[0];
    return key ? (data[key] || []) : [];
  }

  while (true) {
    const rows = await fetchPage();
    if (!rows.length) break;

    for (const r of rows) {
      out.write(JSON.stringify(r) + '\n');
    }
    total += rows.length;
    skip += rows.length;

    process.stdout.write(`\rFetched: ${total}`);
    if (rows.length < first) break; // last page
  }

  out.end();
  process.stdout.write(`\nDone. Wrote ${total} rows to ${outFile}\n`);
}

main().catch(e => {
  console.error('FATAL:', e?.stack || e?.message || String(e));
  process.exit(1);
});
