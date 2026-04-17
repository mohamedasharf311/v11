// api/webhook.js
const axios = require('axios');
const { VertexAI } = require('@google-cloud/vertexai');

const INSTANCE_ID = "instance3532";
const WAPILOT_TOKEN = "yzWzEjmxZpbifuOx6lWafYT3Ng69gaFpJGAdTsVc6N";
const WAPILOT_API_URL = "https://api.wapilot.net/api/v2";

const PROJECT_ID = '1088721799548';
const LOCATION = 'us-central1';

let model = null;

// تهيئة Vertex AI باستخدام Service Account
if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    try {
        const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS);
        
        const vertexAI = new VertexAI({
            project: PROJECT_ID,
            location: LOCATION,
            googleAuthOptions: { credentials }
        });
        
        model = vertexAI.preview.getGenerativeModel({ model: 'gemini-1.5-pro' });
        console.log('✅ Vertex AI Ready with Service Account');
    } catch (error) {
        console.error('❌ Vertex AI Init Error:', error.message);
    }
}

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
        return res.status(200).json({ status: 'active', vertex: !!model });
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
        
        if (mediaUrl && model) {
            await sendWAPilotMessage(chatId, "⏳ جاري تحليل الصورة...");
            
            const imageData = await imageUrlToBase64(mediaUrl);
            if (!imageData) {
                await sendWAPilotMessage(chatId, "❌ لم أتمكن من تحميل الصورة.");
                return res.status(200).json({ ok: false });
            }
            
            try {
                const request = {
                    contents: [{
                        role: 'user',
                        parts: [
                            { text: 'استخرج النص العربي من الصورة، صحح الأخطاء، وأجب عن أي سؤال. أجب بالعربية.' },
                            { inlineData: { mimeType: imageData.mimeType, data: imageData.base64 } }
                        ]
                    }]
                };
                
                const result = await model.generateContent(request);
                const response = result.response.candidates[0].content.parts[0].text;
                
                await sendWAPilotMessage(chatId, `🤖 *تحليل Vertex AI:*\n\n${response}`);
            } catch (error) {
                await sendWAPilotMessage(chatId, `❌ خطأ: ${error.message}`);
            }
        } else {
            await sendWAPilotMessage(chatId, "📸 أرسل صورة ورقة الإجابة");
        }
        
        return res.status(200).json({ ok: true });
    }
    
    res.status(404).send('Not Found');
};
