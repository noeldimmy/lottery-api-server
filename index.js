const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const moment = require('moment-timezone');

const app = express();
app.use(cors());

// Fonksyon Scraping ki pi solid
async function scrapeData(state) {
    try {
        // Nou itilize lotteryusa paske li pi estab pou scraping senp
        const url = `https://www.lotteryusa.com/${state}/`;
        const { data } = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const $ = cheerio.load(data);
        
        let numbers = [];
        // Selektè sa a vize boul ki fèk soti yo
        $('.draw-result .ball').each((i, el) => {
            let n = $(el).text().trim();
            if (n && !isNaN(n)) numbers.push(n.padStart(2, '0'));
        });
        
        return numbers.length >= 3 ? numbers : null;
    } catch (e) {
        console.log(`Error scraping ${state}:`, e.message);
        return null;
    }
}

app.get('/results', async (req, res) => {
    const nyNow = moment().tz("America/New_York");
    const dateQuery = req.query.date || nyNow.format("YYYY-MM-DD");

    // Rale done yo an paralèl
    const [flBalls, nyBalls, gaBalls, njBalls] = await Promise.all([
        scrapeData('florida'),
        scrapeData('new-york'),
        scrapeData('georgia'),
        scrapeData('new-jersey')
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
            midiBalls: flBalls ? flBalls.slice(0, 3) : [], 
            midiTarget: getTarget(13, 35),
            gameAswe: "Florida | ASWÈ",
            asweBalls: flBalls ? flBalls.slice(0, 3) : [],
            asweTarget: getTarget(21, 50),
        },
        {
            state: "New York Lottery",
            dateStr: moment(dateQuery).format("dddd, D MMM YYYY"),
            gameMidi: "New York | MIDI",
            midiBalls: nyBalls ? nyBalls.slice(0, 3) : [],
            midiTarget: getTarget(14, 30),
            gameAswe: "New York | ASWÈ",
            asweBalls: nyBalls ? nyBalls.slice(0, 3) : [],
            asweTarget: getTarget(22, 30),
        },
        {
            state: "Georgia Lottery",
            dateStr: moment(dateQuery).format("dddd, D MMM YYYY"),
            gameMidi: "Georgia | MIDI",
            midiBalls: gaBalls ? gaBalls.slice(0, 3) : [],
            midiTarget: getTarget(12, 29),
            gameAswe: "Georgia | ASWÈ",
            asweBalls: gaBalls ? gaBalls.slice(0, 3) : [],
            asweTarget: getTarget(23, 34),
        }
    ];

    res.json({ items });
});

app.listen(process.env.PORT || 3000);
