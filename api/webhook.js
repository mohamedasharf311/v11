// api/webhook.js
const axios = require('axios');

const INSTANCE_ID = "instance3532";
const WAPILOT_TOKEN = "yzWzEjmxZpbifuOx6lWafYT3Ng69gaFpJGAdTsVc6N";
const WAPILOT_API_URL = "https://api.wapilot.net/api/v2";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

// ثبت موديل واحد بس
const MODEL = 'google/gemini-2.0-flash-001';

// نظام الـ Prompt الجديد
const TEACHER_SYSTEM_PROMPT = `أنت مدرس صبور لطلاب المرحلة الإعدادية.

قواعدك:
1. لا تعطي الإجابة النهائية مباشرة.
2. اسأل الطالب سؤال بسيط يقوده للحل.
3. لو الطالب أجاب بشكل صحيح → كمل للخطوة التالية.
4. لو أخطأ → قوله "فكر تاني" أو "خلينا نعد صح" - متقلش ممتاز.
5. لو قال "مش عارف" → أعطه hint بسيط.
6. بعد محاولتين فاشلتين → اشرح الحل خطوة خطوة.

أسلوبك:
- بسيط جدًا
- باللهجة المصرية
- تشجع الطالب

ابدأ دايماً بـ: "يلا بينا يا بطل 👊"`;

// تنظيف الرد - بس من الحاجات الغريبة، منغير ما نمسح الرد الأصلي
function cleanResponse(text) {
    // لو فيه كود برمجي
    if (text.includes('```javascript') || text.includes('const ') && text.includes('function')) {
        return "خلينا نركز على الشرح يا بطل 😊 قوللي فهمت الجزء اللي قلته؟";
    }
    
    // لو الرد فاضي
    if (!text || text.trim().length < 5) {
        return null;
    }
    
    // غير كده نرجع الرد الأصلي
    return text;
}

async function chatWithAI(message, conversationHistory = []) {
    try {
        console.log(`🔄 Using model: ${MODEL}`);
        
        const messages = [
            {
                role: "system",
                content: TEACHER_SYSTEM_PROMPT
            },
            ...conversationHistory,
            {
                role: "user",
                content: message
            }
        ];
        
        const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: MODEL,
                messages: messages,
                temperature: 0.7,
                max_tokens: 600
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                    'HTTP-Referer': 'https://school-gamma-ten.vercel.app',
                    'X-Title': 'WhatsApp Teacher Bot'
                },
                timeout: 20000
            }
        );
        
        if (response.data?.choices?.[0]?.message?.content) {
            let reply = response.data.choices[0].message.content;
            console.log(`📝 Original AI reply: ${reply.substring(0, 100)}...`);
            
            const cleaned = cleanResponse(reply);
            if (cleaned) {
                console.log(`✅ Using cleaned reply`);
                return cleaned;
            } else {
                console.log(`⚠️ Clean returned null, using original`);
                return reply;
            }
        }
        
    } catch (error) {
        console.log(`❌ Model failed:`, error.response?.data?.error?.message || error.message);
    }
    
    throw new Error('النموذج فشل');
}

function getFallbackReply(message) {
    const msg = message.toLowerCase().trim();
    
    // لو طلب شرح الجمع
    if (msg.includes('جمع') || msg.includes('شرح') && msg.includes('درس')) {
        return `👊 يلا بينا يا بطل!

تعالى نلعب لعبة سريعة 😄

لو معاك 2 تفاحة 🍎🍎
وجبتلك كمان 3 تفاحات 🍎🍎🍎

بقى عندك كام تفاحة؟`;

    // لو سأل "انت مين"
    } else if (msg.includes('انت مين') || msg.includes('who are you')) {
        return `👨‍🏫 أنا مدرسك الخصوصي الصبور!

مهمتي إني أعلّمك مش أحللك المسائل. هخليك تفكر وتوصل للحل بنفسك خطوة بخطوة.

جهيز تبدأ؟ قوللي ايه اللي عايز تتعلمه`;
    }
    
    // أي سؤال تاني
    return `👊 يلا بينا يا بطل!

خلينا نبدأ بالتدريج. ايه المادة اللي عايز تذاكرها النهاردة؟

(رياضيات - علوم - عربي - إنجليزي)`;
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
        console.error('Error sending message:', error.message);
        return false;
    }
}

// تخزين المحادثات
const conversationStore = new Map();

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
            <head><title>بوت المدرس الصبور</title></head>
            <body style="font-family: Arial; text-align: center; padding: 50px; background: #1a1a2e; color: white;">
                <h1>👨‍🏫 بوت المدرس الصبور</h1>
                <p>✅ شغال - أسلوب تعليمي تفاعلي</p>
                <p>🎯 جرب تسأل: "اشرحلي الجمع"</p>
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
        
        console.log(`📨 Received: "${textMessage}" from ${chatId}`);
        
        if (textMessage && textMessage.trim()) {
            let userSession = conversationStore.get(chatId) || { history: [], failCount: 0 };
            
            if (OPENROUTER_API_KEY) {
                try {
                    const reply = await chatWithAI(textMessage, userSession.history);
                    await sendWAPilotMessage(chatId, reply);
                    
                    // تحديث تاريخ المحادثة
                    userSession.history.push({ role: "user", content: textMessage });
                    userSession.history.push({ role: "assistant", content: reply });
                    if (userSession.history.length > 20) {
                        userSession.history = userSession.history.slice(-20);
                    }
                    conversationStore.set(chatId, userSession);
                    
                } catch (error) {
                    console.error('AI Error:', error);
                    const fallback = getFallbackReply(textMessage);
                    await sendWAPilotMessage(chatId, fallback);
                }
            } else {
                const fallback = getFallbackReply(textMessage);
                await sendWAPilotMessage(chatId, fallback);
            }
        } else {
            await sendWAPilotMessage(chatId, "👨‍🏫 أهلاً بيك يا بطل! اكتبلي أي سؤال وهاخد معاك خطوة خطوة لحد ما تفهم بنفسك 💪");
        }
        
        return res.status(200).json({ ok: true });
    }
    
    res.status(404).send('Not Found');
};
