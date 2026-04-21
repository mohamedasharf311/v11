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
    
    if (msg.includes('مساء الخير')) {
        return "🌙 مساء النور يا بطل! عامل إيه النهاردة؟ جهيز تذاكر ولا عايز تسأل في حاجة معينة؟";
    }
    
    if (msg.includes('صباح الخير')) {
        return "🌞 صباح النور يا بطل! عامل إيه النهاردة؟ جهيز تذاكر ولا عايز تسأل في حاجة معينة؟";
    }
    
    if (msg.includes('السلام عليكم')) {
        return "👋 وعليكم السلام! أنا مدرسك الصبور. ايه اللي عايز تتعلمه النهاردة؟";
    }
    
    if (msg.includes('اهلا') || msg.includes('هلا')) {
        return "😊 أهلاً بيك يا بطل! النهاردة هنتعلم ايه؟";
    }
    
    if (msg.includes('شكر') || msg.includes('تسلم')) {
        return "العفو يا بطل 🤗";
    }
    
    if (msg.includes('عامل ايه') || msg.includes('ازيك')) {
        return "الحمد لله تمام يا بطل! جهيز نبدأ؟ 💪";
    }
    
    return null;
}

// 2. Smart Detection محسنة - مع Priority للـ Practice
function smartDetect(message, session) {
    const msg = message.toLowerCase().trim();
    
    // أولاً: التحيات
    const greetingResponse = handleGreeting(message);
    if (greetingResponse) {
        return { subject: 'general', intent: 'greeting', response: greetingResponse };
    }
    
    // ثانياً: طلب مسألة/سؤال/تدريب (الأهم - DEAD FIRST)
    if (msg.startsWith('اديني') || 
        msg.includes('اديني سؤال') ||
        msg.includes('اديني مسأله') ||
        msg.includes('اديني مسألة') ||
        msg.includes('عايز سؤال') ||
        msg.includes('عايز مسألة') ||
        msg.includes('سؤال') && msg.length < 15 ||
        msg.includes('مسألة') && msg.length < 15 ||
        msg.includes('اتدرب') ||
        msg.includes('تدرب')) {
        console.log(`🔍 Practice detected: ${msg}`);
        return { subject: session.subject || 'math', intent: 'practice' };
    }
    
    // ثالثاً: كشف العملية (جمع/طرح/ضرب/قسمة)
    if (msg.includes('جمع')) {
        session.currentOperation = 'addition';
        if (msg.includes('اشرح')) return { subject: 'math', intent: 'explain', operation: 'addition' };
        return { subject: 'math', intent: 'practice', operation: 'addition' };
    }
    
    if (msg.includes('طرح') || msg.includes('طرخ')) {
        session.currentOperation = 'subtraction';
        if (msg.includes('اشرح')) return { subject: 'math', intent: 'explain', operation: 'subtraction' };
        return { subject: 'math', intent: 'practice', operation: 'subtraction' };
    }
    
    if (msg.includes('ضرب')) {
        session.currentOperation = 'multiplication';
        if (msg.includes('اشرح')) return { subject: 'math', intent: 'explain', operation: 'multiplication' };
        return { subject: 'math', intent: 'practice', operation: 'multiplication' };
    }
    
    if (msg.includes('قسمة') || msg.includes('قسمه')) {
        session.currentOperation = 'division';
        if (msg.includes('اشرح')) return { subject: 'math', intent: 'explain', operation: 'division' };
        return { subject: 'math', intent: 'practice', operation: 'division' };
    }
    
    // رابعاً: لو في وضع سؤال وجاوب برقم
    if (/^\d+$/.test(msg) && session.mode === 'question') {
        return { subject: session.subject || 'math', intent: 'answer' };
    }
    
    // خامساً: المسائل الرياضية (5+3)
    if (/\d+\s*[\+\-\*x÷]\s*\d+/.test(msg)) {
        return { subject: 'math', intent: 'question' };
    }
    
    // سادساً: مواد أخرى
    if (msg.includes('رياضيات') || msg.includes('حساب')) {
        session.subject = 'math';
        return { subject: 'math', intent: 'practice' };
    }
    
    if (msg.includes('علوم') || msg.includes('كيمياء') || msg.includes('فيزياء')) {
        if (msg.includes('اشرح')) return { subject: 'science', intent: 'explain' };
        return { subject: 'science', intent: 'explain' };
    }
    
    return null;
}

