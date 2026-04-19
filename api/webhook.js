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

async function chatWithAI(message) {
    for (const model of MODELS) {
        try {
            console.log(`🔄 Trying model: ${model}`);
            
            const response = await axios.post(
                'https://openrouter.ai/api/v1/chat/completions',
                {
                    model: model,
                    messages: [
                        {
                            role: "system",
                            content: `أنت مساعد ذكي اسمه "بوت تصحيح الأوراق". اتكلم باللهجة المصرية العامية. خليك ودود وبسيط.`
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
        'اهلا': 'أهلاً بيك يا باشا! 👋',
        'عامل ايه': 'الحمد لله تمام! وإنت؟',
        'انت مين': 'أنا بوت تصحيح الأوراق 🤖',
        'اخبارك': 'كويس الحمد لله! وإنت عامل إيه؟',
        'اغلى عربيه': 'أغلى عربية في العالم هي Rolls-Royce Boat Tail بـ 28 مليون دولار! 🚗💎',
        'اسرع عربيه': 'أسرع عربية هي Koenigsegg Jesko Absolut بسرعة 531 كم/ساعة! 🏎️',
    };
    
    for (const [key, value] of Object.entries(replies)) {
        if (msg.includes(key)) return value;
    }
    
    return `معرفش الصراحة 🤔\nجرب تسأل سؤال تاني.`;
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
            <head><title>بوت AI</title></head>
            <body style="font-family: Arial; text-align: center; padding: 50px; background: #1a1a2e; color: white;">
                <h1>🤖 بوت AI</h1>
                <p>✅ شغال مع OpenRouter</p>
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
            if (OPENROUTER_API_KEY) {
                try {
                    const reply = await chatWithAI(textMessage);
                    await sendWAPilotMessage(chatId, reply);
                } catch (error) {
                    const fallback = getFallbackReply(textMessage);
                    await sendWAPilotMessage(chatId, fallback);
                }
            } else {
                const fallback = getFallbackReply(textMessage);
                await sendWAPilotMessage(chatId, fallback);
            }
        } else {
            await sendWAPilotMessage(chatId, "أهلاً! اكتبلي رسالة.");
        }
        
        return res.status(200).json({ ok: true });
    }
    
    res.status(404).send('Not Found');
};
