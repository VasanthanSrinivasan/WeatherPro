// ===== Weather maps: satellite base + data layers + forecast timeline =====
const TS = [
  [-20, 139, 92, 246],
  [0, 34, 211, 238],
  [10, 163, 230, 53],
  [20, 250, 204, 21],
  [30, 249, 115, 22],
  [40, 220, 38, 38],
];
const TL = [-20, -10, 0, 10, 20, 30, 40];
const LY = {
  temp: { i: "🌡️", n: "Temperature", k: "temp", st: TS, leg: TL, t: 1 },
  rain: {
    i: "💧",
    n: "Precipitation",
    k: "rain",
    tile: "precipitation_new",
    d: 1,
    u: " mm",
    leg: [0, 0.2, 1, 3, 10],
    st: [
      [0, 147, 197, 253, 0],
      [0.2, 147, 197, 253, 0.5],
      [1, 59, 130, 246, 0.7],
      [3, 29, 78, 216, 0.8],
      [10, 124, 58, 237, 0.9],
    ],
  },
  radar: { i: "📡", n: "Radar" },
  wind: {
    i: "💨",
    n: "Wind",
    k: "wind",
    u: " km/h",
    arrow: 1,
    leg: [0, 20, 40, 70, 100],
    st: [
      [0, 34, 197, 94, 0.35],
      [20, 250, 204, 21, 0.5],
      [40, 249, 115, 22, 0.6],
      [70, 220, 38, 38, 0.7],
      [100, 126, 34, 206, 0.8],
    ],
  },
  cloud: {
    i: "☁️",
    n: "Clouds",
    k: "cloud",
    tile: "clouds_new",
    u: "%",
    leg: [0, 25, 50, 75, 100],
    st: [
      [0, 255, 255, 255, 0],
      [50, 255, 255, 255, 0.4],
      [100, 255, 255, 255, 0.85],
    ],
  },
  hum: {
    i: "💦",
    n: "Humidity",
    k: "hum",
    u: "%",
    leg: [20, 40, 60, 80, 100],
    st: [
      [20, 217, 119, 6],
      [50, 163, 230, 53],
      [70, 34, 197, 94],
      [85, 20, 184, 166],
      [100, 59, 130, 246],
    ],
  },
  vis: {
    i: "👁️",
    n: "Visibility",
    k: "vis",
    div: 1000,
    d: 1,
    u: " km",
    leg: [0, 2, 6, 10, 20],
    st: [
      [0, 126, 34, 206],
      [2, 220, 38, 38],
      [6, 250, 204, 21],
      [10, 34, 197, 94],
      [20, 59, 130, 246],
    ],
  },
  pres: {
    i: "🧭",
    n: "Pressure",
    k: "pres",
    u: " mb",
    leg: [990, 1000, 1010, 1020, 1030],
    st: [
      [990, 59, 130, 246],
      [1005, 34, 211, 238],
      [1013, 163, 230, 53],
      [1020, 250, 204, 21],
      [1030, 220, 38, 38],
    ],
  },
  dew: { i: "🌫️", n: "Dew point", k: "dew", st: TS, leg: TL, t: 1 },
  uv: {
    i: "☀️",
    n: "UV index",
    k: "uv",
    d: 1,
    u: "",
    leg: [0, 3, 6, 8, 11],
    st: [
      [0, 34, 197, 94],
      [3, 250, 204, 21],
      [6, 249, 115, 22],
      [8, 220, 38, 38],
      [11, 126, 34, 206],
    ],
  },
  aqi: {
    i: "🍃",
    n: "Air quality",
    k: "aqi",
    u: "",
    leg: [0, 50, 100, 150, 200, 300],
    st: [
      [0, 34, 197, 94],
      [50, 250, 204, 21],
      [100, 249, 115, 22],
      [150, 220, 38, 38],
      [200, 126, 34, 206],
      [300, 127, 29, 29],
    ],
  },
  feels: { i: "🥵", n: "Feels like", k: "feels", st: TS, leg: TL, t: 1 },
};
const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/";
const BASES = {
  sat: () => [
    L.tileLayer(ESRI + "World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 18,
      attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
    }),
    L.tileLayer(
      ESRI + "Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 18, pane: "lbl" },
    ),
  ],
  street: () => [
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap contributors",
    }),
  ],
  light: () => [
    L.tileLayer(
      ESRI + "Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 16, attribution: "© Esri, HERE, Garmin" },
    ),
    L.tileLayer(
      ESRI + "Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 16, pane: "lbl" },
    ),
  ],
};
let cur = "temp",
  G,
  gKey,
  ti = 0,
  baseL = [],
  fieldL,
  tileL,
  bub,
  rv = [],
  rf = [],
  pastN = 0,
  pt;
