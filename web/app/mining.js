const miningPanel = document.getElementById("mining-power-panel");
const miningMode = document.getElementById("mining-mode");
const miningPercent = document.getElementById("mining-percent");
const miningSource = document.getElementById("mining-source");
const miningUpdated = document.getElementById("mining-updated");

const setMiningValue = (element, value) => {
  if (!element) return;
  element.textContent = value;
};

export async function loadMiningPower() {
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

export function setupMiningActions() {
  if (!miningPanel) return;

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
