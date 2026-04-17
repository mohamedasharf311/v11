// api/webhook.js
const axios = require('axios');
const vision = require('@google-cloud/vision');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require('fs');
const path = require('path');

// --- إعدادات WAPILOT V2 (زي كود النمر بالظبط) ---
const INSTANCE_ID = "instance3532";
const WAPILOT_TOKEN = "yzWzEjmxZpbifuOx6lWafYT3Ng69gaFpJGAdTsVc6N";
const WAPILOT_API_URL = "https://api.wapilot.net/api/v2";

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
// دالة إرسال رسالة عبر WAPILOT V2
// =============================================
async function sendWAPilotMessage(chatId, text) {
    try {
        console.log(`📤 Sending to ${chatId}: ${text.substring(0, 50)}...`);
        
        const response = await axios.post(
            `${WAPILOT_API_URL}/${INSTANCE_ID}/send-message`,
            { chat_id: chatId, text: text },
            { 
                headers: { 
                    "token": WAPILOT_TOKEN, 
                    "Content-Type": "application/json" 
                },
                timeout: 10000
            }
        );
        
        console.log('✅ Message sent:', JSON.stringify(response.data).substring(0, 200));
        return true;
    } catch (error) {
        console.error('❌ Send Error:', error.response?.data || error.message);
        return false;
    }
}

