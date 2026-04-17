// api/webhook.js
const axios = require('axios');
const vision = require('@google-cloud/vision');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require('fs');
const path = require('path');

// --- إعدادات WAPilot ---
const INSTANCE_ID = "instance3532";
const WAPILOT_TOKEN = "yzWzEjmxZpbifuOx6lWafYT3Ng69gaFpJGAdTsVc6N";

// --- إعدادات Google (من Environment Variables) ---
const GEMINI_API_KEY = process.env.Gemini_API_Key || process.env.GEMINI_API_KEY || '';
const GOOGLE_VISION_API_KEY = process.env.GOOGLE_VISION_API_KEY || '';

// --- تهيئة Gemini ---
let genAI;
let model;
let geminiInitialized = false;
let geminiError = '';

if (GEMINI_API_KEY) {
    try {
        console.log('🔑 Initializing Gemini with key length:', GEMINI_API_KEY.length);
        
        if (GEMINI_API_KEY.startsWith('AQ.')) {
            console.log('✅ Using Vertex AI configuration');
            genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
            model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        } else {
            console.log('✅ Using Google AI Studio configuration');
            genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
            model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        }
        geminiInitialized = true;
        console.log('✅ Gemini Ready');
    } catch (error) {
        console.error('❌ Gemini Error:', error.message);
        geminiError = error.message;
    }
} else {
    console.warn('⚠️ GEMINI_API_KEY not found');
}

// --- تهيئة Vision Client ---
let visionClient;
let visionInitialized = false;
let visionError = '';

if (GOOGLE_VISION_API_KEY) {
    try {
        visionClient = new vision.ImageAnnotatorClient({ apiKey: GOOGLE_VISION_API_KEY });
        visionInitialized = true;
        console.log('✅ Vision Ready');
    } catch (error) {
        console.error('❌ Vision Error:', error.message);
        visionError = error.message;
    }
} else {
    console.warn('⚠️ GOOGLE_VISION_API_KEY not found');
}

// =============================================
// دالة إرسال رسالة عبر WAPilot (محسنة مع retry و multiple endpoints)
// =============================================
async function sendWAPilotMessage(to, text, retries = 3) {
    // تنظيف الرقم من @lid أو @c.us
    const cleanPhone = to.replace(/@.*$/, '').replace(/\D/g, '');
    
    console.log(`📤 Sending to ${cleanPhone}: ${text.substring(0, 50)}...`);

    // قائمة الـ endpoints المحتملة
    const endpoints = [
        'https://api.wapilot.com/v1/send-message',
        'https://api.wapilot.com/v1/messages/send',
        'https://api.wapilot.com/v1/message/send',
        'https://api.wapilot.com/v1/chat/send',
        'https://api.wapilot.com/v1/send'
    ];

    let lastError = null;

    // نجرب كل endpoint
    for (const endpoint of endpoints) {
        let currentRetries = retries;
        
        while (currentRetries > 0) {
            try {
                const attemptNumber = retries - currentRetries + 1;
                console.log(`🔄 Trying ${endpoint} (attempt ${attemptNumber}/${retries})`);
                
                const response = await axios.post(
                    endpoint,
                    {
                        instance_id: INSTANCE_ID,
                        token: WAPILOT_TOKEN,
                        phone: cleanPhone,
                        message: text
                    },
                    {
                        timeout: 15000 // 15 ثانية
                    }
                );

                console.log(`✅ Message sent successfully via ${endpoint}`);
                console.log(`📨 Response:`, JSON.stringify(response.data).substring(0, 200));
                return true;

            } catch (error) {
                lastError = error;
                
                // تحليل نوع الخطأ
                const status = error.response?.status;
                const code = error.code;
                
                console.warn(`⚠️ Failed on ${endpoint}:`, {
                    status,
                    code,
                    message: error.message
                });
                
                // لو الخطأ 522 (Cloudflare timeout) أو 504 (Gateway timeout) أو Connection timeout
                if (code === 'ECONNABORTED' || status === 522 || status === 504 || code === 'ETIMEDOUT') {
                    currentRetries--;
                    
                    if (currentRetries > 0) {
                        console.log(`⏳ Waiting 2 seconds before retry...`);
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    }
                } else {
                    // خطأ تاني (400, 401, 500) - منكملش المحاولات على الـ endpoint ده
                    console.error(`❌ Non-retryable error on ${endpoint}:`, error.response?.data || error.message);
                    break;
                }
            }
        }
        
        console.log(`🔄 Switching to next endpoint...`);
    }

    // كل الحلول فشلت
    console.error(`❌ All endpoints failed. Last error:`, lastError?.message);
    
    if (lastError?.response) {
        console.error(`❌ Status: ${lastError.response.status}`);
        console.error(`❌ Data:`, JSON.stringify(lastError.response.data).substring(0, 500));
    }
    
    return false;
}

