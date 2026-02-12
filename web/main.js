import { loadDashboardSections } from "/static/section-loader.js";

async function boot() {
  await loadDashboardSections();
  await import("/static/app.js");
}

boot().catch((error) => {
  console.error("Dashboard initialization failed", error);
});