// =============================================
// دالة جلب صورة من WAPILOT V2
// =============================================
async function getWAPilotMedia(mediaId) {
    console.log(`🖼️ Fetching media ID: ${mediaId}`);
    
    // قائمة الـ endpoints المحتملة لـ WAPILOT V2
    const endpoints = [
        `${WAPILOT_API_URL}/${INSTANCE_ID}/media/${mediaId}`,
        `${WAPILOT_API_URL}/${INSTANCE_ID}/file/${mediaId}`,
        `${WAPILOT_API_URL}/${INSTANCE_ID}/download/${mediaId}`,
        `https://api.wapilot.net/api/v1/media/${mediaId}`,
        `https://api.wapilot.net/api/v2/${INSTANCE_ID}/message/media/${mediaId}`
    ];
    
    for (const endpoint of endpoints) {
        try {
            console.log(`🔄 Trying: ${endpoint}`);
            
            const response = await axios.get(endpoint, {
                headers: { "token": WAPILOT_TOKEN },
                timeout: 15000
            });
            
            console.log(`📦 Response keys:`, Object.keys(response.data));
            
            // استخراج الرابط من الصيغ المختلفة
            const imageUrl = response.data.url || 
                            response.data.file_url || 
                            response.data.media_url ||
                            response.data.link ||
                            response.data.download_url ||
                            response.data.data?.url ||
                            (typeof response.data === 'string' ? response.data : null);
            
            if (imageUrl && typeof imageUrl === 'string' && imageUrl.startsWith('http')) {
                console.log(`✅ Media URL found: ${imageUrl.substring(0, 80)}...`);
                return imageUrl;
            }
            
        } catch (error) {
            console.warn(`⚠️ Failed on ${endpoint}:`, error.message);
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
    // Webhook Verification (GET)
    // =============================================
    if (method === 'GET' && url === '/api/webhook') {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        return res.status(200).json({ 
            status: 'active',
            instance_id: INSTANCE_ID,
            gemini: geminiInitialized ? 'ready' : 'not initialized',
            vision: visionInitialized ? 'ready' : 'not initialized',
            gemini_key: GEMINI_API_KEY ? 'present' : 'missing',
            vision_key: GOOGLE_VISION_API_KEY ? 'present' : 'missing',
            api: 'WAPILOT V2',
            timestamp: new Date().toISOString()
        });
    }

    // =============================================
    // الصفحة الرئيسية (Dashboard HTML)
    // =============================================
    if (method === 'GET' && (url === '/' || url === '')) {
        try {
            const htmlPath = path.join(process.cwd(), 'public', 'index.html');
            if (fs.existsSync(htmlPath)) {
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                return res.status(200).send(fs.readFileSync(htmlPath, 'utf8'));
            }
        } catch (error) {
            console.error('HTML Error:', error);
        }
        
        // صفحة احتياطية
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(200).send(`
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
                    <p style="margin-top: 20px;">
                        🔑 Gemini Key: ${GEMINI_API_KEY ? '✅ موجود' : '❌ مفقود'}<br>
                        👁️ Vision Key: ${GOOGLE_VISION_API_KEY ? '✅ موجود' : '❌ مفقود'}
                    </p>
                </div>
            </body>
            </html>
        `);
    }

    // =============================================
    // استقبال رسائل واتساب (POST)
    // =============================================
    if (method === 'POST' && url === '/api/webhook') {
        const data = req.body;
        
        console.log('📨 ========== WEBHOOK RECEIVED ==========');
        console.log('📨 FULL BODY:', JSON.stringify(data).substring(0, 1500));
        console.log('📨 ========================================');
        
        // استخراج البيانات بكل الطرق الممكنة
        let rawChatId = null;
        let message = null;
        let hasMedia = false;
        let mediaId = null;
        let mediaType = null;
        let isImage = false;
        
        if (data.payload) {
            rawChatId = data.payload.from || data.payload.chatId;
            message = data.payload.body || data.payload.text || data.payload.caption || '';
            
            // فحص الميديا
            hasMedia = data.payload.hasMedia || false;
            
            // استخراج mediaId
            if (data.payload.media) {
                mediaId = data.payload.media.id || data.payload.media;
                mediaType = data.payload.media.type || data.payload.mediaType;
                isImage = mediaType === 'image' || data.payload.media.mimeType?.includes('image');
            } else if (data.payload.mediaId) {
                mediaId = data.payload.mediaId;
            } else if (data.payload.image) {
                mediaId = data.payload.image.id;
                isImage = true;
            } else if (data.payload.file) {
                mediaId = data.payload.file.id;
            }
            
            // لو فيه mediaType في الـ payload
            if (data.payload.mediaType) {
                mediaType = data.payload.mediaType;
                isImage = data.payload.mediaType === 'image';
            }
            
            // لو الـ message فارغ والـ caption موجود
            if (!message && data.payload.caption) {
                message = data.payload.caption;
            }
        }
        
        // صيغ بديلة
        if (!rawChatId && data.from) rawChatId = data.from;
        if (!rawChatId && data.chatId) rawChatId = data.chatId;
        
        // فحص إضافي: لو فيه media في الـ root
        if (!hasMedia && data.media) {
            hasMedia = true;
            mediaId = data.media.id || data.media;
        }
        
        // فحص: لو النوع image في الـ root
        if (!isImage && data.type === 'image') {
            isImage = true;
            hasMedia = true;
            mediaId = data.id || data.mediaId;
        }
        
        if (!rawChatId) {
            console.log('⚠️ No chat_id found');
            console.log('Available keys:', Object.keys(data));
            return res.status(200).json({ success: false, error: 'No chat_id' });
        }
        
        // ضبط صيغة chatId
        let chatId = rawChatId;
        if (!chatId.includes('@')) {
            chatId = `${chatId}@c.us`;
        }
        
        console.log(`📱 From: ${chatId}`);
        console.log(`💬 Message: ${message || '(empty)'}`);
        console.log(`🖼️ Has Media: ${hasMedia} | Media ID: ${mediaId} | Type: ${mediaType} | Is Image: ${isImage}`);
        
        // =============================================
        // 🔥 معالجة الصورة
        // =============================================
        if ((hasMedia || mediaId) && (isImage || mediaType === 'image' || !mediaType)) {
            console.log('🖼️🖼️🖼️ PROCESSING IMAGE 🖼️🖼️🖼️');
            
            await sendWAPilotMessage(chatId, "⏳ جاري تحليل الصورة واستخراج النص...");
            
            // جلب الصورة
            const imageUrl = await getWAPilotMedia(mediaId);
            
            if (!imageUrl) {
                await sendWAPilotMessage(chatId, "❌ لم أتمكن من تحميل الصورة. جرب صورة أخرى.");
                return res.status(200).json({ success: false, error: 'Failed to fetch media' });
            }
            
            console.log('🔗 Image URL obtained');
            
            // =============================================
            // Google Vision OCR
            // =============================================
            let extractedText = "";
            if (visionClient) {
                try {
                    console.log('👁️ Calling Vision OCR...');
                    const [result] = await visionClient.textDetection(imageUrl);
                    
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
            await sendWAPilotMessage(chatId, finalMessage);
            console.log('✅ Image processed and response sent!');
            
            return res.status(200).json({ success: true, processed: 'image' });
        }
        
        // =============================================
        // رسالة نصية عادية
        // =============================================
        console.log('💬 Processing as TEXT message');
        
        await sendWAPilotMessage(
            chatId,
            "📸 *مرحباً بك في بوت تصحيح الأوراق!*\n\n" +
            "من فضلك أرسل صورة واضحة لورقة الإجابة.\n\n" +
            "سأقوم بـ:\n" +
            "✅ استخراج النص من الصورة\n" +
            "✅ تصحيح الأخطاء الإملائية\n" +
            "✅ الإجابة عن الأسئلة\n\n" +
            "*تأكد من أن الصورة واضحة ومضاءة جيداً.*"
        );
        
        return res.status(200).json({ success: true, processed: 'text' });
    }
    
    // =============================================
    // أي طلب تاني - 404
    // =============================================
    res.status(404).send('Not Found');
};
