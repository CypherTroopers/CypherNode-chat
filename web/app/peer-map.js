const peerMapEl = document.getElementById("peer-map");
const peerMapCount = document.getElementById("peer-map-count");
const peerMapUpdated = document.getElementById("peer-map-updated");
const peerMapGeoip = document.getElementById("peer-map-geoip");
const peerMapThemeToggle = document.getElementById("peer-map-theme-toggle");

let peerMap = null;
let peerMapTheme = "night";
let peerMapThemeInitialized = false;
let peerNodes = [];
let peerLinks = [];
let activeArcEvents = [];
let activeBeamHeads = [];
let activeRingEvents = [];
let activeImageRunnerEvents = [];
let activeImageRunnerHeads = [];
let peerResizeBound = false;

const ARC_TTL_MS = 2500;
const RING_TTL_MS = 1400;
const BEAM_HEAD_TTL_MS = 950;
const BEAM_HEAD_MAX_RADIUS = 2.2;
const BEAM_HEAD_SPEEDUP = 1.0;
const CASCADE_STEPS = 4;
const CASCADE_BRANCHES = 2;
const CASCADE_STEP_DELAY_MS = 190;
const TX_SURGE_RING_COUNT = 3;
const GLOBAL_FLOW_LINK_LIMIT = 36;
const GLOBAL_FLOW_STAGGER_MS = 26;
const TX_LIGHT_LINK_LIMIT = 14;
const IMAGE_RUNNER_TTL_MS = 1200;
const IMAGE_RUNNER_BASE_SIZE = 18;
const IMAGE_RUNNER_URL = "/static/image.png";
const MAP_THEME_STORAGE_KEY = "peer-map-theme";
const MAP_THEMES = {
  night: "https://unpkg.com/three-globe/example/img/earth-night.jpg",
  day: "https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg",
};

const nodeKey = (lat, lng) => `${Number(lat).toFixed(2)},${Number(lng).toFixed(2)}`;

const applyPeerMapTheme = (theme, persist = false) => {
  if (!peerMap) return;

  const nextTheme = theme === "day" ? "day" : "night";
  peerMapTheme = nextTheme;
  peerMap.globeImageUrl(MAP_THEMES[nextTheme]);

  if (peerMapThemeToggle) {
    peerMapThemeToggle.textContent = nextTheme === "night" ? "Switch to Day" : "Switch to Night";
    peerMapThemeToggle.setAttribute("aria-label", `Map theme: ${nextTheme}`);
  }

  if (persist) {
    window.localStorage.setItem(MAP_THEME_STORAGE_KEY, nextTheme);
  }
};

const restorePeerMapTheme = () => {
  if (peerMapThemeInitialized) return;
  const stored = window.localStorage.getItem(MAP_THEME_STORAGE_KEY);
  if (stored === "day" || stored === "night") {
    peerMapTheme = stored;
  }
  peerMapThemeInitialized = true;
};

const togglePeerMapTheme = () => {
  const nextTheme = peerMapTheme === "night" ? "day" : "night";
  applyPeerMapTheme(nextTheme, true);
};

