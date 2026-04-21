// api/webhook.js
const axios = require('axios');

const INSTANCE_ID = "instance3532";
const WAPILOT_TOKEN = "yzWzEjmxZpbifuOx6lWafYT3Ng69gaFpJGAdTsVc6N";
const WAPILOT_API_URL = "https://api.wapilot.net/api/v2";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

// 1. ثبت موديل واحد - بلاش switching عشان الثبات
const MODEL = 'google/gemini-2.0-flash-001';

// الـ Prompt الرئيسي - مدرس عام لكل المواد
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
- تقول "اكتب نبدأ" غير في أول مرة`;

// 2. فلترة الردود - منع كود ولغات غريبة
function cleanResponse(text) {
    if (!text || text.trim().length < 3) return null;
    
    // منع الكود البرمجي
    if (text.includes('```') || text.includes('function') || text.includes('const ') || text.includes('let ')) {
        return null;
    }
    
    // منع الحروف الغريبة (غير العربية والإنجليزية والأرقام والرموز البسيطة)
    const allowedPattern = /^[\u0600-\u06FF\u0000-\u007F\s\d\.,!?@#$%^&*()_+=\[\]{};:'"<>\/\\|~`\n\r]+$/;
    if (!allowedPattern.test(text)) {
        return null;
    }
    
    return text.trim();
}

// 3. State System - أهم حاجة
const MODES = {
    LEARNING: 'learning',   // بيشرح
    QUESTION: 'question'    // سأل سؤال وبيستنى إجابة
};

class UserSession {
    constructor() {
        this.mode = MODES.LEARNING;
        this.currentAnswer = null;
        this.currentQuestion = null;
        this.level = 1;
        this.score = 0;
        this.streak = 0;
        this.failCount = 0;
        this.questionsAnswered = 0;
        this.conversationHistory = [];
        this.hasStarted = false;
        this.freeQuestions = 0;  // عدّاد الأسئلة المجانية (3-5 بس)
        this.subscriptionOffered = false;
    }
}

const sessions = new Map();

function getUserSession(chatId) {
    if (!sessions.has(chatId)) {
        sessions.set(chatId, new UserSession());
    }
    return sessions.get(chatId);
}

// 4. بنك الأسئلة حسب المستوى
const questionBank = {
    1: [
        { question: "🔥 Level 1: معاك 3 تفاحات 🍎🍎🍎 وجبتلك 2 تفاحات تانيين 🍎🍎، بقى معاك كام تفاحة؟", answer: 5, hint: "عدهم: 3... 4... 5" },
        { question: "🔥 Level 1: معاك 4 جنيه 💰💰💰💰 ومامتك ادتك 3 جنيه كمان، بقى معاك كام جنيه؟", answer: 7, hint: "4... 5... 6... 7" },
        { question: "🔥 Level 1: عندك 6 كراسي 🪑🪑🪑🪑🪑🪑 وجبت 2 كراسي زيادة، كام كرسي بقى عندك؟", answer: 8, hint: "6... 7... 8" }
    ],
    2: [
        { question: "🔥 Level 2: 15 + 20 = كام؟ 💰", answer: 35, hint: "15... 20... 25... 30... 35" },
        { question: "🔥 Level 2: 25 + 13 = كام؟", answer: 38, hint: "25... 30... 35... 38" },
        { question: "🔥 Level 2: معاك 42 جنيه وصاحبك اديك 17 جنيه، كام بقى معاك؟", answer: 59, hint: "42 + 10 = 52 + 7 = 59" }
    ],
    3: [
        { question: "🏆 Level 3 - تحدي: 38 + 27 = كام؟", answer: 65, hint: "30+20=50، 8+7=15، 50+15=65" },
        { question: "🏆 Level 3 - تحدي: 56 + 29 = كام؟", answer: 85, hint: "50+20=70، 6+9=15، 70+15=85" }
    ]
};

function getNextQuestion(level) {
    const questions = questionBank[level] || questionBank[1];
    const randomIndex = Math.floor(Math.random() * questions.length);
    return { ...questions[randomIndex] };
}

