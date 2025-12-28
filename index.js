// index.js — Lottery Results API (Stable: cache + auto refresh + stale fallback)
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

// ===== Refresh settings =====
const REFRESH_EVERY_MS = 5 * 60 * 1000; // 5 min
const REQUEST_TIMEOUT = 25000;

let STATE = {
  payload: { items: [], updatedAt: new Date().toISOString(), stale: true },
  lastGood: null,
  lastError: "",
  refreshing: false
};

// ===== Helpers =====
function nextTargetISO(hour, minute) {
  const now = moment.tz(TZ);
  let t = moment.tz(TZ).set({ hour, minute, second: 0, millisecond: 0 });
  if (now.isSameOrAfter(t)) t = t.add(1, "day");
  return t.toDate().toISOString();
}
function fmtLongDate(dateLike) {
  if (!dateLike) return "-";
  const m = moment.tz(dateLike, ["YYYY-MM-DD", "MM/DD/YY", "MM/DD/YYYY"], TZ);
  return m.isValid() ? m.format("dddd, D MMMM YYYY") : String(dateLike);
}
function digits3Array(s) {
  const d = String(s || "").replace(/\D/g, "");
  return d.length === 3 ? d.split("") : [];
}
async function httpGet(url, opts = {}) {
  const res = await axios.get(url, {
    timeout: REQUEST_TIMEOUT,
    headers: {
      "Accept": opts.accept || "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9"
    },
    responseType: opts.responseType || "text",
    validateStatus: (s) => s >= 200 && s < 400
  });
  return res;
}

// ===== Sources =====
// Florida official PDF Pick 3
const FL_PICK3_PDF = "https://files.floridalottery.com/exptkt/p3.pdf"; // official 
// New York official numbers page
const NY_NUMBERS_URL = "https://www.nylottery.org/numbers/past-winning-numbers"; // 
// Georgia (can 403 on datacenter IP). We'll stale fallback if blocked.
const GA_CASH3_URL = "https://www.lotterypost.com/results/ga/cash3/past"; // may 403 

// ===== Florida parser (PDF) =====
function parseFloridaPick3PdfText(text) {
  const t = String(text || "").replace(/\s+/g, " ").trim();

  // Patterns in PDF often include:
  // 12/26/25 M 3 9 3
  // 12/26/25 E 1 1 4
  const reSpaced = /(\d{2}\/\d{2}\/\d{2})\s+([ME])\s+(\d)\s+(\d)\s+(\d)/g;
  const reCompact = /(\d{2}\/\d{2}\/\d{2})\s+([ME])\s+(\d{3})/g;

  const map = new Map(); // date -> { M:"393", E:"114" }
  let m;

  while ((m = reSpaced.exec(t)) !== null) {
    const date = m[1];
    const draw = m[2];
    const num = `${m[3]}${m[4]}${m[5]}`;
    if (!map.has(date)) map.set(date, {});
    map.get(date)[draw] = num;
  }

  while ((m = reCompact.exec(t)) !== null) {
    const date = m[1];
    const draw = m[2];
    const num = m[3];
    if (!map.has(date)) map.set(date, {});
    if (!map.get(date)[draw]) map.get(date)[draw] = num;
  }

  if (map.size === 0) return { ok: false, dateStr: "-", midi: [], aswe: [], message: "Florida: pa jwenn done nan PDF." };

  const dates = Array.from(map.keys());
  dates.sort((a, b) => moment(b, "MM/DD/YY").valueOf() - moment(a, "MM/DD/YY").valueOf());
  const latest = dates[0];
  const row = map.get(latest) || {};

  const midi = digits3Array(row.M);
  const aswe = digits3Array(row.E);

  return {
    ok: midi.length || aswe.length,
    dateStr: fmtLongDate(latest),
    midi,
    aswe,
    message: (midi.length || aswe.length) ? "" : "Florida: pa rive ekstrè 3 chif yo."
  };
}