export const initPeerMap = () => {
  if (!peerMapEl || !window.Globe) return;

  peerMap = window.Globe()(peerMapEl)
    .globeImageUrl(MAP_THEMES.night)
    .backgroundColor("rgba(0,0,0,0)")
    .showAtmosphere(true)
    .atmosphereColor("#6fffe9")
    .atmosphereAltitude(0.18)
    .pointAltitude((d) => {
      if (d.kind === "beamHead") {
        return 0.02 + Math.min(0.06, (d.intensity || 1) * 0.012);
      }
      return 0.015 + Math.min(0.08, d.count * 0.004);
    })
    .pointRadius((d) => {
      if (d.kind === "beamHead") {
        const age = Date.now() - (d.ts || 0);
        const ttl = d.ttl || BEAM_HEAD_TTL_MS;
        const progress = Math.max(0, Math.min(1, age / ttl));
        const growth = Math.min(BEAM_HEAD_MAX_RADIUS, (d.intensity || 1) * 0.7);
        return Math.max(0.12, growth * (1 - progress * 0.85));
      }
      return 0.14 + Math.min(0.45, d.count * 0.07);
    })
    .pointColor((d) => {
      if (d.kind === "beamHead") {
        const age = Date.now() - (d.ts || 0);
        const ttl = d.ttl || BEAM_HEAD_TTL_MS;
        const alpha = Math.max(0, 1 - age / ttl);
        return `rgba(255, 248, 196, ${Math.max(0.15, alpha).toFixed(3)})`;
      }
      return "#6fffe9";
    })
    .pointLabel((d) => {
      if (d.kind === "beamHead") return "";
      return `<b>${d.countryLabel}</b><br/>${d.count} peer(s)`;
    })
    .arcColor((d) => {
      const age = Date.now() - (d.ts || 0);
      const ttl = d.ttl || ARC_TTL_MS;
      const alpha = Math.max(0.08, 0.95 - age / ttl);
      if (d.glow) {
        const glowAlpha = Math.max(0.1, Math.min(1, alpha + 0.18));
        const trailAlpha = Math.max(0.06, glowAlpha * 0.45);
        return [
          `rgba(147, 197, 253, ${trailAlpha.toFixed(3)})`,
          `rgba(255, 255, 210, ${glowAlpha.toFixed(3)})`,
        ];
      }
      const trail = Math.max(0.04, alpha * 0.3);
      return [`rgba(59,130,246,${trail.toFixed(3)})`, `rgba(111,255,233,${alpha.toFixed(3)})`];
    })
    .arcAltitude((d) => d.altitude)
    .arcStroke((d) => d.stroke)
    .arcDashLength(0.35)
    .arcDashGap(1.1)
    .arcDashAnimateTime((d) => d.animateTime)
    .arcLabel((d) => `${d.sourceLabel} ⇄ ${d.targetLabel}<br/>connections: ${d.weight}`)
    .arcsTransitionDuration(250)
    .ringLat((d) => d.lat)
    .ringLng((d) => d.lng)
    .ringMaxRadius(4.8)
    .ringPropagationSpeed(3.4)
    .ringRepeatPeriod(10_000)
    .ringColor((d) => {
      const age = Date.now() - (d.ts || 0);
      const ttl = d.ttl || RING_TTL_MS;
      const alpha = Math.max(0, 0.92 - age / ttl);
      return `rgba(255, 224, 130, ${alpha.toFixed(3)})`;
    })
    .htmlElementsData(activeImageRunnerHeads)
    .htmlLat((d) => d.lat)
    .htmlLng((d) => d.lng)
    .htmlAltitude(0.03)
    .htmlElement((d) => {
      const img = document.createElement("img");
      img.src = IMAGE_RUNNER_URL;
      img.alt = "tx-runner";
      const size = Math.max(12, d.size || IMAGE_RUNNER_BASE_SIZE);
      img.style.width = `${size}px`;
      img.style.height = `${size}px`;
      img.style.pointerEvents = "none";
      img.style.filter = "drop-shadow(0 0 6px rgba(255, 248, 196, 0.9))";
      return img;
    });

  restorePeerMapTheme();
  applyPeerMapTheme(peerMapTheme);

  const controls = peerMap.controls();
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.45;
  controls.enablePan = false;

  const resizeGlobe = () => {
    const width = peerMapEl.clientWidth;
    const height = peerMapEl.clientHeight;
    if (!width || !height) return;
    peerMap.width(width).height(height);
    peerMap.pointOfView({ lat: 18, lng: 0, altitude: 2.05 }, 0);
  };

  resizeGlobe();
  if (!peerResizeBound) {
    window.addEventListener("resize", resizeGlobe);
    peerResizeBound = true;
  }

  if (peerMapThemeToggle) {
    peerMapThemeToggle.addEventListener("click", togglePeerMapTheme);
  }
};

