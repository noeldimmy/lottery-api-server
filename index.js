const express = require('express');
const cors = require('cors');
const app = express();
app.use(cors());

app.get('/results', (req, res) => {
    // Nou pran lè kounye a nan zòn New York/Haiti
    const now = new Date();
    const estTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
    const hours = estTime.getHours();
    const minutes = estTime.getMinutes();
    const currentTime = hours + (minutes / 60);

    // Lojik pou konnen si tiraj yo fèt deja
    // Midi se vè 1:30 PM (13.5) | Aswè se vè 9:30 PM (21.5)
    const isMidiReady = currentTime >= 13.5; 
    const isAsweReady = currentTime >= 21.5;

    const items = [
        {
            date: estTime.toISOString().split('T')[0],
            lotteryName: "FLORIDA PICK 3/4",
            // Si l poko lè, nou voye yon mesaj olye de boul
            midi: isMidiReady ? ["4", "0", "1", "9"] : ["Poko"], 
            aswe: isAsweReady ? ["0", "9", "2", "5"] : ["Poko"],
            nextDraw: isAsweReady ? "Demen Midi" : (isMidiReady ? "9:30 PM" : "1:30 PM")
        },
        {
            date: estTime.toISOString().split('T')[0],
            lotteryName: "NEW YORK NUMBERS",
            midi: isMidiReady ? ["8", "3", "5", "1"] : ["Poko"],
            aswe: isAsweReady ? ["7", "0", "4", "2"] : ["Poko"],
            nextDraw: isAsweReady ? "Demen Midi" : (isMidiReady ? "9:30 PM" : "1:30 PM")
        }
    ];

    res.json({ items });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Sèvè Entèlijan Limen!'));
