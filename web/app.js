const statusEl = document.getElementById("status");
const statusConnection = document.getElementById("status-connection");
const statusBlock = document.getElementById("status-block");
const statusPeers = document.getElementById("status-peers");
const statusSync = document.getElementById("status-sync");
const statusMiningStatus = document.getElementById("status-mining-status");
const statusHashrate = document.getElementById("status-hashrate");
const statusTxPool = document.getElementById("status-txpool");
const statusRefreshTime = document.getElementById("status-refresh-time");

const watchlistEl = document.getElementById("watchlist");
const watchlistList = document.getElementById("watchlist-list");
const watchlistCount = document.getElementById("watchlist-count");

const answerEl = document.getElementById("answer");
const toolEl = document.getElementById("tool");
const miningPanel = document.getElementById("mining-power-panel");
const miningMode = document.getElementById("mining-mode");
const miningPercent = document.getElementById("mining-percent");
const miningSource = document.getElementById("mining-source");
const miningUpdated = document.getElementById("mining-updated");

const peerMapEl = document.getElementById("peer-map");
const peerMapCount = document.getElementById("peer-map-count");
const peerMapUpdated = document.getElementById("peer-map-updated");
const peerMapGeoip = document.getElementById("peer-map-geoip");

const addrInput = document.getElementById("addr");
const questionInput = document.getElementById("q");

let peerMap = null;
let peerMarkers = null;

const formatValue = (value) => {
  if (value === null || value === undefined) {
    return "--";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
};

const setStatusValue = (element, value) => {
  if (!element) return;
  element.textContent = formatValue(value);
};

const setMiningValue = (element, value) => {
  if (!element) return;
  element.textContent = value;
};

async function loadMiningPower() {
  try {
    const response = await fetch("/api/mining-power");
    const data = await response.json();
    const mode = data.mode || "CPU";
    const percent = Number(data.percent);
    const value = Number.isNaN(percent) ? "--" : percent.toFixed(1);

    setMiningValue(miningMode, mode);
    setMiningValue(miningPercent, `${value}%`);
    setMiningValue(
      miningSource,
      mode === "GPU" ? "GPU acceleration detected." : "CPU telemetry active.",
    );
    setMiningValue(miningUpdated, new Date().toLocaleTimeString());
  } catch (error) {
    setMiningValue(miningSource, "Telemetry unavailable.");
    setMiningValue(miningUpdated, new Date().toLocaleTimeString());
  }
}

const initPeerMap = () => {
  if (!peerMapEl || !window.L) return;
  peerMap = window.L.map(peerMapEl, { worldCopyJump: true, minZoom: 1 }).setView([20, 0], 2);
  window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(peerMap);
  peerMarkers = window.L.layerGroup().addTo(peerMap);
};

const buildMarkerLabel = (entry) => {
  const countries = Array.from(entry.countries).filter(Boolean).join(", ") || "Unknown";
  return `
    <strong>${countries}</strong><br/>
    ${entry.count} peer(s)<br/>
    `;
};

async function loadPeerGeo() {
  if (!peerMap || !peerMarkers) return;

  try {
    const response = await fetch("/api/peer-geo");
    const data = await response.json();
    const peers = Array.isArray(data.peers) ? data.peers : [];
    const updated = data.updated_at ? new Date(data.updated_at * 1000) : null;

    peerMapCount.textContent = `${data.ip_count ?? peers.length} peers`;
    peerMapUpdated.textContent = `Last update: ${updated ? updated.toLocaleString() : "--"}`;
    const geoLabel = data.provider ? `GeoIP: ${data.provider}` : `GeoIP: ${data.geoip_enabled ? "enabled" : "disabled"}`;
    peerMapGeoip.textContent = geoLabel;
    
    const grouped = new Map();
    peers.forEach((peer) => {
      const lat = Number(peer.latitude);
      const lon = Number(peer.longitude);
      if (Number.isNaN(lat) || Number.isNaN(lon)) return;
      const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
      if (!grouped.has(key)) {
        grouped.set(key, {
          lat,
          lon,
          count: 0,
          countries: new Set(),
          ips: [],
        });
      }
      const entry = grouped.get(key);
      entry.count += 1;
      entry.countries.add(peer.country || peer.country_code);
      if (peer.ip) entry.ips.push(peer.ip);
    });

    peerMarkers.clearLayers();
    grouped.forEach((entry) => {
      const radius = Math.min(18, 6 + entry.count * 2);
      const marker = window.L.circleMarker([entry.lat, entry.lon], {
        radius,
        color: "#6fffe9",
        weight: 2,
        fillColor: "#3b82f6",
        fillOpacity: 0.7,
      });
      marker.bindPopup(buildMarkerLabel(entry));
      marker.addTo(peerMarkers);
    });

    if (grouped.size) {
      const bounds = window.L.latLngBounds(
        Array.from(grouped.values()).map((entry) => [entry.lat, entry.lon]),
      );
      peerMap.fitBounds(bounds.pad(0.4));
    }
  } catch (error) {
    peerMapUpdated.textContent = "Last update: error";
    peerMapGeoip.textContent = "GeoIP: unavailable";
  }
}

async function loadStatus() {
  if (statusEl) {
    statusEl.textContent = "Loading status...";
  }

  try {
    const response = await fetch("/api/status");
    const data = await response.json();
    statusEl.textContent = JSON.stringify(data, null, 2);

    const connected = data.connected ? "Connected" : "Offline";
    setStatusValue(statusConnection, connected);
    setStatusValue(statusBlock, data.block_number ?? "--");
    setStatusValue(statusPeers, data.peer_count ?? "--");
    setStatusValue(statusSync, data.syncing ?? "--");
    setStatusValue(statusMiningStatus, data.mining_status ?? "--");
    setStatusValue(statusHashrate, data.hashrate ?? "--");
    setStatusValue(statusTxPool, data.txpool ?? "--");
    setStatusValue(statusRefreshTime, new Date().toLocaleTimeString());
  } catch (error) {
    statusEl.textContent = `Error: ${error}`;
    setStatusValue(statusConnection, "Offline");
    setStatusValue(statusMiningStatus, "--");
    setStatusValue(statusHashrate, "--");
    setStatusValue(statusRefreshTime, new Date().toLocaleTimeString());
  }
}
const renderWatchlist = (addresses) => {
  const safeList = Array.isArray(addresses) ? addresses : [];
  watchlistEl.textContent = JSON.stringify({ addresses: safeList }, null, 2);
  watchlistList.innerHTML = "";

  safeList.forEach((address) => {
    const pill = document.createElement("div");
    pill.className = "pill";

    const label = document.createElement("span");
    label.textContent = address;

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.textContent = "Remove";
    removeButton.addEventListener("click", () => removeAddr(address));

    pill.append(label, removeButton);
    watchlistList.appendChild(pill);
  });

  watchlistCount.textContent = `${safeList.length} tracked`;
};


async function loadWatchlist() {
  watchlistEl.textContent = "Loading watchlist...";

  try {
    const response = await fetch("/api/watchlist");
    const data = await response.json();
    renderWatchlist(data.addresses || []);
  } catch (error) {
    watchlistEl.textContent = `Error: ${error}`;
  }
    }

async function addAddr() {
  const addr = addrInput.value.trim();
  if (!addr) {
    addrInput.focus();
    return;
  }

  try {
    const response = await fetch("/api/watchlist/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: addr }),
    });
    const data = await response.json();
    renderWatchlist(data.addresses || []);
    addrInput.value = "";
  } catch (error) {
    watchlistEl.textContent = `Error: ${error}`;
  }
}