const pruneExpiredMapEvents = () => {
  const now = Date.now();
  activeArcEvents = activeArcEvents.filter((arc) => now - arc.ts < (arc.ttl || ARC_TTL_MS));
  activeRingEvents = activeRingEvents.filter((ring) => now - ring.ts < (ring.ttl || RING_TTL_MS));
  activeBeamHeads = activeBeamHeads.filter((head) => now - head.ts < (head.ttl || BEAM_HEAD_TTL_MS));
  activeImageRunnerEvents = activeImageRunnerEvents.filter((runner) => now - runner.ts < (runner.ttl || IMAGE_RUNNER_TTL_MS));
};

const refreshImageRunnerHeads = () => {
  const now = Date.now();
  activeImageRunnerHeads = activeImageRunnerEvents.map((runner) => {
    const elapsed = Math.max(0, now - runner.ts);
    const ttl = runner.ttl || IMAGE_RUNNER_TTL_MS;
    const progress = Math.max(0, Math.min(1, elapsed / ttl));
    const eased = 1 - (1 - progress) ** 2;
    return {
      id: runner.id,
      lat: runner.sourceLat + (runner.targetLat - runner.sourceLat) * eased,
      lng: runner.sourceLng + (runner.targetLng - runner.sourceLng) * eased,
      size: IMAGE_RUNNER_BASE_SIZE * (runner.intensity || 1),
    };
  });
};

export const syncMapEventLayers = () => {
  if (!peerMap) return;
  pruneExpiredMapEvents();
  refreshImageRunnerHeads();
  peerMap
    .pointsData([...peerNodes, ...activeBeamHeads])
    .arcsData(activeArcEvents)
    .ringsData(activeRingEvents)
    .htmlElementsData(activeImageRunnerHeads);
};

const emitBeamHead = (lat, lng, intensity = 1, delayMs = 0) => {
  const now = Date.now();
  activeBeamHeads.push({
    id: `${now}-beam-${Math.random().toString(36).slice(2, 8)}`,
    kind: "beamHead",
    lat,
    lng,
    intensity: Math.max(1, intensity) * BEAM_HEAD_SPEEDUP,
    ttl: BEAM_HEAD_TTL_MS,
    ts: now + delayMs,
  });
};

const emitImageRunner = (link, intensity = 1, delayMs = 0) => {
  const now = Date.now();
  activeImageRunnerEvents.push({
    id: `${now}-runner-${Math.random().toString(36).slice(2, 8)}`,
    sourceLat: link.sourceLat,
    sourceLng: link.sourceLng,
    targetLat: link.targetLat,
    targetLng: link.targetLng,
    intensity: Math.max(0.85, Math.min(2.1, intensity)),
    ttl: Math.max(700, link.animateTime * 0.5),
    ts: now + delayMs,
  });
};

const emitTxFlow = () => {
  if (!peerLinks.length) return;

  const link = peerLinks[Math.floor(Math.random() * peerLinks.length)];
  const now = Date.now();
  const id = `${now}-${Math.random().toString(36).slice(2, 8)}`;

  activeArcEvents.push({
    id,
    sourceLat: link.sourceLat,
    sourceLng: link.sourceLng,
    targetLat: link.targetLat,
    targetLng: link.targetLng,
    sourceLabel: link.sourceLabel,
    targetLabel: link.targetLabel,
    weight: link.weight,
    altitude: link.altitude,
    stroke: link.stroke,
    animateTime: 950,
    ttl: ARC_TTL_MS,
    ts: now,
  });

  activeRingEvents.push({
    id,
    lat: link.targetLat,
    lng: link.targetLng,
    ttl: RING_TTL_MS,
    ts: now,
  });

  syncMapEventLayers();
};

