// index.js — Lottery API Server (NO Magayo, NO key) using public results pages + cache
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const moment = require("moment-timezone");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const TZ = "America/New_York";

// -------------------- CACHE --------------------
let CACHE = { ts: 0, data: null };
const CACHE_MS = 60 * 1000; // 60s

// -------------------- HTTP HELPER --------------------
async function fetchText(url) {
  const res = await axios.get(url, {
    timeout: 20000,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9,fr;q=0.8",
      "Cache-Control": "no-cache",
      "Pragma": "no-cache",
    },
    // pa fòse bypass sekirite; n ap jis fè request nòmal
    validateStatus: (s) => s >= 200 && s < 400,
  });
  return String(res.data || "");
}

// -------------------- TIME HELPERS --------------------
function nextTargetISO(hour, minute) {
  const now = moment.tz(TZ);
  let t = moment.tz(TZ).set({ hour, minute, second: 0, millisecond: 0 });
  if (now.isSameOrAfter(t)) t = t.add(1, "day");
  return t.toDate().toISOString();
}

function formatDateStrEN(dateObj) {
  // Ou ka chanje sa an fr si ou vle.
  return moment(dateObj).tz(TZ).format("dddd, DD MMM YYYY");
}

// -------------------- PARSERS (Regex) --------------------
// Nou parse paj "past results" yo ki ekri konsa:
// "Saturday, December 27, 2025  Midday  8  9  6  ...  Night  4  3  4"
function extractDayBlock(text) {
  const clean = text.replace(/\s+/g, " ").trim();
  // Pran premye dat la (pi resan) + blòk li a
  // Nou koupe jouk pwochen dat (oswa fen)
  const dateRe =
    /(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}/;

  const m = clean.match(dateRe);
  if (!m) return { dateStr: "-", block: "" };

  const start = m.index || 0;
  const rest = clean.slice(start);

  const next = rest.slice(10).match(dateRe); // chèche pwochen dat pi lwen
  const block = next ? rest.slice(0, (next.index || 0) + 10) : rest;

  // dateStr (pi senp)
  const dateStr = m[0]; // eg: Saturday, December 27, 2025
  return { dateStr, block };
}

function pick3DigitsFromBlock(block, label) {
  // label: "Midday" "Evening" "Night"
  const re = new RegExp(`${label}\\s+(\\d)\\s+(\\d)\\s+(\\d)`, "i");
  const m = block.match(re);
  if (!m) return [];
  return [m[1], m[2], m[3]];
}

// -------------------- SOURCES --------------------
// LotteryPost paj yo montre rezilta yo klè (men li ka pafwa bay blokaj sou kèk IP).
// Egzanp GA Cash 3 past results :contentReference[oaicite:2]{index=2}
const SOURCES = {
  FL_PICK3_PAST: "https://www.lotterypost.com/results/fl/pick3/past",
  GA_CASH3_PAST: "https://www.lotterypost.com/results/ga/cash3/past",
  NY_NUMBERS_PAST: "https://www.lotterypost.com/results/ny/numbers/past",
};

// -------------------- BUILD ITEMS --------------------
async function buildFlorida() {
  const html = await fetchText(SOURCES.FL_PICK3_PAST);
  const txt = html.replace(/<[^>]*>/g, " "); // retire tags
  const { dateStr, block } = extractDayBlock(txt);

  // Florida Pick 3 gen Midday + Evening
  const midiBalls = pick3DigitsFromBlock(block, "Midday");
  const asweBalls = pick3DigitsFromBlock(block, "Evening");

  return {
    state: "Loterie de Floride",
    dateStr: dateStr === "-" ? "-" : dateStr,
    gameMidi: "Pick 3 Midi",
    midiBalls,
    midiTarget: nextTargetISO(13, 30),
    gameAswe: "Pick 3 Soir",
    asweBalls,
    asweTarget: nextTargetISO(21, 45),
    midiError: midiBalls.length ? 0 : 1,
    midiMessage: midiBalls.length ? "" : "Pa jwenn done Florida nan sous la.",
    asweError: asweBalls.length ? 0 : 1,
    asweMessage: asweBalls.length ? "" : "Pa jwenn done Florida nan sous la.",
  };
}

async function buildNewYork() {
  const html = await fetchText(SOURCES.NY_NUMBERS_PAST);
  const txt = html.replace(/<[^>]*>/g, " ");
  const { dateStr, block } = extractDayBlock(txt);

  // NY Numbers: Midday + Evening
  const midiBalls = pick3DigitsFromBlock(block, "Midday");
  const asweBalls = pick3DigitsFromBlock(block, "Evening");

  return {
    state: "Loterie de New York",
    dateStr: dateStr === "-" ? "-" : dateStr,
    gameMidi: "Numbers Midi",
    midiBalls,
    midiTarget: nextTargetISO(14, 30),
    gameAswe: "Numbers Soir",
    asweBalls,
    asweTarget: nextTargetISO(22, 30),
    midiError: midiBalls.length ? 0 : 1,
    midiMessage: midiBalls.length ? "" : "Pa jwenn done New York nan sous la.",
    asweError: asweBalls.length ? 0 : 1,
    asweMessage: asweBalls.length ? "" : "Pa jwenn done New York nan sous la.",
  };
}

async function buildGeorgia() {
  const html = await fetchText(SOURCES.GA_CASH3_PAST);
  const txt = html.replace(/<[^>]*>/g, " ");
  const { dateStr, block } = extractDayBlock(txt);

  // Georgia Cash 3: Midday + Night (gen Evening tou, men UI ou a gen 2 selman)
  const midiBalls = pick3DigitsFromBlock(block, "Midday");
  const asweBalls = pick3DigitsFromBlock(block, "Night");

  return {
    state: "Loterie de Géorgie",
    dateStr: dateStr === "-" ? "-" : dateStr,
    gameMidi: "Cash 3 Midi",
    midiBalls,
    midiTarget: nextTargetISO(12, 29),
    gameAswe: "Cash 3 Nuit",
    asweBalls,
    asweTarget: nextTargetISO(23, 34),
    midiError: midiBalls.length ? 0 : 1,
    midiMessage: midiBalls.length ? "" : "Pa jwenn done Georgia nan sous la.",
    asweError: asweBalls.length ? 0 : 1,
    asweMessage: asweBalls.length ? "" : "Pa jwenn done Georgia nan sous la.",
  };
}

// -------------------- ROUTES --------------------
app.get("/", (req, res) => res.json({ ok: true, message: "Lottery API Server running" }));

app.get("/results", async (req, res) => {
  const now = Date.now();

  // Cache
  if (CACHE.data && now - CACHE.ts < CACHE_MS) {
    return res.json({ ...CACHE.data, stale: false, cached: true });
  }

  try {
    const items = await Promise.all([buildFlorida(), buildNewYork(), buildGeorgia()]);
    const payload = { items, updatedAt: new Date().toISOString() };
    CACHE = { ts: now, data: payload };
    return res.json({ ...payload, stale: false, cached: false });
  } catch (e) {
    // fallback sou cache si li egziste
    if (CACHE.data) {
      return res.json({ ...CACHE.data, stale: true, cached: true, error: String(e?.message || e) });
    }
    return res.status(500).json({ items: [], updatedAt: new Date().toISOString(), stale: true, error: String(e?.message || e) });
  }
});

app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
