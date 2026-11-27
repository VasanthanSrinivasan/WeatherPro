require("dotenv").config();

const express = require("express");
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cron = require("node-cron");

const {
  PORT = process.env.PORT || 3000,
  DB_PORT = 3306,
  JWT_SECRET,
  OWM_KEY,
  ADMIN_EMAIL = "",
  RETENTION_DAYS = 7,
  DB_HOST = "localhost",
  DB_USER = "root",
  DB_PASS = "",
  DB_NAME = "weather_app",
} = process.env;

if (!JWT_SECRET || !OWM_KEY) {
  throw new Error("Set JWT_SECRET and OWM_KEY in environment variables");
}

let db;

async function initDb() {
  db = mysql.createPool({
    host: DB_HOST,
    port: Number(DB_PORT),
    user: DB_USER,
    password: DB_PASS,
    database: DB_NAME,
    connectionLimit: 10,
    dateStrings: true,
    connectTimeout: 15000,
  });

  // Test Railway database connection
  await db.query("SELECT 1");

  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(80) NOT NULL,
      email VARCHAR(120) NOT NULL UNIQUE,
      password_hash VARCHAR(100) NOT NULL,
      role ENUM('user','admin') DEFAULT 'user',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS searches (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      city VARCHAR(80),
      country VARCHAR(4),
      lat DOUBLE,
      lon DOUBLE,
      temp FLOAT,
      feels_like FLOAT,
      humidity INT,
      wind_speed FLOAT,
      pressure INT,
      description VARCHAR(80),
      aqi TINYINT NULL,
      uv FLOAT NULL,
      searched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX(user_id, searched_at),
      INDEX(searched_at),
      FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
    )
  `);
}

// Remove old search data
async function cleanup() {
  const [r] = await db.query(
    "DELETE FROM searches WHERE searched_at < NOW() - INTERVAL ? DAY",
    [Number(RETENTION_DAYS)]
  );

  console.log(`[cleanup] removed ${r.affectedRows} rows`);
}

const app = express();

app.use(express.json({ limit: "10kb" }));
app.use(express.static("public"));

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "WeatherPro",
  });
});

// Authentication middleware
const auth = (role) => (req, res, next) => {
  try {
    req.user = jwt.verify(
      (req.headers.authorization || "").replace("Bearer ", ""),
      JWT_SECRET
    );

    if (role && req.user.role !== role) {
      return res.status(403).json({ error: "Admin only" });
    }

    next();
  } catch {
    res.status(401).json({ error: "Please sign in" });
  }
};

// Generate JWT
const sign = (u) => ({
  token: jwt.sign(
    {
      id: u.id,
      role: u.role,
      name: u.name,
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  ),

  user: {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
  },
});

// Register
app.post("/api/auth/register", async (req, res) => {
  const {
    name = "",
    email = "",
    password = "",
  } = req.body;

  if (
    !name.trim() ||
    !/^\S+@\S+\.\S+$/.test(email) ||
    password.length < 6
  ) {
    return res.status(400).json({
      error: "Valid name, email and 6+ char password required",
    });
  }

  try {
    const role =
      email.toLowerCase() === ADMIN_EMAIL.toLowerCase()
        ? "admin"
        : "user";

    const [r] = await db.query(
      "INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)",
      [
        name.trim().slice(0, 80),
        email.toLowerCase(),
        await bcrypt.hash(password, 10),
        role,
      ]
    );

    res.json(
      sign({
        id: r.insertId,
        name: name.trim(),
        email,
        role,
      })
    );
  } catch (e) {
    res.status(e.code === "ER_DUP_ENTRY" ? 409 : 500).json({
      error:
        e.code === "ER_DUP_ENTRY"
          ? "Email already registered"
          : "Server error",
    });
  }
});

// Login
app.post("/api/auth/login", async (req, res) => {
  try {
    const [[u]] = await db.query(
      "SELECT * FROM users WHERE email=?",
      [String(req.body.email || "").toLowerCase()]
    );

    if (
      !u ||
      !(await bcrypt.compare(
        String(req.body.password || ""),
        u.password_hash
      ))
    ) {
      return res.status(401).json({
        error: "Wrong email or password",
      });
    }

    res.json(sign(u));
  } catch (e) {
    console.error("[login]", e.message);
    res.status(500).json({ error: "Server error" });
  }
});

// External API helper
const j = async (u) => {
  const r = await fetch(u);

  if (!r.ok) {
    console.error("[api]", r.status, (await r.text()).slice(0, 200));

    throw Object.assign(
      new Error(
        r.status === 404
          ? "City not found"
          : `Weather service error (${r.status})`
      ),
      {
        status: r.status === 404 ? 404 : 502,
      }
    );
  }

  return r.json();
};

// Current weather + forecast + air quality + UV
app.get("/api/weather", auth(), async (req, res) => {
  const city = String(req.query.city || "")
    .trim()
    .slice(0, 80);

  if (!city) {
    return res.status(400).json({
      error: "Enter a city name",
    });
  }

  try {
    const o = "https://api.openweathermap.org/data/2.5/";
    const k = `&appid=${OWM_KEY}&units=metric`;

    const cur = await j(
      `${o}weather?q=${encodeURIComponent(city)}${k}`
    );

    const { lat, lon } = cur.coord;

    const [fc, air, om] = await Promise.all([
      j(`${o}forecast?lat=${lat}&lon=${lon}${k}`),

      j(
        `${o}air_pollution?lat=${lat}&lon=${lon}&appid=${OWM_KEY}`
      ).catch(() => null),

      j(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max&forecast_days=16&timezone=auto`
      ).catch(() => null),
    ]);

    const a = air?.list?.[0] || null;
    const uv = om?.daily?.uv_index_max?.[0] ?? null;

    await db.query(
      `INSERT INTO searches(
        user_id,city,country,lat,lon,temp,feels_like,
        humidity,wind_speed,pressure,description,aqi,uv
      )
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        req.user.id,
        cur.name,
        cur.sys.country,
        lat,
        lon,
        cur.main.temp,
        cur.main.feels_like,
        cur.main.humidity,
        cur.wind.speed,
        cur.main.pressure,
        cur.weather[0].description,
        a?.main?.aqi ?? null,
        uv,
      ]
    );

    res.json({
      current: cur,
      forecast: fc.list,
      air: a,
      daily: om?.daily || null,
      uv,
    });
  } catch (e) {
    res.status(e.status || 500).json({
      error: e.message,
    });
  }
});

// Validate latitude and longitude
const validLL = (q) => {
  const lat = Number(q.lat);
  const lon = Number(q.lon);

  return isFinite(lat) &&
    isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180
    ? [lat, lon]
    : null;
};
// Hour-by-hour weather for one date
app.get("/api/day", auth(), async (req, res) => {
  const ll = validLL(req.query);
  const date = String(req.query.date || "");

  if (!ll || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({
      error: "Invalid request",
    });
  }

  try {
    res.json(
      await j(
        `https://api.open-meteo.com/v1/forecast?latitude=${ll[0]}&longitude=${ll[1]}&start_date=${date}&end_date=${date}&hourly=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation_probability,precipitation,weathercode,cloud_cover,visibility,pressure_msl,wind_speed_10m,wind_direction_10m,uv_index&daily=sunrise,sunset,temperature_2m_max,temperature_2m_min&timezone=auto`
      )
    );
  } catch (e) {
    res.status(e.status || 500).json({
      error: e.message,
    });
  }
});

