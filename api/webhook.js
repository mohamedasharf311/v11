// api/webhook.js
const axios = require('axios');

// --- إعدادات WAPILOT ---
const INSTANCE_ID = "instance3532";
const WAPILOT_TOKEN = "yzWzEjmxZpbifuOx6lWafYT3Ng69gaFpJGAdTsVc6N";
const WAPILOT_API_URL = "https://api.wapilot.net/api/v2";

// --- إعدادات OpenRouter ---
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

// --- الـ Prompt التعليمي ---
const SYSTEM_PROMPT = `أنت مدرس صبور لطلاب المرحلة الإعدادية.

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

تخصصك: مساعدة الطلاب في فهم المسائل وحلها بأنفسهم. أنت مش بتدي الإجابة، أنت بتفهمهم.`;

// قائمة النماذج المجانية (هنحاول نستخدم أول واحد شغال)
const MODELS = [
    'qwen/qwen-2.5-7b-instruct',      // Qwen 7B - الأفضل للعربي
    'qwen/qwen-2.5-3b-instruct',      // Qwen 3B - أسرع
    'google/gemini-2.0-flash-001',    // Gemini 2.0 Flash
    'meta-llama/llama-3.2-3b-instruct' // Llama 3.2
];

// --- دالة المحادثة مع الذكاء الاصطناعي (مع الـ Prompt التعليمي) ---
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
                            content: SYSTEM_PROMPT  // ✅ الـ Prompt التعليمي
                        },
                        {
                            role: "user",
                            content: message
                        }
                    ],
                    temperature: 0.7,
                    max_tokens: 600
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                        'HTTP-Referer': 'https://school-gamma-ten.vercel.app',
                        'X-Title': 'Educational Bot - مدرس إعدادية'
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

// --- رد احتياطي لو الذكاء الاصطناعي مش شغال ---
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
        return `🧮 ${num1} ${op} ${num2} = ${result}\n\n*دي الإجابة المباشرة، لكن الأفضل تفهم إزاي جت!*`;
    }
    
    const replies = {
        'اهلا': 'أهلاً بيك يا بطل! 👋 أنا مدرسك الخاص. قولي السؤال اللي مش فاهمه وأنا هساعدك تفهمه بنفسك.',
        'مرحبا': 'مرحباً! مستعد تتعلم حاجة جديدة؟ 🧑‍🏫',
        'السلام عليكم': 'وعليكم السلام ورحمة الله وبركاته! قولي يا بطل، فيه حاجة مش فاهمها؟',
        'عامل ايه': 'الحمد لله تمام! جاهز أساعدك تتعلم. إنت قولي، فيه سؤال محتاج تفهمه؟',
        'انت مين': 'أنا مدرسك الخاص 🤖 متخصص في مساعدة طلاب الإعدادية. مش بديلك الإجابة، لكني بخليك تفهمها بنفسك! 💪',
        'بتعرف تعمل ايه': 'أنا متخصص في شرح المسائل لطلاب الإعدادية. بسألك أسئلة تخليك توصل للحل بنفسك. متعة الفهم أحلى من الإجابة الجاهزة! 🎓',
        'اخبارك': 'كويس الحمد لله! جاهز نبدأ نفهم سؤال جديد؟',
        'شكرا': 'العفو يا بطل! أنا موجود عشان أساعدك 🙌',
        'تمام': 'ممتاز! خلينا نشوف سؤال تاني تفهمه 👏',
    };
    
    for (const [key, value] of Object.entries(replies)) {
        if (msg.includes(key)) return value;
    }
    
    return `🎓 *أهلاً بيك في بوت التعليم!*\n\nأنا هنا عشان أفهمك مش أديك الإجابة.\n\nقولي السؤال اللي مش فاهمه، وأنا هسألك أسئلة تخليك تفهمه بنفسك.\n\nمثال:\n- "ازاي نحسب مساحة المستطيل؟"\n- "يعني إيه عدد أولي؟"\n- "ازاي أعرف الفاعل في الجملة؟"`;
}

// --- دالة إرسال رسالة عبر WAPILOT ---
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

