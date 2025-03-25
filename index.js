require('dotenv').config(); // Load environment variables

const express = require('express');
const twilio = require('twilio');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

// ✅ Correctly reference environment variables
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

app.use(express.json());

app.post('/fetch-recording', async (req, res, next) => {
    console.log("Incoming request:", req.body);

    const { RECORDING_URL } = req.body;

    if (!RECORDING_URL) {
        return res.status(400).json({ error: 'Missing RECORDING_URL parameter' });
    }

    const match = RECORDING_URL.match(/Recordings\/(RE[a-zA-Z0-9]+)/);
    if (!match) {
        return res.status(400).json({ error: 'Invalid RECORDING_URL format' });
    }

    console.log("Extracted Recording SID:", match[1]);  
    const recordingSid = match[1];

    try {
        // 🟢 Fetch recording details
        const recording = await client.recordings(recordingSid).fetch();
        console.log("Recording data:", recording);

        const mediaUrl = `https://api.twilio.com${recording.uri.replace('.json', '.mp3')}`;
        console.log("Downloading recording from:", mediaUrl);

        // 🟡 Download and save file
        const response = await axios({
            method: 'GET',
            url: mediaUrl,
            responseType: 'stream',
            auth: {
                username: process.env.TWILIO_ACCOUNT_SID, // ✅ Use process.env
                password: process.env.TWILIO_AUTH_TOKEN  // ✅ Use process.env
            }
        });

        const filePath = path.join(__dirname, `${recordingSid}.mp3`);
        const writer = fs.createWriteStream(filePath);

        response.data.pipe(writer);

        writer.on('finish', () => {
            console.log(`Recording saved as: ${filePath}`);
            res.json({
                message: "Recording downloaded successfully",
                recordingSid: recordingSid,
                localPath: filePath,
                mediaUrl: mediaUrl
            });
        });

        writer.on('error', (err) => {
            console.error("Error saving file:", err);
            next(err);
        });

    } catch (error) {
        console.error("Error fetching recording:", error);
        next(error);
    }
});

// 🛑 Error-handling middleware
app.use((err, req, res, next) => {
