// CommonJS; works on Node 20 (global fetch) without extra deps
const fs = require("fs");
const path = require("path");

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { vars: {} };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--subgraph-id") out.subgraphId = args[++i];
    else if (a === "--query-file") out.queryFile = args[++i];
    else if (a === "--out") out.outFile = args[++i];
    else if (a === "--page") out.page = parseInt(args[++i], 10);
    else if (a === "--var") {
      const [k, v] = args[++i].split("=");
      out.vars[k] = /^\d+$/.test(v) ? Number(v) : v;
    }
  }
  if (!out.subgraphId || !out.queryFile || !out.outFile) {
    throw new Error("Missing: --subgraph-id --query-file --out");
  }
  if (!out.page) out.page = 1000;
  return out;
}

async function main() {
  const { subgraphId, queryFile, outFile, page, vars } = parseArgs();
  const apiKey = process.env.GRAPH_API_KEY;
  if (!apiKey) throw new Error("GRAPH_API_KEY env is required");

  const endpoint = `https://gateway.thegraph.com/api/${apiKey}/subgraphs/id/${subgraphId}`;
  const queryPath = path.resolve(queryFile); // repo-relative path
  const query = fs.readFileSync(queryPath, "utf8");

  const outPath = path.resolve(outFile);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const out = fs.createWriteStream(outPath, { flags: "w" });

  let skip = 0, total = 0;
  const first = page;

  async function fetchPage() {
    const body = { query, variables: { ...vars, first, skip } };
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`HTTP ${res.status}: ${txt}`);
    }
    const json = await res.json();
    if (json.errors?.length) {
      throw new Error(`GraphQL error: ${JSON.stringify(json.errors)}`);
    }
    const data = json.data || {};
    const key = Object.keys(data)[0];
    return key ? (data[key] || []) : [];
  }

  while (true) {
    const rows = await fetchPage();
    if (!rows.length) break;
    for (const r of rows) out.write(JSON.stringify(r) + "\n");
    total += rows.length;
    skip  += rows.length;
    process.stdout.write(`\rFetched: ${total}`);
    if (rows.length < first) break;
  }

  out.end();
  process.stdout.write(`\nDone. Wrote ${total} rows to ${outFile}\n`);
}

main().catch((e) => {
  console.error("FATAL:", e.stack || e.message);
  process.exit(1);
});
