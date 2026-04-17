// api/webhook.js
const axios = require('axios');
const vision = require('@google-cloud/vision');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require('fs');
const path = require('path');

// --- إعدادات WAPilot ---
const INSTANCE_ID = "instance3532";
const WAPILOT_TOKEN = "yzWzEjmxZpbifuOx6lWafYT3Ng69gaFpJGAdTsVc6N";
const BASE_URL = "https://api.wapilot.com/v1";

// --- إعدادات Google (من Environment Variables) ---
const GEMINI_API_KEY = process.env.Gemini_API_Key;
const GOOGLE_VISION_API_KEY = process.env.GOOGLE_VISION_API_KEY;

// --- تهيئة Gemini ---
let genAI;
let model;

if (GEMINI_API_KEY) {
    try {
        if (GEMINI_API_KEY.startsWith('AQ.')) {
            console.log('✅ Using Vertex AI configuration');
            genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
            model = genAI.getGenerativeModel({ 
                model: "gemini-1.5-flash"
            }, {
                apiVersion: "v1beta"
            });
        } else {
            console.log('✅ Using Google AI Studio configuration');
            genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
            model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        }
    } catch (error) {
        console.error('❌ Error initializing Gemini:', error.message);
    }
}

// --- تهيئة Vision Client ---
const visionClient = new vision.ImageAnnotatorClient({
    apiKey: GOOGLE_VISION_API_KEY
});

// --- دالة إرسال رسالة عبر WAPilot ---
async function sendWAPilotMessage(to, text) {
    try {
        const shortText = text.length > 4000 ? text.substring(0, 3990) + "..." : text;
        
        await axios.post(`${BASE_URL}/send-message`, {
            instance_id: INSTANCE_ID,
            token: WAPILOT_TOKEN,
            phone: to,
            message: shortText
        });
        console.log(`✅ Message sent to ${to}`);
    } catch (error) {
        console.error("❌ Error sending message:", error.response?.data || error.message);
    }
}

// --- دالة جلب صورة من WAPilot ---
async function getWAPilotMedia(mediaId) {
    try {
        const response = await axios.get(`${BASE_URL}/media`, {
            params: {
                instance_id: INSTANCE_ID,
                token: WAPILOT_TOKEN,
                media_id: mediaId
            }
        });
        return response.data.url || response.data.base64 || response.data.file_url;
    } catch (error) {
        console.error("❌ Error fetching media:", error.response?.data || error.message);
        return null;
    }
}

