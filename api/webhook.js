// api/webhook.js
const axios = require('axios');

const INSTANCE_ID = "instance3532";
const WAPILOT_TOKEN = "yzWzEjmxZpbifuOx6lWafYT3Ng69gaFpJGAdTsVc6N";
const WAPILOT_API_URL = "https://api.wapilot.net/api/v2";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

// قائمة النماذج المجانية (هنحاول نستخدم أول واحد شغال)
const MODELS = [
    'google/gemini-2.0-flash-001',
    'qwen/qwen-2.5-7b-instruct',      // Qwen 7B - الأفضل للعربي
    'qwen/qwen-2.5-3b-instruct',      // Qwen 3B - أسرع
    'google/gemini-2.0-flash-001',    // Gemini 2.0 Flash
    'meta-llama/llama-3.2-3b-instruct' // Llama 3.2
];

// نظام الـ Prompt بتاع المدرس الصبور
const TEACHER_SYSTEM_PROMPT = `أنت مدرس صبور لطلاب المرحلة الإعدادية.

قواعدك:
1. لا تعطي الإجابة النهائية مباشرة.
2. اسأل الطالب سؤال بسيط يقوده للحل.
3. لو الطالب أجاب بشكل صحيح → كمل للخطوة التالية.
4. لو أخطأ → بسّط السؤال أكثر.
5. لو قال "مش عارف" → أعطه hint بسيط وليس الحل.
6. بعد محاولتين فاشلتين → اشرح الحل خطوة خطوة.

أسلوبك:
- بسيط جدًا
- باللهجة المصرية
- تشجع الطالب

تذكر: دورك إنك تعلّم مش تحل بداله. خلي الطالب يفكر ويوصل للحل بنفسه!`;

async function chatWithAI(message, conversationHistory = []) {
    for (const model of MODELS) {
        try {
            console.log(`🔄 Trying model: ${model}`);
            
            // بناء تاريخ المحادثة مع system prompt
            const messages = [
                {
                    role: "system",
                    content: TEACHER_SYSTEM_PROMPT
                },
                ...conversationHistory,
                {
                    role: "user",
                    content: message
                }
            ];
            
            const response = await axios.post(
                'https://openrouter.ai/api/v1/chat/completions',
                {
                    model: model,
                    messages: messages,
                    temperature: 0.7,
                    max_tokens: 500
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                        'HTTP-Referer': 'https://school-gamma-ten.vercel.app',
                        'X-Title': 'WhatsApp OCR Bot'
                    },
                    timeout: 20000
                }
            );
            
            if (response.data?.choices?.[0]?.message?.content) {
                console.log(`✅ Success with ${model}`);
                return response.data.choices[0].message.content;
            }
            
        } catch (error) {
            console.log(`❌ ${model} failed:`, error.response?.data?.error?.message || error.message);
        }
    }
    
    throw new Error('كل النماذج فشلت');
}

function getFallbackReply(message) {
    const msg = message.toLowerCase().trim();
    
    const mathMatch = msg.match(/(\d+)\s*([\+\-\*\/])\s*(\d+)/);
    if (mathMatch) {
        const num1 = parseInt(mathMatch[1]);
        const op = mathMatch[2];
        const num2 = parseInt(mathMatch[3]);
        let result;
        switch(op) {
            case '+': result = num1 + num2; break;
            case '-': result = num1 - num2; break;
            case '*': result = num1 * num2; break;
            case '/': result = num2 !== 0 ? (num1 / num2).toFixed(2) : 'مينفعش نقسم على صفر'; break;
        }
        return `${num1} ${op} ${num2} = ${result}`;
    }
    
    const replies = {
        'اهلا': 'أهلاً بيك يا باشا! 👋 أنا مدرسك الصبور، جهيز أساعدك تتعلم أي حاجة. ايه السؤال النهاردة؟',
        'عامل ايه': 'الحمد لله تمام! يلا بينا نذاكر. ايه اللي عايز تتعلمه النهاردة؟',
        'انت مين': 'أنا مدرسك الخصوصي 🤓 مهمتي إني أعلّمك مش أحللك المسائل. هخليك تفكر وتوصل للحل بنفسك!',
        'اخبارك': 'كويس الحمد لله! متحمس أعلّمك حاجات جديدة. وريني تقدر تعمل ايه!',
        'مش عارف': 'ماشي يا حبيبي، خليني أساعدك شوية. فكر معايا خطوة بخطوة وهتوصل لحلها إن شاء الله 🤗',
    };
    
    for (const [key, value] of Object.entries(replies)) {
        if (msg.includes(key)) return value;
    }
    
    return `معرفش الصراحة 🤔 بس أنا هنا عشان أعلّمك مش أجاوبك بس!\n\nجرب تسألني سؤال في مادة معينة (رياضيات، علوم، عربي، إنجليزي) وهاخد معاك خطوة بخطوة لحد ما تفهم.`;
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

// تخزين بسيط للمحادثات (في الذاكرة مؤقتًا)
const conversationStore = new Map();

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
                <p>✅ شغال مع OpenRouter - أسلوب تعليمي تفاعلي</p>
                <p>🎯 مهمتي: أعلّمك مش أحللك المسائل!</p>
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
        
        if (textMessage && textMessage.trim()) {
            // جلب تاريخ المحادثة لهذا المستخدم
            let conversationHistory = conversationStore.get(chatId) || [];
            
            if (OPENROUTER_API_KEY) {
                try {
                    const reply = await chatWithAI(textMessage, conversationHistory);
                    await sendWAPilotMessage(chatId, reply);
                    
                    // تحديث تاريخ المحادثة (آخر 10 رسائل عشان نحافظ على الذاكرة)
                    conversationHistory.push({ role: "user", content: textMessage });
                    conversationHistory.push({ role: "assistant", content: reply });
                    if (conversationHistory.length > 20) {
                        conversationHistory = conversationHistory.slice(-20);
                    }
                    conversationStore.set(chatId, conversationHistory);
                    
                } catch (error) {
                    console.error('AI Error:', error);
                    const fallback = getFallbackReply(textMessage);
                    await sendWAPilotMessage(chatId, fallback);
                }
            } else {
                const fallback = getFallbackReply(textMessage);
                await sendWAPilotMessage(chatId, fallback);
            }
        } else {
            await sendWAPilotMessage(chatId, "👨‍🏫 أهلاً بيك يا بطل! أنا مدرسك الصبور. اكتبلي أي سؤال في المنهج وهاخد معاك خطوة خطوة لحد ما تفهمه بنفسك. يلا بينا نبدأ!");
        }
        
        return res.status(200).json({ ok: true });
    }
    
    res.status(404).send('Not Found');
};
