// index.js — Lottery API Server (NO Magayo, NO scraping agressif)
// Florida: parse official PDF Pick 3 history
// NY + GA: placeholders to plug in official PDF URLs (same technique)

const express = require("express");
const cors = require("cors");
const axios = require("axios");
const moment = require("moment-timezone");
const pdfParse = require("pdf-parse");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const TZ = "America/New_York";

// ------------------ CACHE ------------------
let CACHE = { ts: 0, data: null };
const CACHE_MS = 3 * 60 * 1000; // 3 min cache (PDF pi lou)

// ------------------ HELPERS ------------------
function nextTargetISO(hour, minute) {
  const now = moment.tz(TZ);
  let t = moment.tz(TZ).set({ hour, minute, second: 0, millisecond: 0 });
  if (now.isSameOrAfter(t)) t = t.add(1, "day");
  return t.toDate().toISOString();
}

function formatDateStr(dateISO) {
  if (!dateISO) return "-";
  return moment.tz(dateISO, TZ).format("dddd, DD MMM YYYY");
}

function splitDigits(numStr) {
  const s = String(numStr || "").replace(/\D/g, "");
  if (!s) return [];
  return s.split("");
}

// ------------------ FLORIDA (PDF) ------------------
// Official Pick 3 winning history PDF (contains lines like: 12/26/25 M 9-4-5 FB0)
const FL_PICK3_PDF = "https://files.floridalottery.com/exptkt/p3.pdf";

async function fetchPdfText(url) {
  const res = await axios.get(url, { responseType: "arraybuffer", timeout: 20000 });
  const data = await pdfParse(res.data);
  return data.text || "";
}

function parseFloridaPick3FromText(pdfText) {
  // Example text pattern:
  // 12/26/25 M 9-4-5 FB0
  // 12/26/25 E 3-4-6 FB0
  const re = /(\d{2}\/\d{2}\/\d{2})\s+([ME])\s+(\d)\s*-\s*(\d)\s*-\s*(\d)\s+FB\s*([0-9])/g;

  const rows = [];
  let m;
  while ((m = re.exec(pdfText)) !== null) {
    const [_, mmddyy, drawME, d1, d2, d3, fb] = m;
    const dt = moment.tz(mmddyy, "MM/DD/YY", TZ);
    rows.push({
      dateKey: dt.format("YYYY-MM-DD"),
      dateStr: dt.format("dddd, DD MMM YYYY"),
      draw: drawME === "M" ? "MIDI" : "ASWÈ",
      number: `${d1}${d2}${d3}`,
      fireball: String(fb)
    });
  }

  if (!rows.length) return null;

  // pran dènye dat ki pi resan
  rows.sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1));
  const latestDate = rows[0].dateKey;
  const dayRows = rows.filter(r => r.dateKey === latestDate);

  const midi = dayRows.find(r => r.draw === "MIDI") || null;
  const aswe = dayRows.find(r => r.draw === "ASWÈ") || null;

  return { latestDate, dateStr: dayRows[0]?.dateStr || "-", midi, aswe };
}

async function buildFloridaItem() {
  const pdfText = await fetchPdfText(FL_PICK3_PDF);
  const parsed = parseFloridaPick3FromText(pdfText);

  // Florida Pick 3 times: Midday ~ 1:30 PM, Evening ~ 9:45 PM (ET)
  const midiTarget = nextTargetISO(13, 30);
  const asweTarget = nextTargetISO(21, 45);

  if (!parsed) {
    return {
      state: "Loterie de Floride",
      dateStr: "-",
      gameMidi: "Pick 3 Midi",
      midiBalls: [],
      midiTarget,
      gameAswe: "Pick 3 Soir",
      asweBalls: [],
      asweTarget,
      midiError: 1,
      midiMessage: "Pa jwenn done Florida nan PDF la.",
      asweError: 1,
      asweMessage: "Pa jwenn done Florida nan PDF la."
    };
  }

  return {
    state: "Loterie de Floride",
    dateStr: parsed.dateStr || "-",

    gameMidi: "Pick 3 Midi",
    midiBalls: parsed.midi ? splitDigits(parsed.midi.number) : [],
    midiTarget,

    gameAswe: "Pick 3 Soir",
    asweBalls: parsed.aswe ? splitDigits(parsed.aswe.number) : [],
    asweTarget,

    midiError: 0,
    midiMessage: parsed.midi ? "" : "Pa jwenn MIDI pou dènye dat la.",
    asweError: 0,
    asweMessage: parsed.aswe ? "" : "Pa jwenn ASWÈ pou dènye dat la."
  };
}

