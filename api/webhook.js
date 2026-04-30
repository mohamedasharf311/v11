// api/webhook.js
const axios = require('axios');

const INSTANCE_ID = "instance3880";
const WAPILOT_TOKEN = "LVQSwwsO4HiwnZKkDSSFpVIS0HHuF1AtSfOAOCTl9k";
const WAPILOT_API_URL = "https://api.wapilot.net/api/v2";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

// 🔥 موديلات متعددة مع fallback ذكي
const MODELS_TO_TRY = [
    'deepseek/deepseek-chat-v3-0324',  // الأساسي - قوي في الشرح
    'google/gemini-2.0-flash-001',     // سريع
    'openai/gpt-4o-mini'              // متوازن
];

// 🎯 نظام prompt شامل لكل المواد
const TEACHER_SYSTEM_PROMPT = `أنت مدرس شامل لكل المواد (رياضيات - علوم - كيمياء - فيزياء - لغة عربية - إنجليزي - تاريخ - جغرافيا).

مهمتك الأساسية:
- تشرح أي سؤال من الطالب مهما كان المجال
- تبسط المعلومة جداً باستخدام اللهجة المصرية
- تستخدم أمثلة من الحياة اليومية
- متخرجش بره الموضوع المطلوب
- متقولش "قولي عايز تتعلم ايه" أبداً

لو السؤال نظري → اشرح بالتفصيل
لو عملي → وضح بخطوات
لو طلب معلومات (زي "قولي 5 عناصر كيمياء") → اشرح واذكرهم بالتفصيل

شخصيتك:
- ودود ومشجع جداً
- استخدم الإيموجي المناسب
- فخور بتقدم الطالب`;

// رسائل تحفيزية
const motivationalMessages = {
    math: ["🔥 يلا بينا نكسر الدنيا!", "💪 جاهز يا بطل؟", "👀 ركّز معايا كده", "🚀 نبدأ التحدي؟", "🎯 تمام يا بطل"],
    science: ["🔬 خلينا نكتشف سوا!", "🧪 سؤال جميل!", "🌍 معلومة حلوة!"],
    default: ["✨ يلا بينا", "🎯 تمام يا بطل", "💪 يلا"]
};

function getMotivationalMessage(subject) {
    const messages = motivationalMessages[subject] || motivationalMessages.default;
    return messages[Math.floor(Math.random() * messages.length)];
}