// =============================================
// دالة جلب صورة من WAPilot (محسنة مع multiple endpoints)
// =============================================
async function getWAPilotMedia(mediaId) {
    console.log(`🖼️ Fetching media ID: ${mediaId}`);
    
    const endpoints = [
        {
            url: 'https://api.wapilot.com/v1/media',
            params: { instance_id: INSTANCE_ID, token: WAPILOT_TOKEN, media_id: mediaId }
        },
        {
            url: `https://api.wapilot.com/v1/media/${mediaId}`,
            params: { instance_id: INSTANCE_ID, token: WAPILOT_TOKEN }
        },
        {
            url: 'https://api.wapilot.com/v1/files',
            params: { instance_id: INSTANCE_ID, token: WAPILOT_TOKEN, file_id: mediaId }
        },
        {
            url: 'https://api.wapilot.com/v1/download',
            params: { instance_id: INSTANCE_ID, token: WAPILOT_TOKEN, media_id: mediaId }
        }
    ];
    
    for (const endpoint of endpoints) {
        try {
            console.log(`🔄 Trying media endpoint: ${endpoint.url}`);
            
            const response = await axios.get(endpoint.url, {
                params: endpoint.params,
                timeout: 15000
            });
            
            console.log(`📦 Media response:`, JSON.stringify(response.data).substring(0, 300));
            
            // استخراج الرابط من الصيغ المختلفة
            const imageUrl = response.data.url || 
                            response.data.file_url || 
                            response.data.media_url ||
                            response.data.link ||
                            response.data.base64 ||
                            (response.data.data && response.data.data.url);
            
            if (imageUrl) {
                console.log(`✅ Media URL found`);
                return imageUrl;
            }
            
        } catch (error) {
            console.warn(`⚠️ Failed on ${endpoint.url}:`, error.message);
        }
    }
    
    console.error(`❌ Could not fetch media for ID: ${mediaId}`);
    return null;
}

