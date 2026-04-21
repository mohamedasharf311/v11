// api/webhook.js
const axios = require('axios');

const INSTANCE_ID = "instance3532";
const WAPILOT_TOKEN = "yzWzEjmxZpbifuOx6lWafYT3Ng69gaFpJGAdTsVc6N";
const WAPILOT_API_URL = "https://api.wapilot.net/api/v2";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

const MODEL = 'google/gemini-2.0-flash-001';

// شخصية متوازنة: حماستها ذكية + تعليم عميق + متابعة
const TEACHER_SYSTEM_PROMPT = `أنت "كابتن ماث" - مدرب مهارات الرياضيات 🎯

شخصيتك:
- حماسك ذكي مش أوفر (ممنوع "جامد فشخخخ" أو "يا جدع")
- بتتكلم باحترام: "أداء قوي" / "ممتاز" / "واضح إنك فهمت"
- بتهتم إن الطالب يفهم "ازاي" مش "ايه"

قوانين اللعبة:
1. كل إجابة صح → نقاط + تشجيع محترم
2. كل 3 إجابات صح → سؤال فهم عميق ("ازاي جبت الناتج؟")
3. الغلط → تصحيح لطيف + hint
4. نهاية كل جلسة → اقتراح متابعة (5 دقائق يومياً)

أسلوبك باللهجة المصرية:
- "🔥 أداء قوي يا بطل!"
- "واضح إنك بدأت تفهم الفكرة صح 💪"
- "خليني أسألك سؤال مهم عشان نتأكد..."
- "بصراحة مستواك كويس جداً 👀"

ممنوع:
- أوفر في الحماس (جامد فشخخخ)
- إجابة مباشرة
- نهاية مفتوحة (دائماً خلّي في اقتراح للمتابعة)

في آخر كل موضوع → اسأل:
"تحب أعملك برنامج 5 دقائق كل يوم يخليك أسرع واحد في الفصل؟ 😎"`;

// نظام التخزين المتقدم
const userStats = new Map(); 
// { level, score, streak, deepQuestionsAsked, lastActive, dailyProgress }

function getUserStats(chatId) {
    if (!userStats.has(chatId)) {
        userStats.set(chatId, {
            level: 1,
            score: 0,
            streak: 0,
            correctAnswers: 0,
            deepQuestionsAsked: 0,
            lastActive: new Date().toISOString(),
            dailyProgress: [],
            subscriptionRequested: false  // عشان منكررش الطلب كل مرة
        });
    }
    return userStats.get(chatId);
}

function getLevelUpMessage(stats) {
    if (stats.correctAnswers >= 3 && stats.level === 1) {
        stats.level = 2;
        return `\n\n🏆 مبروك! وصلت لـ Level 2!\n⭐ نقاطك: ${stats.score}\n\nخليني أسألك سؤال مهم يا بطل 👀:\nلما بنجمع أرقام زي 15 + 20، بتفكر فيها ازاي في دماغك؟ (بتعدي؟ ولا بتجمع العشرات first؟)`;
    }
    if (stats.correctAnswers >= 6 && stats.level === 2) {
        stats.level = 3;
        return `\n\n🎉 أداء قوي جداً! Level 3 بقى!\n🏅 نقاطك: ${stats.score}\n\nبصراحة مستواك بدأ يبقى كويس 👀\nعايز تقولي إيه أكتر حاجة بتساعدك تفهم المسائل بسرعة؟`;
    }
    return '';
}

function getDailyChallenge() {
    const challenges = [
        { question: "لو معاك 45 جنيه وصاحبك اديك 28 جنيه، كده بقى معاك كام؟", answer: 73 },
        { question: "في الفصل 12 بنت و 15 ولد، كده عدد الطلاب كلهم كام؟", answer: 27 },
        { question: "اشتريت كتاب ب 35 جنيه وقلم ب 12 جنيه، كده كلفوني كام؟", answer: 47 }
    ];
    return challenges[Math.floor(Math.random() * challenges.length)];
}

