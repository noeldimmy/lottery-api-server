const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const moment = require('moment-timezone');

const app = express();
app.use(cors());

async function scrapeLottery(stateCode) {
    try {
        // Sous sa a pi fasil pou rale san blokaj
        const url = `https://www.lotteryusa.com/${stateCode}/`;
        const { data } = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36'
            }
        });
        const $ = cheerio.load(data);
        let results = [];

        // Chèche ti wonn ki gen boul yo
        $('.draw-result ul li').each((i, el) => {
            let val = $(el).text().trim();
            if (val && !isNaN(val)) results.push(val.padStart(2, '0'));
        });

        return results.length > 0 ? results : null;
    } catch (e) {
        console.error(`Erè rale done ${stateCode}:`, e.message);
        return null;
    }
}

app.get('/results', async (req, res) => {
    const nyNow = moment().tz("America/New_York");
    const dateQuery = req.query.date || nyNow.format("YYYY-MM-DD");

    // Rale done yo pou chak eta
    const [flRaw, nyRaw, gaRaw] = await Promise.all([
        scrapeLottery('florida'),
        scrapeLottery('new-york'),
        scrapeLottery('georgia')
    ]);

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
                midiBalls: flRaw ? flRaw.slice(0, 3) : [], // Pran 3 premye boul yo
                midiTarget: getTarget(13, 35),
                gameAswe: "Florida | ASWÈ",
                asweBalls: flRaw ? flRaw.slice(3, 6) : [], // Pran 3 pwochen yo
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

app.get('/', (req, res) => res.send("Sèvè Waldorf ON - Ale sou /results"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Sèvè a aktif sou pòt ${PORT}`));
