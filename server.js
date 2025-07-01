import { GoogleGenerativeAI } from "@google/generative-ai";
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import OpenAI from "openai";
import multer from "multer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';

// Import file parsing libraries with proper error handling
let mammoth; // For DOCX files
let pdfParse; // PDF parser (pure JS)

// Try to load PDF parsing libraries
try {
    pdfParse = (await import("pdf-parse")).default;
    console.log("✓ pdf-parse loaded successfully");
} catch (error) {
    console.log("⚠️ pdf-parse not available:", error.message);
}

try {
    mammoth = (await import("mammoth")).default;
    console.log("✓ mammoth (DOCX parser) loaded successfully");
} catch (error) {
    console.log("⚠️ mammoth not available:", error.message);
}

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Validate Google API Key
const API_KEY = process.env.GOOGLE_API_KEY;
if (!API_KEY) {
    console.error("Missing API Key. Set GOOGLE_API_KEY in .env");
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Collect OpenAI API keys from environment variables
const OPENAI_KEYS = [
    process.env.OPENAI_API_KEY1,
    process.env.OPENAI_API_KEY2,
    process.env.OPENAI_API_KEY3,
    process.env.OPENAI_API_KEY4,
    process.env.OPENAI_API_KEY5
].filter(Boolean);

function getRandomOpenAIKey() {
    return OPENAI_KEYS[Math.floor(Math.random() * OPENAI_KEYS.length)];
}

// Set up multer for file uploads to 'uploads' folder
const upload = multer({ dest: 'uploads/' });

// Store extracted text content as context
let fileContext = "";

// Supported file types and their handlers
const SUPPORTED_EXTENSIONS = {
    '.pdf': 'parsePDF',
    '.docx': 'parseDOCX',
    '.doc': 'parseDOC',
    '.txt': 'parseTXT',
    '.md': 'parseTXT',
    '.json': 'parseTXT',
    '.csv': 'parseTXT',
    '.xml': 'parseTXT',
    '.html': 'parseTXT',
    '.js': 'parseTXT',
    '.py': 'parseTXT',
    '.java': 'parseTXT',
    '.cpp': 'parseTXT',
    '.c': 'parseTXT',
    '.sql': 'parseTXT',
    '.pptx': 'parsePPTX',
    '.ppt': 'parsePPT'
};

// PDF parsing using only pdf-parse (pure JS, cross-platform)
async function parsePDF(filePath) {
    if (!pdfParse) {
        throw new Error("PDF parsing not available - pdf-parse library not loaded");
    }
    try {
        console.log(`Trying pdf-parse: ${filePath}`);
        const dataBuffer = fs.readFileSync(filePath);
        const data = await pdfParse(dataBuffer);
        if (data.text && data.text.trim().length > 0) {
            console.log(`✓ pdf-parse successful: ${data.text.length} characters`);
            return { text: data.text.trim(), method: 'pdf-parse' };
        } else {
            throw new Error("No text extracted from PDF (may be image-based, encrypted, or empty)");
        }
    } catch (error) {
        console.error(`pdf-parse failed: ${error.message}`);
        throw error;
    }
}

// Parse DOCX files using mammoth
async function parseDOCX(filePath) {
    if (!mammoth) {
        throw new Error("DOCX parsing not available - mammoth library not loaded");
    }
    try {
        console.log(`Parsing DOCX: ${filePath}`);
        const result = await mammoth.extractRawText({ path: filePath });
        console.log(`✓ DOCX parsed successfully: ${result.value.length} characters`);
        return { text: result.value, method: 'mammoth' };
    } catch (error) {
        console.error(`DOCX parsing error: ${error.message}`);
        throw error;
    }
}

// Parse DOC files (older format) - basic text extraction
async function parseDOC(filePath) {
    try {
        console.log(`Attempting to parse DOC: ${filePath}`);
        const buffer = fs.readFileSync(filePath);
        const text = buffer.toString('utf8').replace(/[^\x20-\x7E\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim();
        if (text.length > 100) {
            console.log(`✓ DOC parsed (basic extraction): ${text.length} characters`);
            return { text, method: 'basic-extraction' };
        } else {
            throw new Error("Insufficient text extracted from DOC file");
        }
    } catch (error) {
        console.error(`DOC parsing error: ${error.message}`);
        throw error;
    }
}

// Parse plain text files
async function parseTXT(filePath) {
    try {
        console.log(`Reading text file: ${filePath}`);
        const text = fs.readFileSync(filePath, 'utf8');
        console.log(`✓ Text file read successfully: ${text.length} characters`);
        return { text, method: 'fs.readFileSync' };
    } catch (error) {
        console.error(`Text file reading error: ${error.message}`);
        throw error;
    }
}

// Parse PowerPoint files (basic - would need additional libraries for full support)
async function parsePPTX(filePath) {
    console.log(`⚠️ PPTX parsing not fully implemented yet: ${filePath}`);
    return { text: `[PowerPoint file detected: ${path.basename(filePath)} - content extraction not yet implemented]`, method: 'placeholder' };
}

async function parsePPT(filePath) {
    console.log(`⚠️ PPT parsing not fully implemented yet: ${filePath}`);
    return { text: `[PowerPoint file detected: ${path.basename(filePath)} - content extraction not yet implemented]`, method: 'placeholder' };
}

// Generic file parser that routes to appropriate handler
async function parseFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const handler = SUPPORTED_EXTENSIONS[ext];
    
    if (!handler) {
        console.log(`⚠️ Unsupported file type: ${ext} for file: ${path.basename(filePath)}`);
        return { text: `[Unsupported file type: ${path.basename(filePath)}]`, method: 'unsupported' };
    }
    
    try {
        switch (handler) {
            case 'parsePDF':
                return await parsePDF(filePath);
            case 'parseDOCX':
                return await parseDOCX(filePath);
            case 'parseDOC':
                return await parseDOC(filePath);
            case 'parseTXT':
                return await parseTXT(filePath);
            case 'parsePPTX':
                return await parsePPTX(filePath);
            case 'parsePPT':
                return await parsePPT(filePath);
            default:
                throw new Error(`No handler found for: ${handler}`);
        }
    } catch (error) {
        console.error(`Error parsing ${filePath}:`, error.message);
        return { text: `[Failed to parse: ${path.basename(filePath)} - ${error.message}]`, method: 'error' };
    }
}

// Function to load all supported files from assets folder
async function loadFilesFromAssets() {
    const assetsPath = path.join(__dirname, "assets");
    let combinedText = "";
    
    try {
        if (!fs.existsSync(assetsPath)) {
            console.log("Assets folder not found. Creating it...");
            fs.mkdirSync(assetsPath, { recursive: true });
            console.log("Please place your files in the ./assets folder");
            console.log("Supported formats:", Object.keys(SUPPORTED_EXTENSIONS).join(', '));
            return;
        }

        const files = fs.readdirSync(assetsPath);
        const supportedFiles = files.filter(file => {
            const ext = path.extname(file).toLowerCase();
            return SUPPORTED_EXTENSIONS[ext];
        });
        
        if (supportedFiles.length === 0) {
            console.log("No supported files found in assets folder");
            console.log("Supported formats:", Object.keys(SUPPORTED_EXTENSIONS).join(', '));
            return;
        }

        console.log(`Found ${supportedFiles.length} supported files:`, supportedFiles);

        for (const fileName of supportedFiles) {
            const filePath = path.join(assetsPath, fileName);
            
            try {
                console.log(`\n--- Processing ${fileName} ---`);
                
                if (!fs.existsSync(filePath)) {
                    console.error(`✗ File not found: ${filePath}`);
                    continue;
                }

                const result = await parseFile(filePath);
                
                if (result.text && result.text.length > 0) {
                    combinedText += `\n\n=== Content from ${fileName} (${result.method}) ===\n`;
                    combinedText += result.text;
                    console.log(`✓ Successfully processed ${fileName}: ${result.text.length} characters using ${result.method}`);
                } else {
                    console.log(`⚠️ No content extracted from ${fileName}`);
                }
                
            } catch (error) {
                console.error(`✗ Failed to process ${fileName}:`, error.message);
                combinedText += `\n\n=== Error processing ${fileName} ===\n[${error.message}]\n`;
            }
        }

        fileContext = combinedText;
        console.log(`\n🎉 File loading complete! Total context: ${fileContext.length} characters`);
        console.log(`Files processed: ${supportedFiles.length}`);
        
    } catch (error) {
        console.error("Error loading files:", error.message);
        fileContext = "";
    }
}

// Load files at startup with error handling
async function initializeFileContext() {
    try {
        await loadFilesFromAssets();
        console.log("File context ready for AI responses");
    } catch (error) {
        console.error("Failed to initialize file context:", error.message);
        console.log("Continuing without file context...");
    }
}

// Initialize file context
initializeFileContext();

// Main chat endpoint
app.post("/generate", async (req, res) => {
    try {
        const { prompt, provider, personality, forceContext } = req.body;
        if (!prompt) {
            return res.status(400).json({ error: "Prompt is required" });
        }

        const contextKeywords = [
            'document', 'file', 'context', 'content', 'information', 'data',
            'extract', 'summarize', 'explain', 'reference', 'from the document', 'from the file', 'according to', 'based on', 'in the document', 'in the file'
        ];
        const promptLower = prompt.toLowerCase();
        const shouldUseFileContext = Boolean(forceContext) || contextKeywords.some(word => promptLower.includes(word));

        let enhancedPrompt = prompt;
        if (shouldUseFileContext && fileContext) {
            enhancedPrompt = `Context from uploaded documents:\n${fileContext.substring(0, 12000)}\n\n` +
                `Based on the above context, please respond to: ${prompt}`;
        }

        if (personality) {
            let personalityPrompt = "\n\nPlease respond with the following personality characteristics:\n";
            const { context, traits, preferences, style, topics } = personality;
            if (context) personalityPrompt += `Context: ${context}\n`;
            if (traits) personalityPrompt += `Traits: ${traits}\n`;
            if (preferences) personalityPrompt += `Preferences: ${preferences}\n`;
            if (style) personalityPrompt += `Style: ${style}\n`;
            if (topics) personalityPrompt += `Topics: ${topics}\n`;
            enhancedPrompt += personalityPrompt;
        }

        let responseText = "No response";
        let usedProvider = (provider || "google").toLowerCase();
        let errorDetails = null;

        async function tryOpenAI() {
            if (OPENAI_KEYS.length === 0) {
                throw new Error("No OpenAI API keys configured");
            }
            let systemPrompt = "You are an AI assistant.";
            if (shouldUseFileContext && fileContext) {
                systemPrompt += `\n\nYou have access to the following document content for reference:\n${fileContext.substring(0, 12000)}...`;
            }
            if (personality) {
                const { context, traits, preferences, style, topics } = personality;
                if (context) systemPrompt += `\n\nContext: ${context}`;
                if (traits) systemPrompt += `\n\nTraits: ${traits}`;
                if (preferences) systemPrompt += `\n\nPreferences: ${preferences}`;
                if (style) systemPrompt += `\n\nStyle: ${style}`;
                if (topics) systemPrompt += `\n\nTopics: ${topics}`;
            }
            const openai = new OpenAI({ apiKey: getRandomOpenAIKey() });
            const completion = await openai.chat.completions.create({
                model: "gpt-3.5-turbo",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: prompt }
                ],
            });
            return completion.choices[0]?.message?.content || "No response";
        }

        if (usedProvider === "google") {
            try {
                const result = await model.generateContent(enhancedPrompt);
                responseText = result.response?.text() || "No response";
            } catch (error) {
                // If Google quota exceeded, fallback to OpenAI if available
                if (error.status === 429 && OPENAI_KEYS.length > 0) {
                    try {
                        responseText = await tryOpenAI();
                        usedProvider = "openai";
                    } catch (openaiError) {
                        errorDetails = openaiError.message || openaiError.toString();
                    }
                } else {
                    errorDetails = error.message || error.toString();
                }
            }
        } else if (usedProvider === "openai") {
            try {
                responseText = await tryOpenAI();
            } catch (openaiError) {
                errorDetails = openaiError.message || openaiError.toString();
            }
        }

        // Apply personality formatting if specified
        if (personality && personality.responseFormats) {
            if (personality.responseFormats.code) {
                responseText = responseText.replace(/```([\s\S]*?)```/g, match => `\n\n${match}\n\n`);
            }
            if (personality.responseFormats.bold) {
                responseText = `***${responseText}***`;
            }
        }

        if (errorDetails) {
            return res.status(429).json({ error: errorDetails, providerTried: usedProvider });
        }
        res.json({ response: responseText, provider: usedProvider });
    } catch (error) {
        console.error("Error generating content:", error);
        res.status(500).json({ error: error.message || "Internal Server Error" });
    }
});

