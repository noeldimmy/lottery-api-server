const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000; // Render bezwen sa

app.use(cors());

async function scrapeState(state) {
    try {
        const url = `https://www.lotteryusa.com/${state}/`;
        const { data } = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        const $ = cheerio.load(data);
        const results = [];

        $('.state-results-game').each((i, el) => {
            const gameName = $(el).find('.game-title').text().trim();
            if (gameName.toLowerCase().includes("pick")) {
                const balls = [];
                $(el).find('.draw-result li').each((idx, b) => balls.push($(b).text().trim()));
                
                if (balls.length > 0) {
                    results.push({
                        date: new Date().toISOString(),
                        lotteryName: `${state.toUpperCase()} ${gameName}`,
                        midi: balls.slice(0, Math.ceil(balls.length/2)),
                        aswe: balls.slice(Math.ceil(balls.length/2))
                    });
                }
            }
        });
        return results;
    } catch (e) { return []; }
}

app.get('/results', async (req, res) => {
    const states = ['florida', 'new-york', 'georgia', 'new-jersey'];
    let allResults = [];
    
    for (const state of states) {
        const data = await scrapeState(state);
        allResults = [...allResults, ...data];
    }
    
    res.json({ items: allResults });
});

app.listen(PORT, () => console.log(`Sèvè a limen sou pò ${PORT}`));