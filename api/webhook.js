// api/webhook.js
const axios = require('axios');

const INSTANCE_ID = "instance3532";
const WAPILOT_TOKEN = "yzWzEjmxZpbifuOx6lWafYT3Ng69gaFpJGAdTsVc6N";
const WAPILOT_API_URL = "https://api.wapilot.net/api/v2";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

const MODEL = 'google/gemini-2.0-flash-001';

const TEACHER_SYSTEM_PROMPT = `أنت مدرس صبور لطلاب المرحلة الإعدادية.

أسلوبك:
- اشرح ببساطة شديدة باللهجة المصرية
- استخدم أمثلة من الحياة اليومية
- رد على التحيات بشكل طبيعي وودود

مهمتك:
- أنت هنا للشرح والرد على الأسئلة
- متسألش أسئلة رياضية بنفسك
- رد على أسئلة الطالب في المواد المختلفة
- لو حد سلم عليك، رد السلام كويس و اسأله ازاي تقدر تساعد`;

// 1. دالة التحيات والمحادثة العامة
function handleGreeting(message) {
    const msg = message.toLowerCase().trim();
    
    const greetings = ['صباح الخير', 'مساء الخير', 'السلام عليكم', 'اهلا', 'هلا', 'يا باشا', 'صباح النور', 'مساء النور'];
    const responses = [
        "🌞 صباح النور يا بطل! عامل إيه النهاردة؟ جهيز تذاكر ولا عايز تسأل في حاجة معينة؟",
        "😊 أهلاً بيك يا بطل! النهاردة هنتعلم ايه؟",
        "👋 وعليكم السلام! أنا مدرسك الصبور. ايه اللي عايز تتعلمه النهاردة؟",
        "🎉 أهلاً وسهلاً! يلا بينا نبدأ رحلة التعليم 💪"
    ];
    
    for (const greeting of greetings) {
        if (msg.includes(greeting)) {
            return responses[Math.floor(Math.random() * responses.length)];
        }
    }
    
    // شكر
    if (msg.includes('شكر') || msg.includes('تسلم')) {
        return "العفو يا بطل 🤗 أي خدمة، أنا موجود في أي وقت عشان أساعدك.";
    }
    
    // كيف الحال
    if (msg.includes('عامل ايه') || msg.includes('ازيك') || msg.includes('اخبارك')) {
        return "الحمد لله تمام يا بطل! متحمس أبدأ معاك النهاردة. إنت عامل ايه؟ جهيز نذاكر؟ 💪";
    }
    
    // ليه
    if (msg.includes('ليه') || msg.includes('لماذا')) {
        return "سؤال جميل يا بطل! 👀 خليني أشرحلك بالتفصيل. قولي على ايه بالضبط عايز تعرف ليه؟";
    }
    
    return null;
}