async function chatWithAI(message, conversationHistory = [], stats) {
    try {
        console.log(`🔄 Using model: ${MODEL}`);
        
        const contextMessage = `[مستوى اللاعب: ${stats.level} | نقاط: ${stats.score} | إجابات صح متتالية: ${stats.streak} | تم طرح أسئلة فهم عميق: ${stats.deepQuestionsAsked}]
        
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
                temperature: 0.7,
                max_tokens: 650
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
            
            const levelUpMsg = getLevelUpMessage(stats);
            if (levelUpMsg) {
                reply += levelUpMsg;
                stats.deepQuestionsAsked++;
            }
            
            return reply;
        }
        
    } catch (error) {
        console.log(`❌ Model failed:`, error.response?.data?.error?.message || error.message);
    }
    
    throw new Error('النموذج فشل');
}

// ردود احتياطية متوازنة
function getFallbackReply(message, stats) {
    const msg = message.toLowerCase().trim();
    
    const numberMatch = msg.match(/\d+/);
    if (numberMatch && stats.lastQuestion) {
        const answer = parseInt(numberMatch[0]);
        
        if (stats.lastQuestion === '15+20' && answer === 35) {
            stats.correctAnswers++;
            stats.score += 10;
            stats.streak++;
            const levelUp = getLevelUpMessage(stats);
            
            let reply = `🔥 أداء قوي يا بطل!

✅ إجابة صح! نقاطك بقيت: ${stats.score}
📊 ضربت ${stats.streak} صح ورا بعض!

${levelUp || ''}

عايز تحل مسألة أصعب شوية ولا نراجع اللي خدناه؟ 💪`;
            
            // لو خلص Level 2، نطلب اشتراك
            if (stats.level >= 2 && !stats.subscriptionRequested) {
                stats.subscriptionRequested = true;
                reply += `\n\n━━━━━━━━━━━━━━━━\n👀 بصراحة مستواك كويس جداً!\n\nتحب أعملك برنامج 5 دقائق كل يوم يخليك أسرع واحد في الفصل في الحساب؟ 😎\n\nلو مهتم، قولي "أنا موافق" وهبدأ معاك بكرة من Level جديد!`;
            }
            
            return reply;
            
        } else if (stats.lastQuestion === '15+20') {
            stats.streak = 0;
            return `قريب 👀 بس خلينا نفهمها صح:

15 + 20 = (10 + 10) + (5 + 10) = 20 + 15 = 35

الفكرة: بنجمع العشرات مع بعض، والآحاد مع بعض.

جرب تحل دلوقتي: 25 + 13 = كام؟ 💪`;
        }
    }
    
    // بداية متوازنة
    if (msg.includes('جمع') || msg.includes('رياضيات') || msg.includes('نبدأ')) {
        stats.lastQuestion = '15+20';
        return `🎯 يلا بينا يا بطل!

📊 المستوى الحالي: ${stats.level}
⭐ نقاطك: ${stats.score}

التحدي الأول Level ${stats.level} 🔥:

معاك 15 جنيه 💰
ومامتك ادتك 20 كمان

كام بقى معاك؟

فكر فيها كويس وقولي الرقم 💪`;
    }
    
    if (msg.includes('انا موافق')) {
        return `🎉 ممتاز! أنت دلوقتي في برنامج "5 دقائق أبطال الحساب" 🏆

📅 هنبدأ بكرة الصبح
⏰ هبعتلك تحدي每一天 5 دقائق بس
📊 هتتابع تقدمك يومياً

جهيز تبدأ بكرة؟ 👀`;
    }
    
    if (msg.includes('انت مين')) {
        return `🎯 أنا "كابتن ماث" - مدرب مهارات الرياضيات.

مهمتي مش إن أحلك المسائل، لا… مهمتي إنك تبقى أنت اللي تحلها بسرعة وذكاء.

📊 نظامي:
• مستويات متدرجة
• نقاط وخبرة
• أسئلة تفهمك "ازاي" تفكر

جهيز تبدأ الرحلة؟ 🔥`;
    }
    
    if (msg.includes('مش عارف')) {
        return `ماشي يا بطل 🤗 خلينا نفهمها بطريقة تانية:

15 + 20 = ?

فكر فيها: 15 = 10 + 5
20 = 10 + 10

نجمع العشرات: 10 + 10 + 10 = 30
نجمع الآحاد: 5
المجموع: 30 + 5 = 35

واضحة ولا أحاول تاني بطريقة مختلفة؟ 💪`;
    }
    
    // لو فضل ساكت أو أي حاجة تانية
    return `🎯 مرحباً بيك في أكاديمية كابتن ماث!

📊 مستواك الحالي: ${stats.level}
⭐ نقاطك: ${stats.score}

جهيز تبدأ؟
اكتبلي "نبدأ" وهنبدأ أول تحدي 💪`;
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
            <head><title>أكاديمية كابتن ماث</title></head>
            <body style="font-family: Arial; text-align: center; padding: 50px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;">
                <h1>🎯 أكاديمية كابتن ماث</h1>
                <h2>مدرب مهارات الرياضيات</h2>
                <p>✅ نظام متوازن: تعليم عميق + تشجيع ذكي</p>
                <p>📊 مستويات - نقاط - تقدم يومي</p>
                <p>🔥 اكتب "نبدأ" عشان تبدأ الرحلة</p>
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
            stats.lastActive = new Date().toISOString();
            
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
            await sendWAPilotMessage(chatId, `🎯 مرحباً بيك في أكاديمية كابتن ماث!

📊 المستوى: ${stats.level}
⭐ نقاطك: ${stats.score}
📅 آخر زيارة: ${stats.lastActive ? new Date(stats.lastActive).toLocaleDateString('ar-EG') : 'أول مرة'}

اكتبلي "نبدأ" عشان نبدأ أول تحدي 💪

ولو غبت عن المتابعة، أنا هاجي أسأل عليك 👀`);
        }
        
        return res.status(200).json({ ok: true });
    }
    
    res.status(404).send('Not Found');
};