// 🧠 1. Smart Detection مطور جداً
function smartDetect(message, session) {
    const msg = message.toLowerCase().trim();
    
    // التحيات
    if (msg.includes('مساء الخير')) {
        return { subject: 'general', intent: 'greeting', response: "🌙 مساء النور يا بطل! عامل إيه النهاردة؟" };
    }
    if (msg.includes('صباح الخير')) {
        return { subject: 'general', intent: 'greeting', response: "🌞 صباح النور يا بطل! عامل إيه النهاردة؟" };
    }
    if (msg.includes('مرحبا') || msg.includes('اهلا')) {
        return { subject: 'general', intent: 'greeting', response: "😊 أهلاً بيك يا بطل! النهاردة هنتعلم ايه؟" };
    }
    
    // 🔥 طلب معلومات عامة (موسع جداً)
    const isInfoRequest = 
        msg.includes('ايه') || 
        msg.includes('ما هو') ||
        msg.includes('يعني') ||
        msg.includes('اشرح') ||
        msg.includes('قولي') ||      // 🔥 مهم جداً
        msg.includes('اذكر') ||      // 🔥
        msg.includes('عدد') ||       // 🔥
        msg.includes('عرف') ||
        msg.includes('تعريف');
    
    if (isInfoRequest) {
        return { subject: session.subject || 'general', intent: 'explain' };
    }
    
    // طلب مسألة/سؤال للتدريب
    if (msg.includes('مسألة') || msg.includes('سؤال') || 
        msg.includes('اديني') || msg.includes('هات') ||
        msg.includes('عايز سؤال') || msg.includes('تدريب')) {
        return { subject: session.subject || 'math', intent: 'practice' };
    }
    
    // تحديد المواد
    if (msg.includes('علوم') || msg.includes('كيمياء') || msg.includes('فيزياء')) {
        session.subject = 'science';
        return { subject: 'science', intent: 'practice' };
    }
    if (msg.includes('رياضيات') || msg.includes('حساب')) {
        session.subject = 'math';
        return { subject: 'math', intent: 'practice' };
    }
    
    // العمليات الحسابية
    if (msg.includes('جمع')) {
        session.currentOperation = 'addition';
        if (msg.includes('اشرح')) return { subject: 'math', intent: 'explain', operation: 'addition' };
        return { subject: 'math', intent: 'practice', operation: 'addition' };
    }
    if (msg.includes('طرح')) {
        session.currentOperation = 'subtraction';
        if (msg.includes('اشرح')) return { subject: 'math', intent: 'explain', operation: 'subtraction' };
        return { subject: 'math', intent: 'practice', operation: 'subtraction' };
    }
    if (msg.includes('ضرب')) {
        session.currentOperation = 'multiplication';
        if (msg.includes('اشرح')) return { subject: 'math', intent: 'explain', operation: 'multiplication' };
        return { subject: 'math', intent: 'practice', operation: 'multiplication' };
    }
    if (msg.includes('قسمة')) {
        session.currentOperation = 'division';
        if (msg.includes('اشرح')) return { subject: 'math', intent: 'explain', operation: 'division' };
        return { subject: 'math', intent: 'practice', operation: 'division' };
    }
    
    // إجابة رقمية
    if (/^\d+$/.test(msg) && session.mode === 'question') {
        return { subject: session.subject || 'math', intent: 'answer' };
    }
    
    // رد على سؤال "اه" أو "تمام" بعد الشرح
    if ((msg === 'اه' || msg === 'تمام' || msg === 'ايوه' || msg === 'أيوة') && session.waitingForPractice) {
        return { subject: session.subject, intent: 'practice' };
    }
    
    return null;
}

// 2. وظائف الشرح المخصصة للمواضيع الأساسية
async function getScienceExplanation(topic, message) {
    const msg = message.toLowerCase();
    
    if (topic === 'h2o' || msg.includes('h2o') || msg.includes('ماء')) {
        return `💧 **H2O ده رمز الماء!**

الماء بيتكون من:
• H = هيدروجين (Hydrogen) - ذرتين
• O = أكسجين (Oxygen) - ذرة واحدة

يعني H2O = 2 هيدروجين + 1 أكسجين

الماء بيكوّن حوالي 71% من سطح الكوكب، وهو أساس الحياة على الأرض 🌍

🤔 تحب نجرب سؤال بسيط على كده؟`;
    }
    
    if (topic === 'planet' || msg.includes('كوكب')) {
        return `🌍 **الكواكب في المجموعة الشمسية:**

1. عطارد (الأقرب للشمس)
2. الزهرة
3. الأرض (الكوكب اللي بنعيش عليه)
4. المريخ (الكوكب الأحمر)
5. المشتري (أكبر كوكب)
6. زحل (اللي حواليه حلقات)
7. أورانوس
8. نبتون

🤔 تحب نجرب سؤال بسيط على كده؟`;
    }
    
    if (topic === 'gravity' || msg.includes('جاذبية')) {
        return `🍎 **الجاذبية الأرضية**

العالم إسحاق نيوتن هو اللي اكتشف الجاذبية لما شاف تفاحة بتقع من الشجرة.

الجاذبية هي قوة بتجذب الأجسام نحو الأرض. يعني هي السبب إننا بنقف على الأرض وما بنطيرش في الهوا!

🤔 تحب نجرب سؤال بسيط على كده؟`;
    }
    
    return null;
}

