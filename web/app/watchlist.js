const watchlistEl = document.getElementById("watchlist");
const watchlistList = document.getElementById("watchlist-list");
const watchlistCount = document.getElementById("watchlist-count");
const addrInput = document.getElementById("addr");

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

export async function loadWatchlist() {
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

export function setupWatchlistActions() {
  document.getElementById("watchlist-reload").addEventListener("click", loadWatchlist);
  document.getElementById("watchlist-add").addEventListener("click", addAddr);
}