async function fetchFlorida() {
  try {
    const res = await httpGet(FL_PICK3_PDF, { responseType: "arraybuffer", accept: "application/pdf" });
    const parsed = await pdfParse(Buffer.from(res.data));
    const out = parseFloridaPick3PdfText(parsed.text);

    return {
      ok: out.ok,
      dateStr: out.dateStr,
      midiBalls: out.midi,
      asweBalls: out.aswe,
      error: out.ok ? 0 : 1,
      message: out.message || "",
      source: FL_PICK3_PDF
    };
  } catch (e) {
    return {
      ok: false,
      dateStr: "-",
      midiBalls: [],
      asweBalls: [],
      error: 1,
      message: String(e?.message || e),
      source: FL_PICK3_PDF
    };
  }
}

// ===== New York parser (official page) =====
function parseNYFromText(text) {
  const t = String(text || "").replace(/\s+/g, " ").trim();

  const re =
    /([A-Za-z]+)\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\d{4}).*?Midday:\s*(\d)\s*(\d)\s*(\d).*?Evening:\s*(\d)\s*(\d)\s*(\d)/;

  const m = t.match(re);
  if (!m) {
    return { ok: false, dateStr: "-", midi: [], aswe: [], message: "NY: pa rive li Midday/Evening sou paj la." };
  }

  const dateHuman = `${m[1]} ${m[2]} ${m[3]} ${m[4]}`;
  const dateStr = moment.tz(dateHuman, "dddd MMMM D YYYY", TZ).format("dddd, D MMMM YYYY");

  return {
    ok: true,
    dateStr,
    midi: [m[5], m[6], m[7]],
    aswe: [m[8], m[9], m[10]],
    message: ""
  };
}

async function fetchNY() {
  try {
    const res = await httpGet(NY_NUMBERS_URL);
    const $ = cheerio.load(res.data);
    const text = $("body").text();
    const out = parseNYFromText(text);

    return {
      ok: out.ok,
      dateStr: out.dateStr,
      midiBalls: out.midi,
      asweBalls: out.aswe,
      error: out.ok ? 0 : 2,
      message: out.message || "",
      source: NY_NUMBERS_URL
    };
  } catch (e) {
    return {
      ok: false,
      dateStr: "-",
      midiBalls: [],
      asweBalls: [],
      error: 2,
      message: String(e?.message || e),
      source: NY_NUMBERS_URL
    };
  }
}

// ===== Georgia parser (LotteryPost) =====
function parseGAFromText(text) {
  const t = String(text || "").replace(/\s+/g, " ").trim();

  const dateRe = /([A-Za-z]+,\s+[A-Za-z]+\s+\d{1,2},\s+\d{4})/;
  const dateMatch = t.match(dateRe);
  const dateStr = dateMatch ? dateMatch[1] : "-";

  // Midday digits
  const midRe = /Midday.*?(\d)\D+(\d)\D+(\d)/;
  const nightRe = /Night.*?(\d)\D+(\d)\D+(\d)/;
  const eveRe = /Evening.*?(\d)\D+(\d)\D+(\d)/;

  const mm = t.match(midRe);
  const nn = t.match(nightRe) || t.match(eveRe);

  const midi = mm ? [mm[1], mm[2], mm[3]] : [];
  const aswe = nn ? [nn[1], nn[2], nn[3]] : [];

  const ok = midi.length || aswe.length;
  return {
    ok,
    dateStr: ok ? fmtLongDate(dateStr) : "-",
    midi,
    aswe,
    message: ok ? "" : "GA: pa rive li paj la (oswa li bloké)."
  };
}

async function fetchGA() {
  try {
    const res = await httpGet(GA_CASH3_URL);
    const $ = cheerio.load(res.data);
    const text = $("body").text();
    const out = parseGAFromText(text);

    return {
      ok: out.ok,
      dateStr: out.dateStr,
      midiBalls: out.midi,
      asweBalls: out.aswe,
      error: out.ok ? 0 : 1,
      message: out.message || "",
      source: GA_CASH3_URL
    };
  } catch (e) {
    return {
      ok: false,
      dateStr: "-",
      midiBalls: [],
      asweBalls: [],
      error: 1,
      message: String(e?.message || e), // often 403
      source: GA_CASH3_URL
    };
  }
}

