// index.js — Lottery API Server (NO Magayo) with caching + fallbacks
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const cheerio = require("cheerio");
const moment = require("moment-timezone");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const TZ = "America/New_York";

// ---------- AXIOS (one place) ----------
const http = axios.create({
  timeout: 20000,
  headers: {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    // Yon UA nòmal (pa “bypass”), jis pou pa sanble ak bot default
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
  }
});

function normalizeText(htmlOrText) {
  return String(htmlOrText || "").replace(/\s+/g, " ").trim();
}

function digits3FromMatch(a, b, c) {
  return [String(a), String(b), String(c)];
}

function formatDateLong(dateISOorText) {
  const m = moment.tz(dateISOorText, TZ);
  return m.isValid() ? m.format("dddd, DD MMMM YYYY") : String(dateISOorText || "-");
}

function nextTargetISO(hour, minute) {
  const now = moment.tz(TZ);
  let t = moment.tz(TZ).set({ hour, minute, second: 0, millisecond: 0 });
  if (now.isSameOrAfter(t)) t = t.add(1, "day");
  return t.toDate().toISOString();
}

// ---------- Caching (important to avoid blocks) ----------
let CACHE = { ts: 0, data: null };
const CACHE_MS = 60 * 1000; // 60 sec

async function safeFetch(url) {
  const res = await http.get(url);
  return res.data;
}

// ---------- NEW YORK (OFFICIAL PAGE) ----------
async function fetchNY() {
  const url = "https://www.nylottery.org/numbers/past-winning-numbers";
  const html = await safeFetch(url);
  const text = normalizeText(cheerio.load(html).text());

  // Egzanp (sou paj la):
  // "Saturday December 27th 2025 Midday: 8 9 3 Evening: 0 5 0"
  const re =
    /([A-Za-z]+)\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\d{4}).*?Midday:\s*(\d)\s*(\d)\s*(\d).*?Evening:\s*(\d)\s*(\d)\s*(\d)/;

  const m = text.match(re);
  if (!m) {
    return {
      ok: false,
      message: "NY: pa jwenn modèl Midday/Evening sou paj ofisyèl la.",
      dateStr: "-",
      midiBalls: [],
      asweBalls: []
    };
  }

  const dateHuman = `${m[1]} ${m[2]} ${m[3]} ${m[4]}`; // ex: Saturday December 27 2025
  const dateStr = moment.tz(dateHuman, "dddd MMMM D YYYY", TZ).format("dddd, DD MMMM YYYY");

  return {
    ok: true,
    dateStr,
    midiBalls: digits3FromMatch(m[5], m[6], m[7]),
    asweBalls: digits3FromMatch(m[8], m[9], m[10]),
    source: url
  };
}

// ---------- FLORIDA (LotteryPost - Pick 3 past) ----------
async function fetchFL() {
  const url = "https://www.lotterypost.com/results/fl/pick3/past";
  const html = await safeFetch(url);
  const text = normalizeText(cheerio.load(html).text());

  // Egzanp (sou paj la) montre:
  // "Friday, December 26, 2025 Midday 9 4 5 Fireball: 7 Evening 3 4 6 Fireball: 0"
  const re =
    /(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4}).*?Midday.*?(\d)\D+(\d)\D+(\d).*?Evening.*?(\d)\D+(\d)\D+(\d)/;

  const m = text.match(re);
  if (!m) {
    return {
      ok: false,
      message: "FL: pa rive li Pick 3 Midday/Evening sou paj la.",
      dateStr: "-",
      midiBalls: [],
      asweBalls: []
    };
  }

  const dateHuman = `${m[1]}, ${m[2]} ${m[3]}, ${m[4]}`;
  const dateStr = moment.tz(dateHuman, "dddd, MMMM D, YYYY", TZ).format("dddd, DD MMMM YYYY");

  return {
    ok: true,
    dateStr,
    midiBalls: digits3FromMatch(m[5], m[6], m[7]),
    asweBalls: digits3FromMatch(m[8], m[9], m[10]),
    source: url
  };
}

