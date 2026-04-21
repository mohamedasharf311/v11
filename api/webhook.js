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

// رسائل تحفيزية عشوائية
const motivationalMessages = [
    "🔥 يلا بينا نكسر الدنيا!",
    "💪 جاهز يا بطل؟",
    "👀 ركّز معايا كده",
    "🚀 نبدأ التحدي؟",
    "🎯 تمام يا بطل",
    "✨ يلا بينا"
];

function getMotivationalMessage() {
    return motivationalMessages[Math.floor(Math.random() * motivationalMessages.length)];
}

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
    
    if (msg.includes('اهلا') || msg.includes('هلا') || msg.includes('مرحبا')) {
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

// 2. توليد أسئلة لكل مادة
function generateScienceQuestion() {
    const questions = [
        "🌍 ايه هو الكوكب اللي بنعيش عليه؟ (الأرض - المريخ - الزهرة)",
        "💧 رمز الماء H2O، H2O دي بتتكون من ايه؟ (هيدروجين وأكسجين - هيدروجين ونيتروجين - أكسجين وكربون)",
        "🌞 ايه مصدر الضوء والحرارة الأساسي على الأرض؟ (القمر - الشمس - النجوم)",
        "🌿 ايه العملية اللي النباتات بتعملها عشان تصنع غذائها؟ (النتح - البناء الضوئي - التنفس)"
    ];
    return questions[Math.floor(Math.random() * questions.length)];
}

function generateArabicQuestion() {
    const questions = [
        "📚 اعرب كلمة (الولد) في جملة: ذهب الولد إلى المدرسة",
        "📖 ما هو جمع كلمة 'كتاب'؟ (كتب - كتابات - كتيب)",
        "✍️ ايه هو ضد كلمة 'طويل'؟ (قصير - عريض - كبير)",
        "📝 في جملة 'أكل الولد التفاحة'، الفاعل هو؟ (أكل - الولد - التفاحة)"
    ];
    return questions[Math.floor(Math.random() * questions.length)];
}

function generateEnglishQuestion() {
    const questions = [
        "🇬🇧 What is the past tense of 'go'? (went - gone - going)",
        "🇬🇧 What is the opposite of 'big'? (small - large - huge)",
        "🇬🇧 Complete: I ___ a student. (am - is - are)",
        "🇬🇧 What does 'Hello' mean in Arabic? (مرحبا - وداعا - شكرا)"
    ];
    return questions[Math.floor(Math.random() * questions.length)];
}

// 3. توليد أسئلة رياضيات حسب المستوى
function generateAdditionQuestion(session) {
    const max = Math.min(session.level * 5, 50);
    const num1 = Math.floor(Math.random() * max) + 1;
    const num2 = Math.floor(Math.random() * max) + 1;
    
    session.lastQuestion = `🧮 ${num1} + ${num2} = كام؟`;
    session.correctAnswer = num1 + num2;
    session.mode = 'question';
    session.failCount = 0;
    session.subject = 'math';
    session.currentOperation = 'addition';
    
    return session.lastQuestion;
}

function generateSubtractionQuestion(session) {
    const max = Math.min(session.level * 5, 50);
    const num1 = Math.floor(Math.random() * max) + 10;
    const num2 = Math.floor(Math.random() * (num1 - 1)) + 1;
    
    session.lastQuestion = `🧮 ${num1} - ${num2} = كام؟`;
    session.correctAnswer = num1 - num2;
    session.mode = 'question';
    session.failCount = 0;
    session.subject = 'math';
    session.currentOperation = 'subtraction';
    
    return session.lastQuestion;
}

function generateMultiplicationQuestion(session) {
    const max = Math.min(session.level * 3, 10);
    const num1 = Math.floor(Math.random() * max) + 1;
    const num2 = Math.floor(Math.random() * max) + 1;
    
    session.lastQuestion = `🧮 ${num1} × ${num2} = كام؟`;
    session.correctAnswer = num1 * num2;
    session.mode = 'question';
    session.failCount = 0;
    session.subject = 'math';
    session.currentOperation = 'multiplication';
    
    return session.lastQuestion;
}

function generateDivisionQuestion(session) {
    const max = Math.min(session.level * 3, 10);
    const num2 = Math.floor(Math.random() * max) + 1;
    const result = Math.floor(Math.random() * max) + 1;
    const num1 = num2 * result;
    
    session.lastQuestion = `🧮 ${num1} ÷ ${num2} = كام؟`;
    session.correctAnswer = result;
    session.mode = 'question';
    session.failCount = 0;
    session.subject = 'math';
    session.currentOperation = 'division';
    
    return session.lastQuestion;
}

function generateQuestionByTopic(session) {
    if (session.subject === 'science') {
        return generateScienceQuestion();
    }
    if (session.subject === 'arabic') {
        return generateArabicQuestion();
    }
    if (session.subject === 'english') {
        return generateEnglishQuestion();
    }
    // math
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

// 4. Smart Detection محسنة
function smartDetect(message, session) {
    const msg = message.toLowerCase().trim();
    
    // أولاً: التحيات
    const greetingResponse = handleGreeting(message);
    if (greetingResponse) {
        return { subject: 'general', intent: 'greeting', response: greetingResponse };
    }
    
    // ثانياً: طلب مسألة/سؤال/تدريب
    if (msg.includes('مسألة') || msg.includes('سؤال') || 
        msg.includes('اديني') || msg.includes('هات') ||
        msg.includes('عايز سؤال') || msg.includes('عايز مسألة') ||
        msg.includes('تدريب') || msg.includes('اتدرب')) {
        return { subject: session.subject || 'math', intent: 'practice' };
    }
    
    // ثالثاً: كشف المواد (لغير الرياضيات)
    if (msg.includes('علوم') || msg.includes('h2o') || msg.includes('ماء') || 
        msg.includes('كيمياء') || msg.includes('فيزياء') || msg.includes('كوكب')) {
        session.subject = 'science';
        if (msg.includes('اشرح')) return { subject: 'science', intent: 'explain' };
        return { subject: 'science', intent: 'practice' };
    }
    
    if (msg.includes('عربي') || msg.includes('نحو') || msg.includes('اعراب')) {
        session.subject = 'arabic';
        if (msg.includes('اشرح')) return { subject: 'arabic', intent: 'explain' };
        return { subject: 'arabic', intent: 'practice' };
    }
    
    if (msg.includes('انجليزي') || msg.includes('english')) {
        session.subject = 'english';
        if (msg.includes('اشرح')) return { subject: 'english', intent: 'explain' };
        return { subject: 'english', intent: 'practice' };
    }
    
    // رابعاً: الرياضيات
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
    
    if (msg.includes('رياضيات') || msg.includes('حساب')) {
        session.subject = 'math';
        return { subject: 'math', intent: 'practice' };
    }
    
    // خامساً: لو في وضع سؤال وجاوب برقم
    if (/^\d+$/.test(msg) && session.mode === 'question') {
        return { subject: session.subject || 'math', intent: 'answer' };
    }
    
    // سادساً: طلب شرح عام
    if (msg.includes('اشرح') || msg.includes('شرح')) {
        return { subject: session.subject || 'math', intent: 'explain' };
    }
    
    return null;
}

// 5. AI Detection (للأسئلة المعقدة فقط)
async function detectWithAI(message) {
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

// 6. Process with Smart Exit
async function processWithSmartDetection(message, session) {
    let detection = smartDetect(message, session);
    
    if (detection && detection.response) {
        return { action: 'direct', detection, directResponse: detection.response };
    }
    
    if (!detection && message.length > 10) {
        const aiDetection = await detectWithAI(message);
        if (aiDetection && aiDetection.subject !== 'general') {
            session.subject = aiDetection.subject;
            detection = { subject: aiDetection.subject, intent: 'explain' };
        }
    }
    
    if (!detection) {
        detection = { subject: session.subject || 'math', intent: 'general' };
    }
    
    // حفظ العملية
    if (detection.operation) {
        session.currentOperation = detection.operation;
    }
    
    // حفظ المادة
    if (detection.subject && detection.subject !== 'general') {
        session.subject = detection.subject;
    }
    
    console.log(`🎯 Detection: Subject=${session.subject}, Intent=${detection.intent}, Mode=${session.mode}`);
    
    // SMART EXIT FROM MODE - أهم حاجة
    // لو المستخدم غير الموضوع، نخرج من وضع السؤال
    if (detection.subject !== session.subject && session.mode === 'question') {
        session.mode = 'learning';
        session.lastQuestion = null;
        session.correctAnswer = null;
        console.log(`🔓 Smart exit: Changed subject from math to ${detection.subject}`);
    }
    
    // لو طلب حاجة غير الإجابة أثناء وضع السؤال
    if (session.mode === 'question' && detection.intent !== 'answer') {
        if (detection.subject !== 'math' || detection.intent === 'explain') {
            session.mode = 'learning';
            session.lastQuestion = null;
            session.correctAnswer = null;
            console.log(`🔓 Smart exit: User requested ${detection.intent} during question mode`);
        }
    }
    
    // Priority System
    if (detection.intent === 'answer' && session.mode === 'question') {
        return { action: 'answer', detection };
    }
    
    if (detection.intent === 'practice') {
        return { action: 'practice', detection };
    }
    
    if (detection.intent === 'explain') {
        return { action: 'explain', detection };
    }
    
    if (detection.intent === 'greeting') {
        return { action: 'greeting', detection };
    }
    
    return { action: 'general', detection };
}

function handleNumericAnswer(userMessage, session) {
    const numbers = userMessage.match(/\d+/g);
    if (!numbers) return null;
    
    const userAnswer = parseInt(numbers[0]);
    
    if (session.mode === 'question' && session.correctAnswer !== null) {
        if (userAnswer === session.correctAnswer) {
            // إجابة صحيحة - نزود المستوى
            session.level = Math.min(session.level + 1, 10);
            session.failCount = 0;
            const newQuestion = generateQuestionByTopic(session);
            return `🔥 أداء قوي يا بطل! ✅ إجابة صح!\n📈 مستواك بقى ${session.level}\n\n${getMotivationalMessage()}\n${newQuestion}`;
        } else {
            session.failCount++;
            
            if (session.failCount >= 2) {
                session.failCount = 0;
                const newQuestion = generateQuestionByTopic(session);
                return `📝 خلينا نفهمها صح:\n\nالسؤال: ${session.lastQuestion}\nالحل: ${session.correctAnswer}\n\nجهيز للسؤال الجاي؟ 💪\n\n${getMotivationalMessage()}\n${newQuestion}`;
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

async function chatWithAI(message, session) {
    try {
        const shortHistory = session.conversationHistory.slice(-4);
        
        const messages = [
            { role: "system", content: TEACHER_SYSTEM_PROMPT },
            { role: "system", content: `اشرح موضوع: ${session.subject || 'الرياضيات'}. اشرح فقط، متسألش أسئلة.` },
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
                <p>✅ شغال - يدعم: رياضيات، علوم، عربي، إنجليزي</p>
                <p>📈 نظام مستويات - كل إجابة صح تزود مستواك</p>
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
            
            console.log(`🎯 Action: ${action}, Subject: ${session.subject}`);
            
            if (action === 'direct' && directResponse) {
                reply = directResponse;
            }
            
            else if (action === 'answer') {
                reply = handleNumericAnswer(textMessage, session);
                if (!reply && session.lastQuestion) {
                    reply = `🎯 ركّز معايا 👀\n\n${session.lastQuestion}`;
                }
            }
            
            else if (action === 'practice') {
                const question = generateQuestionByTopic(session);
                reply = `${getMotivationalMessage()}\n${question}`;
            }
            
            else if (action === 'explain') {
                const aiReply = await chatWithAI(textMessage, session);
                if (aiReply) {
                    // بعد الشرح، نسأل لو عايز يتدرب
                    reply = aiReply + `\n\n🔥 فهمت كده؟ لو عايز تتدرب، قولي "اديني سؤال"`;
                } else {
                    reply = `👨‍🏫 خليني أشرحلك ببساطة. قولي عايز تفهم ايه بالضبط؟`;
                }
            }
            
            else if (action === 'greeting') {
                reply = directResponse || "😊 أهلاً بيك يا بطل! قولي عايز تتعلم ايه؟";
            }
            
            else {
                // general - رد عادي
                const aiReply = await chatWithAI(textMessage, session);
                if (aiReply) {
                    reply = aiReply;
                } else {
                    reply = `👨‍🏫 قولي عايز تتعلم ايه؟ (رياضيات - علوم - عربي - إنجليزي)\nأو اكتب "اديني سؤال" عشان نبدأ تدريب`;
                    session.hasStarted = true;
                }
            }
            
            if (!reply) {
                reply = `${getMotivationalMessage()}\n${generateQuestionByTopic(session)}`;
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