async function getMathExplanation(operation, message) {
    const msg = message.toLowerCase();
    
    if (operation === 'addition' || msg.includes('جمع')) {
        return `🧮 **الجمع** هو إنك بتضيف رقمين أو أكتر مع بعض.

مثال: 3 تفاحات 🍎 + 2 تفاحات 🍎 = 5 تفاحات 🍎🍎🍎🍎🍎

علامة الجمع هي (+)

🤔 تحب نجرب مسألة جمع؟`;
    }
    
    if (operation === 'subtraction' || msg.includes('طرح')) {
        return `🧮 **الطرح** هو إنك بتاخد رقم من رقم تاني.

مثال: 5 تفاحات 🍎🍎🍎🍎🍎 - 2 تفاحات 🍎🍎 = 3 تفاحات 🍎🍎🍎

علامة الطرح هي (-)

🤔 تحب نجرب مسألة طرح؟`;
    }
    
    if (operation === 'division' || msg.includes('قسمة')) {
        return `🧮 **القسمة** هي توزيع الأرقام بالتساوي.

مثال: 6 تفاحات ÷ 3 أشخاص = كل شخص ياخد 2 تفاحة 🍎🍎

علامة القسمة هي (÷)

🤔 تحب نجرب مسألة قسمة؟`;
    }
    
    return null;
}

// 3. توليد الأسئلة (باستخدام progress لكل مادة)
function generateMathQuestion(session) {
    const level = Math.min(session.progress.math, 10);
    const max = level * 5;
    
    if (session.currentOperation === 'subtraction') {
        const num1 = Math.floor(Math.random() * max) + 10;
        const num2 = Math.floor(Math.random() * (num1 - 1)) + 1;
        session.lastQuestion = `🧮 ${num1} - ${num2} = كام؟`;
        session.correctAnswer = num1 - num2;
    } else if (session.currentOperation === 'multiplication') {
        const num1 = Math.floor(Math.random() * Math.min(level, 5)) + 1;
        const num2 = Math.floor(Math.random() * Math.min(level, 5)) + 1;
        session.lastQuestion = `🧮 ${num1} × ${num2} = كام؟`;
        session.correctAnswer = num1 * num2;
    } else if (session.currentOperation === 'division') {
        const num2 = Math.floor(Math.random() * Math.min(level, 5)) + 1;
        const result = Math.floor(Math.random() * Math.min(level, 5)) + 1;
        const num1 = num2 * result;
        session.lastQuestion = `🧮 ${num1} ÷ ${num2} = كام؟`;
        session.correctAnswer = result;
    } else {
        const num1 = Math.floor(Math.random() * max) + 1;
        const num2 = Math.floor(Math.random() * max) + 1;
        session.lastQuestion = `🧮 ${num1} + ${num2} = كام؟`;
        session.correctAnswer = num1 + num2;
    }
    
    session.mode = 'question';
    session.waitingForPractice = false;
    session.failCount = 0;
    session.subject = 'math';
    return session.lastQuestion;
}

function generateScienceQuestion(session) {
    const level = session.progress.science;
    
    const questions = [
        "🌍 ايه هو الكوكب اللي بنعيش عليه؟ (الأرض - المريخ - الزهرة)",
        "💧 ايه هو رمز الماء؟ (H2O - CO2 - O2)",
        "🌞 ايه مصدر الضوء والحرارة الأساسي على الأرض؟ (القمر - الشمس - النجوم)",
        "🍎 مين اللي اكتشف الجاذبية الأرضية؟ (نيوتن - أينشتاين - جاليليو)"
    ];
    
    const index = Math.min(level - 1, questions.length - 1);
    session.lastQuestion = questions[index];
    session.correctAnswer = null;
    session.mode = 'question';
    session.waitingForPractice = false;
    return session.lastQuestion;
}

function generateQuestionByTopic(session) {
    if (session.subject === 'science') {
        return generateScienceQuestion(session);
    }
    return generateMathQuestion(session);
}

