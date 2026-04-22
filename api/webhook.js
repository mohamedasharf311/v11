// api/webhook.js
const axios = require('axios');

const INSTANCE_ID = "instance3532";
const WAPILOT_TOKEN = "yzWzEjmxZpbifuOx6lWafYT3Ng69gaFpJGAdTsVc6N";
const WAPILOT_API_URL = "https://api.wapilot.net/api/v2";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

// 🔥 استخدام DeepSeek V3 - موديل ثابت وقوي
const MODEL = 'deepseek/deepseek-chat-v3-0324';

// موديل احتياطي لو فشل الأساسي
const FALLBACK_MODEL = 'deepseek/deepseek-r1';

const TEACHER_SYSTEM_PROMPT = `أنت مدرس صبور لطلاب المرحلة الإعدادية.

أسلوبك:
- اشرح ببساطة شديدة باللهجة المصرية
- استخدم أمثلة من الحياة اليومية
- خلي كلامك واضح وسهل

مهمتك:
- أنت هنا للشرح فقط
- متسألش أسئلة بنفسك
- رد على أسئلة الطالب مباشرة واشرح المطلوب بالتفصيل

شخصيتك:
- ودود ومشجع
- مبتسم (استخدم الإيموجي المناسب)
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

// 1. Smart Detection
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
    
    // أسئلة معرفية (شرح)
    const isQuestion = msg.startsWith('ايه') || msg.startsWith('ما هو') || 
                       msg.includes('يعني') || msg.includes('رمز') ||
                       msg.includes('اشرح') || msg.includes('شرح') ||
                       msg.includes('ماذا') || msg.includes('كيف');
    
    if (isQuestion) {
        if (msg.includes('h2o') || msg.includes('ماء') || msg.includes('الماء')) {
            return { subject: 'science', intent: 'explain', topic: 'h2o' };
        }
        if (msg.includes('كوكب') || msg.includes('الارض')) {
            return { subject: 'science', intent: 'explain', topic: 'planet' };
        }
        if (msg.includes('جاذبية') || msg.includes('نيوتن')) {
            return { subject: 'science', intent: 'explain', topic: 'gravity' };
        }
        return { subject: session.subject || 'general', intent: 'explain' };
    }
    
    // طلب مسألة/سؤال
    if (msg.includes('مسألة') || msg.includes('سؤال') || 
        msg.includes('اديني') || msg.includes('هات') ||
        msg.includes('عايز سؤال') || msg.includes('تدريب')) {
        return { subject: session.subject || 'math', intent: 'practice' };
    }
    
    // تحديد المواد
    if (msg.includes('علوم')) {
        return { subject: 'science', intent: 'practice' };
    }
    if (msg.includes('رياضيات') || msg.includes('حساب')) {
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
    
    return null;
}

// 2. وظائف الشرح المخصصة
async function getScienceExplanation(topic, message) {
    if (topic === 'h2o' || message.toLowerCase().includes('h2o')) {
        return `💧 **H2O ده رمز الماء!**

الماء بيتكون من:
• H = هيدروجين (Hydrogen) - ذرتين
• O = أكسجين (Oxygen) - ذرة واحدة

يعني H2O = 2 هيدروجين + 1 أكسجين

الماء بيكوّن حوالي 71% من سطح الكوكب، وهو أساس الحياة على الأرض 🌍

عايز تعرف حاجة تانية عن الماء؟`;
    }
    
    if (topic === 'planet' || message.toLowerCase().includes('كوكب')) {
        return `🌍 **الكواكب في المجموعة الشمسية:**

1. عطارد (الأقرب للشمس)
2. الزهرة
3. الأرض (الكوكب اللي بنعيش عليه)
4. المريخ (الكوكب الأحمر)
5. المشتري (أكبر كوكب)
6. زحل (اللي حواليه حلقات)
7. أورانوس
8. نبتون

عايز تعرف تفاصيل عن كوكب معين؟`;
    }
    
    if (topic === 'gravity' || message.toLowerCase().includes('جاذبية')) {
        return `🍎 **الجاذبية الأرضية**

العالم إسحاق نيوتن هو اللي اكتشف الجاذبية لما شاف تفاحة بتقع من الشجرة.

الجاذبية هي قوة بتجذب الأجسام نحو الأرض. يعني هي السبب إننا بنقف على الأرض وما بنطيرش في الهوا!`;
    }
    
    return null;
}

async function getMathExplanation(operation, message) {
    if (operation === 'addition' || message.toLowerCase().includes('جمع')) {
        return `🧮 **الجمع** هو إنك بتضيف رقمين أو أكتر مع بعض.

مثال: 3 تفاحات 🍎 + 2 تفاحات 🍎 = 5 تفاحات 🍎🍎🍎🍎🍎

علامة الجمع هي (+)`;
    }
    
    if (operation === 'subtraction' || message.toLowerCase().includes('طرح')) {
        return `🧮 **الطرح** هو إنك بتاخد رقم من رقم تاني.

مثال: 5 تفاحات 🍎🍎🍎🍎🍎 - 2 تفاحات 🍎🍎 = 3 تفاحات 🍎🍎🍎

علامة الطرح هي (-)`;
    }
    
    if (operation === 'division' || message.toLowerCase().includes('قسمة')) {
        return `🧮 **القسمة** هي توزيع الأرقام بالتساوي.