const buildLinkAdjacency = () => {
  const adjacency = new Map();

  peerLinks.forEach((link) => {
    const sourceId = nodeKey(link.sourceLat, link.sourceLng);
    const targetId = nodeKey(link.targetLat, link.targetLng);

    const forward = {
      sourceLat: link.sourceLat,
      sourceLng: link.sourceLng,
      targetLat: link.targetLat,
      targetLng: link.targetLng,
      sourceLabel: link.sourceLabel,
      targetLabel: link.targetLabel,
      weight: link.weight,
      altitude: link.altitude,
      stroke: link.stroke,
      animateTime: link.animateTime,
      sourceId,
      targetId,
    };

    const reverse = {
      ...forward,
      sourceLat: link.targetLat,
      sourceLng: link.targetLng,
      targetLat: link.sourceLat,
      targetLng: link.sourceLng,
      sourceLabel: link.targetLabel,
      targetLabel: link.sourceLabel,
      sourceId: targetId,
      targetId: sourceId,
    };

    if (!adjacency.has(sourceId)) adjacency.set(sourceId, []);
    if (!adjacency.has(targetId)) adjacency.set(targetId, []);
    adjacency.get(sourceId).push(forward);
    adjacency.get(targetId).push(reverse);
  });

  return adjacency;
};

const emitCascadeStep = (link, step) => {
  const now = Date.now();
  const id = `${now}-${step}-${Math.random().toString(36).slice(2, 8)}`;

  activeArcEvents.push({
    id,
    sourceLat: link.sourceLat,
    sourceLng: link.sourceLng,
    targetLat: link.targetLat,
    targetLng: link.targetLng,
    sourceLabel: link.sourceLabel,
    targetLabel: link.targetLabel,
    weight: link.weight,
    altitude: Math.min(0.42, link.altitude + step * 0.018),
    stroke: Math.min(2.1, link.stroke + step * 0.12),
    animateTime: Math.max(700, link.animateTime - step * 140),
    ttl: ARC_TTL_MS + step * 220,
    ts: now,
  });

  activeRingEvents.push({
    id,
    lat: link.targetLat,
    lng: link.targetLng,
    ttl: RING_TTL_MS + step * 140,
    ts: now,
  });

  syncMapEventLayers();
  emitImageRunner(link, 1 + step * 0.12, step * 40);
};

const emitNodeShockwave = (lat, lng, intensity = 1) => {
  const now = Date.now();
  for (let i = 0; i < TX_SURGE_RING_COUNT; i += 1) {
    const delayMs = i * 30;
    activeRingEvents.push({
      id: `${now}-${i}-${Math.random().toString(36).slice(2, 8)}`,
      lat,
      lng,
      ttl: RING_TTL_MS + i * 220 + intensity * 90,
      ts: now + delayMs,
    });

    emitBeamHead(lat, lng, intensity + i * 0.3, delayMs);
  }
};

export const emitTxCascade = () => {
  if (!peerLinks.length || !peerNodes.length) return;

  const adjacency = buildLinkAdjacency();
  if (!adjacency.size) {
    emitTxFlow();
    return;
  }

  const startNode = peerNodes[Math.floor(Math.random() * peerNodes.length)];
  emitNodeShockwave(startNode.lat, startNode.lng, 2);
  let frontier = [nodeKey(startNode.lat, startNode.lng)];
  const visited = new Set(frontier);

  for (let step = 0; step < CASCADE_STEPS; step += 1) {
    const stepFrontier = [...frontier];
    window.setTimeout(() => {
      const nextFrontier = [];

      stepFrontier.forEach((nodeId) => {
        const neighbors = adjacency.get(nodeId) || [];
        if (!neighbors.length) return;

        const shuffled = [...neighbors].sort(() => Math.random() - 0.5);
        const chosen = shuffled.slice(0, CASCADE_BRANCHES);

        chosen.forEach((link) => {
          emitCascadeStep(link, step);
          if (Math.random() > 0.45) {
            emitCascadeStep({
              ...link,
              sourceLat: link.targetLat,
              sourceLng: link.targetLng,
              targetLat: link.sourceLat,
              targetLng: link.sourceLng,
              sourceLabel: link.targetLabel,
              targetLabel: link.sourceLabel,
            }, step + 1);
          }

          if (!visited.has(link.targetId)) {
            visited.add(link.targetId);
            nextFrontier.push(link.targetId);
          }
        });
      });

      if (nextFrontier.length) {
        frontier = nextFrontier;
      }
    }, step * CASCADE_STEP_DELAY_MS);
  }
};

