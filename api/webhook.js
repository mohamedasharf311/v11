// api/webhook.js
const axios = require('axios');

// --- إعدادات WAPILOT V2 ---
const INSTANCE_ID = "instance3532";
const WAPILOT_TOKEN = "yzWzEjmxZpbifuOx6lWafYT3Ng69gaFpJGAdTsVc6N";
const WAPILOT_API_URL = "https://api.wapilot.net/api/v2";

// --- إعدادات Vertex AI ---
const VERTEX_API_KEY = process.env.GEMINI_API_KEY || '';
const PROJECT_ID = '1088721799548'; // من بياناتك
const LOCATION = 'us-central1';
const VERTEX_API_URL = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/gemini-1.5-pro:generateContent`;

// --- دالة تحميل الصورة ---
async function imageUrlToBase64(url) {
    try {
        const response = await axios.get(url, { 
            responseType: 'arraybuffer',
            timeout: 15000
        });
        
        const base64 = Buffer.from(response.data).toString('base64');
        const mimeType = response.headers['content-type'] || 'image/jpeg';
        
        return { base64, mimeType };
    } catch (error) {
        console.error('❌ Error converting image:', error.message);
        return null;
    }
}

// --- دالة تحليل الصورة باستخدام Vertex AI ---
async function analyzeImageWithVertexAI(imageBase64, mimeType) {
    try {
        const requestBody = {
            contents: [
                {
                    role: "user",
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
                }
            ]
        };
        
        const response = await axios.post(
            VERTEX_API_URL,
            requestBody,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${VERTEX_API_KEY}`
                },
                timeout: 30000
            }
        );
        
        const result = response.data;
        if (result.candidates && result.candidates[0] && result.candidates[0].content) {
            return result.candidates[0].content.parts[0].text;
        } else {
            return "لم يتم الحصول على رد من Vertex AI.";
        }
        
    } catch (error) {
        console.error('❌ Vertex AI Error:', error.response?.data || error.message);
        throw new Error('فشل تحليل الصورة: ' + (error.response?.data?.error?.message || error.message));
    }
}

// --- دالة إرسال رسالة ---
async function sendWAPilotMessage(chatId, text) {
    try {
        await axios.post(
            `${WAPILOT_API_URL}/${INSTANCE_ID}/send-message`,
            { chat_id: chatId, text: text },
            { 
                headers: { 
                    "token": WAPILOT_TOKEN, 
                    "Content-Type": "application/json" 
                },
                timeout: 10000
            }
        );
        console.log('✅ Message sent');
        return true;
    } catch (error) {
        console.error('❌ Send Error:', error.message);
        return false;
    }
}

// --- الدالة الرئيسية ---
module.exports = async (req, res) => {
    
    const url = req.url || '';
    const method = req.method || 'GET';
    
    if (method === 'GET' && url === '/api/webhook') {
        return res.status(200).json({ 
            status: 'active',
            vertex_key: VERTEX_API_KEY ? 'present' : 'missing'
        });
    }

    if (method === 'GET' && (url === '/' || url === '')) {
        return res.status(200).send(`
            <!DOCTYPE html>
            <html dir="rtl">
            <head><title>بوت تصحيح الأوراق</title></head>
            <body style="font-family: Arial; text-align: center; padding: 50px; background: #1a1a2e; color: white;">
                <h1>🤖 بوت تصحيح الأوراق</h1>
                <p>🧠 Vertex AI: ${VERTEX_API_KEY ? '✅ جاهز' : '❌ غير مهيأ'}</p>
                <p>📱 WAPilot: ✅ متصل</p>
            </body>
            </html>
        `);
    }

    if (method === 'POST' && url === '/api/webhook') {
        const data = req.body;
        
        let rawChatId = null;
        let mediaUrl = null;
        let isImage = false;
        
        if (data.payload) {
            rawChatId = data.payload.from || data.payload.chatId;
            isImage = data.payload.mediaType === 'image';
            
            if (data.payload.media?.url) {
                mediaUrl = data.payload.media.url;
            }
        }
        
        if (!rawChatId) {
            return res.status(200).json({ ok: false });
        }
        
        let chatId = rawChatId.includes('@') ? rawChatId : `${rawChatId}@c.us`;
        
        if (isImage && mediaUrl && VERTEX_API_KEY) {
            await sendWAPilotMessage(chatId, "⏳ جاري تحليل الصورة باستخدام Vertex AI...");
            
            try {
                const imageData = await imageUrlToBase64(mediaUrl);
                
                if (!imageData) {
                    await sendWAPilotMessage(chatId, "❌ لم أتمكن من تحميل الصورة.");
                    return res.status(200).json({ ok: false });
                }
                
                const analysis = await analyzeImageWithVertexAI(imageData.base64, imageData.mimeType);
                
                await sendWAPilotMessage(chatId, `🤖 *تحليل Vertex AI:*\n\n${analysis}`);
                
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