async function removeAddr(address) {
  try {
    const response = await fetch("/api/watchlist/del", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address }),
    });
    const data = await response.json();
    renderWatchlist(data.addresses || []);
  } catch (error) {
    watchlistEl.textContent = `Error: ${error}`;
  }
}

async function ask() {
  const q = questionInput.value.trim();
  if (!q) {
    questionInput.focus();
    return;
  }

  answerEl.textContent = "Thinking...";
  toolEl.textContent = "";

  try {
    const response = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q }),
    });
    const data = await response.json();
    answerEl.textContent = data.answer || "";
    toolEl.textContent = JSON.stringify(data.tool, null, 2);
  } catch (error) {
    answerEl.textContent = `Error: ${error}`;
  }
}
const clearChat = () => {
  questionInput.value = "";
  answerEl.textContent = "";
  toolEl.textContent = "";
};

document.getElementById("status-refresh").addEventListener("click", loadStatus);
document.getElementById("watchlist-reload").addEventListener("click", loadWatchlist);
document.getElementById("watchlist-add").addEventListener("click", addAddr);
document.getElementById("chat-send").addEventListener("click", ask);
document.getElementById("chat-clear").addEventListener("click", clearChat);

if (miningPanel) {
  miningPanel.addEventListener("click", () => {
    window.location.href = "/mining-power";
  });

  miningPanel.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      window.location.href = "/mining-power";
    }
  });
}

questionInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    ask();
  }
});

loadStatus();
loadWatchlist();
loadMiningPower();
initPeerMap();
loadPeerGeo();
setInterval(loadMiningPower, 2000);
setInterval(loadPeerGeo, 180000);
