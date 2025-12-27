const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const moment = require('moment-timezone');

const app = express();
app.use(cors());

// Fonksyon pou rale done yo san yo pa bloke nou
async function fetchRealNumbers(state) {
    try {
        // Nou itilize yon sous ki bay rezilta rapid
        const url = `https://www.lotterypost.com/results/${state}`;
        const { data } = await axios.get(url, {
            headers: { 
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1' 
            }
        });
        const $ = cheerio.load(data);
        let allNumbers = [];

        // Nou chèche tout boul ki nan lis rezilta yo
        $('.resultsDrawNumbers li').each((i, el) => {
            let n = $(el).text().trim();
            if (n && !isNaN(n)) allNumbers.push(n.padStart(2, '0'));
        });

        return allNumbers.length > 0 ? allNumbers : null;
    } catch (e) {
        console.error("Erè Scraping:", e.message);
        return null;
    }
}

app.get('/results', async (req, res) => {
    const nyNow = moment().tz("America/New_York");
    const dateQuery = req.query.date || nyNow.format("YYYY-MM-DD");

    // Rale done reyèl yo
    const flRaw = await fetchRealNumbers('fl');
    const nyRaw = await fetchRealNumbers('ny');

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
                // Nou pran premye 3 boul yo pou midi
                midiBalls: flRaw ? flRaw.slice(0, 3) : [], 
                midiTarget: getTarget(13, 35),
                gameAswe: "Florida | ASWÈ",
                // Nou pran 3 pwochen boul yo pou aswè
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
            }
        ]
    });
});

app.get('/', (req, res) => res.send("Sèvè Waldorf aktif!"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Sèvè a limen!"));