// 4. معالجة الإجابات مع نظام Streak
function handleAnswer(userMessage, session) {
    const numbers = userMessage.match(/\d+/g);
    if (!numbers || session.subject !== 'math') return null;
    
    const userAnswer = parseInt(numbers[0]);
    
    if (session.mode === 'question' && session.correctAnswer !== null) {
        if (userAnswer === session.correctAnswer) {
            // 🔥 زيادة مستوى المادة
            if (session.subject === 'math') {
                session.progress.math++;
            } else {
                session.progress.science++;
            }
            session.streak++;
            session.failCount = 0;
            
            const newQuestion = generateMathQuestion(session);
            let streakMessage = "";
            
            // 🎮 Gamification
            if (session.streak === 3) {
                streakMessage = "\n\n🔥 3 إجابات صح ورا بعض! جامد!\n";
            } else if (session.streak === 5) {
                streakMessage = "\n\n🏆 أسطورة! 5 صح متتالية!\n";
            }
            
            return `✅ إجابة صح! ${streakMessage}\n📈 مستواك في ${session.subject === 'math' ? 'الرياضيات' : 'العلوم'} بقى ${session.subject === 'math' ? session.progress.math : session.progress.science}\n\n${getMotivationalMessage(session.subject)}\n${newQuestion}`;
        } else {
            session.failCount++;
            session.streak = 0;
            
            if (session.failCount >= 2) {
                session.failCount = 0;
                const newQuestion = generateMathQuestion(session);
                return `📝 الحل الصحيح كان: ${session.correctAnswer}\n\n${getMotivationalMessage(session.subject)}\n${newQuestion}`;
            }
            return `قريب 👀 حاول تاني.\n\n${session.lastQuestion}`;
        }
    }
    return null;
}

// 5. AI للشرح باستخدام موديلات متعددة
async function chatWithAI(message, session) {
    for (const model of MODELS_TO_TRY) {
        try {
            console.log(`🔄 Trying model: ${model}`);
            
            const messages = [
                { role: "system", content: TEACHER_SYSTEM_PROMPT },
                { role: "user", content: `اشرحلي بالتفصيل وباللهجة المصرية: ${message}` }
            ];
            
            const response = await axios.post(
                'https://openrouter.ai/api/v1/chat/completions',
                {
                    model: model,
                    messages: messages,
                    temperature: 0.7,
                    max_tokens: 800
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                        'HTTP-Referer': 'https://school-gamma-ten.vercel.app',
                        'X-Title': 'WhatsApp Teacher Bot'
                    },
                    timeout: 25000
                }
            );
            
            if (response.data?.choices?.[0]?.message?.content) {
                console.log(`✅ Success with ${model}`);
                let aiReply = response.data.choices[0].message.content;
                
                // إضافة دعوة للتدريب بعد الشرح
                aiReply += "\n\n🤔 تحب نجرب سؤال بسيط على كده؟";
                session.waitingForPractice = true;
                
                return aiReply;
            }
            
        } catch (error) {
            console.log(`❌ ${model} failed:`, error.message);
        }
    }
    
    return null;
}

class UserSession {
    constructor() {
        this.mode = 'learning';        // learning, question
        this.conversationHistory = [];
        this.hasStarted = false;
        this.lastQuestion = null;
        this.correctAnswer = null;
        this.failCount = 0;
        this.subject = 'math';
        this.intent = null;
        this.currentOperation = 'addition';
        
        // 🔥 تتبع التقدم لكل مادة على حدة
        this.progress = {
            math: 1,
            science: 1
        };
        
        // 🎮 نظام النقاط والتحديات
        this.streak = 0;
        this.waitingForPractice = false;
    }
}

const sessions = new Map();