// ===== Build full payload =====
async function buildPayload() {
  const [fl, ny, ga] = await Promise.all([fetchFlorida(), fetchNY(), fetchGA()]);

  const items = [
    {
      state: "Florida Lottery",
      dateStr: fl.dateStr,
      gameMidi: "Florida | MIDI",
      midiBalls: fl.midiBalls,
      midiTarget: nextTargetISO(13, 30),
      gameAswe: "Florida | ASWÈ",
      asweBalls: fl.asweBalls,
      asweTarget: nextTargetISO(21, 45),
      midiError: fl.error,
      midiMessage: fl.message,
      asweError: fl.error,
      asweMessage: fl.message,
      source: fl.source
    },
    {
      state: "New York Lottery",
      dateStr: ny.dateStr,
      gameMidi: "New York | MIDI",
      midiBalls: ny.midiBalls,
      midiTarget: nextTargetISO(14, 30),
      gameAswe: "New York | ASWÈ",
      asweBalls: ny.asweBalls,
      asweTarget: nextTargetISO(22, 30),
      midiError: ny.error,
      midiMessage: ny.message,
      asweError: ny.error,
      asweMessage: ny.message,
      source: ny.source
    },
    {
      state: "Georgia Lottery",
      dateStr: ga.dateStr,
      gameMidi: "Georgia | MIDI",
      midiBalls: ga.midiBalls,
      midiTarget: nextTargetISO(12, 29),
      gameAswe: "Georgia | ASWÈ",
      asweBalls: ga.asweBalls,
      asweTarget: nextTargetISO(23, 34),
      midiError: ga.error,
      midiMessage: ga.message,
      asweError: ga.error,
      asweMessage: ga.message,
      source: ga.source
    }
  ];

  // If at least 1 state has real balls -> consider "good"
  const hasAnyBalls = items.some(it => (it.midiBalls?.length || 0) > 0 || (it.asweBalls?.length || 0) > 0);

  return {
    items,
    updatedAt: new Date().toISOString(),
    stale: !hasAnyBalls
  };
}

// ===== Auto refresh loop =====
async function refreshNow() {
  if (STATE.refreshing) return;
  STATE.refreshing = true;

  try {
    const payload = await buildPayload();

    // Save as lastGood if it has any real balls
    const hasAny = payload.items.some(it => (it.midiBalls?.length || 0) > 0 || (it.asweBalls?.length || 0) > 0);

    STATE.payload = payload;
    STATE.lastError = "";

    if (hasAny) {
      STATE.lastGood = payload;
    } else if (STATE.lastGood) {
      // keep old good data as stale fallback
      STATE.payload = { ...STATE.lastGood, updatedAt: payload.updatedAt, stale: true, error: "Nou pa jwenn nouvo done; nap sèvi ak cache." };
    }
  } catch (e) {
    STATE.lastError = String(e?.message || e);

    if (STATE.lastGood) {
      STATE.payload = { ...STATE.lastGood, updatedAt: new Date().toISOString(), stale: true, error: STATE.lastError };
    } else {
      STATE.payload = { items: [], updatedAt: new Date().toISOString(), stale: true, error: STATE.lastError };
    }
  } finally {
    STATE.refreshing = false;
  }
}

// start auto refresh
setInterval(refreshNow, REFRESH_EVERY_MS);
refreshNow();

// ===== Routes =====
app.get("/", (req, res) => res.json({ ok: true, message: "Lottery API Server running" }));

app.get("/results", (req, res) => {
  res.json(STATE.payload);
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    refreshing: STATE.refreshing,
    updatedAt: STATE.payload.updatedAt,
    stale: STATE.payload.stale,
    lastError: STATE.lastError || ""
  });
});

app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
