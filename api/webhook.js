// api/webhook.js
const axios = require('axios');

const INSTANCE_ID = "instance3532";
const WAPILOT_TOKEN = "yzWzEjmxZpbifuOx6lWafYT3Ng69gaFpJGAdTsVc6N";
const WAPILOT_API_URL = "https://api.wapilot.net/api/v2";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
// ✅ Gemini 2.0 Flash - بيدعم الصور
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent";

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

async function analyzeImageWithGemini(imageBase64, mimeType) {
    try {
        const requestBody = {
            contents: [{
                parts: [
                    { 
                        text: `أنت مصحح آلي للمناهج الدراسية العربية. الصورة المرفقة هي ورقة إجابة طالب مكتوبة بخط اليد باللغة العربية.

المطلوب:
1. استخرج كل النص المكتوب في الصورة.
2. صحح الأخطاء الإملائية والنحوية الواضحة.
3. إذا كان هناك سؤال في النص، أجب عنه بإجابة نموذجية مختصرة.
4. أجب باللغة العربية الفصحى.`
                    },
                    { 
                        inline_data: { 
                            mime_type: mimeType, 
                            data: imageBase64 
                        } 
                    }
                ]
            }]
        };
        
        const response = await axios.post(
            `${GEMINI_API_URL}?key=${GEMINI_API_KEY}`,
            requestBody,
            { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }
        );
        
        const result = response.data;
        if (result.candidates?.[0]?.content?.parts?.[0]?.text) {
            return result.candidates[0].content.parts[0].text;
        }
        return "لم يتم الحصول على رد.";
    } catch (error) {
        throw new Error('فشل تحليل الصورة: ' + (error.response?.data?.error?.message || error.message));
    }
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
        return res.status(200).json({ status: 'active', model: 'gemini-2.0-flash-exp' });
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
                await sendWAPilotMessage(chatId, `🤖 *تحليل Gemini 2.0:*\n\n${analysis}`);
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
