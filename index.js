// index.js — Lottery API Server (NO Magayo)
// Sources:
// - Florida Pick 3: Official FL Lottery PDF
// - New York Pick 3: Open Data NY (Socrata dataset hsys-3def)
// - Georgia Cash 3: WSBTV lottery page (public results page)

const express = require("express");
const cors = require("cors");
const axios = require("axios");
const cheerio = require("cheerio");
const moment = require("moment-timezone");
const pdfParse = require("pdf-parse");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const TZ = "America/New_York";

// ------------ SOURCES ------------
const FL_P3_PDF = "https://files.floridalottery.com/exptkt/p3.pdf"; // official PDF
const NY_OPEN_DATA_ENDPOINT =
  "https://data.ny.gov/resource/hsys-3def.json"; // Daily Numbers/Win-4 dataset (Socrata)
const GA_WSBTV_URL = "https://www.wsbtv.com/lottery/"; // public results page

// ------------ CACHE ------------
let CACHE = { ts: 0, data: null };
const CACHE_MS = 60 * 1000; // 60 sec

function nextTargetISO(hour, minute) {
  const now = moment.tz(TZ);
  let t = moment.tz(TZ).set({ hour, minute, second: 0, millisecond: 0 });
  if (now.isSameOrAfter(t)) t = t.add(1, "day");
  return t.toDate().toISOString();
}

function formatDateStr(dateLike) {
  if (!dateLike) return "-";
  // Accept "MM/DD/YY" or "YYYY-MM-DD" etc.
  const m1 = moment.tz(dateLike, ["MM/DD/YY", "YYYY-MM-DD", moment.ISO_8601], TZ);
  return m1.isValid() ? m1.format("dddd, DD MMMM YYYY") : String(dateLike);
}

function parseDigitsToBalls(str) {
  if (!str) return [];
  // keep only digits, turn into array
  const digits = String(str).replace(/\D/g, "");
  // If 3-digit => ["x","y","z"]
  if (digits.length === 3) return digits.split("");
  // If "8 9 3" => digits "893" => ok
  // If "4520" (includes fireball) => take first 3 as balls
  if (digits.length >= 3) return digits.slice(0, 3).split("");
  return [];
}

// ------------ FLORIDA (PDF) ------------
// PDF structure sometimes extracts as: many dates then many single digits.
// Strategy:
// 1) Extract all date tokens MM/DD/YY in order.
// 2) Extract all single-digit tokens AFTER the first date appears.
// 3) Pair each draw with 4 digits (3 balls + fireball).
// 4) Take the latest date => first date in list, and first 2 draws for that date.
async function getFloridaPick3Latest() {
  const out = {
    dateStr: "-",
    midiBalls: [],
    asweBalls: [],
    midiError: 0,
    midiMessage: "",
    asweError: 0,
    asweMessage: ""
  };

  try {
    const pdfRes = await axios.get(FL_P3_PDF, { responseType: "arraybuffer", timeout: 20000 });
    const parsed = await pdfParse(Buffer.from(pdfRes.data));
    const text = parsed.text || "";

    const tokens = text.split(/\s+/).filter(Boolean);

    // Collect date tokens with their indices
    const dateTokens = [];
    const dateRe = /^\d{2}\/\d{2}\/\d{2}$/;
    for (let i = 0; i < tokens.length; i++) {
      if (dateRe.test(tokens[i])) dateTokens.push({ v: tokens[i], i });
    }
    if (!dateTokens.length) {
      out.midiError = 1;
      out.asweError = 1;
      out.midiMessage = "Pa jwenn okenn dat nan PDF Florida a.";
      out.asweMessage = out.midiMessage;
      return out;
    }

    const firstDateIndex = dateTokens[0].i;

    // Digits AFTER first date index (avoid header digits)
    const digits = [];
    for (let i = firstDateIndex; i < tokens.length; i++) {
      if (/^\d$/.test(tokens[i])) digits.push(tokens[i]);
    }

    // Build draw entries aligned by 4 digits each
    const drawCount = Math.min(dateTokens.length, Math.floor(digits.length / 4));
    const entries = [];
    for (let d = 0; d < drawCount; d++) {
      const date = dateTokens[d].v;
      const g = digits.slice(d * 4, d * 4 + 4); // 3 balls + fireball
      entries.push({ date, balls: g.slice(0, 3), fireball: g[3] });
    }

    if (!entries.length) {
      out.midiError = 1;
      out.asweError = 1;
      out.midiMessage = "PDF Florida a vini men mwen pa rive ranje boul yo.";
      out.asweMessage = out.midiMessage;
      return out;
    }

    const latestDate = entries[0].date;
    const sameDay = entries.filter(e => e.date === latestDate);

    out.dateStr = formatDateStr(latestDate);

    // Most PDFs list 2 draws/day (Midday + Evening). If order differs, you’ll still get both draws.
    if (sameDay.length >= 2) {
      out.midiBalls = sameDay[0].balls;
      out.asweBalls = sameDay[1].balls;
    } else {
      // Fallback
      out.midiBalls = entries[0].balls;
      out.asweBalls = [];
      out.asweError = 1;
      out.asweMessage = "Sèlman 1 tiraj jwenn pou dènye dat la nan PDF Florida a.";
    }

    return out;
  } catch (e) {
    out.midiError = 500;
    out.asweError = 500;
    out.midiMessage = `Florida PDF fetch/parse echwe: ${String(e?.message || e)}`;
    out.asweMessage = out.midiMessage;
    return out;
  }
}

