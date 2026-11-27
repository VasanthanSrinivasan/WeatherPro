const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
let token = localStorage.getItem("wt"),
  user = JSON.parse(localStorage.getItem("wu") || "null"),
  unit = localStorage.getItem("unit") || "C",
  data,
  charts = {},
  map,
  layer,
  pin,
  mode = "login",
  range = "daily";
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
Chart.defaults.color = "#e5e7eb";
Chart.defaults.borderColor = "rgba(255,255,255,.12)";

async function api(p, o = {}) {
  const r = await fetch("/api/" + p, {
    ...o,
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: "Bearer " + token }),
    },
  });
  if (r.status === 401 && token) logout();
  if (!(r.headers.get("content-type") || "").includes("json")) {
    if (!r.ok) throw new Error("Request failed (" + r.status + ")");
    return r;
  }
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "Request failed");
  return d;
}
// ---------- auth ----------
$("#authToggle").onclick = () => {
  mode = mode === "login" ? "register" : "login";
  $("#nameRow").hidden = mode === "login";
  $("#authBtn").textContent = mode === "login" ? "Sign in" : "Create account";
  $("#authToggle").textContent =
    mode === "login" ? "New here? Sign up" : "Have an account? Sign in";
};
$("#authForm").onsubmit = async (e) => {
  e.preventDefault();
  $("#authErr").textContent = "";
  try {
    const d = await api("auth/" + mode, {
      method: "POST",
      body: JSON.stringify({
        name: $("#name").value,
        email: $("#email").value,
        password: $("#password").value,
      }),
    });
    token = d.token;
    user = d.user;
    localStorage.setItem("wt", token);
    localStorage.setItem("wu", JSON.stringify(user));
    data = null;
    show();
  } catch (err) {
    $("#authErr").textContent = err.message;
  }
};
function logout() {
  token = user = data = null;
  localStorage.removeItem("wt");
  localStorage.removeItem("wu");
  show();
}
$("#out").onclick = logout;
function show() {
  const on = !!token;
  $("#auth").hidden = on;
  $("#app").hidden = !on;
  if (!on) return;
  $("#who").textContent = user.name;
  $$(".admin").forEach((e) => (e.hidden = user.role !== "admin"));
  $("#unit").textContent = "°" + unit;
  go("dash");
  if (!data) search(localStorage.getItem("lastCity") || "Namakkal");
}
function go(t) {
  $$("main > section").forEach((s) => (s.hidden = s.id !== "t-" + t));
  $$("nav a").forEach((a) => a.classList.toggle("on", a.dataset.t === t));
  if (t === "dash" && map) setTimeout(() => map.invalidateSize(), 50);
  if (t === "rep") report();
  if (t === "hist") history();
  if (t === "adm") admin();
}
$$("nav a").forEach((a) => (a.onclick = () => go(a.dataset.t)));

// ---------- search ----------
async function search(city) {
  $("#err").textContent = "";
  try {
    data = await api("weather?city=" + encodeURIComponent(city));
    localStorage.setItem("lastCity", data.current.name);
    render();
  } catch (e) {
    $("#err").textContent = e.message;
  }
}
$("#searchForm").onsubmit = (e) => {
  e.preventDefault();
  const v = $("#city").value.trim();
  if (v) {
    search(v);
    go("dash");
  }
};
$("#unit").onclick = () => {
  unit = unit === "C" ? "F" : "C";
  localStorage.setItem("unit", unit);
  $("#unit").textContent = "°" + unit;
  data && render();
};

// ---------- helpers ----------
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
const moon = () => {
  const s = 29.530588853,
    a = ((((Date.now() - Date.UTC(2000, 0, 6, 18, 14)) / 864e5) % s) + s) % s;
  return {
    illum: Math.round(((1 - Math.cos((2 * Math.PI * a) / s)) / 2) * 100),
    toFull: Math.round((14.765 - a + s) % s),
  };
};
const compass = (d) =>
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
  ][Math.round(d / 22.5) % 16];
