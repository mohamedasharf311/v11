// api/webhook.js
const axios = require('axios');

const INSTANCE_ID = "instance3532";
const WAPILOT_TOKEN = "yzWzEjmxZpbifuOx6lWafYT3Ng69gaFpJGAdTsVc6N";
const WAPILOT_API_URL = "https://api.wapilot.net/api/v2";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

// ثبت موديل واحد بس عشان يكون الردود ثابتة
const MODEL = 'google/gemini-2.0-flash-001';

// نظام الـ Prompt الجديد - صارم في التصحيح
const TEACHER_SYSTEM_PROMPT = `أنت مدرس صبور لطلاب المرحلة الإعدادية.

قواعدك الصارمة:
1. لا تعطي الإجابة النهائية مباشرة أبداً.
2. لو الطالب جاوب غلط → متقلش "ممتاز" أو "قريب" من غير ما تصحح.
   قول: "فكر تاني يا بطل" أو "خلينا نعد صح"
3. اسأل سؤال بسيط يقوده للحل.
4. لو أجاب صح → شجعه وكمل.
5. لو قال "مش عارف" → أعطه hint بسيط.
6. بعد محاولتين فاشلتين → اشرح الحل خطوة خطوة بالتفصيل.

أسلوبك:
- بسيط جداً جداً
- باللهجة المصرية
- تشجع الطالب بس متضحكش عليه
- خلي الطالب يحس إنه اتقدم

ممنوع:
- تقول "ممتاز" لو الإجابة غلط
- تحل المسألة بداله من أول مرة
- تستخدم كلمات أجنبية

ابدأ دائماً بـ: "يلا بينا يا بطل 👊"`;

// تنظيف الرد من أي كود أو حروف غريبة
function cleanResponse(text) {
    // لو فيه كود أو حاجات تقنية
    if (text.includes('api/') || text.includes('const ') || text.includes('function') || text.includes('```')) {
        return "خلينا نكمل شرح بشكل بسيط يا بطل 😊 قوللي وصلنا لفين؟";
    }
    
    // لو فيه لغات غريبة غير العربية والإنجليزية
    if (/[^\u0600-\u06FF\u0000-\u007F\u0621-\u064A]/.test(text) && !text.includes('+') && !text.includes('=')) {
        return "معلش حصلت لخبطة بسيطة 😅 تعالى نكمل مع بعض خطوة خطوة. ايه السؤال تاني؟";
    }
    
    // لو الرد طويل أو فيه حاجات غريبة
    if (text.length > 800) {
        return text.substring(0, 750) + "\n\n🤔 معلش طولت شوية، خلينا نركز في نقطة واحدة. فهمت الجزء اللي قلته؟";
    }
    
    return text;
}

async function chatWithAI(message, conversationHistory = []) {
    try {
        console.log(`🔄 Using model: ${MODEL}`);
        
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
                model: MODEL,
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
            let reply = response.data.choices[0].message.content;
            reply = cleanResponse(reply);
            console.log(`✅ Response cleaned`);
            return reply;
        }
        
    } catch (error) {
        console.log(`❌ Model failed:`, error.response?.data?.error?.message || error.message);
    }
    
    throw new Error('النموذج فشل');
}