// 2. دالة Smart Detection محسنة
function smartDetect(message, session) {
    const msg = message.toLowerCase().trim();
    
    // أولاً: التحقق من التحيات والمحادثة العامة
    const greetingResponse = handleGreeting(message);
    if (greetingResponse) {
        console.log(`🔍 Rule-based: Greeting detected`);
        return { subject: 'general', intent: 'greeting', response: greetingResponse };
    }
    
    // لو الرقم مرتبط بالسؤال الحالي
    if (/^\d+$/.test(msg) && session.mode === 'question') {
        console.log(`🔍 Rule-based: Number answer during question mode`);
        return { subject: session.subject, intent: 'answer' };
    }
    
    // كشف المسائل الرياضية (مثل: 5 + 3)
    if (/\d+\s*[\+\-\*x÷]\s*\d+/.test(msg)) {
        console.log(`🔍 Rule-based: Math equation detected`);
        return { subject: 'math', intent: 'question' };
    }
    
    // كشف المواد والنية بالكلمات المفتاحية
    // Math
    if (msg.includes('جمع') || msg.includes('طرح') || msg.includes('ضرب') || 
        msg.includes('قسمة') || msg.includes('زائد') || msg.includes('ناقص') ||
        msg.includes('رياضيات') || msg.includes('حساب')) {
        console.log(`🔍 Rule-based: Math topic detected`);
        
        if (msg.includes('اشرح')) return { subject: 'math', intent: 'explain' };
        if (msg.includes('تدرب') || msg.includes('سؤال')) return { subject: 'math', intent: 'practice' };
        return { subject: 'math', intent: 'general' };
    }
    
    // Science
    if (msg.includes('علوم') || msg.includes('كيمياء') || msg.includes('فيزياء') ||
        msg.includes('h2o') || msg.includes('ماء') || msg.includes('كهرباء') ||
        msg.includes('حرارة') || msg.includes('ضوء') || msg.includes('خلية') ||
        msg.includes('بكتيريا') || msg.includes('فيروس')) {
        console.log(`🔍 Rule-based: Science topic detected`);
        
        if (msg.includes('اشرح')) return { subject: 'science', intent: 'explain' };
        if (msg.includes('تدرب') || msg.includes('سؤال')) return { subject: 'science', intent: 'practice' };
        return { subject: 'science', intent: 'general' };
    }
    
    // Arabic
    if (msg.includes('عربي') || msg.includes('نحو') || msg.includes('صرف') ||
        msg.includes('بلاغة') || msg.includes('إملاء') || msg.includes('قواعد') ||
        msg.includes('اعراب')) {
        console.log(`🔍 Rule-based: Arabic topic detected`);
        
        if (msg.includes('اشرح')) return { subject: 'arabic', intent: 'explain' };
        if (msg.includes('تدرب')) return { subject: 'arabic', intent: 'practice' };
        return { subject: 'arabic', intent: 'general' };
    }
    
    // English
    if (msg.includes('انجليزي') || msg.includes('english') || msg.includes('grammar') ||
        msg.includes('vocabulary') || msg.includes('ترجمة') || msg.includes('verb')) {
        console.log(`🔍 Rule-based: English topic detected`);
        
        if (msg.includes('اشرح')) return { subject: 'english', intent: 'explain' };
        if (msg.includes('تدرب')) return { subject: 'english', intent: 'practice' };
        return { subject: 'english', intent: 'general' };
    }
    
    // لو محددش حاجة، نرجع null عشان نستخدم AI
    console.log(`🔍 Rule-based: No match, fallback to AI`);
    return null;
}

// 3. AI Detection (Fallback)
async function detectWithAI(message) {
    const prompt = `حدد:
1- المادة (math / science / arabic / english / general)
2- نوع الرسالة (explain / question / answer / practice / greeting / general)

مهم: رجع JSON بس بدون أي كلام تاني

مثال: {"subject": "math", "intent": "explain"}
مثال: {"subject": "general", "intent": "greeting"}

message: "${message}"`;

    try {
        const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: MODEL,
                messages: [{ role: "user", content: prompt }],
                temperature: 0,
                max_tokens: 100
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                    'HTTP-Referer': 'https://school-gamma-ten.vercel.app',
                    'X-Title': 'WhatsApp Teacher Bot'
                },
                timeout: 10000
            }
        );
        
        const content = response.data?.choices?.[0]?.message?.content || '';
        console.log(`🤖 AI detection response: ${content}`);
        
        const jsonMatch = content.match(/\{.*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
        
        return { subject: 'general', intent: 'general' };
    } catch (error) {
        console.log(`❌ AI detection failed:`, error.message);
        return { subject: 'general', intent: 'general' };
    }
}

