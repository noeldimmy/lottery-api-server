// index.js — Lottery API Server (NO scraping) using Magayo
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const moment = require("moment-timezone");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ✅ Mete key ou la (tanporè). Pi bon se Env Var pita.
const MAGAYO_API_KEY = "PASTE_YOUR_MAGAYO_KEY_HERE";

const MAGAYO_RESULTS_URL = "https://www.magayo.com/api/results.php";
const TZ = "America/New_York";

// ✅ Cache 30 min
const CACHE_MS = 30 * 60 * 1000;

// Cache pou tout eta yo (all) + pou chak state separe
const CACHE = new Map(); // key: "all" | "fl" | "ny" | "ga" -> {ts, payload}

function nextTargetISO(hour, minute) {
  const now = moment.tz(TZ);
  let t = moment.tz(TZ).set({ hour, minute, second: 0, millisecond: 0 });
  if (now.isSameOrAfter(t)) t = t.add(1, "day");
  return t.toDate().toISOString();
}

function toDateStr(draw) {
  if (!draw) return "-";
  const m = moment.tz(draw, "YYYY-MM-DD", TZ);
  return m.isValid() ? m.format("dddd, DD MMM YYYY") : String(draw);
}

// ✅ Parse solid: si Magayo voye "452 0" oswa "452-0", nou pran premye 3 chif yo
function parseBalls(results, digits = 3) {
  if (!results || typeof results !== "string") return [];
  const first = results.split(";")[0].trim();
  const onlyDigits = first.replace(/\D/g, "");

  if (onlyDigits.length >= digits) {
    return onlyDigits.slice(0, digits).split("");
  }
  return [];
}

// Normalize state query: fl/ny/ga, florida/newyork/georgia, etc.
function normState(q) {
  const s = String(q || "").toLowerCase().trim();
  if (!s) return "";
  if (["fl", "florida", "floridelottery", "florida lottery"].includes(s)) return "fl";
  if (["ny", "newyork", "new york", "new york lottery"].includes(s)) return "ny";
  if (["ga", "georgia", "georgia lottery"].includes(s)) return "ga";
  return s; // fallback
}

async function magayo(game) {
  if (!MAGAYO_API_KEY || MAGAYO_API_KEY.includes("PASTE_YOUR_MAGAYO_KEY_HERE")) {
    throw new Error("Mete MAGAYO API key la nan index.js.");
  }

  const res = await axios.get(MAGAYO_RESULTS_URL, {
    params: { api_key: MAGAYO_API_KEY, game },
    timeout: 15000,
    headers: { Accept: "application/json" },
    validateStatus: () => true,
  });

  // Magayo retounen JSON; pafwa li ka retounen HTML si gen pwoblèm
  const data = res.data || {};
  const err = Number(data.error ?? 999);

  return {
    error: err,
    message: data.message ?? data.msg ?? "",
    draw: data.draw ?? "",
    results: data.results ?? "",
    raw: data,
  };
}

// ✅ Konfig jwèt yo (FL/NY/GA) + code pou query param
const CONFIG = [
  {
    code: "fl",
    state: "Loterie de Floride",
    midi: { label: "Pick 3 Midi", game: "us_fl_cash3_mid", time: { hour: 13, minute: 30 }, digits: 3 },
    aswe: { label: "Pick 3 Soir", game: "us_fl_cash3_eve", time: { hour: 21, minute: 45 }, digits: 3 },
  },
  {
    code: "ny",
    state: "Loterie de New York",
    midi: { label: "Numbers Midi", game: "us_ny_numbers_mid", time: { hour: 14, minute: 30 }, digits: 3 },
    aswe: { label: "Numbers Soir", game: "us_ny_numbers_eve", time: { hour: 22, minute: 30 }, digits: 3 },
  },
  {
    code: "ga",
    state: "Loterie de Géorgie",
    midi: { label: "Cash 3 Midi", game: "us_ga_cash3_mid", time: { hour: 12, minute: 29 }, digits: 3 },
    aswe: { label: "Cash 3 Nuit", game: "us_ga_cash3_night", time: { hour: 23, minute: 34 }, digits: 3 },
  },
];

async function buildItem(cfg) {
  const [m1, m2] = await Promise.all([magayo(cfg.midi.game), magayo(cfg.aswe.game)]);

  const dateStr = toDateStr(m1.draw || m2.draw);

  const midiBalls = m1.error === 0 ? parseBalls(m1.results, cfg.midi.digits) : [];
  const asweBalls = m2.error === 0 ? parseBalls(m2.results, cfg.aswe.digits) : [];

  return {
    state: cfg.state,
    dateStr,

    gameMidi: cfg.midi.label,
    midiBalls,
    midiTarget: nextTargetISO(cfg.midi.time.hour, cfg.midi.time.minute),

    gameAswe: cfg.aswe.label,
    asweBalls,
    asweTarget: nextTargetISO(cfg.aswe.time.hour, cfg.aswe.time.minute),

    midiError: m1.error,
    midiMessage: m1.message,
    asweError: m2.error,
    asweMessage: m2.message,
  };
}

function getCache(key) {
  const c = CACHE.get(key);
  if (!c) return null;
  const fresh = (Date.now() - c.ts) < CACHE_MS;
  return { ...c, fresh };
}

function setCache(key, payload) {
  CACHE.set(key, { ts: Date.now(), payload });
}

app.get("/", (req, res) => res.json({ ok: true, message: "Lottery API Server running" }));

// ✅ Debug route: teste game code dirèk
app.get("/debug/:game", async (req, res) => {
  try {
    const game = String(req.params.game || "").trim();
    res.json(await magayo(game));
  } catch (e) {
    res.status(500).json({ error: true, message: String(e?.message || e) });
  }
});

// ✅ Main route: /results?state=fl | ny | ga
app.get("/results", async (req, res) => {
  const stateQ = normState(req.query.state);
  const cacheKey = stateQ ? stateQ : "all";

  // 1) si cache fresh, retounen li dirèk
  const cached = getCache(cacheKey);
  if (cached && cached.fresh) return res.json({ ...cached.payload, stale: false });

  try {
    // 2) Rale list selon state
    const list = stateQ
      ? CONFIG.filter(x => x.code === stateQ)
      : CONFIG;

    if (stateQ && list.length === 0) {
      return res.status(400).json({ error: true, message: "state pa rekonèt. Sèvi ak fl, ny, ga.", items: [] });
    }

    const items = await Promise.all(list.map(buildItem));
    const payload = { items, updatedAt: new Date().toISOString() };

    // 3) Mete cache
    setCache(cacheKey, payload);

    // 4) Si se state spesifik, mete tou nan "all" (opsyonèl)
    if (!stateQ) setCache("all", payload);

    return res.json({ ...payload, stale: false });
  } catch (e) {
    // 5) Fallback: si gen cache (men li pa fresh), retounen li kanmèm
    const staleCache = getCache(cacheKey);
    if (staleCache) {
      return res.json({
        ...staleCache.payload,
        stale: true,
        warning: "Magayo limite (eg: 303) oswa erè. Mwen retounen dènye cache la.",
      });
    }

    // Sinon pa gen anyen pou retounen
    return res.status(500).json({
      error: true,
      message: String(e?.message || e),
      items: [],
      stale: false,
    });
  }
});

app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
