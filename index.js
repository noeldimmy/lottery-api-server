const express = require('express');
const moment = require('moment-timezone');
const cors = require('cors');
const app = express();
app.use(cors());

app.get('/results', (req, res) => {
    // Nou fòse sèvè a travay sou lè New York (menm ak Ayiti)
    const nyTime = moment().tz("America/New_York");
    
    const getTarget = (h, m) => {
        let t = moment().tz("America/New_York").hours(h).minutes(m).seconds(0);
        // Si lè a pase deja pou jodi a, nou mete l pou demen
        if (nyTime.isAfter(t)) t.add(1, 'days');
        return t.toISOString();
    };

    const items = [
        {
            state: "Florida Lottery",
            dateStr: nyTime.format("dddd, D MMM YYYY"),
            gameMidi: "Florida | MIDI",
            midiBalls: ["04", "52", "00", "01"], // Isit la ou ka mete rezilta reyèl yo
            midiTarget: getTarget(13, 35),
            gameAswe: "Florida | ASWÈ",
            asweBalls: ["03", "46", "23", "66"],
            asweTarget: getTarget(21, 50),
        },
        {
            state: "New York Lottery",
            dateStr: nyTime.format("dddd, D MMM YYYY"),
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

app.listen(process.env.PORT || 3000);
