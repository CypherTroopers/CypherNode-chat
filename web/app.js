<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>ChainChat Node</title>
</head>
<body>
  <h2>ChainChat Node (Cypherium Local AI Agent)</h2>

  <section>
    <h3>Node Status</h3>
    <button onclick="loadStatus()">Refresh</button>
    <pre id="status"></pre>
  </section>

  <section>
    <h3>Wallet Watchlist</h3>
    <input id="addr" placeholder="0x..." style="width:420px"/>
    <button onclick="addAddr()">Add</button>
    <button onclick="loadWatchlist()">Reload</button>
    <pre id="watchlist"></pre>
  </section>

  <section>
    <h3>AI Chat</h3>
    <input id="q" placeholder="ask about status/peers/sync..." style="width:520px"/>
    <button onclick="ask()">Send</button>
    <pre id="answer"></pre>
    <pre id="tool"></pre>
  </section>

  <script src="/static/app.js"></script>
</body>
</html>
root@vmi2680348:~/go/src/github.com/cypherium/cypher/chainchat-agent/web# lsapp.js  index.html
root@vmi2680348:~/go/src/github.com/cypherium/cypher/chainchat-agent/web# cat app.js
async function loadStatus() {
  const r = await fetch("/api/status");
  const j = await r.json();
  document.getElementById("status").textContent = JSON.stringify(j, null, 2);
}

async function loadWatchlist() {
  const r = await fetch("/api/watchlist");
  const j = await r.json();
  document.getElementById("watchlist").textContent = JSON.stringify(j, null, 2);
}

async function addAddr() {
  const addr = document.getElementById("addr").value.trim();
  const r = await fetch("/api/watchlist/add", {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({address: addr})
  });
  const j = await r.json();
  document.getElementById("watchlist").textContent = JSON.stringify(j, null, 2);
}

async function ask() {
  const q = document.getElementById("q").value.trim();
  const r = await fetch("/api/ask", {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({q})
  });
  const j = await r.json();
  document.getElementById("answer").textContent = j.answer || "";
  document.getElementById("tool").textContent = JSON.stringify(j.tool, null, 2);
}

loadStatus();
loadWatchlist();
