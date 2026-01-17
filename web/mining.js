const modeEl = document.getElementById("mining-mode");
const currentEl = document.getElementById("mining-current");
const updatedEl = document.getElementById("mining-updated");
const noteEl = document.getElementById("mining-note");

const chartCtx = document.getElementById("mining-chart");
const labels = [];
const dataPoints = [];

const chart = new Chart(chartCtx, {
  type: "line",
  data: {
    labels,
    datasets: [
      {
        label: "Utilization %",
        data: dataPoints,
        borderColor: "#6fffe9",
        backgroundColor: "rgba(111, 255, 233, 0.18)",
        tension: 0.35,
        fill: true,
        pointRadius: 2,
        pointHoverRadius: 4,
      },
    ],
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {
        min: 0,
        max: 100,
        ticks: {
          callback: (value) => `${value}%`,
          color: "#94a3b8",
        },
        grid: {
          color: "rgba(148, 163, 184, 0.12)",
        },
      },
      x: {
        ticks: {
          color: "#94a3b8",
          maxTicksLimit: 8,
        },
        grid: {
          color: "rgba(148, 163, 184, 0.08)",
        },
      },
    },
    plugins: {
      legend: {
        labels: {
          color: "#e6edf6",
        },
      },
    },
  },
});

const updateChart = (label, value) => {
  labels.push(label);
  dataPoints.push(value);

  if (labels.length > 60) {
    labels.shift();
    dataPoints.shift();
  }

  chart.update();
};

const formatValue = (value) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "--";
  }
  return value.toFixed(1);
};

async function loadMiningPower() {
  try {
    const response = await fetch("/api/mining-power");
    const data = await response.json();
    const percent = Number(data.percent);
    const mode = data.mode || "CPU";
    const timestamp = new Date();

    modeEl.textContent = mode;
    currentEl.textContent = `${formatValue(percent)}%`;
    updatedEl.textContent = timestamp.toLocaleTimeString();
    noteEl.textContent = `${mode} telemetry active`;

    if (!Number.isNaN(percent)) {
      updateChart(timestamp.toLocaleTimeString(), percent);
    }
  } catch (error) {
    noteEl.textContent = `Telemetry unavailable: ${error}`;
  }
}

loadMiningPower();
setInterval(loadMiningPower, 2000);