// ------------ NEW YORK (Open Data) ------------
// We fetch last ~40 rows, detect fields dynamically (because Socrata keys can vary).
// Goal: get latest Midday + Evening Pick 3 / Daily Numbers 3-digit.
async function getNewYorkPick3Latest() {
  const out = {
    dateStr: "-",
    midiBalls: [],
    asweBalls: [],
    midiError: 0,
    midiMessage: "",
    asweError: 0,
    asweMessage: ""
  };

  try {
    const res = await axios.get(NY_OPEN_DATA_ENDPOINT, {
      params: { $limit: 50, $order: "draw_date DESC" },
      timeout: 20000,
      headers: { Accept: "application/json" }
    });

    const rows = Array.isArray(res.data) ? res.data : [];
    if (!rows.length) {
      out.midiError = 1;
      out.asweError = 1;
      out.midiMessage = "NY OpenData pa retounen done.";
      out.asweMessage = out.midiMessage;
      return out;
    }

    // detect keys
    const sample = rows[0] || {};
    const keys = Object.keys(sample);

    const dateKey =
      keys.find(k => k.toLowerCase().includes("draw_date")) ||
      keys.find(k => k.toLowerCase().includes("date")) ||
      "draw_date";

    const timeKey =
      keys.find(k => k.toLowerCase().includes("draw_time")) ||
      keys.find(k => k.toLowerCase().includes("time")) ||
      "draw_time";

    const numbersKey =
      keys.find(k => k.toLowerCase().includes("winning_numbers")) ||
      keys.find(k => (k.toLowerCase().includes("winning") && k.toLowerCase().includes("numbers"))) ||
      keys.find(k => k.toLowerCase().includes("numbers")) ||
      "winning_numbers";

    // Some datasets include multiple games; try to keep 3-digit results
    const normalizeTime = (t) => String(t || "").toLowerCase();

    // Find latest date in dataset
    const latestDate = rows.find(r => r[dateKey])?.[dateKey];
    out.dateStr = formatDateStr(latestDate || "-");

    // Filter rows for that date
    const dayRows = rows.filter(r => String(r[dateKey] || "") === String(latestDate || ""));

    // Find Midday & Evening by draw_time-like values
    const middayRow = dayRows.find(r => normalizeTime(r[timeKey]).includes("midday") || normalizeTime(r[timeKey]).includes("day"));
    const eveningRow = dayRows.find(r => normalizeTime(r[timeKey]).includes("evening") || normalizeTime(r[timeKey]).includes("night"));

    const pickRowWith3Digits = (r) => {
      const balls = parseDigitsToBalls(r?.[numbersKey]);
      return balls.length === 3 ? balls : [];
    };

    out.midiBalls = pickRowWith3Digits(middayRow);
    out.asweBalls = pickRowWith3Digits(eveningRow);

    if (!out.midiBalls.length) {
      out.midiError = 2;
      out.midiMessage = "NY: pa rive jwenn tiraj Midday pou dènye dat la (oswa kolòn yo chanje).";
    }
    if (!out.asweBalls.length) {
      out.asweError = 2;
      out.asweMessage = "NY: pa rive jwenn tiraj Evening/Night pou dènye dat la (oswa kolòn yo chanje).";
    }

    return out;
  } catch (e) {
    out.midiError = 500;
    out.asweError = 500;
    out.midiMessage = `NY OpenData echwe: ${String(e?.message || e)}`;
    out.asweMessage = out.midiMessage;
    return out;
  }
}