// ردود احتياطية محسنة
function getFallbackReply(message) {
    const msg = message.toLowerCase().trim();
    
    // لو طلب شرح الجمع
    if (msg.includes('جمع') || (msg.includes('شرح') && msg.includes('درس'))) {
        return `يلا بينا يا بطل 👊

تعالى نلعب لعبة سريعة 😄

لو معاك 2 تفاحة 🍎🍎
وجبتلك كمان 3 تفاحات 🍎🍎🍎

تحب نعدهم سوا ولا تحاول لوحدك الأول؟

قوللي هيكون عندنا كام تفاحة؟`;
    }
    
    // مسائل رياضية بسيطة مع تصحيح
    const mathMatch = msg.match(/(\d+)\s*\+\s*(\d+)/);
    if (mathMatch) {
        const num1 = parseInt(mathMatch[1]);
        const num2 = parseInt(mathMatch[2]);
        const correct = num1 + num2;
        
        // لو الطالب جاوب (مثلاً كتب 2+3=6)
        if (msg.includes('=')) {
            const theirAnswer = parseInt(msg.split('=')[1]);
            if (theirAnswer === correct) {
                return `🔥 صح 100%! انت شاطر فعلاً!\n\nخلينا نجرب واحدة تانية: ${num1 + 1} + ${num2} = كام؟`;
            } else {
                return `قريب يا بطل 🤔 بس خلينا نعد صح:\n${num1} تفاحات + ${num2} تفاحات = ${correct} تفاحات 🍎\n\nفهمتها؟ جرب تحل: 3 + 4 = كام؟`;
            }
        }
        
        return `فكر فيها كده:\n${num1} 🍎 + ${num2} 🍎 = كام 🍎؟\n\nجرب تقولي الرقم كام؟`;
    }
    
    const replies = {
        'اهلا': '🎉 أهلاً بيك يا بطل! أنا مدرسك الخصوصي. جهيز أشرحلك أي حاجة خطوة خطوة. ايه اللي عايز تتعلمه النهاردة؟',
        'انت مين': '👨‍🏫 أنا مدرسك الصبور. مش هقولك الإجابة علطول، لا هخليك انت اللي توصل لها بنفسك. دي الطريقة الصح للتعليم!',
        'مش عارف': 'ماشي يا حبيبي 🤗 خليني أسهلها عليك. فكر معايا خطوة خطوة وهتوصل لحلها إن شاء الله. جهيز نبدأ؟',
    };
    
    for (const [key, value] of Object.entries(replies)) {
        if (msg.includes(key)) return value;
    }
    
    return `يلا بينا يا بطل 👊

خلينا نلعب لعبة سريعة:

لو معاك 3 أقلام ✏️✏️✏️
وواحد صاحبك أدالك 2 قلم ✏️✏️

بقى عندك كام قلم؟

جرب تحسبها وقولي الرقم 🎯`;
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

// تخزين المحادثات وعدد المحاولات الفاشلة
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
                <p>✅ شغال - أسلوب تعليمي تفاعلي</p>
                <p>🎯 مهمتي: أعلّمك مش أحللك المسائل</p>
                <p>🔥 التحدي: تحل بنفسك وتوصل للإجابة الصح</p>
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
            let userSession = conversationStore.get(chatId) || { history: [], failCount: 0 };
            
            if (OPENROUTER_API_KEY) {
                try {
                    const reply = await chatWithAI(textMessage, userSession.history);
                    
                    // لو الرد فيه كلمة "غلط" أو "فكر تاني" نزود عدد المحاولات الفاشلة
                    let cleanedReply = reply;
                    if (reply.includes('غلط') || reply.includes('فكر تاني') || reply.includes('حاول تاني')) {
                        userSession.failCount += 1;
                    } else if (reply.includes('صح') || reply.includes('ممتاز')) {
                        userSession.failCount = 0; // نجح يبقى نرجع الصفر
                    }
                    
                    // لو فشل مرتين، نرسل شرح
                    if (userSession.failCount >= 2) {
                        cleanedReply = `👨‍🏫 خليني أشرحلك بطريقة بسيطة:\n\n${reply}\n\nفهمت ولا أحاول أشرح تاني بطريقة مختلفة؟`;
                        userSession.failCount = 0;
                    }
                    
                    await sendWAPilotMessage(chatId, cleanedReply);
                    
                    // تحديث تاريخ المحادثة
                    userSession.history.push({ role: "user", content: textMessage });
                    userSession.history.push({ role: "assistant", content: cleanedReply });
                    if (userSession.history.length > 20) {
                        userSession.history = userSession.history.slice(-20);
                    }
                    conversationStore.set(chatId, userSession);
                    
                } catch (error) {
                    console.error('AI Error:', error);
                    // لو فيه error، نمسح الجلسة ونبدأ من جديد
                    conversationStore.delete(chatId);
                    const fallback = getFallbackReply(textMessage);
                    await sendWAPilotMessage(chatId, fallback);
                }
            } else {
                const fallback = getFallbackReply(textMessage);
                await sendWAPilotMessage(chatId, fallback);
            }
        } else {
            await sendWAPilotMessage(chatId, "👨‍🏫 يلا بينا يا بطل!\n\nجهيز تتعلم النهاردة؟ قوللي أي سؤال وهخليك توصل للحل بنفسك 💪");
        }
        
        return res.status(200).json({ ok: true });
    }
    
    res.status(404).send('Not Found');
};
