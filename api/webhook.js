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

// --- دالة إرسال رسالة عبر WAPilot ---
async function sendWAPilotMessage(to, text) {
    try {
        console.log(`📤 Sending to ${to}: ${text.substring(0, 50)}...`);
        const shortText = text.length > 4000 ? text.substring(0, 3990) + "..." : text;
        
        const response = await axios.post(`${BASE_URL}/send-message`, {
            instance_id: INSTANCE_ID,
            token: WAPILOT_TOKEN,
            phone: to,
            message: shortText
        });
        console.log('✅ WAPilot response:', response.data);
    } catch (error) {
        console.error("❌ Send Error:", error.response?.data || error.message);
    }
}

// --- دالة جلب صورة من WAPilot ---
async function getWAPilotMedia(mediaId) {
    try {
        console.log('🖼️ Fetching media:', mediaId);
        const response = await axios.get(`${BASE_URL}/media`, {
            params: { 
                instance_id: INSTANCE_ID, 
                token: WAPILOT_TOKEN, 
                media_id: mediaId 
            }
        });
        console.log('✅ Media response:', response.data);
        return response.data.url || response.data.base64 || response.data.file_url;
    } catch (error) {
        console.error('❌ Media Error:', error.response?.data || error.message);
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
        console.log('📨 FULL BODY:', JSON.stringify(body, null, 2));
        console.log('📨 ========================================');
        
        try {
            let from = null;
            let messageType = null;
            let mediaId = null;
            let textContent = null;
            
            // محاولة استخراج البيانات بكل الطرق الممكنة
            if (body.message) {
                from = body.message.from || body.message.chatId || body.message.sender || body.message.author;
                messageType = body.message.type;
                textContent = body.message.text || body.message.body || body.message.content || body.message.caption;
                if (body.message.media) {
                    mediaId = body.message.media.id || body.message.media;
                } else if (body.message.id && messageType === 'image') {
                    mediaId = body.message.id;
                } else if (body.message.image?.id) {
                    mediaId = body.message.image.id;
                }
            }
            
            // صيغ بديلة
            if (!from && body.from) from = body.from;
            if (!from && body.sender) from = body.sender;
            if (!from && body.chatId) from = body.chatId;
            if (!from && body.contact?.phone) from = body.contact.phone;
            if (!messageType && body.type) messageType = body.type;
            if (!textContent && body.text) textContent = body.text;
            if (!textContent && body.body) textContent = body.body;
            if (!textContent && body.content) textContent = body.content;
            if (!mediaId && body.mediaId) mediaId = body.mediaId;
            if (!mediaId && body.media?.id) mediaId = body.media.id;
            if (!mediaId && body.image?.id) mediaId = body.image.id;
            if (!mediaId && body.file?.id) mediaId = body.file.id;
            
            console.log('📱 Extracted:', { from, messageType, mediaId, textContent });
            
            if (!from) {
                console.log('⚠️ No sender found in payload');
                console.log('Available keys:', Object.keys(body));
                res.status(200).json({ success: false, error: "No sender" });
                return;
            }

            // معالجة الصورة
            if (messageType === 'image' || mediaId) {
                console.log('🖼️ Processing image, mediaId:', mediaId);
                
                await sendWAPilotMessage(from, "⏳ جاري تحليل الصورة واستخراج النص...");
                
                const imageUrl = await getWAPilotMedia(mediaId);
                console.log('🔗 Image URL:', imageUrl ? 'Got it' : 'Failed to get URL');
                
                if (!imageUrl) {
                    await sendWAPilotMessage(from, "❌ لم أتمكن من تحميل الصورة. تأكد من إرسال صورة صالحة.");
                    res.status(200).json({ success: false });
                    return;
                }

                // OCR
                let extractedText = "";
                if (visionClient) {
                    try {
                        console.log('👁️ Calling Vision OCR...');
                        const [result] = await visionClient.textDetection(imageUrl);
                        if (result.textAnnotations?.length > 0) {
                            extractedText = result.textAnnotations[0].description;
                            console.log('📝 OCR Success:', extractedText.length, 'characters');
                            console.log('📝 Preview:', extractedText.substring(0, 100));
                        } else {
                            extractedText = "عذراً، لم يتم التعرف على أي نص في الصورة.";
                            console.log('📝 OCR: No text found');
                        }
                    } catch (e) {
                        console.error('❌ OCR Error:', e.message);
                        extractedText = "خطأ في استخراج النص.";
                    }
                } else {
                    extractedText = "Vision API غير مهيأة.";
                    console.log('⚠️ Vision client not initialized');
                }

                // Gemini
                let aiResponse = "";
                if (extractedText.length > 5 && !extractedText.includes("عذراً") && !extractedText.includes("خطأ")) {
                    if (model) {
                        try {
                            console.log('🤖 Calling Gemini...');
                            const prompt = `أنت مصحح آلي. النص التالي مستخرج من ورقة إجابة:
                            
"${extractedText}"

المطلوب:
1. صحح الأخطاء الإملائية الواضحة
2. إذا كان هناك سؤال، أجب عنه بإجابة مختصرة
3. أجب باللغة العربية`;

                            const aiResult = await model.generateContent(prompt);
                            aiResponse = aiResult.response.text();
                            console.log('🤖 Gemini Success:', aiResponse.length, 'characters');
                            console.log('🤖 Preview:', aiResponse.substring(0, 100));
                        } catch (e) {
                            console.error('❌ Gemini Error:', e.message);
                            console.error('❌ Full error:', e);
                            aiResponse = "خطأ في تحليل النص. " + e.message;
                        }
                    } else {
                        aiResponse = "Gemini غير مهيأ.";
                        console.log('⚠️ Gemini model not initialized');
                    }
                } else {
                    aiResponse = extractedText.length <= 5 ? "النص المستخرج قصير جداً." : "لم يتم استخراج نص كافٍ للتحليل.";
                    console.log('⚠️ Text too short or error in OCR');
                }

                // الرد النهائي
                let finalMessage = `📝 *النص المستخرج:*\n${extractedText.substring(0, 500)}\n`;
                finalMessage += `━━━━━━━━━━━━━━━\n`;
                finalMessage += `🤖 *تحليل Gemini:*\n${aiResponse.substring(0, 800)}`;
                
                console.log('📤 Sending final response...');
                await sendWAPilotMessage(from, finalMessage);
                console.log('✅ Response sent!');
                
            } else {
                // رسالة نصية
                console.log('💬 Text message received:', textContent);
                await sendWAPilotMessage(
                    from, 
                    "📸 *مرحباً بك في بوت تصحيح الأوراق!*\n\nمن فضلك أرسل صورة واضحة لورقة الإجابة وسأقوم بـ:\n✅ استخراج النص المكتوب\n✅ تصحيح الأخطاء الإملائية\n✅ الإجابة عن الأسئلة\n\n*تأكد من أن الصورة واضحة ومضاءة جيداً.*"
                );
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
