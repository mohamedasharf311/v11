// api/webhook.js
const axios = require('axios');

const INSTANCE_ID = "instance3532";
const WAPILOT_TOKEN = "yzWzEjmxZpbifuOx6lWafYT3Ng69gaFpJGAdTsVc6N";
const WAPILOT_API_URL = "https://api.wapilot.net/api/v2";

const OCR_SPACE_API_KEY = '72d9a2c76e88957'; // مفتاحك المجاني

async function extractTextFromImage(imageUrl) {
    console.log('👁️ Starting OCR.Space...');
    
    try {
        // نجرب كل صيغ اللغة الممكنة
        const languages = ['ara', 'Arabic', 'ar', ''];
        
        for (const lang of languages) {
            try {
                console.log(`🔄 Trying language: ${lang || 'auto'}`);
                
                const formData = new URLSearchParams();
                formData.append('apikey', OCR_SPACE_API_KEY);
                formData.append('url', imageUrl);
                if (lang) formData.append('language', lang);
                formData.append('isOverlayRequired', 'false');
                formData.append('detectOrientation', 'true');
                formData.append('scale', 'true');
                formData.append('OCREngine', '2');
                formData.append('filetype', 'jpg');
                
                const response = await axios.post('https://api.ocr.space/parse/image', formData, {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    timeout: 30000
                });
                
                const data = response.data;
                
                if (!data.IsErroredOnProcessing && data.ParsedResults?.[0]?.ParsedText) {
                    const text = data.ParsedResults[0].ParsedText.trim();
                    if (text.length > 5 && !text.includes("E201")) {
                        console.log(`✅ Success with language: ${lang || 'auto'}`);
                        console.log('📝 Text length:', text.length);
                        return text;
                    }
                }
            } catch (e) {
                console.log(`❌ Failed with ${lang}:`, e.message);
            }
        }
        
        return "عذراً، لم يتم التعرف على نص في الصورة.";
        
    } catch (error) {
        console.error('❌ OCR Error:', error.message);
        return "خطأ في استخراج النص.";
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
        return res.status(200).json({ status: 'active' });
    }

    if (method === 'GET' && (url === '/' || url === '')) {
        return res.status(200).send(`
            <!DOCTYPE html>
            <html dir="rtl">
            <head><title>بوت تصحيح الأوراق</title></head>
            <body style="font-family: Arial; text-align: center; padding: 50px; background: #1a1a2e; color: white;">
                <h1>🤖 بوت تصحيح الأوراق</h1>
                <p>👁️ OCR: OCR.Space</p>
                <p>📱 WAPilot: ✅ متصل</p>
            </body>
            </html>
        `);
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
        
        console.log(`📱 From: ${chatId} | Image: ${!!mediaUrl}`);
        
        if (mediaUrl) {
            await sendWAPilotMessage(chatId, "⏳ جاري استخراج النص من الصورة...");
            
            const extractedText = await extractTextFromImage(mediaUrl);
            
            console.log('📝 Extracted:', extractedText.substring(0, 100));
            
            await sendWAPilotMessage(chatId, `📝 *النص المستخرج:*\n\n${extractedText}`);
        } else {
            await sendWAPilotMessage(chatId, "📸 أرسل صورة ورقة الإجابة");
        }
        
        return res.status(200).json({ ok: true });
    }
    
    res.status(404).send('Not Found');
};
