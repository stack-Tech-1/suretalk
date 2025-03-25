// Load environment variables only in development
if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config();
}

const express = require('express');
const twilio = require('twilio');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { storage } = require('./firebase'); // 🔹 Import Firebase Storage
const { ref, uploadBytes, getDownloadURL } = require("firebase/storage");

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ Ensure required environment variables exist
if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    console.error("❌ Missing Twilio credentials. Please check your environment variables.");
    process.exit(1);
}

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
app.use(express.json());

app.post('/fetch-recording', async (req, res, next) => {
    console.log("Incoming request:", req.body);

    const { RECORDING_URL } = req.body;
    if (!RECORDING_URL) return res.status(400).json({ error: 'Missing RECORDING_URL parameter' });

    const match = RECORDING_URL.match(/Recordings\/(RE[a-zA-Z0-9]+)/);
    if (!match) return res.status(400).json({ error: 'Invalid RECORDING_URL format' });

    const recordingSid = match[1];
    console.log("Extracted Recording SID:", recordingSid);

    try {
        // 🟢 Fetch recording details
        const recording = await client.recordings(recordingSid).fetch();
        console.log("Recording data:", recording);

        const mediaUrl = `https://api.twilio.com${recording.uri.replace('.json', '.mp3')}`;
        console.log("Downloading recording from:", mediaUrl);

        // 🟡 Download the file
        const response = await axios({
            method: 'GET',
            url: mediaUrl,
            responseType: 'stream',
            auth: {
                username: process.env.TWILIO_ACCOUNT_SID, 
                password: process.env.TWILIO_AUTH_TOKEN
            }
        });

        const tempFilePath = path.join(__dirname, `${recordingSid}.mp3`);
        const writer = fs.createWriteStream(tempFilePath);
        response.data.pipe(writer);

        writer.on('finish', async () => {
            console.log(`✅ Recording saved as: ${tempFilePath}`);

            // 🟠 Upload to Firebase Storage
            const storageRef = ref(storage, `recordings/${recordingSid}.mp3`);
            const fileBuffer = fs.readFileSync(tempFilePath);
            await uploadBytes(storageRef, fileBuffer);

            // 🌍 Get Public URL
            const publicUrl = await getDownloadURL(storageRef);
            console.log("✅ Public URL:", publicUrl);

            // 🗑 Delete temp file
            fs.unlinkSync(tempFilePath);

            // 🔹 Return Public URL to Twilio
            res.json({
                message: "Recording uploaded successfully",
                recordingSid: recordingSid,
                firebaseUrl: publicUrl
            });
        });

        writer.on('error', (err) => {
            console.error("❌ Error saving file:", err);
            next(err);
        });

    } catch (error) {
        console.error("❌ Error processing recording:", error);
        next(error);
    }
});

// 🛑 Error-handling middleware
app.use((err, req, res, next) => {
    console.error("❌ Unhandled error:", err);
    res.status(500).json({ error: "Internal Server Error", details: err.message });
});

// ✅ Listen on assigned port
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
