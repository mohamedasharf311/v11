// api/webhook.js
const axios = require('axios');

const INSTANCE_ID = "instance3532";
const WAPILOT_TOKEN = "yzWzEjmxZpbifuOx6lWafYT3Ng69gaFpJGAdTsVc6N";
const WAPILOT_API_URL = "https://api.wapilot.net/api/v2";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

// قائمة النماذج اللي ممكن تشتغل
const MODELS = [
    "gemini-pro-vision",
    "gemini-1.0-pro-vision",
    "gemini-1.5-flash"
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

async function tryModel(modelName, imageBase64, mimeType) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`;
    
    const requestBody = {
        contents: [{
            parts: [
                { text: "استخرج النص العربي من الصورة، صحح الأخطاء، وأجب عن أي سؤال. أجب بالعربية." },
                { inline_data: { mime_type: mimeType, data: imageBase64 } }
            ]
        }]
    };
    
    const response = await axios.post(url, requestBody, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
    });
    
    return response.data;
}

async function analyzeImageWithGemini(imageBase64, mimeType) {
    let lastError = null;
    
    for (const modelName of MODELS) {
        try {
            console.log(`🔄 Trying model: ${modelName}`);
            const result = await tryModel(modelName, imageBase64, mimeType);
            
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
    
    if (method === 'GET') {
        return res.status(200).json({ status: 'active' });
    }

    if (method === 'POST' && url === '/api/webhook') {
        const data = req.body;
        let rawChatId = null, mediaUrl = null;
        
        if (data.payload) {
            rawChatId = data.payload.from || data.payload.chatId;
            if (data.payload.mediaType === 'image' && data.payload.media?.url) {
                mediaUrl = data.payload.media.url;
            }
        }
        
        if (!rawChatId) return res.status(200).json({ ok: false });
        let chatId = rawChatId.includes('@') ? rawChatId : `${rawChatId}@c.us`;
        
        if (mediaUrl && GEMINI_API_KEY) {
            await sendWAPilotMessage(chatId, "⏳ جاري تحليل الصورة...");
            
            const imageData = await imageUrlToBase64(mediaUrl);
            if (!imageData) {
                await sendWAPilotMessage(chatId, "❌ لم أتمكن من تحميل الصورة.");
                return res.status(200).json({ ok: false });
            }
            
            try {
                const analysis = await analyzeImageWithGemini(imageData.base64, imageData.mimeType);
                await sendWAPilotMessage(chatId, `🤖 *تحليل Gemini:*\n\n${analysis}`);
            } catch (error) {
                await sendWAPilotMessage(chatId, `❌ ${error.message}`);
            }
        } else {
            await sendWAPilotMessage(chatId, "📸 أرسل صورة ورقة الإجابة");
        }
        
        return res.status(200).json({ ok: true });
    }
    
    res.status(404).send('Not Found');
};
