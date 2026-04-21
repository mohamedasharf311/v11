// api/webhook.js
const axios = require('axios');

const INSTANCE_ID = "instance3532";
const WAPILOT_TOKEN = "yzWzEjmxZpbifuOx6lWafYT3Ng69gaFpJGAdTsVc6N";
const WAPILOT_API_URL = "https://api.wapilot.net/api/v2";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

const MODEL = 'google/gemini-2.0-flash-001';

// نظام اللعبة - شخصية قوية وجذابة
const TEACHER_SYSTEM_PROMPT = `أنت "كابتن ماث" - مدرب أبطال الرياضيات 🦸‍♂️

شخصيتك:
- مش مدرس عادي، انت كابتن فريق الأبطال
- حماسي جداً، بتستخدم رموز 🔥💪🎮
- بتعامل الطالب كلاعب بطل مش طالب عادي

قوانين اللعبة:
1. كل مسألة = مستوى جديد (Level)
2. الحل الصح = نقاط وخبرة
3. الحل الغلط = فرصة تانية مع تعليق ذكي
4. بعد كل 3 حلول صح = تحدي خاص 🏆

أسلوبك باللهجة المصرية:
- "يلا بينا يا بطل 👊"
- "جامد فشخخخ 🔥🔥"
- "شكلك ناوي تبقى أسطورة 😎"
- "قريب 👀 بس مستعجل ليه؟ جرب تاني"

ممنوع تماماً:
- الإجابة المباشرة
- الكلام الرسمي الممل
- التصحيح الجاف

ابدأ كل محادثة بـ: "🎮 مرحباً بيك في أكاديمية الأبطال! أنا كابتن ماث. جهيز تبدأ المغامرة؟"`;

// نظام التخزين لكل مستخدم
const userStats = new Map(); // { level, score, streak, lastQuestion }

function getUserStats(chatId) {
    if (!userStats.has(chatId)) {
        userStats.set(chatId, {
            level: 1,
            score: 0,
            streak: 0,
            questionsAnswered: 0,
            correctAnswers: 0
        });
    }
    return userStats.get(chatId);
}

function getLevelUpMessage(stats) {
    if (stats.correctAnswers >= 3 && stats.level === 1) {
        stats.level = 2;
        return `\n\n🏆 مبروك! وصلت لـ Level 2!\n🔥 نقاطك: ${stats.score}\n💪 جهيز للتحدي الجاي؟`;
    }
    if (stats.correctAnswers >= 6 && stats.level === 2) {
        stats.level = 3;
        return `\n\n🎉 يا أسطورة! Level 3 بقى!\n⭐ نقاطك: ${stats.score}\n😎 ورينا تقدر توصل لكام؟`;
    }
    return '';
}

async function chatWithAI(message, conversationHistory = [], stats) {
    try {
        console.log(`🔄 Using model: ${MODEL}`);
        
        // نضيف معلومات المستوى في الـ context
        const contextMessage = `[مستوى اللاعب: ${stats.level} | نقاط: ${stats.score} | إجابات صح متتالية: ${stats.streak}]
        
سؤال الطالب: ${message}`;
        
        const messages = [
            {
                role: "system",
                content: TEACHER_SYSTEM_PROMPT
            },
            ...conversationHistory,
            {
                role: "user",
                content: contextMessage
            }
        ];
        
        const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: MODEL,
                messages: messages,
                temperature: 0.8, // زودنا الحرارة عشان يبقى أكثر إبداعاً
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
            
            // نضيف الـ level up message لو الطالب كويس
            const levelUpMsg = getLevelUpMessage(stats);
            if (levelUpMsg) {
                reply += levelUpMsg;
            }
            
            return reply;
        }
        
    } catch (error) {
        console.log(`❌ Model failed:`, error.response?.data?.error?.message || error.message);
    }
    
    throw new Error('النموذج فشل');
}

