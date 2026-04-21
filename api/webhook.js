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

مهمتك:
- أنت هنا للشرح فقط
- متسألش أسئلة رياضية بنفسك
- رد على أسئلة الطالب في المواد المختلفة`;

// 1. دالة التحيات
function handleGreeting(message) {
    const msg = message.toLowerCase().trim();
    
    const greetings = ['صباح الخير', 'مساء الخير', 'السلام عليكم', 'اهلا', 'هلا', 'صباح النور', 'مساء النور'];
    const responses = [
        "🌞 صباح النور يا بطل! عامل إيه النهاردة؟ جهيز تذاكر ولا عايز تسأل في حاجة معينة؟",
        "😊 أهلاً بيك يا بطل! النهاردة هنتعلم ايه؟",
        "👋 وعليكم السلام! أنا مدرسك الصبور. ايه اللي عايز تتعلمه النهاردة؟"
    ];
    
    for (const greeting of greetings) {
        if (msg.includes(greeting)) {
            return responses[Math.floor(Math.random() * responses.length)];
        }
    }
    
    if (msg.includes('شكر') || msg.includes('تسلم')) {
        return "العفو يا بطل 🤗";
    }
    
    if (msg.includes('عامل ايه') || msg.includes('ازيك')) {
        return "الحمد لله تمام يا بطل! جهيز نبدأ؟ 💪";
    }
    
    return null;
}

// 2. Smart Detection محسنة - مع Priority
function smartDetect(message, session) {
    const msg = message.toLowerCase().trim();
    
    // أولاً: التحيات
    const greetingResponse = handleGreeting(message);
    if (greetingResponse) {
        return { subject: 'general', intent: 'greeting', response: greetingResponse };
    }
    
    // ثانياً: لو في وضع سؤال وجاوب برقم
    if (/^\d+$/.test(msg) && session.mode === 'question') {
        return { subject: session.subject || 'math', intent: 'answer' };
    }
    
    // ثالثاً: طلب مسألة/سؤال/تدريب (الأهم)
    if (msg.includes('مسألة') || msg.includes('سؤال') || 
        msg.includes('اديني') || msg.includes('تدريب') || 
        msg.includes('اتدرب') || msg.includes('عايز مسألة')) {
        return { subject: session.subject || 'math', intent: 'practice' };
    }
    
    // رابعاً: المسائل الرياضية (5+3)
    if (/\d+\s*[\+\-\*x÷]\s*\d+/.test(msg)) {
        return { subject: 'math', intent: 'question' };
    }
    
    // خامساً: المواد الدراسية
    // Math - مع دعم الأخطاء الإملائية
    if (msg.includes('جمع') || msg.includes('طرح') || msg.includes('طرخ') || 
        msg.includes('ضرب') || msg.includes('قسمة') || msg.includes('زائد') || 
        msg.includes('ناقص') || msg.includes('رياضيات') || msg.includes('حساب')) {
        
        if (msg.includes('اشرح')) return { subject: 'math', intent: 'explain' };
        if (msg.includes('تدرب')) return { subject: 'math', intent: 'practice' };
        return { subject: 'math', intent: 'explain' };
    }
    
    // Science
    if (msg.includes('علوم') || msg.includes('كيمياء') || msg.includes('فيزياء') ||
        msg.includes('h2o') || msg.includes('ماء') || msg.includes('كهرباء')) {
        if (msg.includes('اشرح')) return { subject: 'science', intent: 'explain' };
        return { subject: 'science', intent: 'explain' };
    }
    
    return null;
}

// 3. AI Detection (Fallback)
async function detectWithAI(message) {
    const prompt = `حدد:
1- المادة (math / science / arabic / english / general)
2- نوع الرسالة (explain / practice / question / answer / general)

رجع JSON بس بدون أي كلام تاني

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
        const jsonMatch = content.match(/\{.*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
        
        return { subject: 'general', intent: 'general' };
    } catch (error) {
        return { subject: 'general', intent: 'general' };
    }
}