const mkChart = (id, cfg) => {
  charts[id]?.destroy();
  cfg.options = {
    responsive: true,
    maintainAspectRatio: false,
    ...cfg.options,
  };
  charts[id] = new Chart($("#" + id), cfg);
};
function clock() {
  if (!data) return;
  const d = new Date(Date.now() + data.current.timezone * 1000);
  $("#clock").textContent = d.toLocaleString("en-IN", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
setInterval(clock, 1000);

// ---------- dashboard ----------
function render() {
  const c = data.current,
    w = c.weather[0],
    f = data.forecast,
    a = data.air,
    dl = data.daily,
    tz = c.timezone;
  $("#place").textContent = `${c.name}, ${c.sys.country}`;
  $("#icon").src = `https://openweathermap.org/img/wn/${w.icon}@2x.png`;
  $("#big").textContent = T(c.main.temp) + unit;
  $("#desc").textContent = w.description;
  $("#feels").textContent = "Feels like " + T(c.main.feels_like);
  clock();
  const hm = (ts) =>
    new Date((ts + tz) * 1000).toLocaleTimeString("en-IN", {
      timeZone: "UTC",
      hour: "2-digit",
      minute: "2-digit",
    });
  const h = c.main.humidity,
    g = Math.log(h / 100) + (17.62 * c.main.temp) / (243.12 + c.main.temp),
    dew = (243.12 * g) / (17.62 - g);
  const aq = ["Good", "Fair", "Moderate", "Poor", "Very poor"],
    uv = data.uv,
    m = moon(),
    nx = f[0],
    dayLen = c.sys.sunset - c.sys.sunrise;
  const diff = Math.round(F(c.main.feels_like) - F(c.main.temp));
  const cards = [
    [
      "Feels like",
      T(c.main.feels_like),
      diff > 0
        ? `Warmer than actual by ${diff}°`
        : diff < 0
          ? `Cooler than actual by ${-diff}°`
          : "Same as actual",
    ],
    ["Cloud cover", c.clouds.all + "%", w.main],
    [
      "Precipitation",
      Math.round((nx.pop || 0) * 100) + "%",
      `Next 3h chance · ${nx.rain?.["3h"] ?? 0} mm`,
    ],
    [
      "Wind",
      `<span class="arrow" style="transform:rotate(${(c.wind.deg || 0) + 180}deg)">↑</span> ${(c.wind.speed * 3.6).toFixed(0)} km/h`,
      `From ${compass(c.wind.deg || 0)}${c.wind.gust ? " · gust " + (c.wind.gust * 3.6).toFixed(0) + " km/h" : ""}`,
    ],
    ["Humidity", h + "%", `Dew point ${T(dew)}`],
    [
      "UV index",
      uv ?? "–",
      uv == null
        ? "Unavailable"
        : uv < 3
          ? "Low"
          : uv < 6
            ? "Moderate"
            : uv < 8
              ? "High"
              : "Very high",
    ],
    [
      "Air quality",
      a ? a.main.aqi : "–",
      a
        ? `${aq[a.main.aqi - 1]} · PM2.5 ${a.components.pm2_5.toFixed(1)} µg/m³`
        : "Unavailable",
    ],
    [
      "Visibility",
      ((c.visibility ?? 0) / 1000).toFixed(1) + " km",
      (c.visibility ?? 0) >= 8000 ? "Excellent" : "Reduced",
    ],
    [
      "Pressure",
      c.main.pressure + " mb",
      `Sea level ${c.main.sea_level ?? c.main.pressure}`,
    ],
    [
      "Sun",
      `🌅 ${hm(c.sys.sunrise)}`,
      `Sunset ${hm(c.sys.sunset)} · ${Math.floor(dayLen / 3600)}h ${Math.round((dayLen % 3600) / 60)}m daylight`,
    ],
    ["Moon", m.illum + "%", `Next full moon in ${m.toFull} days`],
  ];
  $("#cards").innerHTML = cards
    .map(
      ([t, v, s]) =>
        `<div class="card"><b>${esc(t)}</b><div class="v">${v}</div><small>${esc(s)}</small></div>`,
    )
    .join("");
  const hh = f.slice(0, 16);
  mkChart("hourly", {
    data: {
      labels: hh.map((x) =>
        new Date((x.dt + tz) * 1000).toLocaleString("en-IN", {
          timeZone: "UTC",
          weekday: "short",
          hour: "numeric",
        }),
      ),
      datasets: [
        {
          type: "line",
          label: "Temp °" + unit,
          data: hh.map((x) => Math.round(F(x.main.temp))),
          borderColor: "#ff7a45",
          tension: 0.4,
          yAxisID: "y",
        },
        {
          type: "bar",
          label: "Rain chance %",
          data: hh.map((x) => Math.round((x.pop || 0) * 100)),
          backgroundColor: "rgba(96,165,250,.5)",
          yAxisID: "y1",
        },
      ],
    },
    options: {
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
  $("#cal").innerHTML = dl
    ? dl.time
        .map(
          (d, i) =>
            `<a class="day" href="/day.html?lat=${c.coord.lat}&lon=${c.coord.lon}&date=${d}&city=${encodeURIComponent(c.name)}"><b>${new Date(d).toLocaleDateString("en-IN", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" })}</b><span>${wmo(dl.weathercode[i])}</span><em>${T(dl.temperature_2m_max[i])} / ${T(dl.temperature_2m_min[i])}</em><small>💧 ${dl.precipitation_probability_max[i] ?? 0}%</small></a>`,
        )
        .join("")
    : "<p>Outlook unavailable</p>";
  drawMap();
  loadTrends();
}
// ---------- weather trends ----------
const MON = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const TR = {
  temp: {
    k: ["max", "min"],
    n: ["Daily high", "Daily low"],
    c: ["#ef4444", "#3b82f6"],
    u: "°",
  },
  rain: { k: ["rain"], n: ["Precipitation"], c: ["#60a5fa"], u: " mm" },
  hum: { k: ["hum"], n: ["Humidity"], c: ["#34d399"], u: "%" },
  wind: { k: ["wind"], n: ["Wind"], c: ["#fbbf24"], u: " km/h" },
};
let trend,
  trKey,
  trTab = "temp";
$("#trtabs").innerHTML = [
  ["temp", "🌡️ Temperature"],
  ["rain", "💧 Precipitation"],
  ["hum", "💦 Humidity"],
  ["wind", "💨 Wind"],
]
  .map(([k, l]) => `<button data-k="${k}">${l}</button>`)
  .join("");
$$("#trtabs button").forEach(
  (b) =>
    (b.onclick = () => {
      trTab = b.dataset.k;
      drawTrends();
    }),
);
$$(".opts input").forEach(
  (i) =>
    (i.onchange = () => {
      const c = charts.trend;
      if (!c) return;
      c.data.datasets.forEach((d) => {
        if (d.g === i.dataset.g) d.hidden = !i.checked;
      });
      c.update();
    }),
);
async function loadTrends() {
  const { lat, lon } = data.current.coord,
    key = lat + "," + lon;
  $("#trerr").textContent = "";
  if (trKey !== key) {
    try {
      trend = await api(`trends?lat=${lat}&lon=${lon}`);
      trKey = key;
    } catch (e) {
      $("#trerr").textContent = "Trends unavailable: " + e.message;
      return;
    }
  }
  drawTrends();
}
const todayLine = {
  id: "today",
  afterDraw(c) {
    if (!trend) return;
    const x = c.scales.x.getPixelForValue(trend.split - 1),
      a = c.chartArea,
      g = c.ctx;
    g.save();
    g.strokeStyle = "rgba(255,255,255,.6)";
    g.fillStyle = "#fff";
    g.beginPath();
    g.moveTo(x, a.top);
    g.lineTo(x, a.bottom);
    g.stroke();
    g.fillText("Today", x - 16, a.top + 12);
    g.restore();
  },
};
function drawTrends() {
  if (!trend) return;
  const t = TR[trTab],
    conv = trTab === "temp" ? F : (x) => x,
    sp = trend.split,
    ds = [];
  const val = (x) => (x == null ? null : +conv(x).toFixed(1)),
    on = (g) => $(`.opts [data-g=${g}]`).checked;
  $$("#trtabs button").forEach((b) =>
    b.classList.toggle("on", b.dataset.k === trTab),
  );
  t.k.forEach((k, i) => {
    const a = trend.actual[k],
      h = trend.normal[k];
    if (!a) return;
    ds.push({
      label: t.n[i],
      g: "a",
      hidden: !on("a"),
      data: a.map((x, j) => (j < sp ? val(x) : null)),
      borderColor: t.c[i],
      backgroundColor: t.c[i] + "33",
      fill: true,
      pointRadius: 0,
      tension: 0.3,
      borderWidth: 1.5,
    });
    ds.push({
      label: t.n[i] + " (forecast)",
      g: "f",
      hidden: !on("f"),
      data: a.map((x, j) => (j >= sp - 1 ? val(x) : null)),
      borderColor: t.c[i],
      borderDash: [4, 4],
      pointRadius: 0,
      tension: 0.3,
      borderWidth: 1.5,
    });
    ds.push({
      label: "Historical " + t.n[i].toLowerCase(),
      g: "h",
      hidden: !on("h"),
      data: h.map(val),
      borderColor: "#fff",
      borderDash: [2, 3],
      pointRadius: 0,
      tension: 0.3,
      borderWidth: 1,
    });
  });
  $("#trerr").textContent = ds.length
    ? ""
    : "No data available for this metric here";
  mkChart("trend", {
    type: "line",
    data: { labels: trend.time, datasets: ds },
    plugins: [todayLine],
    options: {
      interaction: { mode: "index", intersect: false },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            autoSkip: false,
            maxRotation: 0,
            callback(v) {
              const d = this.getLabelForValue(v);
              return d.endsWith("-01") ? MON[+d.slice(5, 7) - 1] : "";
            },
          },
        },
        y: { ticks: { callback: (v) => v + t.u } },
      },
      plugins: {
        legend: { labels: { filter: (i) => !i.text.includes("forecast") } },
        tooltip: {
          callbacks: {
            label: (c) => `${c.dataset.label}: ${c.parsed.y}${t.u}`,
          },
        },
      },
    },
  });
  const C = trend.climate,
    S = trend.summary,
    r0 = (x) => Math.round(F(x)),
    r1 = (x) => x.toFixed(1);
  $("#clim").innerHTML =
    "<tr><th></th><th>Last 12 months</th><th>All years</th></tr>" +
    [
      ["🌡️ Hottest month", "hot"],
      ["❄️ Coldest month", "cold"],
      ["💧 Wettest month", "wet"],
      ["💨 Windiest month", "wind"],
    ]
      .map(
        ([l, k]) =>
          `<tr><td>${l}</td><td>${esc(C[k][0] ?? "–")}</td><td>${esc(C[k][1] ?? "–")}</td></tr>`,
      )
      .join("");
  $("#sumry").innerHTML =
    "<tr><th></th><th>Max</th><th>Average</th><th>Min</th></tr>" +
    [
      ["High temperature (°" + unit + ")", S.max, r0],
      ["Low temperature (°" + unit + ")", S.min, r0],
      ["Precipitation (mm)", S.rain, r1],
      ["Wind (km/h)", S.wind, r1],
    ]
      .map(
        ([l, s, f]) =>
          `<tr><td>${l}</td>${s ? [s.max, s.avg, s.min].map((x) => `<td>${f(x)}</td>`).join("") : "<td>–</td><td>–</td><td>–</td>"}</tr>`,
      )
      .join("");
}

// ---------- reports / history / admin ----------
$$("[data-r]").forEach(
  (b) =>
    (b.onclick = () => {
      range = b.dataset.r;
      report();
    }),
);
async function report() {
  $$("[data-r]").forEach((b) =>
    b.classList.toggle("on", b.dataset.r === range),
  );
  const r = await api("reports?range=" + range),
    lab = (x) =>
      range === "daily" ? x.label + ":00" : String(x.label).slice(0, 10);
  $("#repBody").innerHTML =
    r.rows
      .map(
        (x) =>
          `<tr><td>${esc(lab(x))}</td><td>${x.n}</td><td>${T(x.avg_temp)}</td><td>${T(x.min_temp)}</td><td>${T(x.max_temp)}</td><td>${x.avg_humidity}%</td><td>${x.avg_wind} m/s</td></tr>`,
      )
      .join("") ||
    '<tr><td colspan="7">No data yet — search a city first</td></tr>';
  mkChart("repChart", {
    data: {
      labels: r.rows.map(lab),
      datasets: [
        {
          type: "bar",
          label: "Min–Max °" + unit,
          data: r.rows.map((x) => [
            Math.round(F(x.min_temp)) - 0.3,
            Math.round(F(x.max_temp)) + 0.3,
          ]),
          backgroundColor: "rgba(239,68,68,.45)",
          borderRadius: 6,
          maxBarThickness: 60,
        },
        {
          type: "line",
          label: "Avg °" + unit,
          data: r.rows.map((x) => Math.round(F(x.avg_temp))),
          borderColor: "#ff7a45",
          backgroundColor: "#ff7a45",
          pointRadius: 5,
          tension: 0.3,
        },
        {
          type: "line",
          label: "Humidity %",
          data: r.rows.map((x) => x.avg_humidity),
          borderColor: "#60a5fa",
          backgroundColor: "#60a5fa",
          pointRadius: 5,
          tension: 0.3,
          yAxisID: "y1",
        },
      ],
    },
    options: {
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
async function history() {
  const r = await api("history");
  $("#histBody").innerHTML = r
    .map(
      (x) =>
        `<tr><td>${esc(x.searched_at)}</td><td>${esc(x.city)}, ${esc(x.country)}</td><td>${T(x.temp)}</td><td>${esc(x.description)}</td><td>${x.humidity}%</td></tr>`,
    )
    .join("");
}
async function admin() {
  const r = await api("admin/searches");
  $("#admBody").innerHTML = r
    .map(
      (x) =>
        `<tr><td>${esc(x.searched_at)}</td><td>${esc(x.user_name)}</td><td>${esc(x.email)}</td><td>${esc(x.city)}</td><td>${x.temp}</td><td>${esc(x.description)}</td></tr>`,
    )
    .join("");
}
$("#dl").onclick = async () => {
  const b = await (await api("admin/export.csv")).blob(),
    a = document.createElement("a");
  a.href = URL.createObjectURL(b);
  a.download = "weather_data.csv";
  a.click();
};

show();