export const emitGlobalTxNetworkFlow = (intensity = 1) => {
  if (!peerLinks.length || !peerNodes.length) return;

  const now = Date.now();
  const linkBudget = Math.min(
    peerLinks.length,
    Math.max(10, Math.floor(GLOBAL_FLOW_LINK_LIMIT * Math.min(2.5, intensity))),
  );

  const shuffledLinks = [...peerLinks]
    .sort(() => Math.random() - 0.5)
    .slice(0, linkBudget);

  peerNodes.forEach((node, index) => {
    window.setTimeout(() => {
      emitNodeShockwave(node.lat, node.lng, Math.max(1, intensity * 0.75));
      syncMapEventLayers();
    }, index * 10);
  });

  shuffledLinks.forEach((link, index) => {
    window.setTimeout(() => {
      const eventId = `${now}-global-${index}-${Math.random().toString(36).slice(2, 8)}`;
      const ttlBoost = Math.floor(350 * Math.min(2, intensity));

      activeArcEvents.push({
        id: eventId,
        sourceLat: link.sourceLat,
        sourceLng: link.sourceLng,
        targetLat: link.targetLat,
        targetLng: link.targetLng,
        sourceLabel: link.sourceLabel,
        targetLabel: link.targetLabel,
        weight: link.weight,
        altitude: Math.min(0.5, link.altitude + 0.08),
        stroke: Math.min(2.4, link.stroke + 0.45),
        animateTime: Math.max(520, link.animateTime * 0.45),
        ttl: ARC_TTL_MS + ttlBoost,
        ts: Date.now(),
      });

      activeRingEvents.push({
        id: eventId,
        lat: link.targetLat,
        lng: link.targetLng,
        ttl: RING_TTL_MS + Math.floor(250 * Math.min(2, intensity)),
        ts: Date.now(),
      });

      syncMapEventLayers();
      emitImageRunner(link, 1.2 + Math.min(1, intensity * 0.2), index * 16);
    }, index * GLOBAL_FLOW_STAGGER_MS);
  });
};

export const emitTransactionLightLinks = (intensity = 1) => {
  if (!peerLinks.length) return;

  const now = Date.now();
  const linkBudget = Math.min(
    peerLinks.length,
    Math.max(3, Math.floor(TX_LIGHT_LINK_LIMIT * Math.min(2.2, intensity))),
  );

  const selectedLinks = [...peerLinks]
    .sort(() => Math.random() - 0.5)
    .slice(0, linkBudget);

  selectedLinks.forEach((link, index) => {
    window.setTimeout(() => {
      const eventId = `${now}-tx-link-${index}-${Math.random().toString(36).slice(2, 8)}`;

      activeArcEvents.push({
        id: eventId,
        sourceLat: link.sourceLat,
        sourceLng: link.sourceLng,
        targetLat: link.targetLat,
        targetLng: link.targetLng,
        sourceLabel: link.sourceLabel,
        targetLabel: link.targetLabel,
        weight: link.weight,
        altitude: Math.min(0.52, link.altitude + 0.11),
        stroke: Math.min(2.9, link.stroke + 0.7),
        animateTime: Math.max(420, link.animateTime * 0.35),
        ttl: ARC_TTL_MS + 850,
        ts: Date.now(),
        glow: true,
      });

      activeArcEvents.push({
        id: `${eventId}-return`,
        sourceLat: link.targetLat,
        sourceLng: link.targetLng,
        targetLat: link.sourceLat,
        targetLng: link.sourceLng,
        sourceLabel: link.targetLabel,
        targetLabel: link.sourceLabel,
        weight: link.weight,
        altitude: Math.min(0.52, link.altitude + 0.1),
        stroke: Math.min(2.6, link.stroke + 0.5),
        animateTime: Math.max(420, link.animateTime * 0.38),
        ttl: ARC_TTL_MS + 760,
        ts: Date.now(),
        glow: true,
      });

      syncMapEventLayers();
      emitImageRunner(link, 1.05 + Math.min(0.8, intensity * 0.15), index * 20);
    }, index * 24);
  });
};