// ------------ GEORGIA (WSBTV public page) ------------
// We parse Cash 3 Midday + Night if present.
async function getGeorgiaCash3Latest() {
  const out = {
    dateStr: "-",
    midiBalls: [],
    asweBalls: [],
    midiError: 0,
    midiMessage: "",
    asweError: 0,
    asweMessage: ""
  };

  try {
    const res = await axios.get(GA_WSBTV_URL, {
      timeout: 20000,
      headers: {
        Accept: "text/html"
      }
    });

    const $ = cheerio.load(res.data || "");

    // Try to find "CASH 3 Midday" / "CASH 3 Night" blocks in text
    const pageText = $("body").text().replace(/\s+/g, " ");

    // Helpers to extract the first 3-digit sequence after a label
    const findAfter = (label) => {
      const idx = pageText.toLowerCase().indexOf(label.toLowerCase());
      if (idx < 0) return null;
      const slice = pageText.slice(idx, idx + 300);
      // Match patterns like "8 9 6" or "896"
      const m = slice.match(/(\d)\s+(\d)\s+(\d)/) || slice.match(/(\d)(\d)(\d)/);
      if (!m) return null;
      return [m[1], m[2], m[3]];
    };

    const midday = findAfter("CASH 3 Midday");
    const night = findAfter("CASH 3 Night");
    const evening = findAfter("CASH 3 Evening");

    // Choose what to show as "ASWÈ": prefer Night, else Evening.
    out.midiBalls = Array.isArray(midday) ? midday : [];
    out.asweBalls = Array.isArray(night) ? night : (Array.isArray(evening) ? evening : []);

    // Date often appears like 12/26/2025 near the blocks; try grab one date
    const dm = pageText.match(/\b(\d{2}\/\d{2}\/\d{4})\b/);
    out.dateStr = dm ? formatDateStr(dm[1]) : "-";

    if (!out.midiBalls.length) {
      out.midiError = 3;
      out.midiMessage = "GA: pa jwenn Cash 3 Midday sou paj la.";
    }
    if (!out.asweBalls.length) {
      out.asweError = 3;
      out.asweMessage = "GA: pa jwenn Cash 3 Night/Evening sou paj la.";
    }

    return out;
  } catch (e) {
    out.midiError = 500;
    out.asweError = 500;
    out.midiMessage = `GA source echwe: ${String(e?.message || e)}`;
    out.asweMessage = out.midiMessage;
    return out;
  }
}

// ------------ BUILD FINAL JSON ------------
async function buildItems() {
  // Targets (countdown) — you can adjust times to match your UI
  const flMidiTarget = nextTargetISO(13, 30);
  const flAsweTarget = nextTargetISO(21, 45);

  const nyMidiTarget = nextTargetISO(14, 30);
  const nyAsweTarget = nextTargetISO(22, 30);

  const gaMidiTarget = nextTargetISO(12, 29);
  const gaAsweTarget = nextTargetISO(23, 34);

  const [fl, ny, ga] = await Promise.all([
    getFloridaPick3Latest(),
    getNewYorkPick3Latest(),
    getGeorgiaCash3Latest()
  ]);

  return [
    {
      state: "Florida Lottery",
      dateStr: fl.dateStr,
      gameMidi: "Florida | MIDI",
      midiBalls: fl.midiBalls,
      midiTarget: flMidiTarget,
      gameAswe: "Florida | ASWÈ",
      asweBalls: fl.asweBalls,
      asweTarget: flAsweTarget,
      midiError: fl.midiError,
      midiMessage: fl.midiMessage,
      asweError: fl.asweError,
      asweMessage: fl.asweMessage
    },
    {
      state: "New York Lottery",
      dateStr: ny.dateStr,
      gameMidi: "New York | MIDI",
      midiBalls: ny.midiBalls,
      midiTarget: nyMidiTarget,
      gameAswe: "New York | ASWÈ",
      asweBalls: ny.asweBalls,
      asweTarget: nyAsweTarget,
      midiError: ny.midiError,
      midiMessage: ny.midiMessage,
      asweError: ny.asweError,
      asweMessage: ny.asweMessage
    },
    {
      state: "Georgia Lottery",
      dateStr: ga.dateStr,
      gameMidi: "Georgia | MIDI",
      midiBalls: ga.midiBalls,
      midiTarget: gaMidiTarget,
      gameAswe: "Georgia | ASWÈ",
      asweBalls: ga.asweBalls,
      asweTarget: gaAsweTarget,
      midiError: ga.midiError,
      midiMessage: ga.midiMessage,
      asweError: ga.asweError,
      asweMessage: ga.asweMessage
    }
  ];
}

// ------------ ROUTES ------------
app.get("/", (req, res) => res.json({ ok: true, message: "Lottery API Server running" }));

app.get("/results", async (req, res) => {
  try {
    const now = Date.now();
    if (CACHE.data && now - CACHE.ts < CACHE_MS) {
      return res.json({ ...CACHE.data, stale: false });
    }

    const items = await buildItems();
    const payload = { items, updatedAt: new Date().toISOString() };

    CACHE = { ts: now, data: payload };
    res.json({ ...payload, stale: false });
  } catch (e) {
    res.status(500).json({
      items: [],
      updatedAt: new Date().toISOString(),
      stale: true,
      error: String(e?.message || e)
    });
  }
});

// Quick debug (see server is alive)
app.get("/ping", (req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