// =============================================
// الدالة الرئيسية لـ Vercel
// =============================================
module.exports = async (req, res) => {
    
    const url = req.url || '';
    const method = req.method || 'GET';
    
    console.log(`📥 ${method} ${url}`);

    // =============================================
    // الصفحة الرئيسية (Dashboard HTML)
    // =============================================
    if (method === 'GET' && (url === '/' || url === '')) {
        try {
            const htmlPath = path.join(process.cwd(), 'public', 'index.html');
            if (fs.existsSync(htmlPath)) {
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                res.status(200).send(fs.readFileSync(htmlPath, 'utf8'));
            } else {
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                res.status(200).send(`
                    <!DOCTYPE html>
                    <html dir="rtl">
                    <head>
                        <title>بوت تصحيح الأوراق</title>
                        <style>
                            body { font-family: Arial; text-align: center; padding: 50px; background: linear-gradient(135deg, #1a1a2e, #16213e); color: white; }
                            .container { background: white; border-radius: 20px; padding: 40px; max-width: 500px; margin: 0 auto; color: #333; }
                            .status { display: inline-block; padding: 8px 20px; border-radius: 50px; margin: 5px; }
                            .online { background: #10b981; color: white; }
                            .offline { background: #ef4444; color: white; }
                            code { background: #1a1a2e; color: #10b981; padding: 15px; border-radius: 8px; display: block; margin: 20px 0; direction: ltr; }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <h1>🤖 بوت تصحيح الأوراق</h1>
                            <p>Webhook URL:</p>
                            <code>${req.headers.host}/api/webhook</code>
                            <div>
                                <span class="status ${geminiInitialized ? 'online' : 'offline'}">🧠 Gemini: ${geminiInitialized ? 'متصل' : 'غير متصل'}</span>
                                <span class="status ${visionInitialized ? 'online' : 'offline'}">👁️ Vision: ${visionInitialized ? 'متصل' : 'غير متصل'}</span>
                                <span class="status online">📱 WAPilot: جاهز</span>
                            </div>
                        </div>
                    </body>
                    </html>
                `);
            }
        } catch (error) {
            console.error('HTML Error:', error);
            res.status(500).send('Error');
        }
        return;
    }

    // =============================================
    // Webhook Verification (GET)
    // =============================================
    if (method === 'GET' && url === '/api/webhook') {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.status(200).send(`✅ Bot Ready!\nGemini: ${geminiInitialized ? 'Ready' : 'No'}\nVision: ${visionInitialized ? 'Ready' : 'No'}\nGemini Key: ${GEMINI_API_KEY ? 'Present' : 'Missing'}\nVision Key: ${GOOGLE_VISION_API_KEY ? 'Present' : 'Missing'}`);
        return;
    }

    // =============================================
    // استقبال رسائل واتساب (POST)
    // =============================================
    if (method === 'POST' && url === '/api/webhook') {
        const { body } = req;
        
        console.log('📨 ========== WEBHOOK RECEIVED ==========');
        console.log('📨 Event:', body.event);
        console.log('📨 FULL BODY:', JSON.stringify(body, null, 2).substring(0, 1000));
        console.log('📨 ========================================');
        
        try {
            let from = null;
            let hasMedia = false;
            let mediaId = null;
            let textContent = '';
            let messageType = 'text';
            
            // استخراج البيانات من تنسيق WAPilot
            if (body.payload) {
                from = body.payload.from || body.payload.chatId || body.payload.sender;
                hasMedia = body.payload.hasMedia || false;
                textContent = body.payload.body || body.payload.text || body.payload.caption || '';
                
                // استخراج mediaId
                if (body.payload.media) {
                    mediaId = body.payload.media.id || body.payload.media;
                } else if (body.payload.mediaId) {
                    mediaId = body.payload.mediaId;
                } else if (body.payload.id && hasMedia) {
                    mediaId = body.payload.id;
                }
                
                if (hasMedia) {
                    messageType = body.payload.mediaType || 'image';
                }
            }
            
            // صيغ بديلة
            if (!from && body.from) from = body.from;
            if (!from && body.sender) from = body.sender;
            if (!from && body.payload?.id) {
                from = body.payload.id.split('@')[0];
            }
            
            console.log('📱 From:', from);
            console.log('📝 Message:', textContent);
            console.log('🖼️ Has Media:', hasMedia);
            console.log('🆔 Media ID:', mediaId);
            console.log('📎 Type:', messageType);
            
            if (!from) {
                console.log('⚠️ No sender found in payload');
                console.log('Available keys:', Object.keys(body));
                res.status(200).json({ success: false, error: "No sender" });
                return;
            }

            // =============================================
            // معالجة الصورة
            // =============================================
            if (hasMedia && mediaId) {
                console.log('🖼️ Processing image...');
                
                // إرسال رسالة "جاري المعالجة"
                await sendWAPilotMessage(from, "⏳ جاري تحليل الصورة واستخراج النص...");
                
                // جلب الصورة
                const imageUrl = await getWAPilotMedia(mediaId);
                console.log('🔗 Image URL result:', imageUrl ? 'Success' : 'Failed');
                
                if (!imageUrl) {
                    await sendWAPilotMessage(from, "❌ لم أتمكن من تحميل الصورة. تأكد من إرسال صورة صالحة.");
                    res.status(200).json({ success: false });
                    return;
                }

                // =============================================
                // Google Vision OCR
                // =============================================
                let extractedText = "";
                if (visionClient) {
                    try {
                        console.log('👁️ Calling Vision OCR...');
                        
                        // لو الرابط base64
                        let imageInput = imageUrl;
                        if (imageUrl.startsWith('data:image')) {
                            imageInput = { content: imageUrl.split(',')[1] };
                        }
                        
                        const [result] = await visionClient.textDetection(imageInput);
                        
                        if (result.textAnnotations?.length > 0) {
                            extractedText = result.textAnnotations[0].description;
                            console.log('📝 OCR Success:', extractedText.length, 'characters');
                            console.log('📝 Preview:', extractedText.substring(0, 150));
                        } else {
                            extractedText = "عذراً، لم يتم التعرف على أي نص في الصورة.";
                            console.log('📝 OCR: No text found');
                        }
                    } catch (ocrError) {
                        console.error('❌ OCR Error:', ocrError.message);
                        extractedText = "خطأ في استخراج النص من الصورة.";
                    }
                } else {
                    extractedText = "Vision API غير مهيأة.";
                    console.log('⚠️ Vision client not initialized');
                }

                // =============================================
                // Gemini AI Analysis
                // =============================================
                let aiResponse = "";
                if (extractedText.length > 5 && !extractedText.includes("عذراً") && !extractedText.includes("خطأ")) {
                    if (model) {
                        try {
                            console.log('🤖 Calling Gemini...');
                            
                            const prompt = `أنت مصحح آلي للمناهج الدراسية العربية. النص التالي مستخرج من ورقة إجابة طالب:
                            
"${extractedText}"

المطلوب:
1. صحح الأخطاء الإملائية والنحوية الواضحة.
2. إذا كان هناك سؤال في النص، أجب عنه بإجابة نموذجية مختصرة.
3. إذا لم يكن هناك سؤال، قدم ملخصاً بسيطاً للمحتوى.
4. أجب باللغة العربية الفصحى.`;

                            const aiResult = await model.generateContent(prompt);
                            aiResponse = aiResult.response.text();
                            
                            console.log('🤖 Gemini Success:', aiResponse.length, 'characters');
                            console.log('🤖 Preview:', aiResponse.substring(0, 150));
                        } catch (aiError) {
                            console.error('❌ Gemini Error:', aiError.message);
                            aiResponse = "خطأ في تحليل النص بالذكاء الاصطناعي.";
                        }
                    } else {
                        aiResponse = "Gemini غير مهيأ.";
                        console.log('⚠️ Gemini model not initialized');
                    }
                } else {
                    aiResponse = extractedText.length <= 5 ? 
                        "النص المستخرج قصير جداً. تأكد من وضوح الصورة." : 
                        "لم يتم استخراج نص كافٍ للتحليل.";
                    console.log('⚠️ Text too short or error in OCR');
                }

                // =============================================
                // إرسال الرد النهائي
                // =============================================
                let finalMessage = `📝 *النص المستخرج:*\n${extractedText.substring(0, 600)}\n`;
                finalMessage += `━━━━━━━━━━━━━━━\n`;
                finalMessage += `🤖 *تحليل Gemini:*\n${aiResponse.substring(0, 1000)}`;
                
                console.log('📤 Sending final response...');
                const sent = await sendWAPilotMessage(from, finalMessage);
                
                if (sent) {
                    console.log('✅ Response sent successfully!');
                } else {
                    console.error('❌ Failed to send final response after all retries');
                }
                
            } else {
                // =============================================
                // رسالة نصية عادية
                // =============================================
                console.log('💬 Text message received:', textContent);
                
                const welcomeMessage = "📸 *مرحباً بك في بوت تصحيح الأوراق!*\n\n" +
                    "من فضلك أرسل صورة واضحة لورقة الإجابة وسأقوم بـ:\n" +
                    "✅ استخراج النص المكتوب\n" +
                    "✅ تصحيح الأخطاء الإملائية\n" +
                    "✅ الإجابة عن الأسئلة\n\n" +
                    "*تأكد من أن الصورة واضحة ومضاءة جيداً.*";
                
                const sent = await sendWAPilotMessage(from, welcomeMessage);
                
                if (sent) {
                    console.log('✅ Welcome message sent!');
                } else {
                    console.error('❌ Failed to send welcome message');
                }
            }

        } catch (error) {
            console.error("❌ GENERAL ERROR:", error.message);
            console.error("❌ STACK:", error.stack);
        }

        res.status(200).json({ success: true });
        return;
    }

    // =============================================
    // أي طلب تاني - 404
    // =============================================
    res.status(404).send('Not Found');
};
