// api/webhook.js
const axios = require('axios');
const { GoogleGenerativeAI } = require("@google/generative-ai");

// --- إعدادات WAPILOT V2 ---
const INSTANCE_ID = "instance3532";
const WAPILOT_TOKEN = "yzWzEjmxZpbifuOx6lWafYT3Ng69gaFpJGAdTsVc6N";
const WAPILOT_API_URL = "https://api.wapilot.net/api/v2";

// --- إعدادات Google Gemini ---
const GEMINI_API_KEY = process.env.Gemini_API_Key || process.env.GEMINI_API_KEY || '';

// --- تهيئة Gemini ---
let genAI;
let model;
let geminiInitialized = false;

if (GEMINI_API_KEY) {
    try {
        genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        geminiInitialized = true;
        console.log('✅ Gemini Ready');
    } catch (error) {
        console.error('❌ Gemini Error:', error.message);
    }
}

// --- دالة تحميل الصورة وتحويلها لـ Base64 ---
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
            gemini: geminiInitialized ? 'ready' : 'no'
        });
    }

    if (method === 'GET' && (url === '/' || url === '')) {
        return res.status(200).send(`
            <!DOCTYPE html>
            <html dir="rtl">
            <head><title>بوت تصحيح الأوراق</title></head>
            <body style="font-family: Arial; text-align: center; padding: 50px; background: #1a1a2e; color: white;">
                <h1>🤖 بوت تصحيح الأوراق</h1>
                <p>✅ النظام شغال 100%</p>
                <p>🧠 Gemini Vision: ${geminiInitialized ? '✅' : '❌'} | 📱 WAPilot: ✅</p>
                <p style="color: #10b981;">🎉 مجاني بالكامل - Gemini يقرا الصور مباشرة!</p>
            </body>
            </html>
        `);
    }

    if (method === 'POST' && url === '/api/webhook') {
        const data = req.body;
        
        let rawChatId = null;
        let mediaUrl = null;
        
        if (data.payload) {
            rawChatId = data.payload.from || data.payload.chatId;
            if (data.payload.media?.url && data.payload.mediaType === 'image') {
                mediaUrl = data.payload.media.url;
            }
        }
        
        if (!rawChatId) return res.status(200).json({ ok: false });
        
        let chatId = rawChatId.includes('@') ? rawChatId : `${rawChatId}@c.us`;
        
        if (mediaUrl && model) {
            await sendWAPilotMessage(chatId, "⏳ جاري تحليل الصورة باستخدام Gemini Vision...");
            
            try {
                // تحويل الصورة لـ Base64
                const imageData = await imageUrlToBase64(mediaUrl);
                
                if (!imageData) {
                    await sendWAPilotMessage(chatId, "❌ لم أتمكن من تحميل الصورة.");
                    return res.status(200).json({ ok: false });
                }
                
                // إرسال الصورة لـ Gemini Vision
                const prompt = `أنت مصحح آلي للمناهج الدراسية العربية. 
الصورة المرفقة هي ورقة إجابة طالب مكتوبة بخط اليد باللغة العربية.

المطلوب:
1. استخرج كل النص المكتوب في الصورة (حتى لو كان بخط يد غير واضح).
2. صحح الأخطاء الإملائية والنحوية في النص المستخرج.
3. إذا كان هناك سؤال في النص، أجب عنه بإجابة نموذجية مختصرة.
4. أجب باللغة العربية الفصحى.`;

                const imagePart = {
                    inlineData: {
                        data: imageData.base64,
                        mimeType: imageData.mimeType
                    }
                };
                
                const result = await model.generateContent([prompt, imagePart]);
                const response = result.response.text();
                
                await sendWAPilotMessage(chatId, `🤖 *تحليل Gemini للصورة:*\n\n${response}`);
                
            } catch (error) {
                console.error('❌ Gemini Vision Error:', error.message);
                await sendWAPilotMessage(chatId, "❌ خطأ في تحليل الصورة. حاول مرة أخرى.");
            }
            
        } else if (mediaUrl && !model) {
            await sendWAPilotMessage(chatId, "❌ Gemini غير مهيأ. تأكد من API Key.");
        } else {
            await sendWAPilotMessage(chatId, "📸 *مرحباً بك في بوت تصحيح الأوراق!*\n\nمن فضلك أرسل صورة واضحة لورقة الإجابة.\n\nسأقوم بتحليل الصورة مباشرة باستخدام Gemini Vision 🧠");
        }
        
        return res.status(200).json({ ok: true });
    }
    
    res.status(404).send('Not Found');
};
