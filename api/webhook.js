// api/webhook.js
const axios = require('axios');
const vision = require('@google-cloud/vision');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require('fs');
const path = require('path');

// --- إعدادات WAPILOT V2 (زي كود النمر بالظبط) ---
const INSTANCE_ID = "instance3532";
const WAPILOT_TOKEN = "yzWzEjmxZpbifuOx6lWafYT3Ng69gaFpJGAdTsVc6N";
const WAPILOT_API_URL = "https://api.wapilot.net/api/v2"; // ✅ V2 API اللي شغال

// --- إعدادات Google ---
const GEMINI_API_KEY = process.env.Gemini_API_Key || process.env.GEMINI_API_KEY || '';
const GOOGLE_VISION_API_KEY = process.env.GOOGLE_VISION_API_KEY || '';

// --- تهيئة Gemini ---
let genAI, model, geminiInitialized = false;

if (GEMINI_API_KEY) {
    try {
        if (GEMINI_API_KEY.startsWith('AQ.')) {
            genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
            model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        } else {
            genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
            model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        }
        geminiInitialized = true;
        console.log('✅ Gemini Ready');
    } catch (error) {
        console.error('❌ Gemini Error:', error.message);
    }
}

// --- تهيئة Vision ---
let visionClient, visionInitialized = false;

if (GOOGLE_VISION_API_KEY) {
    try {
        visionClient = new vision.ImageAnnotatorClient({ apiKey: GOOGLE_VISION_API_KEY });
        visionInitialized = true;
        console.log('✅ Vision Ready');
    } catch (error) {
        console.error('❌ Vision Error:', error.message);
    }
}

// --- دالة إرسال رسالة (زي كود النمر بالظبط) ---
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
        
        console.log('✅ Message sent:', response.data);
        return true;
    } catch (error) {
        console.error('❌ Send Error:', error.response?.data || error.message);
        return false;
    }
}

// --- دالة جلب صورة (نحتاج نعرف إزاي V2 بترجع الصور) ---
async function getWAPilotMedia(mediaId) {
    // WAPILOT V2 بتحتاج طريقة مختلفة لجلب الميديا
    // ممكن تكون: /media/${mediaId} أو /download/${mediaId}
    try {
        console.log(`🖼️ Fetching media: ${mediaId}`);
        
        const response = await axios.get(`${WAPILOT_API_URL}/${INSTANCE_ID}/media/${mediaId}`, {
            headers: { "token": WAPILOT_TOKEN },
            timeout: 15000
        });
        
        // بنحاول نستخرج الرابط من الصيغة اللي بترجع
        const imageUrl = response.data.url || response.data.file_url || response.data.link;
        
        if (imageUrl) {
            console.log('✅ Media URL found');
            return imageUrl;
        }
    } catch (error) {
        console.error('❌ Media Error:', error.response?.data || error.message);
    }
    
    return null;
}

