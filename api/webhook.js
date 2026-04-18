// api/webhook.js
const axios = require('axios');

const INSTANCE_ID = "instance3532";
const WAPILOT_TOKEN = "yzWzEjmxZpbifuOx6lWafYT3Ng69gaFpJGAdTsVc6N";
const WAPILOT_API_URL = "https://api.wapilot.net/api/v2";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";

async function imageUrlToBase64(url) {
    try {
        const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
        const base64 = Buffer.from(response.data).toString('base64');
        const mimeType = response.headers['content-type'] || 'image/jpeg';
        return { base64, mimeType };
    } catch (error) {
        console.error('❌ Image fetch error:', error.message);
        return null;
    }
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
    
    console.log('🖼️ Sending image to Gemini...');
    
    const response = await axios.post(
        `${GEMINI_API_URL}?key=${GEMINI_API_KEY}`,
        requestBody,
        { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }
    );
    
    const result = response.data;
    if (result.candidates?.[0]?.content?.parts?.[0]?.text) {
        return result.candidates[0].content.parts[0].text;
    }
    throw new Error('لم يتم الحصول على رد');
}

async function chatWithGemini(message) {
    const requestBody = {
        contents: [{
            parts: [{ text: message }]
        }]
    };
    
    console.log('💬 Sending text to Gemini:', message.substring(0, 50));
    
    try {
        const response = await axios.post(
            `${GEMINI_API_URL}?key=${GEMINI_API_KEY}`,
            requestBody,
            { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
        );
        
        console.log('📦 Gemini response status:', response.status);
        
        const result = response.data;
        if (result.candidates?.[0]?.content?.parts?.[0]?.text) {
            return result.candidates[0].content.parts[0].text;
        }
        
        console.error('❌ Unexpected response structure:', JSON.stringify(result).substring(0, 200));
        throw new Error('هيكل الرد غير متوقع');
        
    } catch (error) {
        console.error('❌ Gemini API Error:', error.response?.data || error.message);
        throw error;
    }
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
        return res.status(200).json({ 
            status: 'active', 
            gemini: !!GEMINI_API_KEY,
            keyLength: GEMINI_API_KEY.length
        });
    }

    if (method === 'GET' && (url === '/' || url === '')) {
        return res.status(200).send(`
            <!DOCTYPE html>
            <html dir="rtl">
            <head><title>بوت تصحيح الأوراق</title></head>
            <body style="font-family: Arial; text-align: center; padding: 50px; background: #1a1a2e; color: white;">
                <h1>🤖 بوت تصحيح الأوراق</h1>
                <p>🧠 Gemini: ${GEMINI_API_KEY ? '✅ المفتاح موجود' : '❌ المفتاح مفقود'}</p>
                <p>📱 WAPilot: ✅ متصل</p>
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
        
        console.log(`📱 From: ${chatId} | Image: ${!!mediaUrl} | Text: "${textMessage}"`);
        
        if (!GEMINI_API_KEY) {
            await sendWAPilotMessage(chatId, "❌ GEMINI_API_KEY غير موجود.");
            return res.status(200).json({ ok: false });
        }
        
        // معالجة الصورة
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
                await sendWAPilotMessage(chatId, `❌ خطأ في تحليل الصورة: ${error.message}`);
            }
        }
        
        // معالجة النص
        else if (textMessage && textMessage.trim()) {
            try {
                const reply = await chatWithGemini(textMessage);
                await sendWAPilotMessage(chatId, reply);
            } catch (error) {
                // رد افتراضي لو Gemini فشل
                const reply = `👋 أهلاً بك! أنا بوت تصحيح الأوراق.

📸 أرسل صورة ورقة إجابة لتحليلها واستخراج النص منها.

❓ أو اسألني سؤالاً وسأحاول مساعدتك.

⚠️ ملاحظة: Gemini API غير متاح حالياً، جاري العمل على إصلاح المشكلة.`;
                
                await sendWAPilotMessage(chatId, reply);
            }
        }
        
        // مفيش رسالة
        else {
            await sendWAPilotMessage(chatId, "📸 أرسل صورة ورقة الإجابة أو اكتب سؤالك.");
        }
        
        return res.status(200).json({ ok: true });
    }
    
    res.status(404).send('Not Found');
};
