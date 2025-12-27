const express = require('express');
const cors = require('cors');
const moment = require('moment-timezone'); // Pou lè a pa bay manti
const app = express();

app.use(cors());

app.get('/results', (req, res) => {
    // Nou fòse kalkil la sou lè Ayiti/New York
    const kounye a = moment().tz("America/New_York");

    const jwennTarget = (h, m) => {
        let t = moment().tz("America/New_York").hours(h).minutes(m).seconds(0);
        if (kounye a.isAfter(t)) t.add(1, 'days'); 
        return t.toISOString();
    };

    const items = [
        {
            state: "Florida Lottery",
            dateStr: "Samdi, 27 Desanm 2025",
            gameMidi: "Florida | MIDI",
            midiBalls: ["04", "52", "00", "01"], 
            midiTarget: jwennTarget(13, 35),
            gameAswe: "Florida | ASWÈ",
            asweBalls: ["03", "46", "23", "66"],
            asweTarget: jwennTarget(21, 50),
        },
        {
            state: "New York Lottery",
            dateStr: "Samdi, 27 Desanm 2025",
            gameMidi: "New York | MIDI",
            midiBalls: ["04", "64", "45", "73"], 
            midiTarget: jwennTarget(14, 30),
            gameAswe: "New York | ASWÈ",
            asweBalls: ["01", "14", "26", "00"],
            asweTarget: jwennTarget(22, 30),
        }
    ];
    res.json({ items });
});

app.listen(process.env.PORT || 3000);
