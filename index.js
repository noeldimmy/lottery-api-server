const express = require('express');
const cors = require('cors');
const app = express();
app.use(cors());

app.get('/results', (req, res) => {
    const now = new Date();
    const estTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
    
    const getTarget = (h, m) => {
        let d = new Date(estTime);
        d.setHours(h, m, 0, 0);
        return d.toISOString();
    };

    // Done sa yo se egzanp pwofesyonèl (n ap rale yo sou sit la apre)
    const items = [
        {
            state: "Florida Lottery",
            dateStr: "Samdi, 27 Desanm 2025",
            gameMidi: "Florida | MIDI",
            midiBalls: ["04", "52", "00", "01"],
            midiTarget: getTarget(13, 35),
            gameAswe: "Florida | ASWÈ",
            asweBalls: ["03", "46", "23", "66"],
            asweTarget: getTarget(21, 50),
        },
        {
            state: "New York Lottery",
            dateStr: "Samdi, 27 Desanm 2025",
            gameMidi: "New York | MIDI",
            midiBalls: ["04", "64", "45", "73"],
            midiTarget: getTarget(14, 30),
            gameAswe: "New York | ASWÈ",
            asweBalls: ["01", "14", "26", "00"],
            asweTarget: getTarget(22, 30),
        }
    ];
    res.json({ items });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Sèvè Pro Online!'));