// --- دالة Vercel الأساسية ---
module.exports = async (req, res) => {
    
    const url = req.url || '';

    // =============================================
    // نقطة API: عرض صفحة الـ Dashboard
    // =============================================
    if (req.method === 'GET' && (url === '/' || url === '/index.html' || url === '')) {
        try {
            const htmlPath = path.join(process.cwd(), 'public', 'index.html');
            const html = fs.readFileSync(htmlPath, 'utf8');
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.status(200).send(html);
        } catch (error) {
            res.status(200).send(`
                <!DOCTYPE html>
                <html dir="rtl">
                <head>
                    <title>بوت تصحيح الأوراق</title>
                    <style>
                        body { font-family: Arial; text-align: center; padding: 50px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; }
                        .container { background: rgba(255,255,255,0.95); border-radius: 20px; padding: 40px; max-width: 600px; margin: 0 auto; color: #333; }
                        code { background: #1a1a2e; color: #00ff88; padding: 10px; border-radius: 8px; display: block; margin: 20px 0; }
                        a { color: #667eea; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>🤖 بوت تصحيح الأوراق يعمل!</h1>
                        <p>Webhook URL:</p>
                        <code>${req.headers.host}/api/webhook</code>
                        <p>⬆️ استخدم هذا الرابط في إعدادات WAPilot</p>
                        <p><a href="/api/check-gemini">فحص Gemini</a> | <a href="/api/check-vision">فحص Vision</a></p>
                    </div>
                </body>
                </html>
            `);
        }
        return;
    }

    // =============================================
    // نقطة API: فحص Gemini
    // =============================================
    if (req.method === 'GET' && url === '/api/check-gemini') {
        try {
            if (!GEMINI_API_KEY) {
                throw new Error('Gemini API Key not configured');
            }
            
            if (!model) {
                throw new Error('Gemini model not initialized');
            }
            
            const testResult = await model.generateContent('Say "OK" in Arabic');
            const response = testResult.response.text();
            
            res.status(200).json({ 
                status: 'ok', 
                model: 'Gemini 1.5 Flash',
                response: response.substring(0, 20)
            });
        } catch (error) {
            res.status(500).json({ 
                status: 'error', 
                message: error.message 
            });
        }
        return;
    }

    // =============================================
    // نقطة API: فحص Google Vision
    // =============================================
    if (req.method === 'GET' && url === '/api/check-vision') {
        try {
            if (!GOOGLE_VISION_API_KEY) {
                throw new Error('Vision API Key not configured');
            }
            
            res.status(200).json({ 
                status: 'ok', 
                api: 'Cloud Vision API'
            });
        } catch (error) {
            res.status(500).json({ 
                status: 'error', 
                message: error.message 
            });
        }
        return;
    }

    // =============================================
    // نقطة API: فحص WAPilot
    // =============================================
    if (req.method === 'GET' && url === '/api/check-wapilot') {
        try {
            if (INSTANCE_ID && WAPILOT_TOKEN) {
                res.status(200).json({ 
                    status: 'ok', 
                    instance: INSTANCE_ID,
                    note: 'Credentials configured'
                });
            } else {
                throw new Error('WAPilot credentials not configured');
            }
        } catch (error) {
            res.status(500).json({ 
                status: 'error', 
                message: error.message 
            });
        }
        return;
    }

    // =============================================
    // نقطة API: الـ Webhook الرئيسي لـ WAPilot
    // =============================================
    if (req.method === 'GET' && url === '/api/webhook') {
        res.status(200).send('✅ WAPilot OCR Bot is running!\n\nGemini: ' + (model ? 'Ready' : 'Not initialized'));
        return;
    }
    
    // استقبال POST من WAPilot
    if (req.method === 'POST' && url === '/api/webhook') {
        const { body } = req;
        console.log('📨 Incoming webhook:', JSON.stringify(body).substring(0, 500));

        try {
            let from = null;
            let messageType = null;
            let mediaId = null;
            let textContent = null;
            
            if (body.message) {
                from = body.message.from || body.message.chatId;
                messageType = body.message.type;
                textContent = body.message.text || body.message.body;
                if (body.message.media) {
                    mediaId = body.message.media.id;
                } else if (body.message.id && messageType === 'image') {
                    mediaId = body.message.id;
                }
            }
            
            if (!from && body.from) from = body.from;
            if (!messageType && body.type) messageType = body.type;
            if (!textContent && body.body) textContent = body.body;
            if (!mediaId && body.mediaId) mediaId = body.mediaId;
            if (!mediaId && body.media?.id) mediaId = body.media.id;
            
            if (!from) {
                console.log('⚠️ No sender found in payload');
                res.status(200).json({ success: false, error: "No sender" });
                return;
            }

            console.log(`📱 From: ${from} | Type: ${messageType}`);

            if (messageType === 'image' || mediaId || (body.message?.media?.type === 'image')) {
                
                await sendWAPilotMessage(from, "⏳ جاري تحليل الصورة واستخراج النص...");

                const imageUrl = await getWAPilotMedia(mediaId);
                
                if (!imageUrl) {
                    await sendWAPilotMessage(from, "❌ لم أتمكن من تحميل الصورة.");
                    res.status(200).json({ success: false });
                    return;
                }

                let extractedText = "";
                try {
                    const [result] = await visionClient.textDetection(imageUrl);
                    const detections = result.textAnnotations;
                    
                    if (detections && detections.length > 0) {
                        extractedText = detections[0].description;
                        console.log(`📝 OCR Success: ${extractedText.length} chars`);
                    } else {
                        extractedText = "عذراً، لم يتم التعرف على أي نص في الصورة.";
                    }
                } catch (ocrError) {
                    console.error("❌ OCR Error:", ocrError.message);
                    extractedText = "خطأ في استخراج النص من الصورة.";
                }

                let aiResponse = "";
                if (extractedText.length > 5 && !extractedText.includes("عذراً") && !extractedText.includes("خطأ")) {
                    try {
                        if (!model) throw new Error("Gemini not initialized");

                        const prompt = `أنت مصحح آلي للمناهج الدراسية العربية. النص التالي مستخرج من ورقة إجابة طالب:
                        
"${extractedText}"

المطلوب:
1. صحح الأخطاء الإملائية والنحوية الواضحة.
2. إذا كان هناك سؤال في النص، أجب عنه بإجابة نموذجية مختصرة.
3. إذا لم يكن هناك سؤال، قدم ملخصاً بسيطاً للمحتوى.
4. أجب باللغة العربية الفصحى.`;

                        const aiResult = await model.generateContent(prompt);
                        aiResponse = aiResult.response.text();
                        console.log(`🤖 Gemini Success`);
                    } catch (aiError) {
                        console.error("❌ Gemini Error:", aiError.message);
                        aiResponse = "خطأ في تحليل النص بالذكاء الاصطناعي.";
                    }
                } else {
                    aiResponse = "لم يتم استخراج نص كافٍ للتحليل.";
                }

                let finalMessage = "";
                finalMessage += `📝 النص المستخرج:\n${extractedText.substring(0, 800)}\n`;
                finalMessage += `━━━━━━━━━━━━━━━\n`;
                finalMessage += `🤖 تحليل Gemini:\n${aiResponse.substring(0, 1200)}`;
                
                finalMessage = finalMessage.replace(/[*_~`]/g, '');
                
                await sendWAPilotMessage(from, finalMessage);
                
            } else {
                await sendWAPilotMessage(
                    from, 
                    "📸 *مرحباً بك في بوت تصحيح الأوراق!*\n\nمن فضلك أرسل صورة واضحة لورقة الإجابة وسأقوم بـ:\n✅ استخراج النص المكتوب\n✅ تصحيح الأخطاء الإملائية\n✅ الإجابة عن الأسئلة"
                );
            }

        } catch (error) {
            console.error("❌ General Error:", error.message);
        }

        res.status(200).json({ success: true });
        return;
    }

    // أي طلب تاني
    res.status(404).send('Not Found');
};
