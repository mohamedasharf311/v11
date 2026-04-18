// api/webhook.js
const axios = require('axios');

const INSTANCE_ID = "instance3532";
const WAPILOT_TOKEN = "yzWzEjmxZpbifuOx6lWafYT3Ng69gaFpJGAdTsVc6N";
const WAPILOT_API_URL = "https://api.wapilot.net/api/v2";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

// قائمة النماذج اللي ممكن تشتغل مع API Key
const MODELS = [
    "gemini-1.5-flash",
    "gemini-pro",
    "gemini-1.0-pro",
    "chat-bison-001"
];

async function chatWithGemini(message) {
    // نجرب كل النماذج
    for (const model of MODELS) {
        try {
            console.log(`🔄 Trying model: ${model}`);
            
            const response = await axios.post(
                `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
                {
                    contents: [{
                        parts: [{ text: message }]
                    }]
                },
                {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 15000
                }
            );
            
            const result = response.data;
            if (result.candidates?.[0]?.content?.parts?.[0]?.text) {
                console.log(`✅ Success with ${model}`);
                return result.candidates[0].content.parts[0].text;
            }
        } catch (error) {
            console.log(`❌ ${model} failed:`, error.response?.data?.error?.message || error.message);
        }
    }
    
    throw new Error('كل النماذج فشلت');
}

async function sendWAPilotMessage(chatId, text) {
    try {
        await axios.post(
            `${WAPILOT_API_URL}/${INSTANCE_ID}/send-message`,
            { chat_id: chatId, text: text },
            { headers: { "token": WAPILOT_TOKEN, "Content-Type": "application/json" }, timeout: 10000 }
        );
        console.log('✅ Message sent');
        return true;
    } catch (error) {
        console.error('❌ Send Error:', error.message);
        return false;
    }
}

module.exports = async (req, res) => {
    const url = req.url || '';
    const method = req.method || 'GET';
    
    if (method === 'GET' && url === '/api/webhook') {
        return res.status(200).json({ status: 'active', keyExists: !!GEMINI_API_KEY });
    }

    if (method === 'GET' && (url === '/' || url === '')) {
        return res.status(200).send(`
            <!DOCTYPE html>
            <html dir="rtl">
            <head>
                <title>بوت المحادثة</title>
                <style>
                    body { font-family: Arial; text-align: center; padding: 50px; background: #1a1a2e; color: white; }
                    .online { color: #10b981; }
                    .offline { color: #ef4444; }
                </style>
            </head>
            <body>
                <h1>🤖 بوت المحادثة</h1>
                <p>🧠 Gemini API: ${GEMINI_API_KEY ? '✅ المفتاح موجود' : '❌ المفتاح مفقود'}</p>
                <p>📱 WAPilot: ✅ متصل</p>
            </body>
            </html>
        `);
    }

    if (method === 'POST' && url === '/api/webhook') {
        const data = req.body;
        let rawChatId = null, textMessage = null;
        
        if (data.payload) {
            rawChatId = data.payload.from || data.payload.chatId;
            textMessage = data.payload.body || data.payload.text || '';
        }
        
        if (!rawChatId) return res.status(200).json({ ok: false });
        let chatId = rawChatId.includes('@') ? rawChatId : `${rawChatId}@c.us`;
        
        console.log(`📱 From: ${chatId} | Message: "${textMessage}"`);
        
        if (!GEMINI_API_KEY) {
            await sendWAPilotMessage(chatId, "❌ GEMINI_API_KEY غير موجود في Vercel.");
            return res.status(200).json({ ok: false });
        }
        
        if (textMessage && textMessage.trim()) {
            try {
                const reply = await chatWithGemini(textMessage);
                await sendWAPilotMessage(chatId, reply);
            } catch (error) {
                console.error('❌ All models failed:', error.message);
                await sendWAPilotMessage(chatId, "❌ عذراً، خدمة الذكاء الاصطناعي غير متاحة حالياً. حاول لاحقاً.");
            }
        } else {
            await sendWAPilotMessage(chatId, "👋 أهلاً! اكتب رسالة وسأرد عليك.");
        }
        
        return res.status(200).json({ ok: true });
    }
    
    res.status(404).send('Not Found');
};
