// api/webhook.js
const axios = require('axios');

const INSTANCE_ID = "instance3532";
const WAPILOT_TOKEN = "yzWzEjmxZpbifuOx6lWafYT3Ng69gaFpJGAdTsVc6N";
const WAPILOT_API_URL = "https://api.wapilot.net/api/v2";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

// قائمة النماذج اللي هنحاول نستخدمها
const MODELS = [
    "gemini-pro",           // النموذج الأساسي للنص
    "gemini-1.0-pro",       // النموذج القديم
    "gemini-1.5-pro",       // النموذج المتقدم
    "chat-bison-001"        // نموذج PaLM القديم
];

async function imageUrlToBase64(url) {
    try {
        const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
        const base64 = Buffer.from(response.data).toString('base64');
        const mimeType = response.headers['content-type'] || 'image/jpeg';
        return { base64, mimeType };
    } catch (error) {
        return null;
    }
}

async function tryModel(modelName, requestBody) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`;
    
    console.log(`🔄 Trying model: ${modelName}`);
    
    const response = await axios.post(url, requestBody, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
    });
    
    return response.data;
}

async function chatWithGemini(message) {
    const requestBody = {
        contents: [{
            parts: [{ text: message }]
        }]
    };
    
    let lastError = null;
    
    for (const modelName of MODELS) {
        try {
            const result = await tryModel(modelName, requestBody);
            
            if (result.candidates?.[0]?.content?.parts?.[0]?.text) {
                console.log(`✅ Success with ${modelName}`);
                return result.candidates[0].content.parts[0].text;
            }
        } catch (error) {
            console.log(`❌ ${modelName} failed:`, error.response?.data?.error?.message || error.message);
            lastError = error;
        }
    }
    
    throw new Error('جميع النماذج فشلت: ' + (lastError?.response?.data?.error?.message || lastError?.message));
}

async function analyzeImageWithGemini(imageBase64, mimeType) {
    const requestBody = {
        contents: [{
            parts: [
                { text: "استخرج النص العربي من الصورة، صحح الأخطاء، وأجب عن أي سؤال. أجب بالعربية." },
                { inline_data: { mime_type: mimeType, data: imageBase64 } }
            ]
        }]
    };
    
    // للصور نجرب gemini-pro-vision
    const visionModels = ["gemini-pro-vision", "gemini-1.0-pro-vision", ...MODELS];
    
    let lastError = null;
    
    for (const modelName of visionModels) {
        try {
            const result = await tryModel(modelName, requestBody);
            
            if (result.candidates?.[0]?.content?.parts?.[0]?.text) {
                console.log(`✅ Image success with ${modelName}`);
                return result.candidates[0].content.parts[0].text;
            }
        } catch (error) {
            console.log(`❌ ${modelName} failed:`, error.response?.data?.error?.message || error.message);
            lastError = error;
        }
    }
    
    throw new Error('جميع نماذج الصور فشلت');
}

async function sendWAPilotMessage(chatId, text) {
    try {
        await axios.post(
            `${WAPILOT_API_URL}/${INSTANCE_ID}/send-message`,
            { chat_id: chatId, text: text },
            { headers: { "token": WAPILOT_TOKEN, "Content-Type": "application/json" }, timeout: 10000 }
        );
        return true;
    } catch (error) {
        return false;
    }
}

module.exports = async (req, res) => {
    const url = req.url || '';
    const method = req.method || 'GET';
    
    if (method === 'GET' && url === '/api/webhook') {
        return res.status(200).json({ status: 'active' });
    }

    if (method === 'GET' && (url === '/' || url === '')) {
        return res.status(200).send(`
            <!DOCTYPE html>
            <html dir="rtl">
            <head><title>بوت تصحيح الأوراق</title></head>
            <body style="font-family: Arial; text-align: center; padding: 50px; background: #1a1a2e; color: white;">
                <h1>🤖 بوت تصحيح الأوراق</h1>
                <p>🧠 Gemini: ${GEMINI_API_KEY ? '✅' : '❌'}</p>
            </body>
            </html>
        `);
    }

    if (method === 'POST' && url === '/api/webhook') {
        const data = req.body;
        let rawChatId = null, mediaUrl = null, textMessage = null;
        
        if (data.payload) {
            rawChatId = data.payload.from || data.payload.chatId;
            textMessage = data.payload.body || data.payload.text || '';
            
            if (data.payload.mediaType === 'image' && data.payload.media?.url) {
                mediaUrl = data.payload.media.url;
            }
        }
        
        if (!rawChatId) return res.status(200).json({ ok: false });
        let chatId = rawChatId.includes('@') ? rawChatId : `${rawChatId}@c.us`;
        
        if (mediaUrl) {
            await sendWAPilotMessage(chatId, "⏳ جاري تحليل الصورة...");
            
            const imageData = await imageUrlToBase64(mediaUrl);
            if (!imageData) {
                await sendWAPilotMessage(chatId, "❌ لم أتمكن من تحميل الصورة.");
                return res.status(200).json({ ok: false });
            }
            
            try {
                const analysis = await analyzeImageWithGemini(imageData.base64, imageData.mimeType);
                await sendWAPilotMessage(chatId, `🤖 *تحليل الصورة:*\n\n${analysis}`);
            } catch (error) {
                await sendWAPilotMessage(chatId, `❌ ${error.message}`);
            }
        } else if (textMessage && textMessage.trim()) {
            try {
                const reply = await chatWithGemini(textMessage);
                await sendWAPilotMessage(chatId, reply);
            } catch (error) {
                await sendWAPilotMessage(chatId, `❌ ${error.message}`);
            }
        } else {
            await sendWAPilotMessage(chatId, "📸 أرسل صورة أو اكتب سؤالك");
        }
        
        return res.status(200).json({ ok: true });
    }
    
    res.status(404).send('Not Found');
};