const sl = $("#mtime");

const rgba = (s, v) => {
  const f = (a) => [a[1], a[2], a[3], a[4] ?? 0.65];
  if (v <= s[0][0]) return f(s[0]);
  for (let i = 1; i < s.length; i++)
    if (v <= s[i][0]) {
      const a = f(s[i - 1]),
        b = f(s[i]),
        t = (v - s[i - 1][0]) / (s[i][0] - s[i - 1][0]);
      return a.map((x, k) => x + (b[k] - x) * t);
    }
  return f(s[s.length - 1]);
};
// inverse-distance interpolation between the forecast grid points
const idw = (P, cl, lat, lon) => {
  let sw = 0,
    sv = 0,
    m = 9;
  for (const p of P) {
    const d = (p.lat - lat) ** 2 + ((p.lon - lon) * cl) ** 2;
    if (d < m) m = d;
    if (d < 1e-6) return p.v;
    const w = 1 / (d * Math.sqrt(d));
    sw += w;
    sv += w * p.v;
  }
  return m > 1.7 ? null : sv / sw;
};
const gv = (p, Lc) => {
  const v = p[Lc.k][ti];
  return v == null ? null : v / (Lc.div || 1);
};
const points = (Lc) =>
  G.pts
    .map((p) => ({ lat: p.lat, lon: p.lon, v: gv(p, Lc) }))
    .filter((p) => p.v != null);
const fm = (Lc, v) =>
  Lc.t ? Math.round(F(v)) + "°" : +v.toFixed(Lc.d || 0) + Lc.u;
const lbl = (d) =>
  new Date(d.getTime() + data.current.timezone * 1000).toLocaleString("en-IN", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

const Field = L.GridLayer.extend({
  initialize(P, Lc, o) {
    this.P = P;
    this.Lc = Lc;
    this.cl = Math.cos((P[0].lat * Math.PI) / 180);
    L.setOptions(this, o);
  },
  createTile(c) {
    const n = 33,
      s = document.createElement("canvas");
    s.width = s.height = n;
    const g = s.getContext("2d"),
      im = g.createImageData(n, n);
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const ll = this._map.unproject(
            L.point(c.x * 256 + i * 8, c.y * 256 + j * 8),
            c.z,
          ),
          v = idw(this.P, this.cl, ll.lat, ll.lng);
        if (v == null) continue;
        const k = rgba(this.Lc.st, v);
        im.data.set([k[0], k[1], k[2], k[3] * 255], (j * n + i) * 4);
      }
    g.putImageData(im, 0, 0);
    const t = document.createElement("canvas");
    t.width = t.height = 256;
    const tg = t.getContext("2d");
    tg.imageSmoothingEnabled = true;
    tg.drawImage(s, -4, -4, 264, 264);
    return t;
  },
});

