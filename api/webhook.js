// api/webhook.js
const axios = require('axios');

const INSTANCE_ID = "instance3532";
const WAPILOT_TOKEN = "yzWzEjmxZpbifuOx6lWafYT3Ng69gaFpJGAdTsVc6N";
const WAPILOT_API_URL = "https://api.wapilot.net/api/v2";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

const MODEL = 'google/gemini-2.0-flash-001';

// نظام الحالات (State Machine)
const MODES = {
    ONBOARDING: 'onboarding',  // أول مرة بس
    LEARNING: 'learning',      // بيشرحله حاجة
    QUESTION: 'question',      // سأله سؤال وبيستنى إجابة
    GAME: 'game'              // وضع التحدي
};

const TEACHER_SYSTEM_PROMPT = `أنت "كابتن ماث" - مدرب مهارات الرياضيات 🎯

شخصيتك:
- حماسك ذكي مش أوفر
- بتهتم إن الطالب يفهم "ازاي" مش "ايه"
- دايمًا بترد على إجابات الطالب مباشرة

قوانينك الصارمة:
1. لو الطالب جاوب على سؤال → صحح له فورًا (غلط أو صح)
2. مفيش حاجة اسمها "اكتب نبدأ" بعد ما بدأنا
3. خلي flow المحادثة مستمر
4. لو الطالب غلط → قوله "قريب 👀 تعالى نعدهم سوا"

أسلوبك:
- "🔥 أداء قوي!"
- "قريب 👀 تعالى نعدهم سوا"
- "ممتاز! 👍"

ممنوع:
- تكتب "[مستوى اللاعب: ...]" دي تظهر للمستخدم
- تعمل reset في نص المحادثة
- تطلب "اكتب نبدأ" غير في أول مرة بس`;

// هيكل بيانات المستخدم المتقدم
class UserSession {
    constructor() {
        this.mode = MODES.ONBOARDING;
        this.level = 1;
        this.score = 0;
        this.streak = 0;
        this.currentQuestion = null;
        this.currentAnswer = null;
        this.conversationHistory = [];
        this.hasStarted = false; // عشان نعرف لو بدأ قبل كده
    }
}

const sessions = new Map(); // تخزين جلسات المستخدمين

function getUserSession(chatId) {
    if (!sessions.has(chatId)) {
        sessions.set(chatId, new UserSession());
    }
    return sessions.get(chatId);
}

// التعامل مع إجابات الطالب
function handleAnswer(session, userAnswer) {
    if (session.mode !== MODES.QUESTION || session.currentAnswer === null) {
        return null;
    }
    
    const answer = parseInt(userAnswer);
    const isCorrect = (answer === session.currentAnswer);
    
    if (isCorrect) {
        session.score += 10;
        session.streak++;
        session.mode = MODES.LEARNING;
        
        let reply = `🔥 أداء قوي يا بطل! ✅ إجابة صح!\n⭐ نقاطك: ${session.score}\n📊 ضربت ${session.streak} صح ورا بعض!\n\n`;
        
        // نضيف سؤال جديد
        const newQuestion = getNextQuestion(session.level);
        if (newQuestion) {
            session.currentQuestion = newQuestion.question;
            session.currentAnswer = newQuestion.answer;
            session.mode = MODES.QUESTION;
            reply += `${newQuestion.question}\n\nقوللي الرقم كام؟ 💪`;
        } else {
            reply += `عايز تحل مسألة أصعب شوية ولا نرجع حاجة تانية؟`;
        }
        
        return reply;
    } else {
        session.streak = 0;
        // ندي hint من غير ما نغير السؤال
        return `قريب 👀 تعالى نعدهم سوا:\n\n${getHintForQuestion(session.currentQuestion, session.currentAnswer)}\n\nجرب تاني وقولي الرقم الصح كام؟ 💪`;
    }
}

function getNextQuestion(level) {
    const questions = {
        1: [
            { question: "🍎🍎🍎 + 🍎🍎 = كام تفاحة؟", answer: 5 },
            { question: "💰💰💰💰 + 💰💰💰 = كام جنيه؟", answer: 7 },
            { question: "🪑🪑🪑🪑🪑🪑 + 🪑🪑 = كام كرسي؟", answer: 8 }
        ],
        2: [
            { question: "15 + 20 = كام؟", answer: 35 },
            { question: "25 + 13 = كام؟", answer: 38 },
            { question: "42 + 17 = كام؟", answer: 59 }
        ]
    };
    
    const levelQuestions = questions[level] || questions[1];
    const randomIndex = Math.floor(Math.random() * levelQuestions.length);
    return levelQuestions[randomIndex];
}

