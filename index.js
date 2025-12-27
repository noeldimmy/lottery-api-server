const express = require('express');
const axios = require('axios');
const cors = require('cors');
const moment = require('moment-timezone');

const app = express();
app.use(cors());

// Fonksyon pou rale done nan yon sous API piblik oswa RSS
async function fetchLotteryData(state) {
    try {
        // Nou itilize yon sèvis ki bay done JSON dirèkteman pou evite blokaj HTML
        const url = `https://data.ny.gov/resource/dg63-4siq.json?$limit=1&$order=draw_date DESC`; // Egzanp NY
        const response = await axios.get(url);
        if (response.data && response.data.length > 0) {
            const numbers = response.data[0].winning_numbers.split(' ');
            return numbers;
        }
        return null;
    } catch (e) {
        return null;
    }
}

app.get('/results', async (req, res) => {
    const nyNow = moment().tz("America/New_York");
    const dateQuery = req.query.date || nyNow.format("YYYY-MM-DD");

    // Pou Florida ak lòt yo, nou simulate done reyèl yo si scraping la bloke
    // Nan yon pwojè 100% pro, nou t ap itilize yon kle API peye tankou "Lottery API"
    // Men pou kounye a, ann fòse done yo parèt pou w wè kijan l ap bèl nan App a
    
    const items = [
        {
            state: "Florida Lottery",
            dateStr: nyNow.format("dddd, D MMM YYYY"),
            gameMidi: "Florida | MIDI",
            midiBalls: ["12", "45", "09"], // Done sa yo ap vin dinamik depi API a konekte
            midiTarget: moment.tz(`${dateQuery} 13:35`, "YYYY-MM-DD HH:mm", "America/New_York").toISOString(),
            gameAswe: "Florida | ASWÈ",
            asweBalls: ["33", "21", "67"],
            asweTarget: moment.tz(`${dateQuery} 21:50`, "YYYY-MM-DD HH:mm", "America/New_York").toISOString(),
        },
        {
            state: "New York Lottery",
            dateStr: nyNow.format("dddd, D MMM YYYY"),
            gameMidi: "New York | MIDI",
            midiBalls: ["04", "64", "45"],
            midiTarget: moment.tz(`${dateQuery} 14:30`, "YYYY-MM-DD HH:mm", "America/New_York").toISOString(),
            gameAswe: "New York | ASWÈ",
            asweBalls: ["88", "12", "00"],
            asweTarget: moment.tz(`${dateQuery} 22:30`, "YYYY-MM-DD HH:mm", "America/New_York").toISOString(),
        }
    ];

    res.json({ items });
});

app.get('/', (req, res) => res.send("Waldorf API Online"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Sèvè a ap kouri sou pòt ${PORT}`));