// 4. Auto Mode Switching محسنة
async function processWithSmartDetection(message, session) {
    // الأول نحاول Rule-based
    let detection = smartDetect(message, session);
    
    // لو detection جاي معاه response مباشر (زي التحية)
    if (detection && detection.response) {
        return { action: 'direct', detection, directResponse: detection.response };
    }
    
    // لو مش موجود، نستخدم AI
    if (!detection) {
        detection = await detectWithAI(message);
    }
    
    console.log(`🎯 Final detection: Subject=${detection.subject}, Intent=${detection.intent}`);
    
    // حفظ في السيشن
    if (detection.subject && detection.subject !== 'general') {
        session.subject = detection.subject;
    }
    session.intent = detection.intent;
    
    // Auto Mode Switching
    if (detection.intent === 'answer' && session.mode === 'question') {
        return { action: 'answer', detection };
    }
    
    if (detection.intent === 'explain') {
        session.mode = 'explain';
        return { action: 'explain', detection };
    }
    
    if (detection.intent === 'practice') {
        session.mode = 'practice';
        return { action: 'practice', detection };
    }
    
    if (detection.intent === 'question') {
        session.mode = 'question';
        return { action: 'question', detection };
    }
    
    if (detection.intent === 'greeting') {
        return { action: 'greeting', detection };
    }
    
    return { action: 'general', detection };
}

// توليد أسئلة حسب المادة
function generateQuestionByTopic(session) {
    if (session.currentOperation === 'addition') {
        return generateAdditionQuestion(session);
    } else if (session.currentOperation === 'subtraction') {
        return generateSubtractionQuestion(session);
    }
    return generateAdditionQuestion(session);
}

function generateAdditionQuestion(session) {
    const num1 = Math.floor(Math.random() * 10) + 1;
    const num2 = Math.floor(Math.random() * 10) + 1;
    
    session.lastQuestion = `🧮 لو معاك ${num1} تفاحات 🍎، وجبتلك ${num2} تفاحات تانيين، بقى معاك كام تفاحة؟`;
    session.correctAnswer = num1 + num2;
    session.mode = 'question';
    session.failCount = 0;
    session.subject = 'math';
    session.currentOperation = 'addition';
    
    return session.lastQuestion;
}

function generateSubtractionQuestion(session) {
    const num1 = Math.floor(Math.random() * 15) + 5;
    const num2 = Math.floor(Math.random() * 5) + 1;
    
    session.lastQuestion = `🧮 لو معاك ${num1} جنيه 💰، وصرفت ${num2} جنيه، فضل معاك كام جنيه؟`;
    session.correctAnswer = num1 - num2;
    session.mode = 'question';
    session.failCount = 0;
    session.subject = 'math';
    session.currentOperation = 'subtraction';
    
    return session.lastQuestion;
}