مثال: 6 تفاحات ÷ 3 أشخاص = كل شخص ياخد 2 تفاحة 🍎🍎

علامة القسمة هي (÷)`;
    }
    
    return null;
}

// 3. توليد الأسئلة
function generateMathQuestion(session) {
    const level = Math.min(session.level, 10);
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
    session.failCount = 0;
    session.subject = 'math';
    return session.lastQuestion;
}

function generateScienceQuestion() {
    const questions = [
        "🌍 ايه هو الكوكب اللي بنعيش عليه؟ (الأرض - المريخ - الزهرة)",
        "💧 ايه هو رمز الماء؟ (H2O - CO2 - O2)",
        "🌞 ايه مصدر الضوء والحرارة الأساسي على الأرض؟ (القمر - الشمس - النجوم)",
        "🍎 مين اللي اكتشف الجاذبية الأرضية؟ (نيوتن - أينشتاين - جاليليو)"
    ];
    return questions[Math.floor(Math.random() * questions.length)];
}

function generateQuestionByTopic(session) {
    if (session.subject === 'science') {
        return generateScienceQuestion();
    }
    return generateMathQuestion(session);
}

// 4. معالجة الإجابات
function handleAnswer(userMessage, session) {
    const numbers = userMessage.match(/\d+/g);
    if (!numbers || session.subject !== 'math') return null;
    
    const userAnswer = parseInt(numbers[0]);
    
    if (session.mode === 'question' && session.correctAnswer !== null) {
        if (userAnswer === session.correctAnswer) {
            session.level++;
            session.failCount = 0;
            const newQuestion = generateMathQuestion(session);
            return `🔥 أداء قوي يا بطل! ✅ إجابة صح!\n📈 مستواك بقى ${session.level}\n\n${getMotivationalMessage('math')}\n${newQuestion}`;
        } else {
            session.failCount++;
            if (session.failCount >= 2) {
                session.failCount = 0;
                const newQuestion = generateMathQuestion(session);
                return `📝 الحل الصحيح: ${session.correctAnswer}\n\n${getMotivationalMessage('math')}\n${newQuestion}`;
            }
            return `قريب 👀 حاول تاني.\n\n${session.lastQuestion}`;
        }
    }
    return null;
}

// 5. AI للشرح باستخدام DeepSeek (ثابت)
async function chatWithAI(message, session) {
    // تجربة الموديل الأساسي أولاً
    const modelsToTry = [MODEL, FALLBACK_MODEL];
    
    for (const model of modelsToTry) {
        try {
            console.log(`🔄 Trying DeepSeek model: ${model}`);
            
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
                    max_tokens: 600,
                    top_p: 0.9,
                    frequency_penalty: 0.5,
                    presence_penalty: 0.5
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                        'HTTP-Referer': 'https://school-gamma-ten.vercel.app',
                        'X-Title': 'WhatsApp Teacher Bot - DeepSeek'
                    },
                    timeout: 30000
                }
            );
            
            if (response.data?.choices?.[0]?.message?.content) {
                console.log(`✅ Success with DeepSeek ${model}`);
                return response.data.choices[0].message.content;
            }
            
        } catch (error) {
            console.log(`❌ DeepSeek ${model} failed:`, error.message);
            if (error.response) {
                console.log(`   Status: ${error.response.status}`);
                console.log(`   Data:`, JSON.stringify(error.response.data).slice(0, 200));
            }
        }
    }
    
    return null;
}

function cleanResponse(text) {
    if (!text || text.trim().length < 3) return null;
    if (text.includes('```') || text.includes('function') || text.includes('const ')) {
        return null;
    }
    return text.trim();
}

class UserSession {
    constructor() {
        this.mode = 'learning';
        this.conversationHistory = [];
        this.hasStarted = false;
        this.lastQuestion = null;
        this.correctAnswer = null;
        this.failCount = 0;
        this.subject = 'math';
        this.intent = null;
        this.currentOperation = 'addition';
        this.level = 1;
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
            <head><title>بوت المدرس الصبور - DeepSeek V3</title></head>
            <body style="font-family: Arial; text-align: center; padding: 50px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;">
                <h1>👨‍🏫 بوت المدرس الصبور</h1>
                <p>✅ شغال على DeepSeek V3 - موديل ثابت وقوي</p>
                <p>🎯 يدعم: رياضيات، علوم، شرح، أسئلة</p>
                <p>🤖 DeepSeek - الذكاء الاصطناعي الصيني المتطور</p>
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
            
            // Smart Exit
            if (prevSubject && detection.subject !== prevSubject && session.mode === 'question') {
                session.mode = 'learning';
                session.lastQuestion = null;
                session.correctAnswer = null;
                console.log(`🔓 Smart exit: ${prevSubject} → ${detection.subject}`);
            }
            
            console.log(`🎯 Subject: ${session.subject}, Intent: ${detection.intent}, Mode: ${session.mode}`);
            
            // المعالجة
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
            }
            
            else if (detection.intent === 'greeting') {
                reply = detection.response || "😊 أهلاً بيك! قولي عايز تتعلم ايه؟";
            }
            
            else {
                reply = `👨‍🏫 قولي عايز تتعلم ايه؟\n\nمتاح: رياضيات - علوم\nأو اكتب "اديني سؤال" عشان نبدأ تدريب`;
            }
            
            if (!reply) {
                reply = `${getMotivationalMessage(session.subject)}\n${generateQuestionByTopic(session)}`;
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