// =============================================
// الدالة الرئيسية
// =============================================
module.exports = async (req, res) => {
    const url = req.url || '';
    const method = req.method || 'GET';
    
    console.log(`📥 ${method} ${url}`);

    // Webhook Verification
    if (method === 'GET' && url === '/api/webhook') {
        return res.status(200).json({ 
            status: 'active',
            instance_id: INSTANCE_ID,
            gemini: geminiInitialized ? 'ready' : 'not initialized',
            vision: visionInitialized ? 'ready' : 'not initialized',
            api: 'WAPILOT V2'
        });
    }

    // الصفحة الرئيسية
    if (method === 'GET' && (url === '/' || url === '')) {
        try {
            const htmlPath = path.join(process.cwd(), 'public', 'index.html');
            if (fs.existsSync(htmlPath)) {
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                return res.status(200).send(fs.readFileSync(htmlPath, 'utf8'));
            }
        } catch (error) {}
        
        return res.status(200).send(`
            <h1>🤖 OCR Bot Running!</h1>
            <p>Gemini: ${geminiInitialized ? '✅' : '❌'}</p>
            <p>Vision: ${visionInitialized ? '✅' : '❌'}</p>
            <p>WAPILOT V2 API: ✅</p>
        `);
    }

    // استقبال رسائل واتساب (POST) - بنفس تنسيق كود النمر
    if (method === 'POST' && url === '/api/webhook') {
        const data = req.body;
        
        console.log('📨 Webhook received:', JSON.stringify(data).substring(0, 500));
        
        // استخراج البيانات بنفس طريقة كود النمر
        let rawChatId = null;
        let message = null;
        let hasMedia = false;
        let mediaId = null;
        let mediaType = null;
        
        if (data.payload) {
            rawChatId = data.payload.from;
            message = data.payload.body || '';
            hasMedia = data.payload.hasMedia || false;
            mediaId = data.payload.media?.id || data.payload.mediaId;
            mediaType = data.payload.mediaType;
        }
        
        if (!rawChatId) {
            console.log('⚠️ No chat_id found');
            return res.status(200).json({ success: false });
        }
        
        // ضبط صيغة chatId (زي كود النمر)
        let chatId = rawChatId;
        if (!chatId.includes('@')) {
            chatId = `${chatId}@c.us`;
        }
        
        console.log(`📱 From: ${chatId}`);
        console.log(`💬 Message: ${message}`);
        console.log(`🖼️ Has Media: ${hasMedia} | Type: ${mediaType}`);
        
        // =============================================
        // معالجة الصورة (لو فيه ميديا)
        // =============================================
        if (hasMedia && mediaId && (mediaType === 'image' || mediaType === '')) {
            console.log('🖼️ Processing image...');
            
            await sendWAPilotMessage(chatId, "⏳ جاري تحليل الصورة واستخراج النص...");
            
            // جلب الصورة
            const imageUrl = await getWAPilotMedia(mediaId);
            
            if (!imageUrl) {
                await sendWAPilotMessage(chatId, "❌ لم أتمكن من تحميل الصورة. جرب صورة أخرى.");
                return res.status(200).json({ success: false });
            }
            
            // OCR
            let extractedText = "";
            if (visionClient) {
                try {
                    const [result] = await visionClient.textDetection(imageUrl);
                    if (result.textAnnotations?.length > 0) {
                        extractedText = result.textAnnotations[0].description;
                        console.log('📝 OCR:', extractedText.substring(0, 100));
                    } else {
                        extractedText = "عذراً، لم يتم التعرف على نص.";
                    }
                } catch (e) {
                    extractedText = "خطأ في استخراج النص.";
                }
            } else {
                extractedText = "Vision API غير مهيأة.";
            }
            
            // Gemini
            let aiResponse = "";
            if (extractedText.length > 5 && model) {
                try {
                    const prompt = `صحح الأخطاء الإملائية وأجب عن أي سؤال:\n\n"${extractedText}"\n\nأجب بالعربية.`;
                    const aiResult = await model.generateContent(prompt);
                    aiResponse = aiResult.response.text();
                } catch (e) {
                    aiResponse = "خطأ في التحليل.";
                }
            } else {
                aiResponse = "لم يتم استخراج نص كافٍ.";
            }
            
            const finalMessage = `📝 *النص:*\n${extractedText.substring(0, 500)}\n\n━━━━━━━━\n\n🤖 *التحليل:*\n${aiResponse.substring(0, 800)}`;
            await sendWAPilotMessage(chatId, finalMessage);
            
            return res.status(200).json({ success: true, processed: true });
        }
        
        // =============================================
        // رسالة نصية عادية
        // =============================================
        if (message && message.trim()) {
            await sendWAPilotMessage(
                chatId,
                "📸 *مرحباً بك في بوت تصحيح الأوراق!*\n\nمن فضلك أرسل صورة واضحة لورقة الإجابة."
            );
        }
        
        return res.status(200).json({ success: true });
    }
    
    res.status(404).send('Not Found');
};