// ردود احتياطية - بنظام اللعبة
function getFallbackReply(message, stats) {
    const msg = message.toLowerCase().trim();
    
    // التحقق من إجابة رقمية
    const numberMatch = msg.match(/\d+/);
    if (numberMatch && stats.lastQuestion) {
        const answer = parseInt(numberMatch[0]);
        
        // مثال: لو السؤال كان عن جمع 15 + 20
        if (stats.lastQuestion === '15+20' && answer === 35) {
            stats.correctAnswers++;
            stats.score += 10;
            stats.streak++;
            const levelUp = getLevelUpMessage(stats);
            return `🔥🔥 جامد فشخخخ! إجابة صح!

نقاطك بقيت: ${stats.score}
ضربت ${stats.streak} صح ورا بعض!

${levelUp || 'جهيز للتالي؟ 💪'}

عايز تحل مسألة أصعب شوية ولا نثبت اللي خدناه؟`;
        } else if (stats.lastQuestion === '15+20') {
            stats.streak = 0;
            return `قريب 👀 بس شكلك مستعجل!

جرب تعدهم واحدة واحدة:
15... وبعدين نزود عليهم 20

وصلت لكام؟

(فكر فيها تاني وهتجيبه 💪)`;
        }
    }
    
    // بداية اللعبة
    if (msg.includes('جمع') || msg.includes('رياضيات') || msg.includes('نبدأ')) {
        stats.lastQuestion = '15+20';
        return `🎮 يلا بينا يا بطل!

دلوقتي دخلنا Level 1 🔥

معاك 15 جنيه 💰
ومامتك ادتك 20 كمان

لو حسبتها صح → هتعدي الليفل 😏

يلا وريني 💪
كام بقى معاك؟`;
    }
    
    if (msg.includes('انت مين')) {
        return `🦸‍♂️ أنا كابتن ماث!

مهمتي إني أخرج البطل جواك.

هنا مش مجرد شرح - دي أكاديمية الأبطال 🎮

كل إجابة صح = نقاط + مستويات
كل إجابة غلط = فرصة تانية + تشجيع

جهيز تبدأ الرحلة؟ 🔥`;
    }
    
    if (msg.includes('مش عارف')) {
        return `ماشي يا بطل 🤗

خليني أسهلها عليك:

15 جنيه... و20 جنيه...

لو جمعنا الـ 10 الأولى مع بعض = 10 + 10 = 20
وبعدين نضيف الـ 5 + 10 = 15

كام الناتج النهائي؟

جرب تاني وهتجيبهة 💪`;
    }
    
    return `🎮 مرحباً بيك في أكاديمية الأبطال!

أنا كابتن ماث 🦸‍♂️

المستوى الحالي: ${stats.level}
نقاطك: ${stats.score}

جهيز تبدأ المغامرة؟
اكتبلي "نبدأ" أو اسألني في أي حاجة 💪`;
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
            <head><title>أكاديمية الأبطال - كابتن ماث</title></head>
            <body style="font-family: Arial; text-align: center; padding: 50px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;">
                <h1>🦸‍♂️ أكاديمية الأبطال</h1>
                <h2>كابتن ماث في خدمتك!</h2>
                <p>✅ النظام شغال - اكتب "نبدأ" عشان تبدأ المغامرة</p>
                <p>🎯 كل إجابة صح = نقاط ومستويات</p>
                <p>🏆 أول Level 3 ياخد شهادة تقدير!</p>
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
            let userSession = conversationStore.get(chatId) || { history: [] };
            let stats = getUserStats(chatId);
            
            if (OPENROUTER_API_KEY) {
                try {
                    const reply = await chatWithAI(textMessage, userSession.history, stats);
                    await sendWAPilotMessage(chatId, reply);
                    
                    userSession.history.push({ role: "user", content: textMessage });
                    userSession.history.push({ role: "assistant", content: reply });
                    if (userSession.history.length > 20) {
                        userSession.history = userSession.history.slice(-20);
                    }
                    conversationStore.set(chatId, userSession);
                    userStats.set(chatId, stats);
                    
                } catch (error) {
                    console.error('AI Error:', error);
                    const fallback = getFallbackReply(textMessage, stats);
                    await sendWAPilotMessage(chatId, fallback);
                    userStats.set(chatId, stats);
                }
            } else {
                const fallback = getFallbackReply(textMessage, stats);
                await sendWAPilotMessage(chatId, fallback);
                userStats.set(chatId, stats);
            }
        } else {
            const stats = getUserStats(chatId);
            await sendWAPilotMessage(chatId, `🦸‍♂️ أهلاً بيك في أكاديمية الأبطال يا بطل!

المستوى: ${stats.level}
نقاطك: ${stats.score}

اكتبلي "نبدأ" عشان نبدأ المغامرة 💪`);
        }
        
        return res.status(200).json({ ok: true });
    }
    
    res.status(404).send('Not Found');
};
