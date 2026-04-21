// api/webhook.js
const axios = require('axios');

const INSTANCE_ID = "instance3532";
const WAPILOT_TOKEN = "yzWzEjmxZpbifuOx6lWafYT3Ng69gaFpJGAdTsVc6N";
const WAPILOT_API_URL = "https://api.wapilot.net/api/v2";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

// ثبت موديل واحد - بلاش switching
const MODEL = 'google/gemini-2.0-flash-001';

// الـ Prompt الرئيسي - الموديل هو اللي يرد من نفسه
const TEACHER_SYSTEM_PROMPT = `أنت مدرس صبور لطلاب المرحلة الإعدادية - كل المواد (رياضيات، علوم، عربي، إنجليزي، دراسات)

قواعدك الصارمة:
1. لا تعطي الإجابة النهائية مباشرة.
2. اسأل الطالب سؤال بسيط يقوده للحل.
3. لو الطالب أجاب بشكل صحيح → كمل للخطوة التالية + شجعه.
4. لو أخطأ → قوله "قريب 👀" أو "حاول تاني" (ممنوع "ممتاز" وهو غلط).
5. لو قال "مش عارف" → أعطه hint بسيط.
6. بعد محاولتين فاشلتين → اشرح الحل خطوة خطوة.

أسلوبك باللهجة المصرية:
- "قريب 👀 حاول تاني"
- "أداء قوي 🔥"
- "يلا بينا يا بطل"

ممنوع تماماً:
- كود برمجي في الرد
- حروف غريبة
- تقول "ممتاز" والإجابة غلط
- تعمل reset في نص المحادثة

أنت المسؤول عن إنشاء الأسئلة والشرح حسب ما يراه الطالب مناسب.`;

// فلترة الردود
function cleanResponse(text) {
    if (!text || text.trim().length < 3) return null;
    
    if (text.includes('```') || text.includes('function') || text.includes('const ') || text.includes('let ')) {
        return null;
    }
    
    return text.trim();
}

// State System بسيط
class UserSession {
    constructor() {
        this.mode = 'learning';
        self.conversationHistory = [];
        self.hasStarted = false;
    }
}

const sessions = new Map();

function getUserSession(chatId) {
    if (!sessions.has(chatId)) {
        sessions.set(chatId, new UserSession());
    }
    return sessions.get(chatId);
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
            const cleaned = cleanResponse(reply);
            console.log(`✅ AI response: ${reply.substring(0, 100)}...`);
            return cleaned || reply;
        }
        
    } catch (error) {
        console.log(`❌ Model failed:`, error.response?.data?.error?.message || error.message);
    }
    
    return null;
}

// ردود احتياطية بسيطة جداً
function getFallbackReply(message) {
    const msg = message.toLowerCase().trim();
    
    if (msg.includes('اهلا') || msg.includes('هلا')) {
        return "🎉 أهلاً بيك يا بطل! أنا مدرسك الخصوصي. اسألني في أي مادة وهبدأ أشرحلك خطوة خطوة 💪";
    }
    
    if (msg.includes('انت مين')) {
        return "👨‍🏫 أنا مدرسك الصبور! بدرس كل المواد للإعدادية. اسألني في أي حاجة مش فاهمها وهخليك توصل للحل بنفسك.";
    }
    
    if (msg.includes('شكرا')) {
        return "العفو يا بطل 🤗 أي خدمة، أنا موجود في أي وقت.";
    }
    
    return "👨‍🏫 أهلاً بيك! اسألني في أي مادة (رياضيات - علوم - عربي - إنجليزي) وهبدأ أشرحلك خطوة خطوة. جهيز؟ 😊";
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
                <p>✅ شغال - مدرس لكل المواد</p>
                <p>🎯 اسأل في أي حاجة: رياضيات - علوم - عربي - إنجليزي - دراسات</p>
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
            let conversationHistory = conversationStore.get(chatId) || [];
            
            if (OPENROUTER_API_KEY) {
                try {
                    const reply = await chatWithAI(textMessage, conversationHistory);
                    
                    if (reply) {
                        await sendWAPilotMessage(chatId, reply);
                    } else {
                        const fallback = getFallbackReply(textMessage);
                        await sendWAPilotMessage(chatId, fallback);
                    }
                    
                    conversationHistory.push({ role: "user", content: textMessage });
                    conversationHistory.push({ role: "assistant", content: reply || getFallbackReply(textMessage) });
                    if (conversationHistory.length > 20) {
                        conversationHistory = conversationHistory.slice(-20);
                    }
                    conversationStore.set(chatId, conversationHistory);
                    
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
            await sendWAPilotMessage(chatId, "👨‍🏫 أهلاً بيك يا بطل! اكتبلي سؤالك في أي مادة وهبدأ أشرحلك خطوة خطوة 💪");
        }
        
        return res.status(200).json({ ok: true });
    }
    
    res.status(404).send('Not Found');
};