// 3. AI Detection (للمواد التانية بس)
async function detectWithAI(message) {
    // للرسائل القصيرة، بلاش AI
    if (message.length < 5) return null;
    
    const prompt = `حدد المادة فقط (science / arabic / english / general)
رجع JSON بس

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
        
        return null;
    } catch (error) {
        return null;
    }
}

// 4. Process with Priority System
async function processWithSmartDetection(message, session) {
    // الأول Rule-based
    let detection = smartDetect(message, session);
    
    if (detection && detection.response) {
        return { action: 'direct', detection, directResponse: detection.response };
    }
    
    // لو مش موجود، AI بس للرسائل الطويلة
    if (!detection && message.length > 10) {
        const aiDetection = await detectWithAI(message);
        if (aiDetection && aiDetection.subject !== 'general') {
            detection = aiDetection;
            detection.intent = 'explain';
        }
    }
    
    if (!detection) {
        detection = { subject: session.subject || 'math', intent: 'practice' };
    }
    
    // حفظ المادة والعملية
    if (detection.subject && detection.subject !== 'general') {
        session.subject = detection.subject;
    }
    
    if (detection.operation) {
        session.currentOperation = detection.operation;
    }
    
    console.log(`🎯 Detection: Subject=${detection.subject}, Intent=${detection.intent}, Operation=${session.currentOperation}`);
    
    // PRIORITY SYSTEM
    if (detection.intent === 'answer' && session.mode === 'question') {
        return { action: 'answer', detection };
    }
    
    if (detection.intent === 'practice') {
        return { action: 'practice', detection };
    }
    
    if (detection.intent === 'question') {
        return { action: 'question', detection };
    }
    
    if (detection.intent === 'explain') {
        return { action: 'explain', detection };
    }
    
    if (detection.intent === 'greeting') {
        return { action: 'greeting', detection };
    }
    
    return { action: 'practice', detection: { subject: session.subject || 'math', intent: 'practice' } };
}

// 5. توليد الأسئلة حسب العملية
function generateQuestionByTopic(session) {
    console.log(`🎲 Generating question for operation: ${session.currentOperation}`);
    
    switch (session.currentOperation) {
        case 'subtraction':
            return generateSubtractionQuestion(session);
        case 'multiplication':
            return generateMultiplicationQuestion(session);
        case 'division':
            return generateDivisionQuestion(session);
        default:
            return generateAdditionQuestion(session);
    }
}

function generateAdditionQuestion(session) {
    const num1 = Math.floor(Math.random() * 10) + 1;
    const num2 = Math.floor(Math.random() * 10) + 1;
    
    session.lastQuestion = `🧮 ${num1} + ${num2} = كام؟`;
    session.correctAnswer = num1 + num2;
    session.mode = 'question';
    session.failCount = 0;
    session.subject = 'math';
    session.currentOperation = 'addition';
    
    return session.lastQuestion;
}

function generateSubtractionQuestion(session) {
    const num1 = Math.floor(Math.random() * 15) + 10;
    const num2 = Math.floor(Math.random() * 5) + 1;
    
    session.lastQuestion = `🧮 ${num1} - ${num2} = كام؟`;
    session.correctAnswer = num1 - num2;
    session.mode = 'question';
    session.failCount = 0;
    session.subject = 'math';
    session.currentOperation = 'subtraction';
    
    return session.lastQuestion;
}

function generateMultiplicationQuestion(session) {
    const num1 = Math.floor(Math.random() * 5) + 1;
    const num2 = Math.floor(Math.random() * 5) + 1;
    
    session.lastQuestion = `🧮 ${num1} × ${num2} = كام؟`;
    session.correctAnswer = num1 * num2;
    session.mode = 'question';
    session.failCount = 0;
    session.subject = 'math';
    session.currentOperation = 'multiplication';
    
    return session.lastQuestion;
}

function generateDivisionQuestion(session) {
    const num2 = Math.floor(Math.random() * 5) + 1;
    const result = Math.floor(Math.random() * 5) + 1;
    const num1 = num2 * result;
    
    session.lastQuestion = `🧮 ${num1} ÷ ${num2} = كام؟`;
    session.correctAnswer = result;
    session.mode = 'question';
    session.failCount = 0;
    session.subject = 'math';
    session.currentOperation = 'division';
    
    return session.lastQuestion;
}

// 6. معالجة الإجابات
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
        const shortHistory = session.conversationHistory.slice(-4);
        
        const messages = [
            { role: "system", content: TEACHER_SYSTEM_PROMPT },
            { role: "system", content: `اشرح موضوع: ${session.subject || 'الرياضيات'}. العملية: ${session.currentOperation || 'عام'}. اشرح فقط.` },
            ...shortHistory,
            { role: "user", content: message }
        ];
        
        const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: MODEL,
                messages: messages,
                temperature: 0.7,
                max_tokens: 400
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
                <p>✅ شغال - العمليات: جمع، طرح، ضرب، قسمة</p>
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
                if (!reply) {
                    reply = `🎯 ركّز معايا 👀\n\n${session.lastQuestion || generateQuestionByTopic(session)}`;
                }
            }
            
            else if (action === 'practice') {
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
                    else if (op === '÷') result = num1 / num2;
                    reply = `📝 ${num1} ${op} ${num2} = ${result}`;
                }
            }
            
            else if (action === 'explain') {
                const aiReply = await chatWithAI(textMessage, session);
                if (aiReply) {
                    const question = generateQuestionByTopic(session);
                    reply = aiReply + `\n\n🔥 ركّز بقى 👇\n${question}`;
                } else {
                    const question = generateQuestionByTopic(session);
                    reply = `🎯 يلا بينا نتدرب!\n\n${question}`;
                }
            }
            
            else if (action === 'greeting') {
                reply = "🌞 أهلاً بيك يا بطل! أنا مدرسك الصبور. ايه اللي عايز تتعلمه النهاردة؟ 😊";
            }
            
            else {
                const question = generateQuestionByTopic(session);
                reply = `🎯 يلا بينا نتدرب!\n\n${question}`;
            }
            
            if (!reply) {
                reply = generateQuestionByTopic(session);
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
