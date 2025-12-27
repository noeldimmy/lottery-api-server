const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
app.use(cors());

async function getResults(state) {
    try {
        const url = `https://www.lotteryusa.com/${state}/`;
        const { data } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const $ = cheerio.load(data);
        const results = [];

        $('.state-results-game').each((i, el) => {
            const gameName = $(el).find('.game-title').text().trim();
            if (gameName.toLowerCase().includes("pick") || gameName.toLowerCase().includes("numbers") || gameName.toLowerCase().includes("win 4")) {
                const balls = [];
                $(el).find('.draw-result li').each((idx, b) => {
                    const val = $(b).text().trim();
                    if(val) balls.push(parseInt(val));
                });

                if (balls.length >= 3) {
                    results.push({
                        date: new Date().toISOString(),
                        lotteryName: `${state.toUpperCase()} ${gameName}`,
                        midi: balls.slice(0, Math.floor(balls.length / 2)),
                        aswe: balls.slice(Math.floor(balls.length / 2))
                    });
                }
            }
        });
        return results;
    } catch (e) { return []; }
}

app.get('/results', async (req, res) => {
    const states = ['florida', 'new-york', 'georgia', 'new-jersey'];
    let all = [];
    for (const s of states) {
        const r = await getResults(s);
        all = [...all, ...r];
    }
    res.json({ items: all });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Sèvè a limen!'));