// ------------------ NY + GA (PLUG IN PDF URLs) ------------------
// Pou NY/GA: pi bon pratik la se itilize “Winning numbers history” PDF ofisyèl yo tou.
// Ou mete URL PDF la isit la, epi nou itilize menm teknik parse PDF la (regex diferan selon fòma).
const NY_NUMBERS_PDF = ""; // <-- mete URL PDF ofisyèl la lè ou genyen l
const GA_CASH3_PDF = "";   // <-- mete URL PDF ofisyèl la lè ou genyen l

async function buildNYItem() {
  // NY Numbers times: Midday 2:30 PM, Evening 10:30 PM 
  const midiTarget = nextTargetISO(14, 30);
  const asweTarget = nextTargetISO(22, 30);

  if (!NY_NUMBERS_PDF) {
    return {
      state: "Loterie de New York",
      dateStr: "-",
      gameMidi: "Numbers Midi",
      midiBalls: [],
      midiTarget,
      gameAswe: "Numbers Soir",
      asweBalls: [],
      asweTarget,
      midiError: 2,
      midiMessage: "NY PDF URL poko mete. Mete NY_NUMBERS_PDF nan index.js.",
      asweError: 2,
      asweMessage: "NY PDF URL poko mete. Mete NY_NUMBERS_PDF nan index.js."
    };
  }

  // Lè ou mete PDF la, n ap ajoute regex pou NY.
  return {
    state: "Loterie de New York",
    dateStr: "-",
    gameMidi: "Numbers Midi",
    midiBalls: [],
    midiTarget,
    gameAswe: "Numbers Soir",
    asweBalls: [],
    asweTarget,
    midiError: 3,
    midiMessage: "NY parse poko aktive (fòma PDF la bezwen regex).",
    asweError: 3,
    asweMessage: "NY parse poko aktive (fòma PDF la bezwen regex)."
  };
}

async function buildGAItem() {
  // GA Cash 3 times: 12:29 pm, 6:59 pm, 11:34 pm 
  // Nan app ou: nou kenbe MIDI (12:29) + ASWÈ/NIGHT (11:34)
  const midiTarget = nextTargetISO(12, 29);
  const asweTarget = nextTargetISO(23, 34);

  if (!GA_CASH3_PDF) {
    return {
      state: "Loterie de Géorgie",
      dateStr: "-",
      gameMidi: "Cash 3 Midi",
      midiBalls: [],
      midiTarget,
      gameAswe: "Cash 3 Nuit",
      asweBalls: [],
      asweTarget,
      midiError: 2,
      midiMessage: "GA PDF URL poko mete. Mete GA_CASH3_PDF nan index.js.",
      asweError: 2,
      asweMessage: "GA PDF URL poko mete. Mete GA_CASH3_PDF nan index.js."
    };
  }

  // Lè ou mete PDF la, n ap ajoute regex pou GA.
  return {
    state: "Loterie de Géorgie",
    dateStr: "-",
    gameMidi: "Cash 3 Midi",
    midiBalls: [],
    midiTarget,
    gameAswe: "Cash 3 Nuit",
    asweBalls: [],
    asweTarget,
    midiError: 3,
    midiMessage: "GA parse poko aktive (fòma PDF la bezwen regex).",
    asweError: 3,
    asweMessage: "GA parse poko aktive (fòma PDF la bezwen regex)."
  };
}

// ------------------ ROUTES ------------------
app.get("/", (req, res) => res.json({ ok: true, message: "Lottery API Server running" }));

app.get("/results", async (req, res) => {
  try {
    const now = Date.now();
    if (CACHE.data && (now - CACHE.ts) < CACHE_MS) return res.json(CACHE.data);

    const [fl, ny, ga] = await Promise.all([
      buildFloridaItem(),
      buildNYItem(),
      buildGAItem()
    ]);

    const payload = {
      items: [fl, ny, ga],
      updatedAt: new Date().toISOString(),
      stale: false
    };

    CACHE = { ts: now, data: payload };
    res.json(payload);
  } catch (e) {
    res.status(500).json({
      error: true,
      message: String(e?.message || e),
      items: [],
      updatedAt: new Date().toISOString(),
      stale: true
    });
  }
});

app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
