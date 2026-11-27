const q = new URLSearchParams(location.search),
  token = localStorage.getItem("wt");
let unit = localStorage.getItem("unit") || "C",
  d,
  chart;
if (!token) location.href = "/";
const $ = (s) => document.querySelector(s);
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const F = (c) => (unit === "C" ? c : (c * 9) / 5 + 32),
  T = (c) => (c == null ? "–" : Math.round(F(c)) + "°");
const wmo = (c) =>
  c <= 1
    ? "☀️"
    : c == 2
      ? "⛅"
      : c == 3
        ? "☁️"
        : c <= 48
          ? "🌫️"
          : c <= 57
            ? "🌦️"
            : c <= 67
              ? "🌧️"
              : c <= 77
                ? "❄️"
                : c <= 82
                  ? "🌧️"
                  : "⛈️";
const compass = (x) =>
  [
    "N",
    "NNE",
    "NE",
    "ENE",
    "E",
    "ESE",
    "SE",
    "SSE",
    "S",
    "SSW",
    "SW",
    "WSW",
    "W",
    "WNW",
    "NW",
    "NNW",
  ][Math.round(x / 22.5) % 16];
Chart.defaults.color = "#e5e7eb";
Chart.defaults.borderColor = "rgba(255,255,255,.12)";

async function load() {
  const p = new URLSearchParams({
    lat: q.get("lat") || "",
    lon: q.get("lon") || "",
    date: q.get("date") || "",
  });
  const r = await fetch("/api/day?" + p, {
    headers: { Authorization: "Bearer " + token },
  });
  if (r.status === 401) {
    localStorage.removeItem("wt");
    location.href = "/";
    return;
  }
  const j = await r.json();
  if (!r.ok) {
    $("#err").textContent = j.error || "Could not load";
    return;
  }
  d = j;
  render();
}
function render() {
  const h = d.hourly,
    dy = d.daily,
    city = q.get("city") || "";
  const date = new Date(q.get("date")).toLocaleDateString("en-IN", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  $("#unit").textContent = "°" + unit;
  $("#title").textContent = date;
  $("#place").textContent = city;
  $("#sum").textContent =
    `High ${T(dy.temperature_2m_max[0])} · Low ${T(dy.temperature_2m_min[0])}`;
  $("#sun").textContent =
    `🌅 ${dy.sunrise[0].slice(11, 16)}   🌇 ${dy.sunset[0].slice(11, 16)}`;
  $("#rows").innerHTML = h.time
    .map(
      (t, i) =>
        `<tr><td>${esc(t.slice(11, 16))}</td><td>${wmo(h.weathercode[i])}</td><td>${T(h.temperature_2m[i])}</td><td>${T(h.apparent_temperature[i])}</td><td>${h.precipitation_probability[i] ?? 0}%</td><td>${h.precipitation[i] ?? 0}</td><td>${h.relative_humidity_2m[i]}%</td><td>${Math.round(h.wind_speed_10m[i])} km/h ${compass(h.wind_direction_10m[i])}</td><td>${h.cloud_cover[i]}%</td><td>${h.uv_index[i] ?? "–"}</td><td>${((h.visibility[i] ?? 0) / 1000).toFixed(1)} km</td><td>${Math.round(h.pressure_msl[i])} mb</td></tr>`,
    )
    .join("");
  chart?.destroy();
  chart = new Chart($("#hc"), {
    data: {
      labels: h.time.map((t) => t.slice(11, 16)),
      datasets: [
        {
          type: "line",
          label: "Temp °" + unit,
          data: h.temperature_2m.map((x) => Math.round(F(x))),
          borderColor: "#ff7a45",
          tension: 0.4,
          yAxisID: "y",
        },
        {
          type: "bar",
          label: "Rain chance %",
          data: h.precipitation_probability.map((x) => x ?? 0),
          backgroundColor: "rgba(96,165,250,.5)",
          yAxisID: "y1",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y1: {
          position: "right",
          min: 0,
          max: 100,
          grid: { drawOnChartArea: false },
        },
      },
    },
  });
}
$("#unit").onclick = () => {
  unit = unit === "C" ? "F" : "C";
  localStorage.setItem("unit", unit);
  d && render();
};
load();
