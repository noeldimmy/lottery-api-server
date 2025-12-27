const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const moment = require('moment-timezone');

const app = express();
app.use(cors());

// Fonksyon Scraping sou yon sous ki pi lejè (ka rale rezilta jodi a)
async function getBalls(state) {
    try {
        // Nou itilize yon sous ki bay rezilta rapid san blokaj
        const url = `https://www.lotterypost.com/results/${state}`;
        const { data } = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const $ = cheerio.load(data);
        
        let results = [];
        // Selektè sa a vize ti wonn boul yo sou sit sa a
        $('.resultsDrawNumbers li').each((i, el) => {
            let n = $(el).text().trim();
            if (n && !isNaN(n)) results.push(n.padStart(2, '0'));
        });
        
        // Si nou jwenn boul, nou pran 3 premye yo pou chak tiraj
        return results.length > 0 ? results : null;
    } catch (e) {
        console.log(`Erè pou ${state}:`, e.message);
        return null;
    }
}

app.get('/results', async (req, res) => {
    const nyNow = moment().tz("America/New_York");
    const dateQuery = req.query.date || nyNow.format("YYYY-MM-DD");

    // Rale done yo pou chak eta
    const [flRaw, nyRaw, gaRaw] = await Promise.all([
        getBalls('fl'),
        getBalls('ny'),
        getBalls('ga')
    ]);

    const getTarget = (h, m) => {
        let t = moment.tz(`${dateQuery} ${h}:${m}`, "YYYY-MM-DD HH:mm", "America/New_York");
        if (nyNow.isAfter(t) && !req.query.date) t.add(1, 'days');
        return t.toISOString();
    };

    const items = [
        {
            state: "Florida Lottery",
            dateStr: moment(dateQuery).format("dddd, D MMM YYYY"),
            gameMidi: "Florida | MIDI",
            midiBalls: flRaw ? flRaw.slice(0, 3) : [], 
            midiTarget: getTarget(13, 35),
            gameAswe: "Florida | ASWÈ",
            asweBalls: flRaw ? flRaw.slice(3, 6) : [],
            asweTarget: getTarget(21, 50),
        },
        {
            state: "New York Lottery",
            dateStr: moment(dateQuery).format("dddd, D MMM YYYY"),
            gameMidi: "New York | MIDI",
            midiBalls: nyRaw ? nyRaw.slice(0, 3) : [],
            midiTarget: getTarget(14, 30),
            gameAswe: "New York | ASWÈ",
            asweBalls: nyRaw ? nyRaw.slice(3, 6) : [],
            asweTarget: getTarget(22, 30),
        },
        {
            state: "Georgia Lottery",
            dateStr: moment(dateQuery).format("dddd, D MMM YYYY"),
            gameMidi: "Georgia | MIDI",
            midiBalls: gaRaw ? gaRaw.slice(0, 3) : [],
            midiTarget: getTarget(12, 29),
            gameAswe: "Georgia | ASWÈ",
            asweBalls: gaRaw ? gaRaw.slice(3, 6) : [],
            asweTarget: getTarget(23, 34),
        }
    ];

    res.json({ items });
});

app.get('/', (req, res) => res.send("Sèvè Waldorf ON - Ale sou /results"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Sèvè a limen!"));
