const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
app.use(cors());

async function getResults(state) {
    try {
        // Nou chanje URL la pou l ale dirèkteman nan paj rezilta yo
        const url = `https://www.lotteryusa.com/${state}/`;
        const { data } = await axios.get(url, { 
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9'
            },
            timeout: 10000 
        });
        
        const $ = cheerio.load(data);
        const results = [];

        // N ap chèche kote boul yo kache nan HTML la
        $('.state-results-game').each((i, el) => {
            const gameName = $(el).find('.game-title').text().trim();
            
            // Filtre pou jwenn Pick 3, Pick 4, Numbers, elatriye.
            if (gameName.toLowerCase().match(/pick|numbers|win 4/)) {
                const balls = [];
                $(el).find('.draw-result li').each((idx, b) => {
                    const val = $(b).text().trim();
                    if(val) balls.push(parseInt(val));
                });

                if (balls.length >= 3) {
                    results.push({
                        date: new Date().toISOString(),
                        lotteryName: `${state.toUpperCase()} ${gameName}`,
                        midi: balls.slice(0, Math.ceil(balls.length / 2)),
                        aswe: balls.slice(Math.ceil(balls.length / 2))
                    });
                }
            }
        });
        return results;
    } catch (e) { 
        console.log(`Erè pou ${state}:`, e.message);
        return []; 
    }
}

app.get('/results', async (req, res) => {
    // Nou kòmanse ak Florida sèlman pou tès la fèt rapid
    const states = ['florida', 'new-york', 'georgia'];
    let allResults = [];
    
    for (const s of states) {
        const r = await getResults(s);
        allResults = [...allResults, ...r];
    }
    
    res.json({ items: allResults });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Sèvè a pare!'));