// =============================================
// الدالة الرئيسية
// =============================================
module.exports = async (req, res) => {
    const url = req.url || '';
    const method = req.method || 'GET';
    
    // Webhook Verification
    if (method === 'GET' && url === '/api/webhook') {
        return res.status(200).json({ 
            status: 'active',
            openrouter: !!OPENROUTER_API_KEY,
            models: MODELS,
            prompt: 'مدرس إعدادية صبور'
        });
    }

    // الصفحة الرئيسية
    if (method === 'GET' && (url === '/' || url === '')) {
        return res.status(200).send(`
            <!DOCTYPE html>
            <html dir="rtl">
            <head>
                <title>مدرس الإعدادية - بوت تعليمي</title>
                <style>
                    body { 
                        font-family: Arial; 
                        text-align: center; 
                        padding: 50px; 
                        background: linear-gradient(135deg, #1e3c72, #2a5298); 
                        color: white; 
                        min-height: 100vh;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    }
                    .container {
                        background: rgba(255,255,255,0.1);
                        backdrop-filter: blur(10px);
                        border-radius: 24px;
                        padding: 40px;
                        max-width: 600px;
                        border: 1px solid rgba(255,255,255,0.2);
                    }
                    h1 { 
                        color: #ffd700; 
                        margin-bottom: 10px;
                        font-size: 2.5rem;
                    }
                    .status { 
                        display: inline-block; 
                        padding: 8px 20px; 
                        border-radius: 50px; 
                        margin: 10px 5px;
                        font-weight: bold;
                    }
                    .online { background: #10b981; color: white; }
                    .offline { background: #ef4444; color: white; }
                    .prompt-box {
                        background: rgba(0,0,0,0.3);
                        border-radius: 16px;
                        padding: 20px;
                        margin: 30px 0;
                        text-align: right;
                        border-left: 4px solid #ffd700;
                    }
                    .prompt-box h3 {
                        color: #ffd700;
                        margin-bottom: 15px;
                    }
                    .prompt-box p {
                        line-height: 1.8;
                        margin: 5px 0;
                    }
                    .feature {
                        display: inline-block;
                        background: rgba(255,215,0,0.2);
                        padding: 5px 12px;
                        border-radius: 20px;
                        margin: 5px;
                        font-size: 0.9rem;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>🧑‍🏫 مدرس الإعدادية</h1>
                    <p style="font-size: 1.2rem; color: #e0e0e0;">مش بيديك الإجابة... بيفهمك إزاي توصلها!</p>
                    
                    <div>
                        <span class="status ${OPENROUTER_API_KEY ? 'online' : 'offline'}">🤖 الذكاء الاصطناعي: ${OPENROUTER_API_KEY ? 'متصل' : 'غير متصل'}</span>
                        <span class="status online">📱 واتساب: متصل</span>
                    </div>
                    
                    <div class="prompt-box">
                        <h3>📋 قواعد المدرس:</h3>
                        <p>✅ ما يعطيش الإجابة مباشرة</p>
                        <p>✅ يسأل أسئلة تقود الطالب للحل</p>
                        <p>✅ لو الطالب أجاب صح → يكمل</p>
                        <p>✅ لو أخطأ → يبسّط السؤال</p>
                        <p>✅ لو قال "مش عارف" → يديله hint</p>
                        <p>✅ بعد محاولتين → يشرح الحل خطوة بخطوة</p>
                    </div>
                    
                    <div>
                        <span class="feature">🗣️ لهجة مصرية</span>
                        <span class="feature">🎯 صبور</span>
                        <span class="feature">🏆 يشجع الطالب</span>
                        <span class="feature">📚 للمرحلة الإعدادية</span>
                    </div>
                    
                    <p style="margin-top: 30px; opacity: 0.8;">
                        📱 جرب البوت على واتساب: <strong>+20 119 383 101</strong><br>
                        اكتب سؤالك وهو هيساعدك تفهمه
                    </p>
                </div>
            </body>
            </html>
        `);
    }

    // استقبال رسائل واتساب
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
                    // إرسال "بيتكلم..." مؤقت
                    await sendWAPilotMessage(chatId, "🧑‍🏫 *المدرس بيفكر...*");
                    
                    const reply = await chatWithAI(textMessage);
                    await sendWAPilotMessage(chatId, reply);
                } catch (error) {
                    console.log('⚠️ AI failed, using fallback');
                    const fallback = getFallbackReply(textMessage);
                    await sendWAPilotMessage(chatId, fallback);
                }
            } else {
                const fallback = getFallbackReply(textMessage);
                await sendWAPilotMessage(chatId, fallback);
            }
        } else {
            await sendWAPilotMessage(chatId, "🧑‍🏫 *أهلاً بيك!*\n\nأنا مدرسك الخاص. قولي السؤال اللي مش فاهمه وأنا هساعدك تفهمه بنفسك. 💪");
        }
        
        return res.status(200).json({ ok: true });
    }
    
    res.status(404).send('Not Found');
};
