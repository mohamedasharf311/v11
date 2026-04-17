// api/webhook.js
const axios = require('axios');
const Tesseract = require('tesseract.js');

const INSTANCE_ID = "instance3532";
const WAPILOT_TOKEN = "yzWzEjmxZpbifuOx6lWafYT3Ng69gaFpJGAdTsVc6N";
const WAPILOT_API_URL = "https://api.wapilot.net/api/v2";

async function extractTextFromImage(imageUrl) {
    console.log('👁️ Starting Tesseract OCR...');
    
    try {
        const result = await Tesseract.recognize(
            imageUrl,
            'ara+eng', // Arabic + English
            {
                logger: m => {
                    if (m.status === 'recognizing text') {
                        console.log(`📝 OCR: ${Math.round(m.progress * 100)}%`);
                    }
                }
            }
        );
        
        const text = result.data.text.trim();
        console.log('✅ OCR completed:', text.length, 'chars');
        return text || "عذراً، لم يتم التعرف على نص.";
        
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
        
        if (mediaUrl) {
            await sendWAPilotMessage(chatId, "⏳ جاري استخراج النص من الصورة...");
            
            const extractedText = await extractTextFromImage(mediaUrl);
            
            let response = `📝 *النص المستخرج:*\n${extractedText}`;
            
            if (extractedText.length > 5 && !extractedText.includes("عذراً")) {
                response += `\n\n━━━━━━━━━━━━━━━\n\n✅ تم استخراج النص بنجاح!`;
            }
            
            await sendWAPilotMessage(chatId, response);
        } else {
            await sendWAPilotMessage(chatId, "📸 أرسل صورة ورقة الإجابة");
        }
        
        return res.status(200).json({ ok: true });
    }
    
    res.status(404).send('Not Found');
};
