// api/webhook.js
const axios = require('axios');

const INSTANCE_ID = "instance3532";
const WAPILOT_TOKEN = "yzWzEjmxZpbifuOx6lWafYT3Ng69gaFpJGAdTsVc6N";
const WAPILOT_API_URL = "https://api.wapilot.net/api/v2";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

const MODEL = 'google/gemini-2.0-flash-001';

const TEACHER_SYSTEM_PROMPT = `أنت مدرس صبور لطلاب المرحلة الإعدادية - كل المواد.

قواعدك:
1. لا تعطي الإجابة النهائية مباشرة.
2. اسأل الطالب سؤال بسيط يقوده للحل.
3. لو الطالب أجاب صح → كمل.
4. لو أخطأ → قوله "قريب 👀 حاول تاني".
5. بعد محاولتين → اشرح الحل.

أسلوبك باللهجة المصرية.
ممنوع الكود البرمجي في الرد.`;

function cleanResponse(text) {
    if (!text || text.trim().length < 3) return null;
    if (text.includes('```') || text.includes('function') || text.includes('const ')) {
        return null;
    }
    return text.trim();
}

// 2. اصلح الكارثة - self كانت غلط
class UserSession {
    constructor() {
        this.mode = 'learning';      // learning أو question
        this.conversationHistory = [];
        this.hasStarted = false;
        this.lastQuestion = null;     // تخزين السؤال اللي اتسأل
        this.correctAnswer = null;    // تخزين الإجابة الصحيحة
        this.failCount = 0;           // عدد المحاولات الفاشلة
    }
}

const sessions = new Map();

function getUserSession(chatId) {
    if (!sessions.has(chatId)) {
        sessions.set(chatId, new UserSession());
    }
    return sessions.get(chatId);
}

// 4. أهم إضافة - رد على الإجابة بنفسك
function handleNumericAnswer(userMessage, session) {
    // استخراج الرقم من الرسالة
    const numbers = userMessage.match(/\d+/g);
    if (!numbers) return null;
    
    const userAnswer = parseInt(numbers[0]);
    
    // لو في وضع السؤال وعندنا إجابة متوقعة
    if (session.mode === 'question' && session.correctAnswer !== null) {
        if (userAnswer === session.correctAnswer) {
            // إجابة صحيحة
            session.failCount = 0;
            session.mode = 'learning';
            return `🔥 صح يا بطل! أداء قوي!\n\nجهيز للسؤال الجاي؟`;
        } else {
            // إجابة غلط
            session.failCount++;
            
            if (session.failCount >= 2) {
                session.mode = 'learning';
                session.failCount = 0;
                return `قريب 👀 خلينا نفهمها صح:\n\n${session.lastQuestion}\nالحل الصحيح: ${session.correctAnswer}\n\nفهمتها؟`;
            }
            
            return `قريب 👀 حاول تاني.\n\n${session.lastQuestion}`;
        }
    }
    
    return null;
}

async function chatWithAI(message, session) {
    try {
        console.log(`🔄 Using model: ${MODEL}, Mode: ${session.mode}`);
        
        // 5. قلل الـ history لآخر 6 رسائل بس
        const shortHistory = session.conversationHistory.slice(-6);
        
        const messages = [
            { role: "system", content: TEACHER_SYSTEM_PROMPT },
            ...shortHistory,
            { role: "user", content: message }
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
            
            // لو الرد فيه سؤال، نخزنه عشان نعرف الإجابة بعدين
            if (reply.includes('؟') || reply.includes('كام')) {
                session.mode = 'question';
                // هنخلي الـ AI يحدد السؤال والإجابة
                // بس هنحاول نستخرج الرقم المتوقع من السياق
            }
            
            return cleaned || reply;
        }
        
    } catch (error) {
        console.log(`❌ Model failed:`, error.message);
    }
    return null;
}

// 1. اصلح الـ fallback - يخلي الـ flow مستمر
function getFallbackReply(message, session) {
    const msg = message.toLowerCase().trim();
    
    // لو في نص شرح وطلب تكملة
    if (msg.includes('كنا بنشرح') || msg.includes('نكمل')) {
        if (session.lastQuestion) {
            return `آه يا بطل، كنا في السؤال ده:\n\n${session.lastQuestion}\n\nجرب تحله تاني 💪`;
        }
        return `كنا بنشرح الرياضيات. جهيز تحل السؤال الجاي؟ 😊`;
    }
    
    // لو في وضع السؤال ورد برقم
    const numericResult = handleNumericAnswer(message, session);
    if (numericResult) return numericResult;
    
    // 6. امسح أي onboarding أو "اسألني في أي مادة"
    // دلوقتي الـ fallback قصير ومفيهوش reset
    if (msg.includes('انت مين')) {
        return "👨‍🏫 أنا مدرسك الصبور. قولي عايز تفهم ايه؟";
    }
    
    if (msg.includes('شكرا')) {
        return "العفو يا بطل 🤗";
    }
    
    // 1. أهم حاجة - منرجعش للبداية
    if (session.hasStarted && session.lastQuestion) {
        return `معلش حصل لخبطة بسيطة 😅 نكمل من هنا...\n\n${session.lastQuestion}`;
    }
    
    if (session.hasStarted) {
        return "معلش حصل لخبطة بسيطة 😅 قولي كنا بنشرح ايه؟";
    }
    
    // أول مرة بس
    session.hasStarted = true;
    return "🎯 أهلاً بيك! قولي عايز تتعلم ايه وهبدأ أشرحلك 💪";
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
                <p>✅ شغال - نظام متكامل</p>
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
            const session = getUserSession(chatId);
            
            let reply = null;
            
            // 3. منطق قبل الـ AI
            // لو طلب شرح
            if (textMessage.includes('اشرح') || textMessage.includes('شرح')) {
                session.mode = 'learning';
                session.failCount = 0;
            }
            
            // لو رد برقم في وضع السؤال
            const numericMatch = textMessage.match(/^\d+$/);
            if (numericMatch && session.mode === 'question') {
                reply = handleNumericAnswer(textMessage, session);
            }
            
            // لو مفيش رد لسه، نجرب الـ AI
            if (!reply && OPENROUTER_API_KEY) {
                try {
                    const aiReply = await chatWithAI(textMessage, session);
                    if (aiReply) {
                        reply = aiReply;
                        
                        // محاولة بسيطة لاستخراج السؤال والإجابة من رد الـ AI
                        // ده تحسين، مش ضروري للشغل الأساسي
                    }
                } catch (error) {
                    console.error('AI Error:', error);
                }
            }
            
            // لو مفيش رد لسه، نستخدم الـ fallback
            if (!reply) {
                reply = getFallbackReply(textMessage, session);
            }
            
            await sendWAPilotMessage(chatId, reply);
            
            // تحديث الـ history - آخر 6 بس
            session.conversationHistory.push({ role: "user", content: textMessage });
            session.conversationHistory.push({ role: "assistant", content: reply });
            if (session.conversationHistory.length > 12) {
                session.conversationHistory = session.conversationHistory.slice(-12);
            }
            sessions.set(chatId, session);
            
        } else {
            const session = getUserSession(chatId);
            await sendWAPilotMessage(chatId, "أهلاً بيك! قولي عايز تتعلم ايه؟ 💪");
        }
        
        return res.status(200).json({ ok: true });
    }
    
    res.status(404).send('Not Found');
};
