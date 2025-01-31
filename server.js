import { GoogleGenerativeAI } from "@google/generative-ai";
import express from "express";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();
const app = express();
app.use(express.json());
app.use(cors());

const API_KEY = process.env.GOOGLE_API_KEY;
if (!API_KEY) {
    console.error("Missing API Key. Set GOOGLE_API_KEY in .env");
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

app.post("/generate", async (req, res) => {
    try {
        const { prompt } = req.body;
        if (!prompt) {
            return res.status(400).json({ error: "Prompt is required" });
        }

        const result = await model.generateContent({ 
            contents: [{ role: "user", parts: [{ text: prompt }] }] 
        });

        const responseText = result.response?.text() || "No response";
        res.json({ response: responseText });

    } catch (error) {
        console.error("Error generating content:", error);
        res.status(500).json({ error: error.message || "Internal Server Error" });
    }
});

app.get("/", (req, res) => {
    res.send("Welcome to the Google Generative AI API");
})

const PORT = process.env.PORT || 7070;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