// Weather trends
const trendCache = new Map();

const MN = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const K = {
  max: "temperature_2m_max",
  min: "temperature_2m_min",
  rain: "precipitation_sum",
  wind: "wind_speed_10m_max",
  hum: "relative_humidity_2m_mean",
};

app.get("/api/trends", auth(), async (req, res) => {
  const ll = validLL(req.query);

  if (!ll) {
    return res.status(400).json({
      error: "Invalid location",
    });
  }

  const [lat, lon] = ll;
  const key = lat.toFixed(1) + "," + lon.toFixed(1);
  const hit = trendCache.get(key);

  if (hit && Date.now() - hit.t < 6 * 3600e3) {
    return res.json(hit.d);
  }

  try {
    const iso = (d) => d.toISOString().slice(0, 10);

    const end = new Date(Date.now() - 5 * 864e5);
    const start = new Date(end);

    start.setFullYear(start.getFullYear() - 5);

    const base =
      "temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max";

    const arc = (v) =>
      j(
        `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${iso(start)}&end_date=${iso(end)}&daily=${v}&timezone=auto`
      );

    const [A, fc] = await Promise.all([
      arc(base + ",relative_humidity_2m_mean")
        .catch(() => arc(base))
        .then((r) => r.daily),

      j(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=${base}&past_days=5&forecast_days=16&timezone=auto`
      )
        .then((r) => r.daily)
        .catch(() => null),
    ]);

    const t = A.time;
    const cut = t.length - 360;
    const lastT = t[t.length - 1];

    const fi = fc
      ? fc.time.map((d, i) => i).filter((i) => fc.time[i] > lastT)
      : [];

    const time = [
      ...t.slice(cut),
      ...fi.map((i) => fc.time[i]),
    ];

    const today = iso(new Date());

    let split = time.findIndex((d) => d > today);

    if (split < 0) split = time.length;

    const norm = {};

    t.forEach((d, i) => {
      if (i >= cut) return;

      const o = (norm[d.slice(5)] ??= {});

      for (const m of Object.values(K)) {
        if (A[m]?.[i] != null) {
          (o[m] ??= []).push(A[m][i]);
        }
      }
    });

    const actual = {};
    const normal = {};

    for (const [k, m] of Object.entries(K)) {
      if (!A[m]) continue;

      actual[k] = [
        ...A[m].slice(cut),
        ...fi.map((i) => fc?.[m]?.[i] ?? null),
      ];

      normal[k] = time.map((d) => {
        const v = norm[d.slice(5)]?.[m];

        return v?.length
          ? +(v.reduce((a, b) => a + b) / v.length).toFixed(1)
          : null;
      });
    }

    const all = t.map((_, i) => i);
    const last = all.slice(cut);

    const pick = (idx, m, best) => {
      const sum = {};
      const cnt = {};

      idx.forEach((i) => {
        const v = A[m]?.[i];

        if (v == null) return;

        const mo = +t[i].slice(5, 7) - 1;

        sum[mo] = (sum[mo] || 0) + v;
        cnt[mo] = (cnt[mo] || 0) + 1;
      });

      const e = Object.keys(sum)
        .map((mo) => [mo, sum[mo] / cnt[mo]])
        .sort((a, b) => best * (b[1] - a[1]));

      return e.length ? MN[e[0][0]] : null;
    };

    const st = (m) => {
      const v = last
        .map((i) => A[m]?.[i])
        .filter((x) => x != null);

      return v.length
        ? {
            max: Math.max(...v),
            avg: v.reduce((a, b) => a + b) / v.length,
            min: Math.min(...v),
          }
        : null;
    };

    const d = {
      time,
      split,
      actual,
      normal,

      climate: {
        hot: [
          pick(last, K.max, 1),
          pick(all, K.max, 1),
        ],

        cold: [
          pick(last, K.min, -1),
          pick(all, K.min, -1),
        ],

        wet: [
          pick(last, K.rain, 1),
          pick(all, K.rain, 1),
        ],

        wind: [
          pick(last, K.wind, 1),
          pick(all, K.wind, 1),
        ],
      },

      summary: {
        max: st(K.max),
        min: st(K.min),
        rain: st(K.rain),
        wind: st(K.wind),
      },
    };

    trendCache.set(key, {
      t: Date.now(),
      d,
    });

    res.json(d);
  } catch (e) {
    res.status(e.status || 500).json({
      error: e.message,
    });
  }
});
// Gridded weather forecast
const gridCache = new Map();

const GV = {
  temp: "temperature_2m",
  feels: "apparent_temperature",
  dew: "dew_point_2m",
  hum: "relative_humidity_2m",
  rain: "precipitation",
  cloud: "cloud_cover",
  vis: "visibility",
  pres: "pressure_msl",
  wind: "wind_speed_10m",
  wdir: "wind_direction_10m",
  uv: "uv_index",
};

app.get("/api/grid", auth(), async (req, res) => {
  const ll = validLL(req.query);

  if (!ll) {
    return res.status(400).json({
      error: "Invalid location",
    });
  }

  const key = ll[0].toFixed(1) + "," + ll[1].toFixed(1);
  const hit = gridCache.get(key);

  if (hit && Date.now() - hit.t < 30 * 60e3) {
    return res.json(hit.d);
  }

  const N = 5;
  const S = 1.3;
  const pts = [];

  for (let a = -N; a <= N; a++) {
    for (let b = -N; b <= N; b++) {
      pts.push([
        +Math.max(-85, Math.min(85, ll[0] + a * S)).toFixed(2),
        +(ll[1] + b * S).toFixed(2),
      ]);
    }
  }

  try {
    const q = `latitude=${pts.map((p) => p[0])}&longitude=${pts.map((p) => p[1])}&forecast_days=5&timezone=GMT`;

    const [w, aq] = await Promise.all([
      j(
        `https://api.open-meteo.com/v1/forecast?${q}&hourly=${Object.values(GV)}`
      ),

      j(
        `https://air-quality-api.open-meteo.com/v1/air-quality?${q}&hourly=us_aqi`
      ).catch(() => null),
    ]);

    const W = Array.isArray(w) ? w : [w];
    const Q = aq ? (Array.isArray(aq) ? aq : [aq]) : [];

    const time = W[0].hourly.time;

    const now = Math.max(
      0,
      time.findIndex((t) => new Date(t + "Z") > new Date()) - 1
    );

    const ix = [];

    for (let i = now; i < time.length; i += 3) {
      ix.push(i);
    }

    const pick = (a) =>
      ix.map((i) =>
        a?.[i] == null ? null : +(+a[i]).toFixed(1)
      );

    const d = {
      n: N,
      times: ix.map((i) => time[i]),

      pts: W.map((x, i) => {
        const o = {
          lat: pts[i][0],
          lon: pts[i][1],
        };

        for (const [k, m] of Object.entries(GV)) {
          o[k] = pick(x.hourly[m]);
        }

        o.aqi = pick(Q[i]?.hourly?.us_aqi);

        return o;
      }),
    };

    gridCache.set(key, {
      t: Date.now(),
      d,
    });

    res.json(d);
  } catch (e) {
    res.status(e.status || 500).json({
      error: e.message,
    });
  }
});

