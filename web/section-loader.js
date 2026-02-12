const SECTION_TARGETS = [
  ["node-status", "/static/sections/node-status.html"],
  ["wallet-watchlist", "/static/sections/wallet-watchlist.html"],
  ["ai-operations-console", "/static/sections/ai-operations-console.html"],
  ["ai-mining-power", "/static/sections/ai-mining-power.html"],
  ["cyphertroopers-map", "/static/sections/cyphertroopers-map.html"],
];

export async function loadDashboardSections() {
  await Promise.all(
    SECTION_TARGETS.map(async ([targetId, path]) => {
      const target = document.getElementById(targetId);
      if (!target) return;

      const response = await fetch(path);
      if (!response.ok) {
        throw new Error(`Failed to load ${path}`);
      }

      target.outerHTML = await response.text();
    }),
  );
}
