const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const moment = require('moment-timezone');

const app = express();
app.use(cors());

// Fonksyon inivèsèl pou Scraping
async function getLiveResults(url, selectors) {
    try {
        const { data } = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' }
        });
        const $ = cheerio.load(data);
        let results = [];
        
        $(selectors).each((i, el) => {
            let val = $(el).text().trim();
            if (val && !isNaN(val)) {
                results.push(val.padStart(2, '0'));
            }
        });
        return results.length > 0 ? results : null;
    } catch (error) {
        console.error(`Erè rale done nan ${url}:`, error.message);
        return null;
    }
}

app.get('/results', async (req, res) => {
    const nyTime = moment().tz("America/New_York");
    const dateParam = req.query.date || nyTime.format("YYYY-MM-DD");

    // Adrès sous yo
    const sources = {
        florida: "https://www.lotteryusa.com/florida/",
        new_york: "https://www.lotteryusa.com/new-york/",
        georgia: "https://www.lotteryusa.com/georgia/",
        new_jersey: "https://www.lotteryusa.com/new-jersey/"
    };

    // Ekstrakksyon done an paralèl (Voye tout request yo an menm tan)
    const [flRaw, nyRaw, gaRaw, njRaw] = await Promise.all([
        getLiveResults(sources.florida, '.draw-result .ball'),
        getLiveResults(sources.new_york, '.draw-result .ball'),
        getLiveResults(sources.georgia, '.draw-result .ball'),
        getLiveResults(sources.new_jersey, '.draw-result .ball')
    ]);

    const getTarget = (h, m) => {
        let t = moment.tz(`${dateParam} ${h}:${m}`, "YYYY-MM-DD HH:mm", "America/New_York");
        if (nyTime.isAfter(t) && !req.query.date) t.add(1, 'days');
        return t.toISOString();
    };

    // Estrikti done pou voye bay Flutter
    const items = [
        {
            state: "Florida Lottery",
            dateStr: moment(dateParam).format("dddd, D MMM YYYY"),
            gameMidi: "Florida | MIDI",
            midiBalls: flRaw ? flRaw.slice(0, 3) : ["--", "--", "--"],
            midiTarget: getTarget(13, 35),
            gameAswe: "Florida | ASWÈ",
            asweBalls: flRaw ? flRaw.slice(0, 3) : ["--", "--", "--"],
            asweTarget: getTarget(21, 50),
        },
        {
            state: "New York Lottery",
            dateStr: moment(dateParam).format("dddd, D MMM YYYY"),
            gameMidi: "New York | MIDI",
            midiBalls: nyRaw ? nyRaw.slice(0, 3) : ["--", "--", "--"],
            midiTarget: getTarget(14, 30),
            gameAswe: "New York | ASWÈ",
            asweBalls: nyRaw ? nyRaw.slice(0, 3) : ["--", "--", "--"],
            asweTarget: getTarget(22, 30),
        },
        {
            state: "Georgia Lottery",
            dateStr: moment(dateParam).format("dddd, D MMM YYYY"),
            gameMidi: "Georgia | MIDI",
            midiBalls: gaRaw ? gaRaw.slice(0, 3) : ["--", "--", "--"],
            midiTarget: getTarget(12, 29),
            gameAswe: "Georgia | ASWÈ",
            asweBalls: gaRaw ? gaRaw.slice(0, 3) : ["--", "--", "--"],
            asweTarget: getTarget(23, 34),
        },
        {
            state: "New Jersey Lottery",
            dateStr: moment(dateParam).format("dddd, D MMM YYYY"),
            gameMidi: "New Jersey | MIDI",
            midiBalls: njRaw ? njRaw.slice(0, 3) : ["--", "--", "--"],
            midiTarget: getTarget(12, 59),
            gameAswe: "New Jersey | ASWÈ",
            asweBalls: njRaw ? njRaw.slice(0, 3) : ["--", "--", "--"],
            asweTarget: getTarget(22, 57),
        }
    ];

    res.json({ items });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Waldorf Scraper Live sou pòt ${PORT} - Lè NY: ${moment().tz("America/New_York").format()}`);
});