function getHintForQuestion(question, answer) {
    if (answer === 5) return "3... 4... 5";
    if (answer === 7) return "4... 5... 6... 7";
    if (answer === 8) return "6... 7... 8";
    if (answer === 35) return "15... 20... 25... 30... 35";
    if (answer === 38) return "25... 30... 35... 38";
    return "جمع الرقمين مع بعض خطوة خطوة";
}

async function chatWithAI(message, session) {
    try {
        console.log(`🔄 Using model: ${MODEL}, Mode: ${session.mode}`);
        
        const messages = [
            {
                role: "system",
                content: TEACHER_SYSTEM_PROMPT
            },
            ...session.conversationHistory.slice(-10),
            {
                role: "user",
                content: `[الوضع الحالي: ${session.mode} | مستوى: ${session.level} | نقاط: ${session.score}]
                
سؤال المستخدم: ${message}`
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
            // ننقي الرد من أي metadata
            reply = reply.replace(/\[.*?\]/g, '').trim();
            return reply;
        }
        
    } catch (error) {
        console.log(`❌ Model failed:`, error.message);
    }
    
    return null;
}

// ردود احتياطية ذكية
function getFallbackReply(message, session) {
    const msg = message.toLowerCase().trim();
    
    // لو في وضع QUESTION، نتعامل مع الإجابة مباشرة
    if (session.mode === MODES.QUESTION && session.currentAnswer !== null) {
        const answerMatch = msg.match(/\d+/);
        if (answerMatch) {
            return handleAnswer(session, answerMatch[0]);
        } else {
            return `قوللي الرقم كام بالارقام يا بطل 💪\n\n${session.currentQuestion}`;
        }
    }
    
    // لو طلب شرح الجمع
    if (msg.includes('جمع') || msg.includes('شرح')) {
        const firstQuestion = getNextQuestion(1);
        session.mode = MODES.QUESTION;
        session.currentQuestion = firstQuestion.question;
        session.currentAnswer = firstQuestion.answer;
        session.hasStarted = true;
        
        return `تمام جداً! الجمع ببساطة هو إنك بتضم مجموعتين أو أكثر مع بعض عشان تعمل مجموعة واحدة أكبر.\n\n${firstQuestion.question}\n\nجرّب تحسبها وقولي الناتج! 😉`;
    }
    
    // لو أول مرة
    if (!session.hasStarted && (msg.includes('اهلا') || msg.includes('هلا') || msg.includes('بداية'))) {
        session.hasStarted = true;
        return `🎯 أهلاً بيك في أكاديمية كابتن ماث!\n\nأنا كابتن ماث، المدرب بتاعك في عالم الرياضيات.\n\nاكتبلي "اشرحلي الجمع" وهنبدأ أول درس 💪`;
    }
    
    // لو كتب "نبدأ" أو أي حاجة تانية
    if (msg.includes('نبدأ') && !session.hasStarted) {
        session.hasStarted = true;
        return `🎯 يلا بينا! اكتبلي "اشرحلي الجمع" وهنبدأ أول درس 💪`;
    }
    
    // أي كلام تاني
    if (session.hasStarted && session.mode === MODES.LEARNING) {
        return `اكتبلي "اشرحلي الجمع" عشان نبدأ، أو اسألني في حاجة تانية 😊`;
    }
    
    return `🎯 أهلاً بيك! أنا كابتن ماث.\n\nاكتبلي "اشرحلي الجمع" وهنبدأ أول درس مع بعض 💪`;
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
            <head><title>أكاديمية كابتن ماث</title></head>
            <body style="font-family: Arial; text-align: center; padding: 50px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;">
                <h1>🎯 أكاديمية كابتن ماث</h1>
                <p>✅ نظام State Machine - بيحافظ على flow المحادثة</p>
                <p>🔥 جرب تسأل: "اشرحلي الجمع"</p>
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
            
            // نجرب الـ AI أولاً
            if (OPENROUTER_API_KEY) {
                try {
                    reply = await chatWithAI(textMessage, session);
                } catch (error) {
                    console.error('AI Error:', error);
                }
            }
            
            // لو AI مردش، نستخدم الـ fallback
            if (!reply) {
                reply = getFallbackReply(textMessage, session);
            }
            
            await sendWAPilotMessage(chatId, reply);
            
            // تحديث تاريخ المحادثة
            session.conversationHistory.push({ role: "user", content: textMessage });
            session.conversationHistory.push({ role: "assistant", content: reply });
            if (session.conversationHistory.length > 20) {
                session.conversationHistory = session.conversationHistory.slice(-20);
            }
            sessions.set(chatId, session);
            
        } else {
            await sendWAPilotMessage(chatId, "🎯 أهلاً بيك! اكتبلي أي سؤال وهساعدك 💪");
        }
        
        return res.status(200).json({ ok: true });
    }
    
    res.status(404).send('Not Found');
};
