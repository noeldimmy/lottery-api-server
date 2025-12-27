// index.js — Lottery API Server (NO scraping) using Magayo

const express = require("express");
const cors = require("cors");
const axios = require("axios");
const moment = require("moment-timezone");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ✅ API KEY la anndan kòd la (tanporè)
const MAGAYO_API_KEY = "LdmqpX6izpWSXLtSe8";

const MAGAYO_RESULTS_URL = "https://www.magayo.com/api/results.php";
const TZ = "America/New_York";

// Cache 60 sec
let CACHE = { ts: 0, data: null };
const CACHE_MS = 60 * 1000;

function nextTargetISO(hour, minute) {
  const now = moment.tz(TZ);
  let t = moment.tz(TZ).set({ hour, minute, second: 0, millisecond: 0 });
  if (now.isSameOrAfter(t)) t = t.add(1, "day");
  return t.toDate().toISOString();
}

function toDateStr(draw) {
  if (!draw) return "";
  const m = moment.tz(draw, "YYYY-MM-DD", TZ);
  return m.isValid() ? m.format("dddd, DD MMM YYYY") : String(draw);
}

function parseBalls(results, digits = 3) {
  if (!results || typeof results !== "string") return [];
  const first = results.split(";")[0].trim();

  if (first.includes(",")) {
    return first.split(",").map((s) => s.trim()).filter(Boolean);
  }

  const onlyDigits = first.replace(/\D/g, "");
  if (digits && onlyDigits.length === digits) return onlyDigits.split("");

  return onlyDigits ? [onlyDigits] : [];
}

// ✅ FIX: pa gen includes() ankò — sa t ap bloke tout bagay
async function magayo(game) {
  if (!MAGAYO_API_KEY) {
    throw new Error("MAGAYO API key la vid nan index.js.");
  }

  const res = await axios.get(MAGAYO_RESULTS_URL, {
    params: { api_key: MAGAYO_API_KEY, game },
    timeout: 15000,
    headers: { Accept: "application/json" },
  });

  const data = res.data || {};
  return {
    error: Number(data.error ?? 999),
    message: data.message ?? data.msg ?? "",
    draw: data.draw ?? "",
    results: data.results ?? "",
    raw: data,
  };
}

// ✅ Konfig jwèt yo (FL / NY / GA)
const CONFIG = [
  {
    state: "Florida Lottery",
    midi: { label: "Pick 3 Midday", game: "us_fl_cash3_mid", time: { hour: 13, minute: 30 }, digits: 3 },
    aswe: { label: "Pick 3 Evening", game: "us_fl_cash3_eve", time: { hour: 21, minute: 45 }, digits: 3 },
  },
  {
    state: "New York Lottery",
    midi: { label: "Numbers Midday", game: "us_ny_numbers_mid", time: { hour: 14, minute: 30 }, digits: 3 },
    aswe: { label: "Numbers Evening", game: "us_ny_numbers_eve", time: { hour: 22, minute: 30 }, digits: 3 },
  },
  {
    state: "Georgia Lottery",
    midi: { label: "Cash 3 Midday", game: "us_ga_cash3_mid", time: { hour: 12, minute: 29 }, digits: 3 },
    aswe: { label: "Cash 3 Night", game: "us_ga_cash3_night", time: { hour: 23, minute: 34 }, digits: 3 },
    // Si ou pito Evening:
    // aswe: { label: "Cash 3 Evening", game: "us_ga_cash3_eve", time: { hour: 18, minute: 34 }, digits: 3 }
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

    // Debug: si Magayo ap voye erè, w ap wè li nan JSON la
    midiError: m1.error,
    midiMessage: m1.message,
    asweError: m2.error,
    asweMessage: m2.message,
  };
}

app.get("/", (req, res) => res.json({ ok: true, message: "Lottery API Server running" }));

// ✅ Debug route: teste nenpòt game code
app.get("/debug/:game", async (req, res) => {
  try {
    const game = String(req.params.game || "").trim();
    res.json(await magayo(game));
  } catch (e) {
    res.status(500).json({ error: true, message: String(e?.message || e) });
  }
});

app.get("/results", async (req, res) => {
  try {
    const now = Date.now();
    if (CACHE.data && now - CACHE.ts < CACHE_MS) return res.json(CACHE.data);

    const items = await Promise.all(CONFIG.map(buildItem));
    const payload = { items, updatedAt: new Date().toISOString() };

    CACHE = { ts: now, data: payload };
    res.json(payload);
  } catch (e) {
    res.status(500).json({ error: true, message: String(e?.message || e), items: [] });
  }
});

app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
