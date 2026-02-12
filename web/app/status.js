import {
  emitGlobalTxNetworkFlow,
  emitTransactionLightLinks,
  emitTxCascade,
} from "/static/app/peer-map.js";

const statusEl = document.getElementById("status");
const statusConnection = document.getElementById("status-connection");
const statusBlock = document.getElementById("status-block");
const statusPeers = document.getElementById("status-peers");
const statusSync = document.getElementById("status-sync");
const statusMiningStatus = document.getElementById("status-mining-status");
const statusHashrate = document.getElementById("status-hashrate");
const statusTxPool = document.getElementById("status-txpool");
const statusRefreshTime = document.getElementById("status-refresh-time");

let previousTxPoolTotal = null;
let previousTxPoolBreakdown = { pending: 0, queued: 0 };
let statusRequestInFlight = false;

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

const txpoolToNumber = (txpool) => {
  if (txpool === null || txpool === undefined) return 0;
  if (typeof txpool === "number") return txpool;
  if (typeof txpool === "string") {
    const parsed = Number(txpool);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (typeof txpool !== "object") return 0;

  const pending = Number(txpool.pending ?? 0);
  const queued = Number(txpool.queued ?? 0);
  const safePending = Number.isNaN(pending) ? 0 : pending;
  const safeQueued = Number.isNaN(queued) ? 0 : queued;
  return safePending + safeQueued;
};

const txpoolBreakdown = (txpool) => {
  if (txpool === null || txpool === undefined || typeof txpool !== "object") {
    return { pending: 0, queued: 0 };
  }

  const pending = Number(txpool.pending ?? 0);
  const queued = Number(txpool.queued ?? 0);
  return {
    pending: Number.isNaN(pending) ? 0 : pending,
    queued: Number.isNaN(queued) ? 0 : queued,
  };
};

export async function loadStatus() {
  if (statusRequestInFlight) return;
  statusRequestInFlight = true;

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

    const txpoolTotal = txpoolToNumber(data.txpool);
    const currentBreakdown = txpoolBreakdown(data.txpool);
    const pendingDelta = Math.max(0, currentBreakdown.pending - previousTxPoolBreakdown.pending);
    const queuedDelta = Math.max(0, currentBreakdown.queued - previousTxPoolBreakdown.queued);
    const totalDelta = Math.max(0, txpoolTotal - (previousTxPoolTotal ?? txpoolTotal));
    const activity = Math.max(totalDelta, pendingDelta + queuedDelta);

    if (previousTxPoolTotal !== null && activity > 0) {
      const burst = Math.min(5, activity);
      for (let i = 0; i < burst; i += 1) {
        window.setTimeout(emitTxCascade, i * 180);
      }
      emitGlobalTxNetworkFlow(activity);
      emitTransactionLightLinks(activity);
    }

    previousTxPoolBreakdown = currentBreakdown;
    previousTxPoolTotal = txpoolTotal;
  } catch (error) {
    statusEl.textContent = `Error: ${error}`;
    setStatusValue(statusConnection, "Offline");
    setStatusValue(statusMiningStatus, "--");
    setStatusValue(statusHashrate, "--");
    setStatusValue(statusRefreshTime, new Date().toLocaleTimeString());
  } finally {
    statusRequestInFlight = false;
  }
}

export function setupStatusActions() {
  document.getElementById("status-refresh").addEventListener("click", loadStatus);
}
