// api/webhook.js
const axios = require('axios');

const INSTANCE_ID = "instance3532";
const WAPILOT_TOKEN = "yzWzEjmxZpbifuOx6lWafYT3Ng69gaFpJGAdTsVc6N";
const WAPILOT_API_URL = "https://api.wapilot.net/api/v2";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

// قائمة النماذج المجانية
const MODELS = [
    'google/gemini-2.0-flash-001',
    'qwen/qwen-2.5-7b-instruct',
    'qwen/qwen-2.5-3b-instruct',
    'meta-llama/llama-3.2-3b-instruct'
];

// الـ Prompt بتاع المدرس الصبور (مدرس عام مش متخصص)
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

ملاحظة مهمة: أنت مدرس لكل المواد (رياضيات، علوم، عربي، إنجليزي، دراسات)، مش متخصص في مادة واحدة. الطالب ممكن يسألك في أي حاجة.`;

async function chatWithAI(message, conversationHistory = []) {
    for (const model of MODELS) {
        try {
            console.log(`🔄 Trying model: ${model}`);
            
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
    
    // لو طلب شرح الطرح
    if (msg.includes('طرح')) {
        return `تمام يا بطل 👊

الطرح هو إنك بتاخد حاجة من حاجة تانية.

مثال: لو معاك ٥ تفاحات 🍎🍎🍎🍎🍎
وأكلت ٢ تفاحة 🍎🍎
يبقى فضل معاك كام تفاحة؟

فكر شوية وقولي الرقم 😊`;
    }
    
    // لو طلب شرح الجمع
    if (msg.includes('جمع')) {
        return `يلا بينا يا بطل 👊

الجمع هو إنك بتضيف حاجة لحاجة تانية.

مثال: لو معاك ٣ أقلام ✏️✏️✏️
وجبتلك ٢ تانيين ✏️✏️
يبقى معاك كام قلم؟

جرب تحسبها وقولي كام؟`;
    }
    
    const replies = {
        'اهلا': '🎉 أهلاً بيك يا بطل! أنا مدرسك الخصوصي. اسألني في أي مادة (رياضيات - علوم - عربي - إنجليزي - دراسات) وهاخد معاك خطوة خطوة لحد ما تفهم 💪',
        'انت مين': '👨‍🏫 أنا مدرسك الصبور! بدرس كل المواد للإعدادية. مهمتي إني أعلّمك مش أحللك المسائل. اسألني في أي حاجة وهبدأ أشرحلك خطوة بخطوة.',
        'مش عارف': 'ماشي يا حبيبي 🤗 خليني أسهلها عليك. فكر معايا خطوة خطوة وهتوصل لحلها إن شاء الله. جهيز نبدأ؟',
        'شكرا': 'العفو يا بطل 🤗 أي خدمة. لو عايز تفهم حاجة تانية، أنا موجود 💪',
    };
    
    for (const [key, value] of Object.entries(replies)) {
        if (msg.includes(key)) return value;
    }
    
    return `👨‍🏫 مرحباً بيك يا بطل!

أنا مدرسك الخصوصي لجميع المواد (رياضيات - علوم - عربي - إنجليزي - دراسات).

اسألني في أي حاجة مش فاهمها وهاخد معاك خطوة خطوة لحد ما توصل للحل بنفسك.

جهيز تبدأ؟ قوللي ايه اللي عايز تذاكره 😊`;
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

// تخزين المحادثات
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
                <p>✅ شغال - مدرس لكل المواد (رياضيات - علوم - عربي - إنجليزي - دراسات)</p>
                <p>🎯 جرب تسأل: "اشرحلي الطرح" أو "اشرحلي الجمع"</p>
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
            let conversationHistory = conversationStore.get(chatId) || [];
            
            if (OPENROUTER_API_KEY) {
                try {
                    const reply = await chatWithAI(textMessage, conversationHistory);
                    await sendWAPilotMessage(chatId, reply);
                    
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
            await sendWAPilotMessage(chatId, "👨‍🏫 أهلاً بيك يا بطل! أنا مدرسك الصبور. اسألني في أي مادة وهاخد معاك خطوة خطوة لحد ما تفهم بنفسك 💪");
        }
        
        return res.status(200).json({ ok: true });
    }
    
    res.status(404).send('Not Found');
};
