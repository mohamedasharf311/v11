// api/webhook.js
const axios = require('axios');

const INSTANCE_ID = "instance3532";
const WAPILOT_TOKEN = "yzWzEjmxZpbifuOx6lWafYT3Ng69gaFpJGAdTsVc6N";
const WAPILOT_API_URL = "https://api.wapilot.net/api/v2";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

const MODEL = 'google/gemini-2.0-flash-001';

// 9. الـ Prompt الجديد - مدرس حقيقي مش ChatGPT
const TEACHER_SYSTEM_PROMPT = `أنت مدرس صبور لطلاب المرحلة الإعدادية.

أسلوبك:
- اشرح ببساطة شديدة باللهجة المصرية
- لو الطالب قال "اشرح براحة" → استخدم مثال بسيط جداً
- اسأل الطالب "فهمت؟" أو "تحب نجرب سؤال؟"
- لا تنتقل لسؤال جديد إلا بعد تأكيد الفهم

مهمتك:
- أنت هنا للشرح فقط، مش لإدارة الأسئلة
- النظام هو اللي هيسأل الأسئلة ويصحح الإجابات
- لو الطالب وافق على سؤال، قوله "تمام، استنى السؤال من النظام"

ممنوع:
- تسأل أسئلة رياضية بنفسك
- تقول "اسألني في أي مادة"
- تعمل reset في نص المحادثة`;

// 1. Intent Detection
function detectIntent(message) {
    const msg = message.toLowerCase();
    
    if (msg.includes('اشرح') || msg.includes('شرح')) return 'explain';
    if (msg.match(/^\d+$/)) return 'answer';
    if (msg.includes('سؤال') || msg.includes('مسألة') || msg.includes('تحدي')) return 'practice';
    if (msg.includes('فهمت') || msg.includes('ايوه') || msg.includes('اه') || msg.includes('تمام')) return 'confirm';
    
    return 'general';
}

// 2. Topic Detection
function detectTopic(message) {
    const msg = message.toLowerCase();
    
    if (msg.includes('جمع')) return 'addition';
    if (msg.includes('طرح')) return 'subtraction';
    if (msg.includes('ضرب')) return 'multiplication';
    if (msg.includes('قسم')) return 'division';
    if (msg.includes('انجليزي') || msg.includes('english')) return 'english';
    if (msg.includes('علوم') || msg.includes('science')) return 'science';
    if (msg.includes('عربي')) return 'arabic';
    
    return null;
}

// توليد أسئلة حسب المادة
function generateQuestionByTopic(session) {
    if (session.currentTopic === 'addition') {
        return generateAdditionQuestion(session);
    } else if (session.currentTopic === 'subtraction') {
        return generateSubtractionQuestion(session);
    } else if (session.currentTopic === 'multiplication') {
        return generateMultiplicationQuestion(session);
    } else {
        return generateAdditionQuestion(session);
    }
}

function generateAdditionQuestion(session) {
    const num1 = Math.floor(Math.random() * 10) + 1;
    const num2 = Math.floor(Math.random() * 10) + 1;
    
    session.lastQuestion = `🧮 لو معاك ${num1} تفاحات 🍎، وجبتلك ${num2} تفاحات تانيين، بقى معاك كام تفاحة؟`;
    session.correctAnswer = num1 + num2;
    session.mode = 'question';
    session.failCount = 0;
    
    return session.lastQuestion;
}

function generateSubtractionQuestion(session) {
    const num1 = Math.floor(Math.random() * 15) + 5;
    const num2 = Math.floor(Math.random() * 5) + 1;
    
    session.lastQuestion = `🧮 لو معاك ${num1} جنيه 💰، وصرفت ${num2} جنيه، فضل معاك كام جنيه؟`;
    session.correctAnswer = num1 - num2;
    session.mode = 'question';
    session.failCount = 0;
    
    return session.lastQuestion;
}

function generateMultiplicationQuestion(session) {
    const num1 = Math.floor(Math.random() * 5) + 1;
    const num2 = Math.floor(Math.random() * 5) + 1;
    
    session.lastQuestion = `🧮 لو معاك ${num1} كيس، وفي كل كيس ${num2} تفاحات، يبقى معاك كام تفاحة؟`;
    session.correctAnswer = num1 * num2;
    session.mode = 'question';
    session.failCount = 0;
    
    return session.lastQuestion;
}

// 4. معالجة الإجابات الرقمية
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
        this.currentTopic = null;
        this.intent = null;
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
        console.log(`🔄 AI explaining: ${session.currentTopic}`);
        
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
            <head><title>بوت المدرس الصبور</title></head>
            <body style="font-family: Arial; text-align: center; padding: 50px; background: #1a1a2e; color: white;">
                <h1>👨‍🏫 بوت المدرس الصبور</h1>
                <p>✅ شغال - نظام تصنيف ذكي</p>
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
            
            // 1. اكتشاف النية
            session.intent = detectIntent(textMessage);
            
            // 2. اكتشاف المادة (تحافظ على المادة السابقة لو مش متغيرة)
            const newTopic = detectTopic(textMessage);
            if (newTopic) {
                session.currentTopic = newTopic;
            }
            
            console.log(`🎯 Intent: ${session.intent}, Topic: ${session.currentTopic}`);
            
            // 4. Routing - أهم نقطة
            if (session.intent === 'answer') {
                reply = handleNumericAnswer(textMessage, session);
            }
            
            else if (session.intent === 'explain') {
                session.mode = 'explain';
                const aiReply = await chatWithAI(textMessage, session);
                if (aiReply) {
                    reply = aiReply + "\n\n📌 فهمت كده؟ 👀 تحب نجرب سؤال بسيط؟";
                    session.waitingForConfirmation = true;
                } else {
                    reply = "👨‍🏫 خليني أشرحلك ببساطة. قولي عايز تفهم ايه بالضبط؟";
                }
            }
            
            else if (session.intent === 'confirm') {
                if (session.waitingForConfirmation || textMessage.includes('ايوه') || textMessage.includes('اه')) {
                    if (session.currentTopic) {
                        const question = generateQuestionByTopic(session);
                        reply = `🎯 تمام! جهيز للسؤال؟\n\n${question}`;
                        session.waitingForConfirmation = false;
                    } else {
                        reply = "قولي عايز تتدرب على ايه؟ (جمع - طرح - ضرب)";
                    }
                } else {
                    reply = "تمام، قولي عايز تتعلم ايه بالضبط؟";
                }
            }
            
            else if (session.intent === 'practice') {
                if (session.currentTopic) {
                    const question = generateQuestionByTopic(session);
                    reply = `🎯 يلا بينا!\n\n${question}`;
                } else {
                    reply = "قولي عايز تتدرب على ايه؟ (جمع - طرح - ضرب)";
                }
            }
            
            else {
                // general - أي كلام تاني
                const aiReply = await chatWithAI(textMessage, session);
                if (aiReply) {
                    reply = aiReply;
                } else {
                    if (session.hasStarted && session.lastQuestion) {
                        reply = `كنا في السؤال ده:\n\n${session.lastQuestion}`;
                    } else {
                        reply = "👨‍🏫 أهلاً بيك! قولي عايز تتعلم ايه؟ (جمع - طرح - ضرب)";
                        session.hasStarted = true;
                    }
                }
            }
            
            if (!reply) {
                reply = "👨‍🏫 قولي عايز تتعلم ايه بالضبط؟";
            }
            
            await sendWAPilotMessage(chatId, reply);
            
            // تحديث الـ history
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