function setBase(b) {
  baseL.forEach((l) => map.removeLayer(l));
  baseL = BASES[b]();
  baseL.forEach((l) => l.addTo(map));
  $$("[data-b]").forEach((x) => x.classList.toggle("on", x.dataset.b === b));
}
function legend(Lc) {
  const el = $("#legend");
  if (Lc === LY.radar) {
    el.innerHTML =
      '<b>Radar</b><div class="lg" style="background:linear-gradient(90deg,#9fd3ff,#3b82f6,#facc15,#ef4444,#a21caf)"></div><div class="lgl"><span style="left:0">Light</span><span style="left:50%">Moderate</span><span style="left:100%">Heavy</span></div>';
    return;
  }
  const s = Lc.st,
    a = s[0][0],
    z = s[s.length - 1][0],
    pc = (v) => ((v - a) / (z - a)) * 100;
  el.innerHTML = `<b>${Lc.n}${Lc.t ? " (°" + unit + ")" : Lc.u ? " (" + Lc.u.trim() + ")" : ""}</b><div class="lg" style="background:linear-gradient(90deg,${s.map((x) => `rgba(${x[1]},${x[2]},${x[3]},${Math.max(x[4] ?? 0.65, 0.4)}) ${pc(x[0])}%`).join(",")})"></div><div class="lgl">${Lc.leg.map((v) => `<span style="left:${pc(v)}%">${Lc.t ? Math.round(F(v)) : v}</span>`).join("")}</div>`;
}
function clearMap() {
  [fieldL, tileL, bub, ...rv].forEach((x) => x && map.removeLayer(x));
  fieldL = tileL = bub = null;
  rv = [];
  map.closePopup();
}
function draw() {
  const Lc = LY[cur];
  [fieldL, tileL, bub].forEach((x) => x && map.removeLayer(x));
  fieldL = tileL = bub = null;
  if (Lc.tile && ti === 0)
    tileL = L.tileLayer(`/api/tiles/${Lc.tile}/{z}/{x}/{y}`, {
      opacity: 0.85,
      pane: "fld",
    }).addTo(map);
  else {
    const P = points(Lc);
    if (P.length) fieldL = new Field(P, Lc, { pane: "fld" }).addTo(map);
  }
  const m = [],
    W = 2 * G.n + 1;
  G.pts.forEach((p, i) => {
    const a = Math.floor(i / W) - G.n,
      b = (i % W) - G.n,
      v = gv(p, Lc);
    if (a % 2 || b % 2 || v == null) return;
    const ar = Lc.arrow
      ? `<span style="display:inline-block;transform:rotate(${(p.wdir[ti] || 0) + 180}deg)">↑</span> `
      : "";
    m.push(
      L.marker([p.lat, p.lon], {
        interactive: false,
        icon: L.divIcon({
          className: "vmw",
          iconSize: [0, 0],
          html: `<div class="vm">${ar}${esc(fm(Lc, v))}</div>`,
        }),
      }),
    );
  });
  bub = L.layerGroup(m).addTo(map);
  legend(Lc);
  $("#mlabel").textContent =
    lbl(new Date(G.times[ti] + "Z")) + (ti ? "" : " · Now");
}
function loadGrid() {
  const { lat, lon } = data.current.coord,
    key = lat + "," + lon;
  if (gKey === key && G) return Promise.resolve();
  $("#mlabel").textContent = "Loading forecast grid…";
  return api(`grid?lat=${lat}&lon=${lon}`)
    .then((g) => {
      G = g;
      gKey = key;
      ti = 0;
    })
    .catch((e) => {
      G = null;
      gKey = null;
      $("#mlabel").textContent = "Map data unavailable: " + e.message;
    });
}
async function setLayer(k) {
  cur = k;
  stop();
  clearMap();
  $$("#layers button").forEach((b) =>
    b.classList.toggle("on", b.dataset.l === k),
  );
  if (k === "radar") return radar();
  await loadGrid();
  if (cur !== k || !G) return;
  sl.max = G.times.length - 1;
  ti = Math.min(ti, +sl.max);
  sl.value = ti;
  draw();
}
async function radar() {
  legend(LY.radar);
  $("#mlabel").textContent = "Loading radar…";
  try {
    const r = await (
      await fetch("https://api.rainviewer.com/public/weather-maps.json")
    ).json();
    if (cur !== "radar") return;
    pastN = r.radar.past.length - 1;
    rf = [...r.radar.past, ...(r.radar.nowcast || [])];
    if (!rf.length) throw 0;
    rv = rf.map((f) =>
      L.tileLayer(`${r.host}${f.path}/256/{z}/{x}/{y}/2/1_1.png`, {
        opacity: 0,
        maxNativeZoom: 7,
        pane: "fld",
      }).addTo(map),
    );
    sl.max = rf.length - 1;
    sl.value = pastN;
    showRadar(pastN);
  } catch {
    $("#mlabel").textContent = "Radar feed unavailable right now";
  }
}
function showRadar(i) {
  rv.forEach((l, k) => l.setOpacity(k === i ? 0.8 : 0));
  $("#mlabel").textContent =
    lbl(new Date(rf[i].time * 1000)) +
    (i > pastN ? " · forecast" : i === pastN ? " · Now" : "");
}
const step = (i) => (cur === "radar" ? showRadar(i) : ((ti = i), draw()));
function stop() {
  clearInterval(pt);
  pt = null;
  $("#mplay").textContent = "▶";
}
sl.oninput = () => step(+sl.value);
$("#mplay").onclick = () => {
  if (pt) return stop();
  $("#mplay").textContent = "⏸";
  pt = setInterval(() => {
    const n = (+sl.value + 1) % (+sl.max + 1);
    sl.value = n;
    step(n);
  }, 800);
};
$("#mnow").onclick = () => {
  stop();
  const i = cur === "radar" ? pastN : 0;
  sl.value = i;
  step(i);
};