// ---------- GEORGIA (LotteryPost - Cash 3 past) ----------
async function fetchGA() {
  const url = "https://www.lotterypost.com/results/ga/cash3/past";
  const html = await safeFetch(url);
  const text = normalizeText(cheerio.load(html).text());

  // Paj la gen Midday / Evening / Night.
  // Nou itilize Midday kòm "MIDI", epi Night kòm "ASWÈ" (paske se dènye tiraj la).
  const re =
    /(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4}).*?Midday.*?(\d)\D+(\d)\D+(\d).*?Night.*?(\d)\D+(\d)\D+(\d)/;

  const m = text.match(re);
  if (!m) {
    return {
      ok: false,
      message: "GA: pa rive li Cash 3 Midday/Night sou paj la.",
      dateStr: "-",
      midiBalls: [],
      asweBalls: []
    };
  }

  const dateHuman = `${m[1]}, ${m[2]} ${m[3]}, ${m[4]}`;
  const dateStr = moment.tz(dateHuman, "dddd, MMMM D, YYYY", TZ).format("dddd, DD MMMM YYYY");

  return {
    ok: true,
    dateStr,
    midiBalls: digits3FromMatch(m[5], m[6], m[7]),
    asweBalls: digits3FromMatch(m[8], m[9], m[10]),
    source: url
  };
}

// ---------- Build response in your JSON structure ----------
async function buildAll() {
  // times (ET)
  // FL Pick 3: 1:30 pm / 9:45 pm (sou LotteryPost li montre sa) :contentReference[oaicite:2]{index=2}
  // NY Numbers: 2:30 pm / 10:30 pm (nou kenbe menm jan ou te mete)
  // GA Cash 3: 12:29 pm / 11:34 pm (ofisyèl GA) :contentReference[oaicite:3]{index=3}
  const [fl, ny, ga] = await Promise.allSettled([fetchFL(), fetchNY(), fetchGA()]);

  function unwrap(p) {
    if (p.status === "fulfilled") return p.value;
    return { ok: false, message: String(p.reason?.message || p.reason), dateStr: "-", midiBalls: [], asweBalls: [] };
  }

  const FL = unwrap(fl);
  const NY = unwrap(ny);
  const GA = unwrap(ga);

  const items = [
    {
      state: "Florida Lottery",
      dateStr: FL.dateStr || "-",
      gameMidi: "Florida | MIDI",
      midiBalls: FL.ok ? FL.midiBalls : [],
      midiTarget: nextTargetISO(13, 30),
      gameAswe: "Florida | ASWÈ",
      asweBalls: FL.ok ? FL.asweBalls : [],
      asweTarget: nextTargetISO(21, 45),
      midiError: FL.ok ? 0 : 1,
      midiMessage: FL.ok ? "" : (FL.message || "FL error"),
      asweError: FL.ok ? 0 : 1,
      asweMessage: FL.ok ? "" : (FL.message || "FL error"),
      source: FL.source || ""
    },
    {
      state: "New York Lottery",
      dateStr: NY.dateStr || "-",
      gameMidi: "New York | MIDI",
      midiBalls: NY.ok ? NY.midiBalls : [],
      midiTarget: nextTargetISO(14, 30),
      gameAswe: "New York | ASWÈ",
      asweBalls: NY.ok ? NY.asweBalls : [],
      asweTarget: nextTargetISO(22, 30),
      midiError: NY.ok ? 0 : 1,
      midiMessage: NY.ok ? "" : (NY.message || "NY error"),
      asweError: NY.ok ? 0 : 1,
      asweMessage: NY.ok ? "" : (NY.message || "NY error"),
      source: NY.source || ""
    },
    {
      state: "Georgia Lottery",
      dateStr: GA.dateStr || "-",
      gameMidi: "Georgia | MIDI",
      midiBalls: GA.ok ? GA.midiBalls : [],
      midiTarget: nextTargetISO(12, 29),
      gameAswe: "Georgia | ASWÈ",
      asweBalls: GA.ok ? GA.asweBalls : [],
      asweTarget: nextTargetISO(23, 34),
      midiError: GA.ok ? 0 : 1,
      midiMessage: GA.ok ? "" : (GA.message || "GA error"),
      asweError: GA.ok ? 0 : 1,
      asweMessage: GA.ok ? "" : (GA.message || "GA error"),
      source: GA.source || ""
    }
  ];

  return { items, updatedAt: new Date().toISOString(), stale: false };
}

// ---------- ROUTES ----------
app.get("/", (req, res) => res.json({ ok: true, message: "Lottery API Server running" }));

app.get("/results", async (req, res) => {
  try {
    const now = Date.now();
    if (CACHE.data && (now - CACHE.ts) < CACHE_MS) return res.json(CACHE.data);

    const payload = await buildAll();
    CACHE = { ts: now, data: payload };
    return res.json(payload);
  } catch (e) {
    // si gen cache anvan, retounen li kòm stale
    if (CACHE.data) {
      return res.status(200).json({
        ...CACHE.data,
        stale: true,
        error: String(e?.message || e)
      });
    }
    return res.status(500).json({ items: [], updatedAt: new Date().toISOString(), stale: true, error: String(e?.message || e) });
  }
});

// Debug rapid
app.get("/health", (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
