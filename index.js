 (cd "$(git rev-parse --show-toplevel)" && git apply --3way <<'EOF' 
diff --git a/index.js b/index.js
index f34fa39be301b5239c2f60a243198c1f91f39b6b..be7c39b57d67f5c13951a89196c5a7b233c3c80f 100644
--- a/index.js
+++ b/index.js
@@ -1,253 +1,330 @@
-// index.js — Lottery API Server (NO Magayo) with caching + fallbacks
-const express = require("express");
-const cors = require("cors");
-const axios = require("axios");
-const cheerio = require("cheerio");
-const moment = require("moment-timezone");
-
-const app = express();
-app.use(cors());
-app.use(express.json());
-
-const PORT = process.env.PORT || 3000;
-const TZ = "America/New_York";
-
-// ---------- AXIOS (one place) ----------
-const http = axios.create({
-  timeout: 20000,
-  headers: {
-    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
-    "Accept-Language": "en-US,en;q=0.9",
-    // Yon UA nòmal (pa “bypass”), jis pou pa sanble ak bot default
-    "User-Agent":
-      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
-  }
-});
-
-function normalizeText(htmlOrText) {
-  return String(htmlOrText || "").replace(/\s+/g, " ").trim();
-}
-
-function digits3FromMatch(a, b, c) {
-  return [String(a), String(b), String(c)];
-}
-
-function formatDateLong(dateISOorText) {
-  const m = moment.tz(dateISOorText, TZ);
-  return m.isValid() ? m.format("dddd, DD MMMM YYYY") : String(dateISOorText || "-");
-}
-
-function nextTargetISO(hour, minute) {
-  const now = moment.tz(TZ);
-  let t = moment.tz(TZ).set({ hour, minute, second: 0, millisecond: 0 });
-  if (now.isSameOrAfter(t)) t = t.add(1, "day");
-  return t.toDate().toISOString();
-}
-
-// ---------- Caching (important to avoid blocks) ----------
-let CACHE = { ts: 0, data: null };
-const CACHE_MS = 60 * 1000; // 60 sec
-
-async function safeFetch(url) {
-  const res = await http.get(url);
-  return res.data;
-}
-
-// ---------- NEW YORK (OFFICIAL PAGE) ----------
-async function fetchNY() {
-  const url = "https://www.nylottery.org/numbers/past-winning-numbers";
-  const html = await safeFetch(url);
-  const text = normalizeText(cheerio.load(html).text());
-
-  // Egzanp (sou paj la):
-  // "Saturday December 27th 2025 Midday: 8 9 3 Evening: 0 5 0"
-  const re =
-    /([A-Za-z]+)\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\d{4}).*?Midday:\s*(\d)\s*(\d)\s*(\d).*?Evening:\s*(\d)\s*(\d)\s*(\d)/;
-
-  const m = text.match(re);
-  if (!m) {
-    return {
-      ok: false,
-      message: "NY: pa jwenn modèl Midday/Evening sou paj ofisyèl la.",
-      dateStr: "-",
-      midiBalls: [],
-      asweBalls: []
-    };
-  }
-
-  const dateHuman = `${m[1]} ${m[2]} ${m[3]} ${m[4]}`; // ex: Saturday December 27 2025
-  const dateStr = moment.tz(dateHuman, "dddd MMMM D YYYY", TZ).format("dddd, DD MMMM YYYY");
-
-  return {
-    ok: true,
-    dateStr,
-    midiBalls: digits3FromMatch(m[5], m[6], m[7]),
-    asweBalls: digits3FromMatch(m[8], m[9], m[10]),
-    source: url
-  };
-}
-
-// ---------- FLORIDA (LotteryPost - Pick 3 past) ----------
-async function fetchFL() {
-  const url = "https://www.lotterypost.com/results/fl/pick3/past";
-  const html = await safeFetch(url);
-  const text = normalizeText(cheerio.load(html).text());
-
-  // Egzanp (sou paj la) montre:
-  // "Friday, December 26, 2025 Midday 9 4 5 Fireball: 7 Evening 3 4 6 Fireball: 0"
-  const re =
-    /(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4}).*?Midday.*?(\d)\D+(\d)\D+(\d).*?Evening.*?(\d)\D+(\d)\D+(\d)/;
-
-  const m = text.match(re);
-  if (!m) {
-    return {
-      ok: false,
-      message: "FL: pa rive li Pick 3 Midday/Evening sou paj la.",
-      dateStr: "-",
-      midiBalls: [],
-      asweBalls: []
-    };
-  }
-
-  const dateHuman = `${m[1]}, ${m[2]} ${m[3]}, ${m[4]}`;
-  const dateStr = moment.tz(dateHuman, "dddd, MMMM D, YYYY", TZ).format("dddd, DD MMMM YYYY");
-
-  return {
-    ok: true,
-    dateStr,
-    midiBalls: digits3FromMatch(m[5], m[6], m[7]),
-    asweBalls: digits3FromMatch(m[8], m[9], m[10]),
-    source: url
-  };
-}
-
-// ---------- GEORGIA (LotteryPost - Cash 3 past) ----------
-async function fetchGA() {
-  const url = "https://www.lotterypost.com/results/ga/cash3/past";
-  const html = await safeFetch(url);
-  const text = normalizeText(cheerio.load(html).text());
-
-  // Paj la gen Midday / Evening / Night.
-  // Nou itilize Midday kòm "MIDI", epi Night kòm "ASWÈ" (paske se dènye tiraj la).
-  const re =
-    /(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4}).*?Midday.*?(\d)\D+(\d)\D+(\d).*?Night.*?(\d)\D+(\d)\D+(\d)/;
-
-  const m = text.match(re);
-  if (!m) {
-    return {
-      ok: false,
-      message: "GA: pa rive li Cash 3 Midday/Night sou paj la.",
-      dateStr: "-",
-      midiBalls: [],
-      asweBalls: []
-    };
-  }
-
-  const dateHuman = `${m[1]}, ${m[2]} ${m[3]}, ${m[4]}`;
-  const dateStr = moment.tz(dateHuman, "dddd, MMMM D, YYYY", TZ).format("dddd, DD MMMM YYYY");
-
-  return {
-    ok: true,
-    dateStr,
-    midiBalls: digits3FromMatch(m[5], m[6], m[7]),
-    asweBalls: digits3FromMatch(m[8], m[9], m[10]),
-    source: url
-  };
-}
-
-// ---------- Build response in your JSON structure ----------
-async function buildAll() {
-  // times (ET)
-  // FL Pick 3: 1:30 pm / 9:45 pm (sou LotteryPost li montre sa) :contentReference[oaicite:2]{index=2}
-  // NY Numbers: 2:30 pm / 10:30 pm (nou kenbe menm jan ou te mete)
-  // GA Cash 3: 12:29 pm / 11:34 pm (ofisyèl GA) :contentReference[oaicite:3]{index=3}
-  const [fl, ny, ga] = await Promise.allSettled([fetchFL(), fetchNY(), fetchGA()]);
-
-  function unwrap(p) {
-    if (p.status === "fulfilled") return p.value;
-    return { ok: false, message: String(p.reason?.message || p.reason), dateStr: "-", midiBalls: [], asweBalls: [] };
-  }
-
-  const FL = unwrap(fl);
-  const NY = unwrap(ny);
-  const GA = unwrap(ga);
-
-  const items = [
-    {
-      state: "Florida Lottery",
-      dateStr: FL.dateStr || "-",
-      gameMidi: "Florida | MIDI",
-      midiBalls: FL.ok ? FL.midiBalls : [],
-      midiTarget: nextTargetISO(13, 30),
-      gameAswe: "Florida | ASWÈ",
-      asweBalls: FL.ok ? FL.asweBalls : [],
-      asweTarget: nextTargetISO(21, 45),
-      midiError: FL.ok ? 0 : 1,
-      midiMessage: FL.ok ? "" : (FL.message || "FL error"),
-      asweError: FL.ok ? 0 : 1,
-      asweMessage: FL.ok ? "" : (FL.message || "FL error"),
-      source: FL.source || ""
-    },
-    {
-      state: "New York Lottery",
-      dateStr: NY.dateStr || "-",
-      gameMidi: "New York | MIDI",
-      midiBalls: NY.ok ? NY.midiBalls : [],
-      midiTarget: nextTargetISO(14, 30),
-      gameAswe: "New York | ASWÈ",
-      asweBalls: NY.ok ? NY.asweBalls : [],
-      asweTarget: nextTargetISO(22, 30),
-      midiError: NY.ok ? 0 : 1,
-      midiMessage: NY.ok ? "" : (NY.message || "NY error"),
-      asweError: NY.ok ? 0 : 1,
-      asweMessage: NY.ok ? "" : (NY.message || "NY error"),
-      source: NY.source || ""
-    },
-    {
-      state: "Georgia Lottery",
-      dateStr: GA.dateStr || "-",
-      gameMidi: "Georgia | MIDI",
-      midiBalls: GA.ok ? GA.midiBalls : [],
-      midiTarget: nextTargetISO(12, 29),
-      gameAswe: "Georgia | ASWÈ",
-      asweBalls: GA.ok ? GA.asweBalls : [],
-      asweTarget: nextTargetISO(23, 34),
-      midiError: GA.ok ? 0 : 1,
-      midiMessage: GA.ok ? "" : (GA.message || "GA error"),
-      asweError: GA.ok ? 0 : 1,
-      asweMessage: GA.ok ? "" : (GA.message || "GA error"),
-      source: GA.source || ""
-    }
-  ];
-
-  return { items, updatedAt: new Date().toISOString(), stale: false };
-}
-
-// ---------- ROUTES ----------
-app.get("/", (req, res) => res.json({ ok: true, message: "Lottery API Server running" }));
-
-app.get("/results", async (req, res) => {
-  try {
-    const now = Date.now();
-    if (CACHE.data && (now - CACHE.ts) < CACHE_MS) return res.json(CACHE.data);
-
-    const payload = await buildAll();
-    CACHE = { ts: now, data: payload };
-    return res.json(payload);
-  } catch (e) {
-    // si gen cache anvan, retounen li kòm stale
-    if (CACHE.data) {
-      return res.status(200).json({
-        ...CACHE.data,
-        stale: true,
-        error: String(e?.message || e)
-      });
-    }
-    return res.status(500).json({ items: [], updatedAt: new Date().toISOString(), stale: true, error: String(e?.message || e) });
-  }
-});
-
-// Debug rapid
-app.get("/health", (req, res) => res.json({ ok: true, time: new Date().toISOString() }));
-
-app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
+// index.js — Lottery API Server (NO Magayo) with caching + fallbacks
+const express = require("express");
+const cors = require("cors");
+const axios = require("axios");
+const cheerio = require("cheerio");
+const moment = require("moment-timezone");
+const pdfParse = require("pdf-parse");
+
+const app = express();
+app.use(cors());
+app.use(express.json());
+
+const PORT = process.env.PORT || 3000;
+const TZ = "America/New_York";
+
+// ---------- AXIOS (one place) ----------
+const http = axios.create({
+  timeout: 20000,
+  headers: {
+    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
+    "Accept-Language": "en-US,en;q=0.9",
+    // Yon UA nòmal (pa “bypass”), jis pou pa sanble ak bot default
+    "User-Agent":
+      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
+  }
+});
+
+function logEvent(level, code, details = {}) {
+  const payload = {
+    time: new Date().toISOString(),
+    level,
+    code,
+    ...details
+  };
+  console.log(JSON.stringify(payload));
+}
+
+function normalizeText(htmlOrText) {
+  return String(htmlOrText || "").replace(/\s+/g, " ").trim();
+}
+
+function digits3FromMatch(a, b, c) {
+  return [String(a), String(b), String(c)];
+}
+
+function formatDateLong(dateISOorText) {
+  const m = moment.tz(dateISOorText, TZ);
+  return m.isValid() ? m.format("dddd, DD MMMM YYYY") : String(dateISOorText || "-");
+}
+
+function nextTargetISO(hour, minute) {
+  const now = moment.tz(TZ);
+  let t = moment.tz(TZ).set({ hour, minute, second: 0, millisecond: 0 });
+  if (now.isSameOrAfter(t)) t = t.add(1, "day");
+  return t.toDate().toISOString();
+}
+
+// ---------- Caching (stale-while-revalidate) ----------
+const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min
+const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 min
+
+const CACHE = {
+  ts: 0,
+  data: null,
+  lastGood: null,
+  inFlight: false
+};
+
+async function safeFetch(url, options = {}) {
+  try {
+    const res = await http.get(url, options);
+    return { ok: true, status: res.status, data: res.data };
+  } catch (err) {
+    const status = err?.response?.status;
+    const code = status === 403 ? "FETCH_403" : "FETCH_HTTP";
+    logEvent("error", code, { url, status, message: err?.message });
+    return { ok: false, status: status || 0, error: err };
+  }
+}
+
+function errorResult(message, code = "PARSE_ERROR") {
+  return {
+    ok: false,
+    message,
+    code,
+    dateStr: "-",
+    midiBalls: [],
+    asweBalls: [],
+    source: ""
+  };
+}
+
+// ---------- NEW YORK (OFFICIAL PAGE) ----------
+async function fetchNY() {
+  const url = "https://www.nylottery.org/numbers/past-winning-numbers";
+  const htmlRes = await safeFetch(url);
+  if (!htmlRes.ok) {
+    return errorResult("NY: paj la pa disponib.", "FETCH_HTTP");
+  }
+
+  const $ = cheerio.load(htmlRes.data);
+  const text = normalizeText($("body").text());
+
+  const re =
+    /(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\d{4}).*?Midday:\s*(\d)\s*(\d)\s*(\d).*?Evening:\s*(\d)\s*(\d)\s*(\d)/i;
+
+  const m = text.match(re);
+  if (!m) {
+    logEvent("error", "PARSE_ERROR", { state: "NY", message: "Regex not found" });
+    return errorResult("NY: pa jwenn Midday/Evening sou paj ofisyèl la.");
+  }
+
+  const dateHuman = `${m[1]} ${m[2]} ${m[3]} ${m[4]}`;
+  const dateStr = moment.tz(dateHuman, "dddd MMMM D YYYY", TZ).format("dddd, DD MMMM YYYY");
+
+  return {
+    ok: true,
+    dateStr,
+    midiBalls: digits3FromMatch(m[5], m[6], m[7]),
+    asweBalls: digits3FromMatch(m[8], m[9], m[10]),
+    source: url
+  };
+}
+
+// ---------- FLORIDA (OFFICIAL PDF) ----------
+async function fetchFL() {
+  const url = "https://floridalottery.com/exptkt/pick3.pdf";
+  const pdfRes = await safeFetch(url, { responseType: "arraybuffer" });
+  if (!pdfRes.ok) {
+    return errorResult("FL: PDF pa disponib.", "FETCH_HTTP");
+  }
+
+  let text = "";
+  try {
+    const parsed = await pdfParse(Buffer.from(pdfRes.data));
+    text = normalizeText(parsed.text);
+  } catch (err) {
+    logEvent("error", "PARSE_ERROR", { state: "FL", message: err?.message });
+    return errorResult("FL: erè pandan parse PDF la.");
+  }
+
+  const re =
+    /(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4}).*?Midday\s+(\d)\s+(\d)\s+(\d)(?:\s+Fireball\s+\d)?\s+Evening\s+(\d)\s+(\d)\s+(\d)/i;
+
+  const m = text.match(re);
+  if (!m) {
+    logEvent("error", "PARSE_ERROR", { state: "FL", message: "Regex not found" });
+    return errorResult("FL: pa rive li Pick 3 Midday/Evening nan PDF la.");
+  }
+
+  const dateHuman = `${m[1]}, ${m[2]} ${m[3]}, ${m[4]}`;
+  const dateStr = moment.tz(dateHuman, "dddd, MMMM D, YYYY", TZ).format("dddd, DD MMMM YYYY");
+
+  return {
+    ok: true,
+    dateStr,
+    midiBalls: digits3FromMatch(m[5], m[6], m[7]),
+    asweBalls: digits3FromMatch(m[8], m[9], m[10]),
+    source: url
+  };
+}
+
+// ---------- GEORGIA (LOTTERYUSA) ----------
+async function fetchGA() {
+  const url = "https://www.lotteryusa.com/georgia/pick-3/";
+  const htmlRes = await safeFetch(url);
+  if (!htmlRes.ok) {
+    return errorResult("GA: paj la pa disponib.", "FETCH_HTTP");
+  }
+
+  const $ = cheerio.load(htmlRes.data);
+  const text = normalizeText($("body").text());
+  const re =
+    /(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4}).*?Midday.*?(\d)\s*(\d)\s*(\d).*?Night.*?(\d)\s*(\d)\s*(\d)/i;
+
+  const m = text.match(re);
+  if (!m) {
+    logEvent("error", "PARSE_ERROR", { state: "GA", message: "Regex not found" });
+    return errorResult("GA: pa rive li Pick 3 Midday/Night sou paj la.");
+  }
+
+  const dateHuman = `${m[1]}, ${m[2]} ${m[3]}, ${m[4]}`;
+  const dateStr = moment.tz(dateHuman, "dddd, MMMM D, YYYY", TZ).format("dddd, DD MMMM YYYY");
+
+  return {
+    ok: true,
+    dateStr,
+    midiBalls: digits3FromMatch(m[5], m[6], m[7]),
+    asweBalls: digits3FromMatch(m[8], m[9], m[10]),
+    source: url
+  };
+}
+
+function buildItem(state, fetched, midiTarget, asweTarget) {
+  return {
+    state,
+    dateStr: fetched.dateStr || "-",
+    gameMidi: `${state} | MIDI`,
+    midiBalls: fetched.ok ? fetched.midiBalls : [],
+    midiTarget,
+    gameAswe: `${state} | ASWÈ`,
+    asweBalls: fetched.ok ? fetched.asweBalls : [],
+    asweTarget,
+    midiError: fetched.ok ? 0 : 1,
+    midiMessage: fetched.ok ? "" : fetched.message || "error",
+    asweError: fetched.ok ? 0 : 1,
+    asweMessage: fetched.ok ? "" : fetched.message || "error",
+    source: fetched.source || ""
+  };
+}
+
+function mergeWithLastGood(items) {
+  if (!CACHE.lastGood?.items) {
+    return items;
+  }
+
+  return items.map((item) => {
+    if (item.midiError === 0 && item.asweError === 0) return item;
+    const last = CACHE.lastGood.items.find((entry) => entry.state === item.state);
+    if (!last) return item;
+    return {
+      ...last,
+      midiError: item.midiError,
+      midiMessage: item.midiMessage,
+      asweError: item.asweError,
+      asweMessage: item.asweMessage,
+      source: item.source || last.source
+    };
+  });
+}
+
+// ---------- Build response in your JSON structure ----------
+async function buildAll() {
+  const [fl, ny, ga] = await Promise.allSettled([fetchFL(), fetchNY(), fetchGA()]);
+
+  function unwrap(p) {
+    if (p.status === "fulfilled") return p.value;
+    return errorResult(String(p.reason?.message || p.reason), "FETCH_HTTP");
+  }
+
+  const FL = unwrap(fl);
+  const NY = unwrap(ny);
+  const GA = unwrap(ga);
+
+  const items = [
+    buildItem("Florida Lottery", FL, nextTargetISO(13, 30), nextTargetISO(21, 45)),
+    buildItem("New York Lottery", NY, nextTargetISO(14, 30), nextTargetISO(22, 30)),
+    buildItem("Georgia Lottery", GA, nextTargetISO(12, 29), nextTargetISO(23, 34))
+  ];
+
+  return { items, updatedAt: new Date().toISOString() };
+}
+
+async function refreshCache(reason) {
+  if (CACHE.inFlight) return;
+  CACHE.inFlight = true;
+  try {
+    const payload = await buildAll();
+    const hasErrors = payload.items.some((item) => item.midiError !== 0 || item.asweError !== 0);
+    const mergedItems = hasErrors ? mergeWithLastGood(payload.items) : payload.items;
+
+    CACHE.data = {
+      ...payload,
+      items: mergedItems,
+      stale: hasErrors
+    };
+
+    if (!hasErrors) {
+      CACHE.lastGood = CACHE.data;
+    }
+
+    CACHE.ts = Date.now();
+    logEvent("info", "CACHE_REFRESH", {
+      reason,
+      stale: hasErrors
+    });
+  } catch (err) {
+    logEvent("error", "REFRESH_FAILED", { message: err?.message || String(err), reason });
+    if (CACHE.lastGood) {
+      CACHE.data = {
+        ...CACHE.lastGood,
+        stale: true,
+        error: "refresh failed"
+      };
+      CACHE.ts = Date.now();
+    }
+  } finally {
+    CACHE.inFlight = false;
+  }
+}
+
+function startScheduler() {
+  refreshCache("startup");
+  setInterval(() => refreshCache("interval"), REFRESH_INTERVAL_MS);
+}
+
+// ---------- ROUTES ----------
+app.get("/", (req, res) => res.json({ ok: true, message: "Lottery API Server running" }));
+
+app.get("/results", async (req, res) => {
+  const now = Date.now();
+  const cacheAge = now - CACHE.ts;
+
+  if (CACHE.data && cacheAge < CACHE_TTL_MS) {
+    return res.json(CACHE.data);
+  }
+
+  if (CACHE.data) {
+    if (!CACHE.inFlight) refreshCache("stale-request");
+    return res.json({ ...CACHE.data, stale: true });
+  }
+
+  await refreshCache("cold-start");
+  if (CACHE.data) {
+    return res.json(CACHE.data);
+  }
+
+  return res.status(503).json({
+    items: [],
+    updatedAt: new Date().toISOString(),
+    stale: true,
+    error: "No cache available"
+  });
+});
+
+// Debug rapid
+app.get("/health", (req, res) => res.json({ ok: true, time: new Date().toISOString() }));
+
+startScheduler();
+app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
 
EOF
)
