const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const moment = require('moment-timezone');

const app = express();
app.use(cors());

// Fonksyon pou rale rezilta yo sou sit ofisyèl la
async function getRealResults(state) {
    try {
        // Nou itilize yon sous ki mete ajou trè vit
        const url = `https://www.lotteryusa.com/${state}/`;
        const { data } = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        const $ = cheerio.load(data);
        let balls = [];

        // Selektè sa a vize boul ki fèk soti yo
        $('.draw-result .ball').each((i, el) => {
            let n = $(el).text().trim();
            if (n && !isNaN(n)) balls.push(n.padStart(2, '0'));
        });
        
        return balls.length > 0 ? balls : null;
    } catch (e) {
        return null;
    }
}

app.get('/results', async (req, res) => {
    const nyNow = moment().tz("America/New_York");
    const dateQuery = req.query.date || nyNow.format("YYYY-MM-DD");

    // Nou rale done reyèl yo nan moman an menm
    const flBalls = await getRealResults('florida');
    const nyBalls = await getRealResults('new-york');

    const getTarget = (h, m) => {
        let t = moment.tz(`${dateQuery} ${h}:${m}`, "YYYY-MM-DD HH:mm", "America/New_York");
        if (nyNow.isAfter(t) && !req.query.date) t.add(1, 'days');
        return t.toISOString();
    };

    res.json({
        items: [
            {
                state: "Florida Lottery",
                dateStr: moment(dateQuery).format("dddd, D MMM YYYY"),
                gameMidi: "Florida | MIDI",
                midiBalls: flBalls ? flBalls.slice(0, 3) : [], 
                midiTarget: getTarget(13, 35),
                gameAswe: "Florida | ASWÈ",
                asweBalls: flBalls ? flBalls.slice(3, 6) : [],
                asweTarget: getTarget(21, 50),
            },
            {
                state: "New York Lottery",
                dateStr: moment(dateQuery).format("dddd, D MMM YYYY"),
                gameMidi: "New York | MIDI",
                midiBalls: nyBalls ? nyBalls.slice(0, 3) : [],
                midiTarget: getTarget(14, 30),
                gameAswe: "New York | ASWÈ",
                asweBalls: nyBalls ? nyBalls.slice(3, 6) : [],
                asweTarget: getTarget(22, 30),
            }
        ]
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Scraper Live!"));