// 5. معالجة الإجابة - دايمًا رد على إجابة المستخدم
function handleAnswer(session, userMessage) {
    if (session.mode !== MODES.QUESTION || session.currentAnswer === null) {
        return null;
    }
    
    // استخراج الرقم من رسالة المستخدم
    const numbers = userMessage.match(/\d+/g);
    if (!numbers) {
        return `قوللي الرقم كام بالأرقام يا بطل 💪\n\n${session.currentQuestion}`;
    }
    
    const userAnswer = parseInt(numbers[0]);
    const isCorrect = (userAnswer === session.currentAnswer);
    
    if (isCorrect) {
        // إجابة صح
        session.score += 10;
        session.streak++;
        session.failCount = 0;
        session.questionsAnswered++;
        session.freeQuestions++;
        
        let reply = `🔥 أداء قوي! ✅ صح!\n⭐ نقاطك: ${session.score}\n📊 ضربت ${session.streak} صح ورا بعض!\n\n`;
        
        // الترقية للمستوى التاني
        if (session.questionsAnswered >= 3 && session.level === 1) {
            session.level = 2;
            reply += `🎉 مبروك! وصلت Level 2!\n\n`;
        }
        if (session.questionsAnswered >= 6 && session.level === 2) {
            session.level = 3;
            reply += `🏆 أسطورة! وصلت Level 3!\n\n`;
        }
        
        // 4. علمه بجد - سؤال عن طريقة التفكير كل سؤالين
        if (session.questionsAnswered % 2 === 0) {
            session.mode = MODES.LEARNING;
            return reply + `استنى لحظة يا بطل 👀\n\nخليني أسألك: إنت حسبتها ازاي في دماغك؟ عديت ولا جمعت العشرات مع بعض؟\n\n(فكر في الطريقة وقوليلي 😊)`;
        }
        
        // 8. تحويل لفلوس - بعد 3 أسئلة مجانية
        if (session.freeQuestions >= 3 && !session.subscriptionOffered) {
            session.subscriptionOffered = true;
            const nextQ = getNextQuestion(session.level);
            session.currentQuestion = nextQ.question;
            session.currentAnswer = nextQ.answer;
            session.mode = MODES.QUESTION;
            
            return reply + `━━━━━━━━━━━━━━━━━━━━\n🔒 خلصت الأسئلة المجانية النهارده!\n\nعايز تكمل التحدي وتفتح Levels جديدة؟\nاشترك وخليني أتابعك يومياً 💪\n\n(لو مهتم قولي "أشترك")\n\n${nextQ.question}`;
        }
        
        // السؤال التالي
        const nextQ = getNextQuestion(session.level);
        session.currentQuestion = nextQ.question;
        session.currentAnswer = nextQ.answer;
        session.mode = MODES.QUESTION;
        reply += nextQ.question;
        
        return reply;
        
    } else {
        // إجابة غلط
        session.streak = 0;
        session.failCount++;
        
        // بعد محاولتين فاشلتين → اشرح الحل
        if (session.failCount >= 2) {
            session.mode = MODES.LEARNING;
            session.failCount = 0;
            return `قريب 👀 خلينا نفهمها صح:\n\n${session.currentQuestion}\n${session.currentHint || `الحل الصحيح: ${session.currentAnswer}`}\n\nفهمتها؟ جهيز للسؤال الجاي؟ 💪`;
        }
        
        return `قريب 👀 ${session.currentHint || 'حاول تاني وفكر فيها كويس'} \n\n${session.currentQuestion}`;
    }
}

// 6. ردود الـ AI مع فلترة
async function chatWithAI(message, session) {
    try {
        console.log(`🔄 Using model: ${MODEL}, Mode: ${session.mode}`);
        
        const messages = [
            { role: "system", content: TEACHER_SYSTEM_PROMPT },
            ...session.conversationHistory.slice(-10),
            { role: "user", content: `[المستوى: ${session.level} | النقاط: ${session.score}] ${message}` }
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
            return cleaned || reply;
        }
        
    } catch (error) {
        console.log(`❌ Model failed:`, error.message);
    }
    return null;
}

// 7. ردود احتياطية
function getFallbackReply(message, session) {
    const msg = message.toLowerCase().trim();
    
    // معالجة الإجابة لو في وضع QUESTION
    if (session.mode === MODES.QUESTION && session.currentAnswer !== null) {
        const answerResult = handleAnswer(session, message);
        if (answerResult) return answerResult;
    }
    
    // الاشتراك
    if (msg.includes('اشترك')) {
        return `🎉 ممتاز! أنت دلوقتي مشترك في برنامج "أبطال الحساب" 🏆\n\n📅 هنبدأ بكرة الصبح\n⏰ هبعتلك تحدي كل يوم 5 دقائق\n📊 هتابع تقدمك يومياً\n\nجهيز؟ 👀`;
    }
    
    // شرح الجمع
    if (msg.includes('جمع') || msg.includes('شرح')) {
        const firstQ = getNextQuestion(1);
        session.mode = MODES.QUESTION;
        session.currentQuestion = firstQ.question;
        session.currentAnswer = firstQ.answer;
        session.currentHint = firstQ.hint;
        session.hasStarted = true;
        session.freeQuestions = 0;
        
        return `يلا بينا يا بطل 👊\n\n${firstQ.question}\n\nقوللي الرقم كام؟ 💪`;
    }
    
    // انت مين
    if (msg.includes('انت مين')) {
        return `👨‍🏫 أنا مدرسك الخصوصي لكل المواد!\n\nمهمتي أعلّمك مش أحللك المسائل.\n\nاكتبلي "اشرحلي الجمع" وهنبدأ أول درس 💪`;
    }
    
    // 7. نهاية تخليه يرجع
    if (msg.includes('بكرة') || msg.includes('بكره')) {
        return `🏆 خلصت تدريب النهارده!\n\nأنا شايف مستواك بيتحسن 👀\nأنا مستنيك بكرة نكمل Level جديد!\n\nولو غبت... هاجي أسأل عليك 😏`;
    }
    
    // بداية المحادثة
    if (!session.hasStarted) {
        session.hasStarted = true;
        return `🎯 أهلاً بيك في أكاديمية كابتن ماث!\n\nأنا مدرسك الخصوصي لكل المواد.\n\nاكتبلي "اشرحلي الجمع" وهنبدأ أول درس 💪`;
    }
    
    return `اكتبلي "اشرحلي الجمع" عشان نبدأ، أو اسألني في مادة تانية (علوم - عربي - إنجليزي) 😊`;
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
                <p>✅ نظام متكامل - Levels - نقاط - متابعة يومية</p>
                <p>🔥 3 أسئلة مجانية، بعد كده اشترك عشان تكمل</p>
                <p>📱 جرب تسأل: "اشرحلي الجمع"</p>
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
            
            // الأول نحاول مع الـ AI
            let reply = await chatWithAI(textMessage, session);
            
            // لو الـ AI مردش أو رد بحاجة مرفوضة، نستخدم الـ fallback
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
            await sendWAPilotMessage(chatId, "🎯 أهلاً بيك! اكتبلي "اشرحلي الجمع" وهنبدأ 💪");
        }
        
        return res.status(200).json({ ok: true });
    }
    
    res.status(404).send('Not Found');
};
