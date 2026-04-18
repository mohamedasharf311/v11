// api/webhook.js
const axios = require('axios');

const INSTANCE_ID = "instance3532";
const WAPILOT_TOKEN = "yzWzEjmxZpbifuOx6lWafYT3Ng69gaFpJGAdTsVc6N";
const WAPILOT_API_URL = "https://api.wapilot.net/api/v2";

// نموذج عربي مجاني من Hugging Face
const HF_MODEL = "https://api-inference.huggingface.co/models/microsoft/DialoGPT-medium";

async function chatWithAI(message) {
    console.log('🔄 Using Hugging Face...');
    
    try {
        const response = await axios.post(
            HF_MODEL,
            {
                inputs: {
                    text: message
                }
            },
            {
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 15000
            }
        );
        
        if (response.data?.generated_text) {
            return response.data.generated_text;
        }
        
        throw new Error('لم يتم الحصول على رد');
        
    } catch (error) {
        console.error('❌ HF Error:', error.message);
        throw error;
    }
}

// ردود احتياطية لو الخدمة مش شغالة
function getFallbackReply(message) {
    const msg = message.toLowerCase().trim();
    
    const replies = {
        'اهلا': 'أهلاً بك! أنا بوت تصحيح الأوراق. 📝 كيف يمكنني مساعدتك؟',
        'مرحبا': 'مرحباً! أنا جاهز لمساعدتك في تصحيح الأوراق واستخراج النصوص.',
        'السلام عليكم': 'وعليكم السلام ورحمة الله وبركاته!',
        'كيف حالك': 'الحمد لله، شكراً لسؤالك! وأنت؟',
        'بخير': 'الحمد لله! أرسل صورة ورقة إجابة وأنا أحللها لك.',
        'شكرا': 'العفو! سعيد بمساعدتك 🤖',
        'تمام': 'تمام! أرسل صورة ورقة إجابة وأنا أستخرج النص منها.',
        'انت مين': 'أنا بوت تصحيح الأوراق. أقوم باستخراج النص من الصور وتصحيح الأخطاء الإملائية.',
        'بتعرف تعمل اي': 'أعرف:\n✅ استخراج النص من الصور\n✅ تصحيح الأخطاء الإملائية\n✅ الإجابة عن الأسئلة\n\nأرسل صورة ورقة إجابة!',
        'ساعدني': 'بكل سرور! أرسل صورة ورقة الإجابة وسأقوم بتحليلها لك.',
    };
    
    // بحث عن كلمة مفتاحية
    for (const [key, value] of Object.entries(replies)) {
        if (msg.includes(key)) {
            return value;
        }
    }
    
    // لو مفيش تطابق
    return `👋 أهلاً بك! أنا بوت تصحيح الأوراق.

📸 أرسل صورة ورقة إجابة لتحليلها واستخراج النص منها.

❓ أو اسألني سؤالاً محدداً.

✨ يمكنني:
- استخراج النص من الصور
- تصحيح الأخطاء الإملائية
- الإجابة عن الأسئلة`;
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
            <head>
                <title>بوت تصحيح الأوراق</title>
                <style>
                    body { font-family: Arial; text-align: center; padding: 50px; background: #1a1a2e; color: white; }
                    .online { color: #10b981; }
                </style>
            </head>
            <body>
                <h1>🤖 بوت تصحيح الأوراق</h1>
                <p class="online">✅ البوت شغال وجاهز للرد!</p>
                <p>📱 WAPilot: ✅ متصل</p>
                <p>💬 الردود: نظام ردود ذكية + احتياطية</p>
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
        
        if (textMessage && textMessage.trim()) {
            try {
                // نحاول نستخدم Hugging Face
                const reply = await chatWithAI(textMessage);
                await sendWAPilotMessage(chatId, reply);
            } catch (error) {
                // لو فشل، نستخدم الردود الاحتياطية
                const fallback = getFallbackReply(textMessage);
                await sendWAPilotMessage(chatId, fallback);
            }
        } else {
            await sendWAPilotMessage(chatId, "👋 أهلاً! اكتب رسالة وسأرد عليك.");
        }
        
        return res.status(200).json({ ok: true });
    }
    
    res.status(404).send('Not Found');
};
