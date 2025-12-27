const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const moment = require('moment-timezone');

const app = express();
app.use(cors());

// Fonksyon pou rale boul yo sou entènèt la
async function scrapeLottery(url, selector) {
    try {
        const { data } = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const $ = cheerio.load(data);
        let balls = [];
        $(selector).each((i, el) => {
            let val = $(el).text().trim();
            if (val && !isNaN(val)) balls.push(val.padStart(2, '0'));
        });
        return balls.slice(0, 4); // Nou pran premye 4 boul yo (Tèt loto + 3 boul)
    } catch (e) {
        return [];
    }
}

app.get('/results', async (req, res) => {
    const nyNow = moment().tz("America/New_York");
    const dateQuery = req.query.date || nyNow.format("YYYY-MM-DD");

    // Adrès pou scraping (Egzanp pwofesyonèl)
    const sources = {
        fl: "https://www.lotteryusa.com/florida/",
        ny: "https://www.lotteryusa.com/new-york/"
    };

    // Scraping an tan reyèl
    const flBalls = await scrapeLottery(sources.fl, '.draw-result .ball');
    const nyBalls = await scrapeLottery(sources.ny, '.draw-result .ball');

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
            midiBalls: flBalls.length > 0 ? flBalls : ["--", "--", "--", "--"],
            midiTarget: getTarget(13, 35),
            gameAswe: "Florida | ASWÈ",
            asweBalls: flBalls.length > 0 ? flBalls : ["--", "--", "--", "--"], // Nan scraping reyèl, ou ka separe yo pa klas
            asweTarget: getTarget(21, 50),
        },
        {
            state: "New York Lottery",
            dateStr: moment(dateQuery).format("dddd, D MMM YYYY"),
            gameMidi: "New York | MIDI",
            nyBalls: nyBalls.length > 0 ? nyBalls : ["--", "--", "--", "--"],
            midiTarget: getTarget(14, 30),
            asweTarget: getTarget(22, 30),
        }
    ];

    res.json({ items });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Scraper Waldorf aktif!'));