const groupedPeersToGraph = (peers) => {
  const grouped = new Map();
  peers.forEach((peer) => {
    const lat = Number(peer.latitude);
    const lng = Number(peer.longitude);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return;

    const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        id: key,
        lat,
        lng,
        count: 0,
        countries: new Set(),
      });
    }

    const entry = grouped.get(key);
    entry.count += 1;
    entry.countries.add(peer.country || peer.country_code || "Unknown");
  });

  const nodes = Array.from(grouped.values()).map((entry) => ({
    ...entry,
    countryLabel: Array.from(entry.countries).filter(Boolean).join(", ") || "Unknown",
  }));

  if (!nodes.length) return { nodes: [], links: [] };

  const hub = nodes.reduce((best, node) => (node.count > best.count ? node : best), nodes[0]);
  const links = [];

  nodes.forEach((node) => {
    if (node.id === hub.id) return;
    const weight = node.count + hub.count;
    links.push({
      sourceLat: hub.lat,
      sourceLng: hub.lng,
      targetLat: node.lat,
      targetLng: node.lng,
      sourceLabel: hub.countryLabel,
      targetLabel: node.countryLabel,
      weight,
      altitude: 0.16 + Math.min(0.28, weight * 0.014),
      stroke: 0.35 + Math.min(1.6, weight * 0.08),
      animateTime: Math.max(1300, 3600 - weight * 75),
    });
  });

  const sorted = [...nodes].sort((a, b) => b.count - a.count).slice(0, 8);
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const source = sorted[i];
    const target = sorted[i + 1];
    const weight = source.count + target.count;
    links.push({
      sourceLat: source.lat,
      sourceLng: source.lng,
      targetLat: target.lat,
      targetLng: target.lng,
      sourceLabel: source.countryLabel,
      targetLabel: target.countryLabel,
      weight,
      altitude: 0.12 + Math.min(0.2, weight * 0.01),
      stroke: 0.3 + Math.min(1.3, weight * 0.06),
      animateTime: Math.max(1200, 3000 - weight * 60),
    });
  }

  return { nodes, links };
};

export async function loadPeerGeo() {
  if (!peerMap) return;

  try {
    const response = await fetch("/api/peer-geo");
    const data = await response.json();
    const peers = Array.isArray(data.peers) ? data.peers : [];
    const updated = data.updated_at ? new Date(data.updated_at * 1000) : null;

    peerMapCount.textContent = `${data.ip_count ?? peers.length} peers`;
    peerMapUpdated.textContent = `Last update: ${updated ? updated.toLocaleString() : "--"}`;
    const geoLabel = data.provider ? `GeoIP: ${data.provider}` : `GeoIP: ${data.geoip_enabled ? "enabled" : "disabled"}`;
    peerMapGeoip.textContent = geoLabel;

    const graph = groupedPeersToGraph(peers);
    peerNodes = graph.nodes;
    peerLinks = graph.links;

    peerMap
      .pointsData([...peerNodes, ...activeBeamHeads])
      .arcsData(activeArcEvents)
      .ringsData(activeRingEvents)
      .htmlElementsData(activeImageRunnerHeads);
  } catch (error) {
    peerMapUpdated.textContent = "Last update: error";
    peerMapGeoip.textContent = "GeoIP: unavailable";
  }
}
