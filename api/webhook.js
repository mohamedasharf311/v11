// api/webhook.js
const axios = require('axios');

const INSTANCE_ID = "instance3532";
const WAPILOT_TOKEN = "yzWzEjmxZpbifuOx6lWafYT3Ng69gaFpJGAdTsVc6N";
const WAPILOT_API_URL = "https://api.wapilot.net/api/v2";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const MODEL = 'qwen/qwen2.5-7b-instruct';

async function chatWithQwen(message) {
    console.log('🔄 Calling OpenRouter...');
    console.log('🔑 API Key exists:', !!OPENROUTER_API_KEY);
    console.log('🔑 API Key prefix:', OPENROUTER_API_KEY.substring(0, 10) + '...');
    
    if (!OPENROUTER_API_KEY) {
        throw new Error('OPENROUTER_API_KEY غير موجود');
    }
    
    try {
        const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: MODEL,
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
        
        console.log('📦 OpenRouter response status:', response.status);
        console.log('📦 Response data:', JSON.stringify(response.data).substring(0, 300));
        
        if (response.data?.choices?.[0]?.message?.content) {
            return response.data.choices[0].message.content;
        }
        
        throw new Error('هيكل الرد غير متوقع');
        
    } catch (error) {
        console.error('❌ OpenRouter Error Details:');
        console.error('Status:', error.response?.status);
        console.error('Data:', error.response?.data);
        console.error('Message:', error.message);
        throw error;
    }
}

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
        return res.status(200).json({ 
            status: 'active',
            openrouter: !!OPENROUTER_API_KEY,
            keyPrefix: OPENROUTER_API_KEY ? OPENROUTER_API_KEY.substring(0, 10) + '...' : 'none'
        });
    }

    if (method === 'GET' && (url === '/' || url === '')) {
        return res.status(200).send(`
            <!DOCTYPE html>
            <html dir="rtl">
            <head><title>بوت Qwen</title></head>
            <body style="font-family: Arial; text-align: center; padding: 50px; background: #1a1a2e; color: white;">
                <h1>🤖 بوت Qwen</h1>
                <p>🔑 OpenRouter: ${OPENROUTER_API_KEY ? '✅ موجود' : '❌ مفقود'}</p>
                <p>🧠 النموذج: ${MODEL}</p>
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
        
        console.log(`📱 Message: "${textMessage}"`);
        
        if (textMessage && textMessage.trim()) {
            if (OPENROUTER_API_KEY) {
                try {
                    const reply = await chatWithQwen(textMessage);
                    await sendWAPilotMessage(chatId, reply);
                } catch (error) {
                    console.log('⚠️ Falling back to default replies');
                    const fallback = getFallbackReply(textMessage);
                    await sendWAPilotMessage(chatId, fallback);
                }
            } else {
                console.log('⚠️ No API Key, using default replies');
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
