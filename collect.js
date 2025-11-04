import fetch from "node-fetch";

const ENDPOINT = "https://api.goldsky.com/c/polymarket/gn/subgraphs/id/QmXr8pFkk7uQLqBD1FarPfKz6Lv9C9U2GehjeoRnj5LNui";

async function getSportsMarkets() {
  const query = `
    {
      markets(where:{category:"Sports"}, first:50) {
        id
        question
        slug
      }
    }
  `;
  
  const res = await fetch(ENDPOINT, {
    method:"POST",
    headers:{ "Content-Type":"application/json"},
    body: JSON.stringify({ query })
  });
  
  const data = await res.json();
  console.log("Sports markets:", data.data.markets);
}

getSportsMarkets();
