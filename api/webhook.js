// api/webhook.js
const axios = require('axios');

const INSTANCE_ID = "instance3532";
const WAPILOT_TOKEN = "yzWzEjmxZpbifuOx6lWafYT3Ng69gaFpJGAdTsVc6N";
const WAPILOT_API_URL = "https://api.wapilot.net/api/v2";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

const MODEL = 'google/gemini-2.0-flash-001';

const TEACHER_SYSTEM_PROMPT = `أنت مدرس صبور لطلاب المرحلة الإعدادية.

قواعدك:
1. أنت مساعد، مش أساسي. دورك تشرح المفاهيم فقط.
2. لا تسأل أسئلة بنفسك - النظام هو اللي بيسأل.
3. لو الطالب سأل عن شرح مفهوم، اشرحه ببساطة باللهجة المصرية.
4. ممنوع تعمل reset أو تقول "اسألني في أي مادة".

أنت هنا للمساعدة في الشرح فقط، مش لإدارة الأسئلة.`;

// 1. أهم دالة - توليد سؤال جمع
function generateAdditionQuestion(session) {
    const num1 = Math.floor(Math.random() * 10) + 1;
    const num2 = Math.floor(Math.random() * 10) + 1;
    
    session.lastQuestion = `🍎 لو معاك ${num1} تفاحات، وجبتلك ${num2} تفاحات تانيين، بقى معاك كام تفاحة؟`;
    session.correctAnswer = num1 + num2;
    session.mode = 'question';
    session.failCount = 0;
    
    console.log(`📝 Generated question: ${num1} + ${num2} = ${session.correctAnswer}`);
    
    return session.lastQuestion;
}

// دالة توليد سؤال طرح
function generateSubtractionQuestion(session) {
    const num1 = Math.floor(Math.random() * 15) + 5;
    const num2 = Math.floor(Math.random() * 5) + 1;
    
    session.lastQuestion = `🍎 لو معاك ${num1} تفاحة، وأكلت ${num2} تفاحات، فضل معاك كام تفاحة؟`;
    session.correctAnswer = num1 - num2;
    session.mode = 'question';
    session.failCount = 0;
    
    console.log(`📝 Generated question: ${num1} - ${num2} = ${session.correctAnswer}`);
    
    return session.lastQuestion;
}

// 2. معالجة الإجابة الرقمية
function handleNumericAnswer(userMessage, session) {
    const numbers = userMessage.match(/\d+/g);
    if (!numbers) return null;
    
    const userAnswer = parseInt(numbers[0]);
    
    if (session.mode === 'question' && session.correctAnswer !== null) {
        if (userAnswer === session.correctAnswer) {
            // إجابة صحيحة
            session.failCount = 0;
            
            // نولّد سؤال جديد
            const newQuestion = generateAdditionQuestion(session);
            
            return `🔥 أداء قوي يا بطل! ✅ إجابة صح!\n\n${newQuestion}`;
        } else {
            // إجابة غلط
            session.failCount++;
            
            if (session.failCount >= 2) {
                // بعد محاولتين فاشلتين، نشرح الحل
                session.failCount = 0;
                const explanation = `📝 خلينا نفهمها صح:\n\nالسؤال: ${session.lastQuestion}\nالحل: ${session.correctAnswer}\n\nجهيز للسؤال الجاي؟ 💪\n\n${generateAdditionQuestion(session)}`;
                return explanation;
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
        console.log(`🔄 AI helper mode, Topic: ${session.currentTopic}`);
        
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

function getFallbackReply(message, session) {
    const msg = message.toLowerCase().trim();
    
    // منرجعش للبداية أبداً
    if (session.hasStarted && session.lastQuestion) {
        return `😅 معلش حصل لخبطة بسيطة... كنا في السؤال ده:\n\n${session.lastQuestion}`;
    }
    
    if (session.hasStarted) {
        return `😅 معلش حصل لخبطة بسيطة... قولي عايز تتعلم ايه بالضبط؟`;
    }
    
    // أول مرة بس
    session.hasStarted = true;
    return `👨‍🏫 مرحباً بيك! أنا مدرسك الصبور.\n\nقولي عايز تتعلم ايه؟ (جمع - طرح - ضرب - قسمة)`;
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
                <p>✅ شغال - نظام الأسئلة متكامل</p>
                <p>🎯 جرب تسأل: "اشرحلي الجمع"</p>
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
            
            // 3. الأول نتحقق من الرقم (إجابة على سؤال)
            const numericMatch = textMessage.match(/^\d+$/);
            if (numericMatch && session.mode === 'question') {
                reply = handleNumericAnswer(textMessage, session);
            }
            
            // لو مفيش رد، نشوف لو طلب شرح مادة
            if (!reply) {
                if (textMessage.includes('جمع') || textMessage.includes('الجمع')) {
                    session.currentTopic = 'addition';
                    const firstQuestion = generateAdditionQuestion(session);
                    reply = `👨‍🏫 الجمع ببساطة هو إضافة الأرقام لبعضها.\n\n${firstQuestion}`;
                }
                else if (textMessage.includes('طرح') || textMessage.includes('الطرح')) {
                    session.currentTopic = 'subtraction';
                    const firstQuestion = generateSubtractionQuestion(session);
                    reply = `👨‍🏫 الطرح هو إنك تاخد حاجة من حاجة تانية.\n\n${firstQuestion}`;
                }
                else if (textMessage.includes('انت مين')) {
                    reply = "👨‍🏫 أنا مدرسك الصبور. قولي عايز تتعلم ايه؟";
                }
                else if (textMessage.includes('شكرا')) {
                    reply = "العفو يا بطل 🤗";
                }
                else {
                    // لأي سؤال تاني، نخلي الـ AI يشرح
                    if (OPENROUTER_API_KEY) {
                        try {
                            const aiReply = await chatWithAI(textMessage, session);
                            if (aiReply) {
                                reply = aiReply;
                            }
                        } catch (error) {
                            console.error('AI Error:', error);
                        }
                    }
                    
                    if (!reply) {
                        if (session.hasStarted && session.lastQuestion) {
                            reply = `😅 كنا في السؤال ده:\n\n${session.lastQuestion}`;
                        } else {
                            reply = "قولي عايز تتعلم ايه؟ (جمع - طرح)";
                        }
                    }
                }
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
            const session = getUserSession(chatId);
            await sendWAPilotMessage(chatId, "أهلاً بيك! قولي عايز تتعلم ايه؟ 💪");
        }
        
        return res.status(200).json({ ok: true });
    }
    
    res.status(404).send('Not Found');
};