// File upload endpoint (supports multiple file types)
app.post("/upload-file", upload.single("file"), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
    }

    const { originalname, size, mimetype, filename, path: filePath } = req.file;
    let extractedText = "";
    let parseMethod = "";

    try {
        const result = await parseFile(filePath);
        extractedText = result.text;
        parseMethod = result.method;
        
        if (extractedText && extractedText.length > 0) {
            fileContext += `\n\n=== Uploaded: ${originalname} (${parseMethod}) ===\n${extractedText}`;
            console.log(`Added ${extractedText.length} characters from uploaded file to context`);
        } else {
            console.log(`Warning: No text extracted from uploaded file ${originalname}`);
        }
        
    } catch (err) {
        console.error("File extraction error:", err.message);
        extractedText = `(Failed to extract text from file: ${err.message})`;
        parseMethod = "error";
    }

    // Clean up uploaded file after processing
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    } catch (cleanupError) {
        console.error("Error cleaning up uploaded file:", cleanupError.message);
    }

    res.json({
        name: originalname,
        size,
        type: mimetype,
        storedAs: filename,
        uploadDate: new Date().toISOString(),
        parseMethod: parseMethod,
        extractedText: extractedText ? extractedText.substring(0, 500) : undefined // preview only
    });
});

// Endpoint to reload files (useful for adding new files without restarting)
app.post("/reload-files", async (req, res) => {
    try {
        await loadFilesFromAssets();
        res.json({
            message: "Files reloaded successfully",
            contextLength: fileContext.length,
            hasContext: fileContext.length > 0,
            supportedFormats: Object.keys(SUPPORTED_EXTENSIONS)
        });
    } catch (error) {
        console.error("Error reloading files:", error);
        res.status(500).json({ error: "Failed to reload files" });
    }
});

