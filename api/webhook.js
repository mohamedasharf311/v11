// api/webhook.js
const axios = require('axios');

const INSTANCE_ID = "instance3532";
const WAPILOT_TOKEN = "yzWzEjmxZpbifuOx6lWafYT3Ng69gaFpJGAdTsVc6N";
const WAPILOT_API_URL = "https://api.wapilot.net/api/v2";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

// ✅ النموذج المجاني للعربي
const MODEL = 'qwen/qwen2.5-7b-instruct';

async function chatWithQwen(message) {
    console.log(`🔄 Using model: ${MODEL}`);
    
    try {
        const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: MODEL,
                messages: [
                    {
                        role: "system",
                        content: `أنت مساعد ذكي اسمه "بوت تصحيح الأوراق" شغال على واتساب.
اتكلم باللهجة المصرية العامية بشكل طبيعي وبسيط.
خليك ودود ولطيف.
لو حد سأل سؤال، جاوبه بشكل مباشر ومختصر.
لو حد بيهزر، رد بهزار خفيف.
متستخدمش لغة رسمية أو معقدة.
تخصصك: تصحيح أوراق الإجابة، استخراج النص من الصور، ومساعدة الطلاب.`
                    },
                    {
                        role: "user",
                        content: message
                    }
                ],
                temperature: 0.7,
                max_tokens: 500
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${OPENROUTER_API_KEY}`
                },
                timeout: 20000
            }
        );
        
        if (response.data?.choices?.[0]?.message?.content) {
            return response.data.choices[0].message.content;
        }
        
        throw new Error('لم يتم الحصول على رد');
        
    } catch (error) {
        console.error('❌ OpenRouter Error:', error.response?.data || error.message);
        throw error;
    }
}

// رد احتياطي لو OpenRouter مش شغال
function getFallbackReply(message) {
    const msg = message.toLowerCase().trim();
    
    // عمليات حسابية
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
            case '/': result = num2 !== 0 ? (num1 / num2).toFixed(2) : 'مينفعش نقسم على صفر يا باشا'; break;
        }
        return `${num1} ${op} ${num2} = ${result}`;
    }
    
    // ردود مصرية
    const replies = {
        'اهلا': 'أهلاً بيك يا باشا! 👋 إزاي أقدر أساعدك؟',
        'مرحبا': 'مرحباً! نورت والله ✨',
        'السلام عليكم': 'وعليكم السلام ورحمة الله وبركاته!',
        'عامل ايه': 'الحمد لله تمام! وإنت عامل إيه؟',
        'بتعرف تعمل ايه': 'والله يا سيدي أنا بوت تصحيح أوراق. بقرا الصور وبطلع النص منها، وبصحح الأخطاء الإملائية، وبجاوب على الأسئلة. تقدر تبعتلي صورة ورقة إجابة وأنا أحللها لك! 📝',
        'انت مين': 'أنا بوت تصحيح الأوراق 🤖 شغال على واتساب. بأساعد الطلبة والمدرسين في تصحيح الأوراق واستخراج النصوص.',
    };
    
    for (const [key, value] of Object.entries(replies)) {
        if (msg.includes(key)) return value;
    }
    
    return `معرفش الصراحة 🤔\nبس تقدر تبعتلي صورة ورقة إجابة وأنا أطلعلك النص منها!\nأو اسألني سؤال تاني.`;
}

async function sendWAPilotMessage(chatId, text) {
    try {
        await axios.post(
            `${WAPILOT_API_URL}/${INSTANCE_ID}/send-message`,
            { chat_id: chatId, text: text },
            { headers: { "token": WAPILOT_TOKEN, "Content-Type": "application/json" }, timeout: 10000 }
        );
        console.log('✅ Message sent');
        return true;
    } catch (error) {
        console.error('❌ Send Error:', error.message);
        return false;
    }
}

module.exports = async (req, res) => {
    const url = req.url || '';
    const method = req.method || 'GET';
    
    if (method === 'GET' && url === '/api/webhook') {
        return res.status(200).json({ 
            status: 'active', 
            model: MODEL,
            keyExists: !!OPENROUTER_API_KEY 
        });
    }

    if (method === 'GET' && (url === '/' || url === '')) {
        return res.status(200).send(`
            <!DOCTYPE html>
            <html dir="rtl">
            <head>
                <title>بوت Qwen - مصري</title>
                <style>
                    body { font-family: Arial; text-align: center; padding: 50px; background: linear-gradient(135deg, #1a1a2e, #16213e); color: white; }
                    .status { background: #10b981; padding: 8px 20px; border-radius: 50px; display: inline-block; }
                </style>
            </head>
            <body>
                <h1>🤖 بوت Qwen المصري</h1>
                <p class="status">✅ شغال وجاهز!</p>
                <p>🧠 النموذج: ${MODEL}</p>
                <p>🔑 OpenRouter: ${OPENROUTER_API_KEY ? '✅ متصل' : '❌ محتاج API Key'}</p>
                <p>💬 بيتكلم: مصري عامي</p>
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
        
        console.log(`📱 From: ${chatId} | Message: "${textMessage}"`);
        
        if (textMessage && textMessage.trim()) {
            if (OPENROUTER_API_KEY) {
                try {
                    const reply = await chatWithQwen(textMessage);
                    await sendWAPilotMessage(chatId, reply);
                } catch (error) {
                    // لو فشل OpenRouter، نستخدم الرد الاحتياطي
                    const fallback = getFallbackReply(textMessage);
                    await sendWAPilotMessage(chatId, fallback);
                }
            } else {
                // مفيش API Key
                const fallback = getFallbackReply(textMessage);
                await sendWAPilotMessage(chatId, fallback);
            }
        } else {
            await sendWAPilotMessage(chatId, "أهلاً بيك! اكتبلي رسالة وهدردش معاك 🤖");
        }
        
        return res.status(200).json({ ok: true });
    }
    
    res.status(404).send('Not Found');
};
