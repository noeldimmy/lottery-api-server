const express = require('express');
const cors = require('cors');
const app = express();
app.use(cors());

app.get('/results', (req, res) => {
    const now = new Date();
    const estTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
    
    // Nou kreye dat jodi a ak lè espesifik kliyan an te bay yo
    const getTarget = (h, m) => {
        let d = new Date(estTime);
        d.setHours(h, m, 0, 0);
        return d.toISOString();
    };

    const items = [
        {
            date: estTime.toLocaleDateString('fr-CA'),
            lotteryName: "FLORIDA PICK 3/4",
            midi: ["4", "0", "1", "9"], 
            aswe: ["0", "9", "2", "5"],
            // Nou voye lè egzak yo pou Flutter ka fè countdown la
            midiTime: getTarget(13, 35), // 1:35 PM
            asweTime: getTarget(21, 50)  // 9:50 PM
        },
        {
            date: estTime.toLocaleDateString('fr-CA'),
            lotteryName: "NEW YORK NUMBERS",
            midi: ["8", "3", "5", "1"],
            aswe: ["7", "0", "4", "2"],
            midiTime: getTarget(14, 30), // 2:30 PM
            asweTime: getTarget(22, 30)  // 10:30 PM
        }
    ];
    res.json({ items });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Sèvè Countdown pare!'));