// Status endpoint
app.get("/status", (req, res) => {
    res.json({
        status: "Server running",
        fileContextAvailable: fileContext.length > 0,
        contextLength: fileContext.length,
        supportedFormats: Object.keys(SUPPORTED_EXTENSIONS),
        availableParsers: {
            pdfParse: !!pdfParse,
            mammoth: !!mammoth
        },
        timestamp: new Date().toISOString()
    });
});

// Root endpoint
app.get("/", (req, res) => {
    res.json({
        message: "Welcome to the Multi-Format Document Chatbot API",
        endpoints: {
            "POST /generate": "Generate AI responses with document context",
            "POST /upload-file": "Upload a file and add its content to context",
            "POST /reload-files": "Reload files from assets folder",
            "GET /status": "Check server status",
            "GET /": "This help message"
        },
        supportedFormats: Object.keys(SUPPORTED_EXTENSIONS),
        fileContextLoaded: fileContext.length > 0,
        availableParsers: {
            pdfParse: !!pdfParse,
            mammoth: !!mammoth
        }
    });
});

// Serve static files from the 'uploads' and 'assets' folders
app.use('/uploads', express.static('uploads'));
app.use('/assets', express.static('assets'));

const PORT = process.env.PORT || 7070;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📄 File context ${fileContext.length > 0 ? 'loaded' : 'not available'}`);
    console.log(`🔧 Supported formats: ${Object.keys(SUPPORTED_EXTENSIONS).join(', ')}`);
    console.log(`🌐 Visit http://localhost:${PORT} for API info`);
});