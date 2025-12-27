const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const moment = require('moment-timezone');

const app = express();
app.use(cors());

async function getLottoResults(state) {
    try {
        // Nou chanje sous la pou n ale sou yon sit ki mwens sevè
        const url = `https://www.lotterypost.com/results/${state}`;
        const { data } = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            }
        });
        const $ = cheerio.load(data);
        let results = [];
        
        $('.resultsDrawNumbers li').each((i, el) => {
            let val = $(el).text().trim();
            if (val && !isNaN(val)) results.push(val.padStart(2, '0'));
        });
        
        return results.length > 0 ? results : null;
    } catch (error) {
        console.log(`Erè 403 evite? : ${error.message}`);
        return null;
    }
}

app.get('/results', async (req, res) => {
    const nyNow = moment().tz("America/New_York");
    const dateQuery = req.query.date || nyNow.format("YYYY-MM-DD");

    // Rale done yo
    const flBalls = await getLottoResults('fl');
    const nyBalls = await getLottoResults('ny');

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

app.listen(process.env.PORT || 3000);
