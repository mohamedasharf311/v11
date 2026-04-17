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
// بدعم الأسماء المختلفة للمتغيرات
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
            model = genAI.getGenerativeModel({ 
                model: "gemini-1.5-flash"
            });
        } else {
            console.log('✅ Using Google AI Studio configuration');
            genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
            model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        }
        geminiInitialized = true;
    } catch (error) {
        console.error('❌ Error initializing Gemini:', error.message);
        geminiError = error.message;
    }
} else {
    console.warn('⚠️ GEMINI_API_KEY not found in environment variables');
    console.log('Available env vars:', Object.keys(process.env).filter(k => k.includes('GEMINI') || k.includes('KEY')));
}

// --- تهيئة Vision Client ---
let visionClient;
let visionInitialized = false;
let visionError = '';

if (GOOGLE_VISION_API_KEY) {
    try {
        visionClient = new vision.ImageAnnotatorClient({
            apiKey: GOOGLE_VISION_API_KEY
        });
        visionInitialized = true;
        console.log('✅ Vision client initialized');
    } catch (error) {
        console.error('❌ Error initializing Vision:', error.message);
        visionError = error.message;
    }
} else {
    console.warn('⚠️ GOOGLE_VISION_API_KEY not found');
}

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

// =============================================
// الدالة الرئيسية لـ Vercel
// =============================================
module.exports = async (req, res) => {
    
    const url = req.url || '';
    const method = req.method || 'GET';
    
    console.log(`📥 ${method} ${url}`);

    // =============================================
    // 1️⃣ الصفحة الرئيسية (Dashboard HTML)
    // =============================================
    if (method === 'GET' && (url === '/' || url === '')) {
        try {
            const htmlPath = path.join(process.cwd(), 'public', 'index.html');
            if (fs.existsSync(htmlPath)) {
                const html = fs.readFileSync(htmlPath, 'utf8');
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                res.status(200).send(html);
            } else {
                // صفحة احتياطية لو الملف مش موجود
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                res.status(200).send(`
                    <!DOCTYPE html>
                    <html dir="rtl">
                    <head>
                        <title>بوت تصحيح الأوراق</title>
                        <style>
                            body { font-family: Arial; text-align: center; padding: 50px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; }
                            .container { background: rgba(255,255,255,0.95); border-radius: 20px; padding: 40px; max-width: 600px; margin: 0 auto; color: #333; }
                            code { background: #1a1a2e; color: #00ff88; padding: 10px; border-radius: 8px; display: block; margin: 20px 0; }
                            .status { display: inline-block; padding: 5px 15px; border-radius: 50px; margin: 5px; }
                            .online { background: #d4edda; color: #155724; }
                            .offline { background: #f8d7da; color: #721c24; }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <h1>🤖 بوت تصحيح الأوراق يعمل!</h1>
                            <p>Webhook URL:</p>
                            <code>${req.headers.host}/api/webhook</code>
                            <p>حالة الخدمات:</p>
                            <div>
                                <span class="status ${geminiInitialized ? 'online' : 'offline'}">🧠 Gemini: ${geminiInitialized ? 'متصل' : 'غير متصل'}</span>
                                <span class="status ${visionInitialized ? 'online' : 'offline'}">👁️ Vision: ${visionInitialized ? 'متصل' : 'غير متصل'}</span>
                                <span class="status ${INSTANCE_ID ? 'online' : 'offline'}">📱 WAPilot: ${INSTANCE_ID ? 'متصل' : 'غير متصل'}</span>
                            </div>
                            <p style="margin-top: 20px;">
                                🔑 Gemini Key: ${GEMINI_API_KEY ? 'موجود ✓' : 'مفقود ✗'}<br>
                                👁️ Vision Key: ${GOOGLE_VISION_API_KEY ? 'موجود ✓' : 'مفقود ✗'}
                            </p>
                            <p style="margin-top: 20px;">⬆️ استخدم الرابط أعلاه في إعدادات WAPilot</p>
                        </div>
                    </body>
                    </html>
                `);
            }
        } catch (error) {
            console.error('Error serving HTML:', error);
            res.status(500).send('Error loading page');
        }
        return;
    }

    // =============================================
    // 2️⃣ نقطة API: فحص Gemini
    // =============================================
    if (method === 'GET' && url === '/api/check-gemini') {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        
        try {
            if (!GEMINI_API_KEY) {
                return res.status(200).json({ 
                    status: 'error', 
                    message: 'Gemini API Key غير موجود في Environment Variables',
                    envKeys: Object.keys(process.env).filter(k => k.toLowerCase().includes('gemini'))
                });
            }
            
            if (!model) {
                return res.status(200).json({ 
                    status: 'error', 
                    message: 'لم يتم تهيئة نموذج Gemini: ' + geminiError
                });
            }
            
            // اختبار سريع
            const testResult = await model.generateContent('قل "تمام"');
            const response = testResult.response.text();
            
            res.status(200).json({ 
                status: 'ok', 
                model: 'Gemini 1.5 Flash',
                response: response.substring(0, 30)
            });
        } catch (error) {
            console.error('Gemini check error:', error.message);
            res.status(200).json({ 
                status: 'error', 
                message: error.message 
            });
        }
        return;
    }

    // =============================================
    // 3️⃣ نقطة API: فحص Google Vision
    // =============================================
    if (method === 'GET' && url === '/api/check-vision') {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        
        try {
            if (!GOOGLE_VISION_API_KEY) {
                return res.status(200).json({ 
                    status: 'error', 
                    message: 'Vision API Key غير موجود'
                });
            }
            
            if (!visionClient) {
                return res.status(200).json({ 
                    status: 'error', 
                    message: 'لم يتم تهيئة Vision Client: ' + visionError
                });
            }
            
            res.status(200).json({ 
                status: 'ok', 
                api: 'Cloud Vision API',
                initialized: true
            });
        } catch (error) {
            console.error('Vision check error:', error.message);
            res.status(200).json({ 
                status: 'error', 
                message: error.message 
            });
        }
        return;
    }

    // =============================================
    // 4️⃣ نقطة API: فحص WAPilot
    // =============================================
    if (method === 'GET' && url === '/api/check-wapilot') {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        
        try {
            if (INSTANCE_ID && WAPILOT_TOKEN) {
                res.status(200).json({ 
                    status: 'ok', 
                    instance: INSTANCE_ID,
                    configured: true
                });
            } else {
                res.status(200).json({ 
                    status: 'error', 
                    message: 'بيانات WAPilot غير مكتملة' 
                });
            }
        } catch (error) {
            console.error('WAPilot check error:', error.message);
            res.status(200).json({ 
                status: 'error', 
                message: error.message 
            });
        }
        return;
    }

    // =============================================
    // 5️⃣ Webhook Verification (GET) - للتحقق من WAPilot
    // =============================================
    if (method === 'GET' && url === '/api/webhook') {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.status(200).send(`✅ WAPilot OCR Bot is running!\n\nGemini: ${geminiInitialized ? 'Ready' : 'Not initialized'}\nVision: ${visionInitialized ? 'Ready' : 'Not initialized'}\n\nGemini Key: ${GEMINI_API_KEY ? 'Present' : 'Missing'}\nVision Key: ${GOOGLE_VISION_API_KEY ? 'Present' : 'Missing'}`);
        return;
    }

    // =============================================
    // 6️⃣ Webhook الرئيسي (POST) - استقبال رسائل واتساب
    // =============================================
    if (method === 'POST' && url === '/api/webhook') {
        const { body } = req;
        console.log('📨 Incoming webhook:', JSON.stringify(body).substring(0, 300));

        try {
            let from = null;
            let messageType = null;
            let mediaId = null;
            
            // استخراج البيانات من الصيغ المختلفة
            if (body.message) {
                from = body.message.from || body.message.chatId;
                messageType = body.message.type;
                if (body.message.media) {
                    mediaId = body.message.media.id;
                } else if (body.message.id && messageType === 'image') {
                    mediaId = body.message.id;
                }
            }
            
            if (!from && body.from) from = body.from;
            if (!messageType && body.type) messageType = body.type;
            if (!mediaId && body.mediaId) mediaId = body.mediaId;
            if (!mediaId && body.media?.id) mediaId = body.media.id;
            
            if (!from) {
                console.log('⚠️ No sender found');
                res.status(200).json({ success: false, error: "No sender" });
                return;
            }

            console.log(`📱 From: ${from} | Type: ${messageType}`);

            // معالجة الصورة
            if (messageType === 'image' || mediaId) {
                
                await sendWAPilotMessage(from, "⏳ جاري تحليل الصورة واستخراج النص...");

                const imageUrl = await getWAPilotMedia(mediaId);
                
                if (!imageUrl) {
                    await sendWAPilotMessage(from, "❌ لم أتمكن من تحميل الصورة.");
                    res.status(200).json({ success: false });
                    return;
                }

                // OCR
                let extractedText = "";
                if (visionClient) {
                    try {
                        const [result] = await visionClient.textDetection(imageUrl);
                        const detections = result.textAnnotations;
                        
                        if (detections && detections.length > 0) {
                            extractedText = detections[0].description;
                        } else {
                            extractedText = "عذراً، لم يتم التعرف على أي نص.";
                        }
                    } catch (ocrError) {
                        console.error("OCR Error:", ocrError.message);
                        extractedText = "خطأ في استخراج النص.";
                    }
                } else {
                    extractedText = "Vision API غير مهيأة.";
                }

                // Gemini
                let aiResponse = "";
                if (extractedText.length > 5 && !extractedText.includes("عذراً") && !extractedText.includes("خطأ")) {
                    if (model) {
                        try {
                            const prompt = `أنت مصحح آلي. النص التالي من ورقة إجابة:
                            
"${extractedText}"

المطلوب: صحح الأخطاء الإملائية، وأجب عن أي سؤال. أجب بالعربية.`;

                            const aiResult = await model.generateContent(prompt);
                            aiResponse = aiResult.response.text();
                        } catch (aiError) {
                            console.error("Gemini Error:", aiError.message);
                            aiResponse = "خطأ في التحليل.";
                        }
                    } else {
                        aiResponse = "Gemini غير مهيأ.";
                    }
                } else {
                    aiResponse = "لم يتم استخراج نص كافٍ.";
                }

                // الرد
                let finalMessage = `📝 النص المستخرج:\n${extractedText.substring(0, 500)}\n`;
                finalMessage += `━━━━━━━━━━━━━━━\n`;
                finalMessage += `🤖 تحليل Gemini:\n${aiResponse.substring(0, 800)}`;
                
                finalMessage = finalMessage.replace(/[*_~`]/g, '');
                
                await sendWAPilotMessage(from, finalMessage);
                
            } else {
                await sendWAPilotMessage(
                    from, 
                    "📸 مرحباً! من فضلك أرسل صورة ورقة الإجابة لتحليلها."
                );
            }

        } catch (error) {
            console.error("❌ General Error:", error.message);
        }

        res.status(200).json({ success: true });
        return;
    }

    // =============================================
    // أي طلب تاني - 404
    // =============================================
    res.status(404).json({ error: 'Not Found', url: url });
};