function getUserSession(chatId) {
    if (!sessions.has(chatId)) {
        sessions.set(chatId, new UserSession());
    }
    return sessions.get(chatId);
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
            <head><title>بوت المدرس الشامل - AI متعدد الموديلات</title></head>
            <body style="font-family: Arial; text-align: center; padding: 50px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;">
                <h1>👨‍🏫 بوت المدرس الشامل</h1>
                <p>✅ شغال على DeepSeek + Gemini + GPT-4o-mini</p>
                <p>🎯 يشرح أي مادة: رياضيات، علوم، كيمياء، فيزياء، عربي، إنجليزي</p>
                <p>🚀 مع نظام تطور ومستويات ومكافآت</p>
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
            
            const prevSubject = session.subject;
            let detection = smartDetect(textMessage, session);
            
            if (!detection) {
                detection = { subject: session.subject, intent: 'general' };
            }
            
            if (detection.subject && detection.subject !== 'general') {
                session.subject = detection.subject;
            }
            
            if (detection.operation) {
                session.currentOperation = detection.operation;
            }
            
            console.log(`🎯 Subject: ${session.subject}, Intent: ${detection.intent}, Mode: ${session.mode}`);
            
            // المعالجة الرئيسية
            if (detection.intent === 'answer') {
                reply = handleAnswer(textMessage, session);
                if (!reply && session.lastQuestion) {
                    reply = `🎯 ركّز معايا 👀\n\n${session.lastQuestion}`;
                }
            }
            
            else if (detection.intent === 'explain') {
                let explanation = await getScienceExplanation(detection.topic, textMessage);
                if (!explanation) {
                    explanation = await getMathExplanation(detection.operation, textMessage);
                }
                
                if (explanation) {
                    reply = explanation;
                    session.waitingForPractice = true;
                    session.mode = 'learning';
                } else {
                    const aiReply = await chatWithAI(textMessage, session);
                    if (aiReply && aiReply.trim().length > 10) {
                        reply = aiReply;
                        session.mode = 'learning';
                    } else {
                        reply = "👨‍🏫 خليني أشرحلك ببساطة. قولي عايز تفهم ايه بالضبط؟";
                    }
                }
            }
            
            else if (detection.intent === 'practice') {
                const question = generateQuestionByTopic(session);
                reply = `${getMotivationalMessage(session.subject)}\n${question}`;
                session.mode = 'question';
                session.waitingForPractice = false;
            }
            
            else if (detection.intent === 'greeting') {
                reply = detection.response || "😊 أهلاً بيك! قولي عايز تتعلم ايه؟";
                session.waitingForPractice = false;
            }
            
            else {
                // 🔥 تحسين كبير: بدل ما نرجع رسالة عامة، نكمل من آخر سياق
                if (session.mode === 'question' && session.lastQuestion) {
                    reply = `👀 كنا في السؤال ده:\n\n${session.lastQuestion}`;
                } else if (session.waitingForPractice) {
                    reply = `🤔 عايز تجرب سؤال على اللي شرحناه؟\n\n${generateQuestionByTopic(session)}`;
                    session.mode = 'question';
                    session.waitingForPractice = false;
                } else {
                    reply = "👨‍🏫 قولّي عايز شرح ايه وأنا هبدأ معاك 💪";
                }
            }
            
            if (!reply) {
                reply = `${getMotivationalMessage(session.subject)}\n${generateQuestionByTopic(session)}`;
                session.mode = 'question';
            }
            
            await sendWAPilotMessage(chatId, reply);
            
            session.conversationHistory.push({ role: "user", content: textMessage });
            session.conversationHistory.push({ role: "assistant", content: reply });
            if (session.conversationHistory.length > 12) {
                session.conversationHistory = session.conversationHistory.slice(-12);
            }
            sessions.set(chatId, session);
            
        } else {
            await sendWAPilotMessage(chatId, "👨‍🏫 أهلاً بيك! قولي عايز تتعلم ايه؟");
        }
        
        return res.status(200).json({ ok: true });
    }
    
    res.status(404).send('Not Found');
};
