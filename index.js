// index.js — Lottery Results API (NO scraping) using Magayo
// Node 18+ recommended

const express = require("express");
const axios = require("axios");
const cors = require("cors");
const dotenv = require("dotenv");
const { DateTime } = require("luxon");
const { LRUCache } = require("lru-cache");

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const MAGAYO_API_KEY = process.env.MAGAYO_API_KEY;

// Magayo endpoints (docs):
// Results: https://www.magayo.com/api/results.php?api_key=...&game=...  (JSON by default)
// Next draw date exists too but returns only date (no time). We'll compute time ourselves.
const MAGAYO_RESULTS_URL = "https://www.magayo.com/api/results.php";

// Cache to protect your Magayo quota (and speed up Flutter)
const cache = new LRUCache({
  max: 200,
  ttl: 60 * 1000, // 60 seconds cache
});

function formatDateStr(yyyyMmDd) {
  if (!yyyyMmDd) return "";
  const dt = DateTime.fromISO(yyyyMmDd, { zone: "America/New_York" });
  if (!dt.isValid) return yyyyMmDd;
  return dt.toFormat("dd LLL yyyy"); // ex: 27 Dec 2025
}

function computeNextTargetTime({ hour, minute }, zone = "America/New_York") {
  const now = DateTime.now().setZone(zone);
  let t = now.set({ hour, minute, second: 0, millisecond: 0 });
  if (now >= t) t = t.plus({ days: 1 });
  return t.toISO(); // ISO string parseable by Flutter DateTime.parse
}

// Parse Magayo "results" for Pick3/Numbers style (ex: "434" or "4,3,4" depending on game)
// - If comma-separated => ["4","3","4"]
// - If plain digits and expectedDigits provided => split digits
function parseBalls(results, expectedDigits) {
  if (!results || typeof results !== "string") return [];

  const r = results.trim();

  // If multiple prizes returned like "2388,7878,6892", take first (top prize) for UI
  // (Magayo docs mention Pick games may return multiple prizes in results) :contentReference[oaicite:7]{index=7}
  const top = r.split(";")[0].trim();

  if (top.includes(",")) {
    return top
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  }

  const digitsOnly = top.replace(/\D/g, "");

  if (expectedDigits && digitsOnly.length === expectedDigits) {
    return digitsOnly.split("");
  }

  // fallback: return whole string as one "ball"
  return digitsOnly ? [digitsOnly] : [];
}

async function magayoGetLatest(gameCode) {
  const key = `magayo:${gameCode}`;
  const cached = cache.get(key);
  if (cached) return cached;

  if (!MAGAYO_API_KEY) {
    throw new Error("MAGAYO_API_KEY missing in env vars.");
  }

  const res = await axios.get(MAGAYO_RESULTS_URL, {
    params: {
      api_key: MAGAYO_API_KEY,
      game: gameCode,
      // format json default
    },
    timeout: 12000,
    headers: {
      "Accept": "application/json",
    },
  });

  const data = res.data || {};
  // Typical response includes: { error: 0, draw: "YYYY-MM-DD", results: "..." } :contentReference[oaicite:8]{index=8}
  cache.set(key, data);
  return data;
}

const STATES = [
  {
    state: "Florida",
    midi: {
      label: "Pick 3 Midday",
      game: "us_fl_cash3_mid",
      time: { hour: 13, minute: 30 }, // 1:30 PM ET :contentReference[oaicite:9]{index=9}
      digits: 3,
    },
    aswe: {
      label: "Pick 3 Evening",
      game: "us_fl_cash3_eve",
      time: { hour: 21, minute: 45 }, // 9:45 PM ET :contentReference[oaicite:10]{index=10}
      digits: 3,
    },
  },
  {
    state: "New York",
    midi: {
      label: "Numbers Midday",
      game: "us_ny_numbers_mid",
      time: { hour: 14, minute: 30 }, // 2:30 PM ET :contentReference[oaicite:11]{index=11}
      digits: 3,
    },
    aswe: {
      label: "Numbers Evening",
      game: "us_ny_numbers_eve",
      time: { hour: 22, minute: 30 }, // 10:30 PM ET :contentReference[oaicite:12]{index=12}
      digits: 3,
    },
  },
  {
    state: "Georgia",
    midi: {
      label: "Cash 3 Midday",
      game: "us_ga_cash3_mid",
      time: { hour: 12, minute: 29 }, // 12:29 PM ET :contentReference[oaicite:13]{index=13}
      digits: 3,
    },
    // App ou a gen 2 blòk (midi + aswè). Georgia gen 3 tiraj (midi/evening/night),
    // mwen mete "Night" kòm aswè pou w gen dènye tiraj la.
    aswe: {
      label: "Cash 3 Night",
      game: "us_ga_cash3_night",
      time: { hour: 23, minute: 34 }, // 11:34 PM ET :contentReference[oaicite:14]{index=14}
      digits: 3,
    },
  },
];

async function buildStateItem(cfg) {
  const [midiData, asweData] = await Promise.allSettled([
    magayoGetLatest(cfg.midi.game),
    magayoGetLatest(cfg.aswe.game),
  ]);

  const midiOk = midiData.status === "fulfilled" ? midiData.value : null;
  const asweOk = asweData.status === "fulfilled" ? asweData.value : null;

  const dateStr = formatDateStr(midiOk?.draw || asweOk?.draw || DateTime.now().toISODate());

  const midiBalls = midiOk?.error === 0 ? parseBalls(midiOk.results, cfg.midi.digits) : [];
  const asweBalls = asweOk?.error === 0 ? parseBalls(asweOk.results, cfg.aswe.digits) : [];

  return {
    state: cfg.state,
    dateStr,
    gameMidi: cfg.midi.label,
    midiBalls,
    midiTarget: computeNextTargetTime(cfg.midi.time),
    gameAswe: cfg.aswe.label,
    asweBalls,
    asweTarget: computeNextTargetTime(cfg.aswe.time),
  };
}

app.get("/", (req, res) => {
  res.json({ ok: true, message: "Lottery API Server running" });
});

app.get("/results", async (req, res) => {
  try {
    const cacheKey = "results:all";
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const items = await Promise.all(STATES.map(buildStateItem));
    const payload = { items };
    cache.set(cacheKey, payload);
    res.json(payload);
  } catch (err) {
    res.status(500).json({
      error: true,
      message: err?.message || "Server error",
      items: [],
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