// 4. Process with Priority System
async function processWithSmartDetection(message, session) {
    // الأول Rule-based
    let detection = smartDetect(message, session);
    
    if (detection && detection.response) {
        return { action: 'direct', detection, directResponse: detection.response };
    }
    
    // لو مش موجود، AI
    if (!detection) {
        detection = await detectWithAI(message);
    }
    
    // حفظ المادة - Context Lock
    if (detection.subject && detection.subject !== 'general') {
        session.subject = detection.subject;
    }
    
    // لو detection ملهاش مادة، خليها من السيشن
    if (!detection.subject || detection.subject === 'general') {
        detection.subject = session.subject || 'math';
    }
    
    console.log(`🎯 Detection: Subject=${detection.subject}, Intent=${detection.intent}`);
    
    // PRIORITY SYSTEM - الترتيب الصح
    // 1. Answer (لو في سؤال شغال)
    if (detection.intent === 'answer' && session.mode === 'question') {
        return { action: 'answer', detection };
    }
    
    // 2. Practice (طلب مسألة/سؤال)
    if (detection.intent === 'practice') {
        return { action: 'practice', detection };
    }
    
    // 3. Question (مسألة رياضية)
    if (detection.intent === 'question') {
        return { action: 'question', detection };
    }
    
    // 4. Explain (شرح)
    if (detection.intent === 'explain') {
        return { action: 'explain', detection };
    }
    
    // 5. Greeting
    if (detection.intent === 'greeting') {
        return { action: 'greeting', detection };
    }
    
    // 6. General - Anti-Confusion Guard
    if (session.subject === 'math' && session.mode === 'question') {
        return { action: 'practice', detection: { subject: 'math', intent: 'practice' } };
    }
    
    return { action: 'general', detection };
}

// توليد الأسئلة
function generateQuestionByTopic(session) {
    if (session.currentOperation === 'subtraction') {
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
        this.currentOperation = 'addition';
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
            return cleanResponse(reply) || reply;
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
            <head><title>بوت المدرس الصبور</title></head>
            <body style="font-family: Arial; text-align: center; padding: 50px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;">
                <h1>👨‍🏫 بوت المدرس الصبور</h1>
                <p>✅ شغال - Priority System</p>
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
            
            const { action, detection, directResponse } = await processWithSmartDetection(textMessage, session);
            
            console.log(`🎯 Action: ${action}`);
            
            if (action === 'direct' && directResponse) {
                reply = directResponse;
            }
            
            else if (action === 'answer') {
                reply = handleNumericAnswer(textMessage, session);
            }
            
            else if (action === 'practice') {
                // مباشرة على طول من غير لف
                const question = generateQuestionByTopic(session);
                reply = `🎯 تمام يا بطل 💪\n\n${question}`;
            }
            
            else if (action === 'question') {
                const mathMatch = textMessage.match(/(\d+)\s*([\+\-\*x÷])\s*(\d+)/);
                if (mathMatch) {
                    const num1 = parseInt(mathMatch[1]);
                    const op = mathMatch[2];
                    const num2 = parseInt(mathMatch[3]);
                    let result;
                    if (op === '+') result = num1 + num2;
                    else if (op === '-') result = num1 - num2;
                    else if (op === '*' || op === 'x') result = num1 * num2;
                    reply = `📝 ${num1} ${op} ${num2} = ${result}`;
                }
            }
            
            else if (action === 'explain') {
                const aiReply = await chatWithAI(textMessage, session);
                if (aiReply) {
                    // بعد الشرح مباشرة سؤال - من غير ما يستنى
                    const question = generateQuestionByTopic(session);
                    reply = aiReply + `\n\n🎯 يلا نجرب سؤال بسيط 👇\n\n${question}`;
                } else {
                    const question = generateQuestionByTopic(session);
                    reply = `🎯 يلا بينا نتدرب!\n\n${question}`;
                }
            }
            
            else if (action === 'greeting') {
                reply = "🌞 أهلاً بيك يا بطل! أنا مدرسك الصبور. ايه اللي عايز تتعلمه النهاردة؟ 😊";
            }
            
            else {
                // Anti-Confusion Guard
                if (session.subject === 'math') {
                    const question = generateQuestionByTopic(session);
                    reply = `🎯 يلا بينا نتدرب!\n\n${question}`;
                } else {
                    reply = "👨‍🏫 قولي عايز تتعلم ايه؟ (رياضيات - علوم - عربي - إنجليزي)";
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