function handleNumericAnswer(userMessage, session) {
    const numbers = userMessage.match(/\d+/g);
    if (!numbers) return null;
    
    const userAnswer = parseInt(numbers[0]);
    
    if (session.mode === 'question' && session.correctAnswer !== null) {
        if (userAnswer === session.correctAnswer) {
            session.failCount = 0;
            const newQuestion = generateQuestionByTopic(session);
            return `🔥 أداء قوي يا بطل! ✅ إجابة صح!\n\n${newQuestion}`;
        } else {
            session.failCount++;
            
            if (session.failCount >= 2) {
                session.failCount = 0;
                const newQuestion = generateQuestionByTopic(session);
                return `📝 خلينا نفهمها صح:\n\nالسؤال: ${session.lastQuestion}\nالحل: ${session.correctAnswer}\n\nجهيز للسؤال الجاي؟ 💪\n\n${newQuestion}`;
            }
            
            return `قريب 👀 حاول تاني.\n\n${session.lastQuestion}`;
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
        this.subject = null;
        this.intent = null;
        this.currentOperation = null;
        this.waitingForConfirmation = false;
    }
}

const sessions = new Map();

function getUserSession(chatId) {
    if (!sessions.has(chatId)) {
        sessions.set(chatId, new UserSession());
    }
    return sessions.get(chatId);
}

async function chatWithAI(message, session) {
    try {
        console.log(`🔄 AI explaining: ${session.subject || 'general'}`);
        
        const shortHistory = session.conversationHistory.slice(-6);
        
        const messages = [
            { role: "system", content: TEACHER_SYSTEM_PROMPT },
            { role: "system", content: `الموضوع الحالي: ${session.subject || 'عام'}. اشرح هذا الموضوع فقط.` },
            ...shortHistory,
            { role: "user", content: message }
        ];
        
        const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: MODEL,
                messages: messages,
                temperature: 0.7,
                max_tokens: 500
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
        console.log(`❌ AI failed:`, error.message);
    }
    return null;
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
            <head><title>بوت المدرس الصبور - Hybrid AI</title></head>
            <body style="font-family: Arial; text-align: center; padding: 50px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;">
                <h1>👨‍🏫 بوت المدرس الصبور</h1>
                <p>✅ Hybrid System: Rule-based + AI</p>
                <p>🎯 يدعم: Math - Science - Arabic - English</p>
                <p>💬 وبيعرف يرد على التحيات والمحادثة العامة</p>
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
            
            // استخدام Smart Detection
            const { action, detection, directResponse } = await processWithSmartDetection(textMessage, session);
            
            console.log(`🎯 Action: ${action}, Subject: ${detection?.subject}, Intent: ${detection?.intent}`);
            
            // التعامل مع كل action
            if (action === 'direct' && directResponse) {
                reply = directResponse;
            }
            
            else if (action === 'answer') {
                reply = handleNumericAnswer(textMessage, session);
            }
            
            else if (action === 'explain') {
                const aiReply = await chatWithAI(textMessage, session);
                if (aiReply) {
                    reply = aiReply + "\n\n📌 فهمت كده؟ 👀 تحب نجرب سؤال بسيط؟";
                    session.waitingForConfirmation = true;
                } else {
                    reply = "👨‍🏫 خليني أشرحلك ببساطة. قولي عايز تفهم ايه بالضبط؟";
                }
            }
            
            else if (action === 'practice') {
                if (detection.subject === 'math') {
                    const question = generateQuestionByTopic(session);
                    reply = `🎯 يلا بينا نتدرب!\n\n${question}`;
                } else {
                    reply = `📚 موضوع ${detection.subject} موجود للشرح حالياً، لكن التدريب عليه هيكون قريباً 🔥\n\nجرب تطلب شرح دلوقتي؟`;
                }
            }
            
            else if (action === 'question') {
                const mathMatch = textMessage.match(/(\d+)\s*([\+\-\*x÷])\s*(\d+)/);
                if (mathMatch) {
                    const num1 = parseInt(mathMatch[1]);
                    const op = mathMatch[2];
                    const num2 = parseInt(mathMatch[3]);
                    let result;
                    if (op === '+') {
                        result = num1 + num2;
                    } else if (op === '-') {
                        result = num1 - num2;
                    } else if (op === '*' || op === 'x') {
                        result = num1 * num2;
                    }
                    reply = `📝 ${num1} ${op} ${num2} = ${result}\n\nعايز أشرحلك ازاي جبنا الناتج؟ 👀`;
                } else {
                    reply = "واضح إنك عايز تحل مسألة 👀\nاكتب المسألة واضحة وهساعدك تحلها خطوة خطوة";
                }
            }
            
            else if (action === 'greeting') {
                reply = "🌞 أهلاً بيك يا بطل! أنا مدرسك الصبور. ايه اللي عايز تتعلمه النهاردة؟ 😊";
            }
            
            else {
                // general
                const aiReply = await chatWithAI(textMessage, session);
                if (aiReply) {
                    reply = aiReply;
                } else {
                    reply = "👨‍🏫 أهلاً بيك! قولي عايز تتعلم ايه؟ (رياضيات - علوم - عربي - إنجليزي)\n\nأنا موجود عشان أساعدك تفهم أي مادة 💪";
                    session.hasStarted = true;
                }
            }
            
            if (!reply) {
                reply = "👨‍🏫 قولي عايز تتعلم ايه بالضبط؟";
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
