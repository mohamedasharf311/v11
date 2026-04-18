// api/webhook.js
const axios = require('axios');

const INSTANCE_ID = "instance3532";
const WAPILOT_TOKEN = "yzWzEjmxZpbifuOx6lWafYT3Ng69gaFpJGAdTsVc6N";
const WAPILOT_API_URL = "https://api.wapilot.net/api/v2";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";

// --- دالة تحويل الصورة لـ Base64 ---
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

// --- دالة تحليل الصورة باستخدام Gemini ---
async function analyzeImageWithGemini(imageBase64, mimeType) {
    const requestBody = {
        contents: [{
            parts: [
                { 
                    text: `أنت مساعد ذكي ومفيد. الصورة المرفقة هي ورقة إجابة أو مستند مكتوب بالعربية.
المطلوب:
1. استخرج كل النص المكتوب في الصورة.
2. صحح الأخطاء الإملائية والنحوية الواضحة.
3. إذا كان هناك سؤال في النص، أجب عنه بإجابة نموذجية مختصرة.
4. أجب باللغة العربية الفصحى.`
                },
                { inline_data: { mime_type: mimeType, data: imageBase64 } }
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
    throw new Error('لم يتم الحصول على رد');
}

// --- دالة الرد على الرسائل النصية باستخدام Gemini ---
async function chatWithGemini(message) {
    const requestBody = {
        contents: [{
            parts: [
                { 
                    text: `أنت مساعد ذكي ومفيد اسمه "بوت تصحيح الأوراق". 
تخصصك هو مساعدة الطلاب والمعلمين في تصحيح الأوراق واستخراج النصوص من الصور.
أجب على الأسئلة باللغة العربية الفصحى بشكل مختصر ومفيد.

رسالة المستخدم: ${message}`
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
    throw new Error('لم يتم الحصول على رد');
}

// --- دالة إرسال رسالة ---
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

// --- الدالة الرئيسية ---
module.exports = async (req, res) => {
    const url = req.url || '';
    const method = req.method || 'GET';
    
    if (method === 'GET' && url === '/api/webhook') {
        return res.status(200).json({ status: 'active', gemini: !!GEMINI_API_KEY });
    }

    if (method === 'GET' && (url === '/' || url === '')) {
        return res.status(200).send(`
            <!DOCTYPE html>
            <html dir="rtl">
            <head>
                <title>بوت تصحيح الأوراق</title>
                <style>
                    body { font-family: Arial; text-align: center; padding: 50px; background: linear-gradient(135deg, #1a1a2e, #16213e); color: white; }
                    .container { background: white; border-radius: 20px; padding: 40px; max-width: 500px; margin: 0 auto; color: #333; }
                    .status { display: inline-block; padding: 8px 20px; border-radius: 50px; margin: 5px; }
                    .online { background: #10b981; color: white; }
                    code { background: #1a1a2e; color: #10b981; padding: 15px; border-radius: 8px; display: block; margin: 20px 0; direction: ltr; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>🤖 بوت تصحيح الأوراق</h1>
                    <p>Webhook URL:</p>
                    <code>${req.headers.host}/api/webhook</code>
                    <div>
                        <span class="status online">🧠 Gemini: ${GEMINI_API_KEY ? '✅ متصل' : '❌ غير متصل'}</span>
                        <span class="status online">📱 WAPilot: ✅ متصل</span>
                    </div>
                    <p style="margin-top: 20px; color: #10b981;">
                        ${GEMINI_API_KEY ? '🎉 جاهز لاستقبال الصور والرسائل النصية!' : '⚠️ تأكد من GEMINI_API_KEY'}
                    </p>
                    <p style="margin-top: 20px; color: #64748b; font-size: 0.9rem;">
                        📸 أرسل صورة لتحليلها<br>
                        💬 أو أرسل رسالة نصية للدردشة
                    </p>
                </div>
            </body>
            </html>
        `);
    }

    if (method === 'POST' && url === '/api/webhook') {
        const data = req.body;
        let rawChatId = null, mediaUrl = null, textMessage = null;
        
        if (data.payload) {
            rawChatId = data.payload.from || data.payload.chatId;
            
            // استخراج النص
            textMessage = data.payload.body || data.payload.text || '';
            
            // استخراج الصورة
            if (data.payload.mediaType === 'image' && data.payload.media?.url) {
                mediaUrl = data.payload.media.url;
            }
        }
        
        if (!rawChatId) return res.status(200).json({ ok: false });
        let chatId = rawChatId.includes('@') ? rawChatId : `${rawChatId}@c.us`;
        
        console.log(`📱 From: ${chatId} | Image: ${!!mediaUrl} | Text: ${textMessage?.substring(0, 30) || '(empty)'}`);
        
        // لو مفيش Gemini API Key
        if (!GEMINI_API_KEY) {
            await sendWAPilotMessage(chatId, "❌ GEMINI_API_KEY غير موجود. تأكد من إضافته في Vercel.");
            return res.status(200).json({ ok: false });
        }
        
        // --- معالجة الصورة ---
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
        
        // --- معالجة الرسالة النصية ---
        else if (textMessage && textMessage.trim()) {
            await sendWAPilotMessage(chatId, "💬 *Gemini يفكر...*");
            
            try {
                const reply = await chatWithGemini(textMessage);
                await sendWAPilotMessage(chatId, reply);
            } catch (error) {
                // لو فشل Gemini، نرد برد افتراضي
                const defaultReplies = {
                    'اهلا': 'أهلاً بك! أنا بوت تصحيح الأوراق. أرسل صورة ورقة إجابة لتحليلها، أو اسألني أي سؤال.',
                    'مرحبا': 'مرحباً! كيف يمكنني مساعدتك اليوم؟',
                    'السلام عليكم': 'وعليكم السلام ورحمة الله وبركاته!',
                    'شكرا': 'العفو! سعيد بمساعدتك 🤖',
                    'تمام': 'الحمد لله! أرسل صورة ورقة إجابة وأنا أحللها لك.',
                };
                
                let reply = defaultReplies[textMessage.toLowerCase()] || 
                    "أهلاً بك! أنا بوت تصحيح الأوراق. 📝\n\nيمكنني:\n✅ تحليل صور أوراق الإجابة\n✅ استخراج النص من الصور\n✅ تصحيح الأخطاء الإملائية\n✅ الإجابة عن الأسئلة\n\nأرسل صورة أو اسألني سؤالاً!";
                
                await sendWAPilotMessage(chatId, reply);
            }
        }
        
        // --- مفيش رسالة ---
        else {
            await sendWAPilotMessage(chatId, "📸 أرسل صورة ورقة الإجابة أو اكتب سؤالك.");
        }
        
        return res.status(200).json({ ok: true });
    }
    
    res.status(404).send('Not Found');
};
