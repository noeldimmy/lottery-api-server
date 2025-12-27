const express = require('express');
const axios = require('axios');
const xml2js = require('xml2js');
const cors = require('cors');
const moment = require('moment-timezone');

const app = express();
app.use(cors());

async function getAutoResults() {
    try {
        // Nou itilize yon Feed RSS ki bay rezilta yo an tan reyèl
        const url = `https://www.lotterypost.com/feed/results/fl`; 
        const { data } = await axios.get(url);
        const parser = new xml2js.Parser();
        const result = await parser.parseStringPromise(data);
        
        // Nou rale dènye rezilta ki nan feed la
        const latestEntry = result.rss.channel[0].item[0].description[0];
        // Nou netwaye tèks la pou n jwenn chif yo sèlman
        const numbers = latestEntry.match(/\d+/g); 
        return numbers ? numbers : [];
    } catch (e) {
        console.error("Erè API:", e.message);
        return [];
    }
}

app.get('/results', async (req, res) => {
    const nyNow = moment().tz("America/New_York");
    const dateQuery = req.query.date || nyNow.format("YYYY-MM-DD");

    const flBalls = await getAutoResults();

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
                midiBalls: flBalls.slice(0, 3), 
                midiTarget: getTarget(13, 35),
                gameAswe: "Florida | ASWÈ",
                asweBalls: flBalls.slice(3, 6),
                asweTarget: getTarget(21, 50),
            },
            {
                state: "New York Lottery",
                dateStr: moment(dateQuery).format("dddd, D MMM YYYY"),
                gameMidi: "New York | MIDI",
                midiBalls: flBalls.slice(0, 3), // Tanporèman pou tès
                midiTarget: getTarget(14, 30),
                gameAswe: "New York | ASWÈ",
                asweBalls: flBalls.slice(3, 6),
                asweTarget: getTarget(22, 30),
            }
        ]
    });
});

app.listen(process.env.PORT || 3000);
