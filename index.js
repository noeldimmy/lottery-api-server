// index.js — Lottery Results API Server (NO scraping)
// Source: Magayo API (results.php)

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const moment = require("moment-timezone");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const MAGAYO_API_KEY = process.env.MAGAYO_API_KEY;

const MAGAYO_RESULTS_URL = "https://www.magayo.com/api/results.php";
const TZ = "America/New_York";

// ---- Ti cache senp pou pa frape API a twòp (60 seg) ----
let CACHE = { ts: 0, data: null };
const CACHE_MS = 60 * 1000;

// ---- Helpers ----
function toDateStr(drawIso) {
  if (!drawIso) return "";
  const m = moment.tz(drawIso, "YYYY-MM-DD", TZ);
  return m.isValid() ? m.format("DD MMM YYYY") : String(drawIso);
}

function nextTargetISO(hour, minute) {
  const now = moment.tz(TZ);
  let t = moment.tz(TZ).set({ hour, minute, second: 0, millisecond: 0 });
  if (now.isSameOrAfter(t)) t = t.add(1, "day");
  return t.toDate().toISOString(); // Flutter DateTime.parse() ap li li byen
}

// Parse "results" Magayo a -> balls[]
// Egzanp: "4,3,4" -> ["4","3","4"]
// Egzanp: "434" -> ["4","3","4"]
function parseBalls(results, digits = 3) {
  if (!results || typeof results !== "string") return [];

  // Si gen plizyè rezilta separe (depann jwèt), pran premye a
  const first = results.split(";")[0].trim();

  // Si gen vigil
  if (first.includes(",")) {
    return first
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  }

  // Si se chif kole
  const onlyDigits = first.replace(/\D/g, "");
  if (onlyDigits.length === digits) return onlyDigits.split("");

  return onlyDigits ? [onlyDigits] : [];
}

async function getLatestResult(gameCode) {
  if (!MAGAYO_API_KEY) throw new Error("MAGAYO_API_KEY pa mete nan Env Vars sou Render.");

  const res = await axios.get(MAGAYO_RESULTS_URL, {
    params: { api_key: MAGAYO_API_KEY, game: gameCode },
    timeout: 12000,
    headers: { Accept: "application/json" },
  });

  // Magayo souvan retounen: { error:0, draw:"YYYY-MM-DD", results:"..." }
  return res.data;
}

// ---- Konfig jwèt ou vle yo (midi + aswè) ----
const CONFIG = [
  {
    state: "Florida Lottery",
    midi: {
      label: "Pick 3 Midday",
      game: "us_fl_cash3_mid",
      time: { hour: 13, minute: 30 },
      digits: 3,
    },
    aswe: {
      label: "Pick 3 Evening",
      game: "us_fl_cash3_eve",
      time: { hour: 21, minute: 45 },
      digits: 3,
    },
  },
  {
    state: "New York Lottery",
    midi: {
      label: "Numbers Midday",
      game: "us_ny_numbers_mid",
      time: { hour: 14, minute: 30 },
      digits: 3,
    },
    aswe: {
      label: "Numbers Evening",
      game: "us_ny_numbers_eve",
      time: { hour: 22, minute: 30 },
      digits: 3,
    },
  },
  {
    state: "Georgia Lottery",
    midi: {
      label: "Cash 3 Midday",
      game: "us_ga_cash3_mid",
      time: { hour: 12, minute: 29 },
      digits: 3,
    },
    // Si ou pito "Night" olye "Evening", chanje game + time:
    // game: "us_ga_cash3_night", time: { hour: 23, minute: 34 }
    aswe: {
      label: "Cash 3 Evening",
      game: "us_ga_cash3_eve",
      time: { hour: 18, minute: 34 },
      digits: 3,
    },
  },
];

async function buildItem(cfg) {
  const [midiRes, asweRes] = await Promise.allSettled([
    getLatestResult(cfg.midi.game),
    getLatestResult(cfg.aswe.game),
  ]);

  const midiData = midiRes.status === "fulfilled" ? midiRes.value : null;
  const asweData = asweRes.status === "fulfilled" ? asweRes.value : null;

  const draw = (midiData && midiData.draw) || (asweData && asweData.draw) || "";
  const dateStr = toDateStr(draw);

  const midiBalls =
    midiData && midiData.error === 0 ? parseBalls(midiData.results, cfg.midi.digits) : [];
  const asweBalls =
    asweData && asweData.error === 0 ? parseBalls(asweData.results, cfg.aswe.digits) : [];

  return {
    state: cfg.state,
    dateStr,
    gameMidi: cfg.midi.label,
    midiBalls,
    midiTarget: nextTargetISO(cfg.midi.time.hour, cfg.midi.time.minute),
    gameAswe: cfg.aswe.label,
    asweBalls,
    asweTarget: nextTargetISO(cfg.aswe.time.hour, cfg.aswe.time.minute),
  };
}

// ---- Routes ----
app.get("/", (req, res) => {
  res.json({ ok: true, message: "Lottery API Server (Magayo) running." });
});

app.get("/results", async (req, res) => {
  try {
    const now = Date.now();
    if (CACHE.data && now - CACHE.ts < CACHE_MS) {
      return res.json(CACHE.data);
    }

    const items = await Promise.all(CONFIG.map(buildItem));
    const payload = { items, updatedAt: new Date().toISOString() };

    CACHE = { ts: now, data: payload };
    res.json(payload);
  } catch (err) {
    res.status(500).json({
      error: true,
      message: err?.message || "Server error",
      items: [],
    });
  }
});

app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
