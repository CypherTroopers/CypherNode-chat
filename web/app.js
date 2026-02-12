import { setupChatActions } from "/static/app/chat.js";
import { loadMiningPower, setupMiningActions } from "/static/app/mining.js";
import { initPeerMap, loadPeerGeo, syncMapEventLayers } from "/static/app/peer-map.js";
import { loadStatus, setupStatusActions } from "/static/app/status.js";
import { loadWatchlist, setupWatchlistActions } from "/static/app/watchlist.js";

setupStatusActions();
setupWatchlistActions();
setupChatActions();
setupMiningActions();

loadStatus();
loadWatchlist();
loadMiningPower();
initPeerMap();
loadPeerGeo();

setInterval(loadMiningPower, 2000);
setInterval(loadStatus, 2000);
setInterval(loadPeerGeo, 180000);
setInterval(syncMapEventLayers, 120);
