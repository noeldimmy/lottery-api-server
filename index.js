const express = require('express');
const cors = require('cors');
const moment = require('moment-timezone'); // Nou enpòte sa nou sot enstale a
const app = express();

app.use(cors());

app.get('/results', (req, res) => {
    // Nou fikse lè a sou America/New_York (menm lè ak Ayiti)
    const kounye a = moment().tz("America/New_York");

    const jwennTarget = (h, m) => {
        let t = moment().tz("America/New_York").hours(h).minutes(m).seconds(0);
        // Si lè a pase deja pou jodi a, nou mete target la pou demen
        if (kounye a.isAfter(t)) {
            t.add(1, 'days');
        }
        return t.toISOString();
    };

    const items = [
        {
            state: "Florida Lottery",
            dateStr: kounye a.format("dddd, D MMM YYYY"),
            gameMidi: "Florida | MIDI",
            midiBalls: ["04", "52", "00", "01"], 
            midiTarget: jwennTarget(13, 35), // 1:35 PM
            gameAswe: "Florida | ASWÈ",
            asweBalls: ["03", "46", "23", "66"],
            asweTarget: jwennTarget(21, 50), // 9:50 PM
        },
        {
            state: "New York Lottery",
            dateStr: kounye a.format("dddd, D MMM YYYY"),
            gameMidi: "New York | MIDI",
            midiBalls: ["04", "64", "45", "73"], 
            midiTarget: jwennTarget(14, 30), // 2:30 PM
            gameAswe: "New York | ASWÈ",
            asweBalls: ["01", "14", "26", "00"],
            asweTarget: jwennTarget(22, 30), // 10:30 PM
        }
    ];

    res.json({ items });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Sèvè a limen sou lè New York!'));
