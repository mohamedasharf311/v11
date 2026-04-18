// api/webhook.js
const axios = require('axios');

const INSTANCE_ID = "instance3532";
const WAPILOT_TOKEN = "yzWzEjmxZpbifuOx6lWafYT3Ng69gaFpJGAdTsVc6N";
const WAPILOT_API_URL = "https://api.wapilot.net/api/v2";

// OpenRouter - مجاني لبعض النماذج
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || ''; // مش محتاج مفتاح للنماذج المجانية

async function chatWithFreeModel(message) {
    console.log('🔄 Using free model...');
    
    // نستخدم نموذج مجاني من OpenRouter
    const response = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
            model: 'google/gemini-2.0-flash-001', // نموذج مجاني
            messages: [{ role: 'user', content: message }]
        },
        {
            headers: {
                'Content-Type': 'application/json',
                // مش محتاج API Key للنماذج المجانية
            },
            timeout: 15000
        }
    );
    
    if (response.data?.choices?.[0]?.message?.content) {
        return response.data.choices[0].message.content;
    }
    
    throw new Error('لم يتم الحصول على رد');
}

// ردود احتياطية لو النموذج مش شغال
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
            case '/': result = num2 !== 0 ? (num1 / num2).toFixed(2) : 'لا يمكن القسمة على صفر'; break;
        }
        return `🧮 ${num1} ${op} ${num2} = ${result}`;
    }
    
    const replies = {
        'اهلا': 'أهلاً بك! أنا بوت تصحيح الأوراق. 📝 كيف يمكنني مساعدتك؟',
        'مرحبا': 'مرحباً! أنا جاهز لمساعدتك.',
        '4+7': '4 + 7 = 11 🧮',
        'عاصمة مصر': 'عاصمة مصر هي القاهرة 🏛️',
    };
    
    for (const [key, value] of Object.entries(replies)) {
        if (msg.includes(key)) return value;
    }
    
    return `👋 أهلاً بك! أنا بوت تصحيح الأوراق.\n\n📸 أرسل صورة ورقة إجابة لتحليلها.\n❓ أو اسألني سؤالاً.`;
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
    
    if (method === 'GET') {
        return res.status(200).json({ status: 'active' });
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
            try {
                const reply = await chatWithFreeModel(textMessage);
                await sendWAPilotMessage(chatId, reply);
            } catch (error) {
                const fallback = getFallbackReply(textMessage);
                await sendWAPilotMessage(chatId, fallback);
            }
        } else {
            await sendWAPilotMessage(chatId, "👋 أهلاً! اكتب رسالة وسأرد عليك.");
        }
        
        return res.status(200).json({ ok: true });
    }
    
    res.status(404).send('Not Found');
};