function onClick(e) {
  const Lc = LY[cur];
  if (!G || !Lc.k) return;
  const P = points(Lc);
  if (!P.length) return;
  const v = idw(
    P,
    Math.cos((P[0].lat * Math.PI) / 180),
    e.latlng.lat,
    e.latlng.lng,
  );
  if (v == null) return;
  L.popup()
    .setLatLng(e.latlng)
    .setContent(
      `<b>${Lc.n}: ${esc(fm(Lc, v))}</b><br>${esc(lbl(new Date(G.times[ti] + "Z")))}`,
    )
    .openOn(map);
}
function drawMap() {
  const { lat, lon } = data.current.coord;
  if (!map) {
    map = L.map("map", { worldCopyJump: true });
    map.createPane("fld").style.zIndex = 250;
    map.createPane("lbl").style.zIndex = 450;
    setBase("sat");
    map.on("click", onClick);
  }
  map.setView([lat, lon], 7);
  setTimeout(() => map.invalidateSize(), 100);
  pin
    ? pin.setLatLng([lat, lon])
    : (pin = L.circleMarker([lat, lon], {
        radius: 8,
        color: "#facc15",
        weight: 3,
        fillOpacity: 0.9,
      }).addTo(map));
  setLayer(cur);
}
$("#layers").innerHTML = Object.entries(LY)
  .map(
    ([k, v]) => `<button data-l="${k}" title="${v.n}">${v.i} ${v.n}</button>`,
  )
  .join("");
$$("#layers button").forEach((b) => (b.onclick = () => setLayer(b.dataset.l)));
$$("[data-b]").forEach((b) => (b.onclick = () => setBase(b.dataset.b)));
$("#mapfs").onclick = () =>
  document.fullscreenElement
    ? document.exitFullscreen()
    : $("#mapbox").requestFullscreen();
document.addEventListener(
  "fullscreenchange",
  () => map && setTimeout(() => map.invalidateSize(), 150),
);
$("#mapme").onclick = () =>
  data && map.setView([data.current.coord.lat, data.current.coord.lon], 7);