// Weather map tiles
app.get("/api/tiles/:l/:z/:x/:y", async (req, res) => {
  const { l, z, x, y } = req.params;

  if (
    ![
      "temp_new",
      "clouds_new",
      "precipitation_new",
      "wind_new",
      "pressure_new",
    ].includes(l) ||
    ![z, x, y].every((n) => /^\d{1,7}$/.test(n))
  ) {
    return res.sendStatus(400);
  }

  try {
    const r = await fetch(
      `https://tile.openweathermap.org/map/${l}/${z}/${x}/${y}.png?appid=${OWM_KEY}`
    );

    res
      .type("png")
      .set("Cache-Control", "public,max-age=600")
      .send(Buffer.from(await r.arrayBuffer()));
  } catch {
    res.sendStatus(502);
  }
});
// Search history
app.get("/api/history", auth(), async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM searches WHERE user_id=? ORDER BY searched_at DESC LIMIT 50",
      [req.user.id]
    );

    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
});

// Daily and weekly reports
app.get("/api/reports", auth(), async (req, res) => {
  try {
    const daily = req.query.range !== "weekly";

    const [rows] = await db.query(
      `SELECT ${
        daily ? "HOUR(searched_at)" : "DATE(searched_at)"
      } AS label, COUNT(*) n,
      ROUND(AVG(temp),1) avg_temp,
      ROUND(MIN(temp),1) min_temp,
      ROUND(MAX(temp),1) max_temp,
      ROUND(AVG(humidity)) avg_humidity,
      ROUND(AVG(wind_speed),1) avg_wind
      FROM searches
      WHERE user_id=?
      AND searched_at >= NOW() - INTERVAL ${
        daily ? "1 DAY" : "7 DAY"
      }
      GROUP BY label
      ORDER BY MIN(searched_at)`,
      [req.user.id]
    );

    res.json({
      range: daily ? "daily" : "weekly",
      rows,
    });
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
});

// Admin search query
const adminQ = `
  SELECT
    s.id,
    u.name user_name,
    u.email,
    s.city,
    s.country,
    s.temp,
    s.feels_like,
    s.humidity,
    s.wind_speed,
    s.pressure,
    s.description,
    s.aqi,
    s.uv,
    s.searched_at
  FROM searches s
  JOIN users u ON u.id=s.user_id
  ORDER BY s.searched_at DESC
`;

// Admin searches
app.get("/api/admin/searches", auth("admin"), async (req, res) => {
  try {
    const [rows] = await db.query(adminQ + " LIMIT 200");
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
});

// Admin CSV export
app.get("/api/admin/export.csv", auth("admin"), async (req, res) => {
  try {
    const [rows] = await db.query(adminQ);

    const cell = (v) => {
      let s = String(v ?? "");

      if (/^[=+\-@]/.test(s)) {
        s = "'" + s;
      }

      return `"${s.replace(/"/g, '""')}"`;
    };

    const cols = rows[0]
      ? Object.keys(rows[0])
      : ["id"];

    res
      .set({
        "Content-Type": "text/csv",
        "Content-Disposition":
          'attachment; filename="weather_data.csv"',
      })
      .send(
        [
          cols.join(","),
          ...rows.map((r) =>
            cols.map((c) => cell(r[c])).join(",")
          ),
        ].join("\n")
      );
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
});

// Unknown API route
app.use("/api", (req, res) => {
  res.status(404).json({
    error: "API route not found",
  });
});
// Connect database first, then start server
initDb()
  .then(() => {
    console.log("Railway MySQL connected successfully");

    // Schedule daily cleanup after successful DB connection
    cron.schedule("0 0 * * *", () => {
      cleanup().catch((e) => {
        console.error("[cleanup error]", e.message);
      });
    });

    // Render-compatible server binding
    app.listen(Number(PORT), "0.0.0.0", () => {
      console.log(`WeatherPro running on port ${PORT}`);
    });
  })
  .catch((e) => {
    console.error("[Database connection failed]", e.message);
    process.exit(1);
  });