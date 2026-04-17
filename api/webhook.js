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

// --- تهيئة Vision Client ---
let visionClient;
let visionInitialized = false;

if (GOOGLE_VISION_API_KEY) {
    try {
        visionClient = new vision.ImageAnnotatorClient({ apiKey: GOOGLE_VISION_API_KEY });
        visionInitialized = true;
        console.log('✅ Vision Ready');
    } catch (error) {
        console.error('❌ Vision Error:', error.message);
    }
}

// --- دالة إرسال رسالة عبر WAPilot (باستخدام الـ API الصحيح) ---
async function sendWAPilotMessage(to, text) {
    try {
        // تنظيف الرقم من @lid أو @c.us لو موجود
        const cleanPhone = to.replace(/@.*$/, '').replace(/\D/g, '');
        
        console.log(`📤 Sending to ${cleanPhone}: ${text.substring(0, 50)}...`);
        
        // استخدام Send Message API من WAPilot
        const response = await axios.post(`https://api.wapilot.com/v1/send-message`, {
            instance_id: INSTANCE_ID,
            token: WAPILOT_TOKEN,
            phone: cleanPhone,
            message: text
        });
        
        console.log('✅ Message sent:', response.data);
        return true;
    } catch (error) {
        console.error("❌ Send Error:", error.response?.data || error.message);
        return false;
    }
}

// --- دالة Vercel الأساسية ---
module.exports = async (req, res) => {
    
    const url = req.url || '';
    const method = req.method || 'GET';
    
    console.log(`📥 ${method} ${url}`);

    // الصفحة الرئيسية
    if (method === 'GET' && (url === '/' || url === '')) {
        try {
            const htmlPath = path.join(process.cwd(), 'public', 'index.html');
            if (fs.existsSync(htmlPath)) {
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                res.status(200).send(fs.readFileSync(htmlPath, 'utf8'));
            } else {
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                res.status(200).send(`<h1>🤖 Bot Running!</h1><p>Webhook: ${req.headers.host}/api/webhook</p>`);
            }
        } catch (error) {
            res.status(500).send('Error');
        }
        return;
    }

    // Webhook verification
    if (method === 'GET' && url === '/api/webhook') {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.status(200).send(`✅ Bot Ready!\nGemini: ${geminiInitialized ? 'Ready' : 'No'}\nVision: ${visionInitialized ? 'Ready' : 'No'}\nGemini Key: ${GEMINI_API_KEY ? 'Present' : 'Missing'}\nVision Key: ${GOOGLE_VISION_API_KEY ? 'Present' : 'Missing'}`);
        return;
    }

    // استقبال رسائل واتساب (POST)
    if (method === 'POST' && url === '/api/webhook') {
        const { body } = req;
        
        console.log('📨 Webhook received. Event:', body.event);
        
        try {
            // --- استخراج البيانات من تنسيق WAPilot الجديد ---
            // الرقم موجود في: body.payload.from
            let from = null;
            let messageType = 'text';
            let mediaId = null;
            let textContent = '';
            let hasMedia = false;
            
            if (body.payload) {
                // استخراج الرقم (ممكن يكون بصيغة 222956399677568@lid)
                from = body.payload.from || body.payload.chatId;
                
                // هل فيه ميديا؟
                hasMedia = body.payload.hasMedia || false;
                mediaId = body.payload.media?.id || body.payload.mediaId || body.payload.id;
                
                // محتوى الرسالة النصية
                textContent = body.payload.body || body.payload.text || body.payload.caption || '';
                
                // نوع الميديا
                if (hasMedia) {
                    messageType = body.payload.mediaType || 'image';
                }
            }
            
            // لو مفيش رقم صريح، نجرب نستخرجه من الـ ID
            if (!from && body.payload?.id) {
                from = body.payload.id.split('@')[0];
            }
            
            console.log('📱 From:', from);
            console.log('📝 Message:', textContent);
            console.log('🖼️ Has Media:', hasMedia, '| Media ID:', mediaId);
            
            if (!from) {
                console.log('⚠️ No sender found');
                res.status(200).json({ success: false });
                return;
            }

            // --- معالجة الصورة (لو فيه ميديا) ---
            if (hasMedia && mediaId) {
                console.log('🖼️ Processing image...');
                
                await sendWAPilotMessage(from, "⏳ جاري تحليل الصورة واستخراج النص...");

                // جلب رابط الصورة من WAPilot
                let imageUrl = null;
                try {
                    const mediaResponse = await axios.get(`https://api.wapilot.com/v1/media`, {
                        params: {
                            instance_id: INSTANCE_ID,
                            token: WAPILOT_TOKEN,
                            media_id: mediaId
                        }
                    });
                    
                    imageUrl = mediaResponse.data.url || mediaResponse.data.file_url;
                    console.log('🔗 Image URL:', imageUrl ? 'Got it' : 'Not found');
                } catch (mediaError) {
                    console.error('❌ Media fetch error:', mediaError.message);
                }
                
                if (!imageUrl) {
                    await sendWAPilotMessage(from, "❌ لم أتمكن من تحميل الصورة.");
                    res.status(200).json({ success: false });
                    return;
                }

                // --- Google Vision OCR ---
                let extractedText = "";
                if (visionClient) {
                    try {
                        const [result] = await visionClient.textDetection(imageUrl);
                        if (result.textAnnotations?.length > 0) {
                            extractedText = result.textAnnotations[0].description;
                            console.log('📝 OCR:', extractedText.substring(0, 100) + '...');
                        } else {
                            extractedText = "عذراً، لم يتم التعرف على نص.";
                        }
                    } catch (ocrError) {
                        console.error('❌ OCR Error:', ocrError.message);
                        extractedText = "خطأ في استخراج النص.";
                    }
                } else {
                    extractedText = "Vision API غير مهيأة.";
                }

                // --- Gemini AI ---
                let aiResponse = "";
                if (extractedText.length > 5 && !extractedText.includes("عذراً") && !extractedText.includes("خطأ")) {
                    if (model) {
                        try {
                            const prompt = `أنت مصحح آلي. صحح الأخطاء الإملائية في النص التالي وأجب عن أي سؤال:\n\n"${extractedText}"\n\nأجب بالعربية.`;
                            const aiResult = await model.generateContent(prompt);
                            aiResponse = aiResult.response.text();
                            console.log('🤖 Gemini:', aiResponse.substring(0, 100) + '...');
                        } catch (aiError) {
                            console.error('❌ Gemini Error:', aiError.message);
                            aiResponse = "خطأ في التحليل.";
                        }
                    } else {
                        aiResponse = "Gemini غير مهيأ.";
                    }
                } else {
                    aiResponse = "لم يتم استخراج نص كافٍ للتحليل.";
                }

                // الرد النهائي
                const finalMessage = `📝 *النص المستخرج:*\n${extractedText.substring(0, 500)}\n\n━━━━━━━━━━━━━━━\n\n🤖 *التحليل:*\n${aiResponse.substring(0, 800)}`;
                
                await sendWAPilotMessage(from, finalMessage);
                
            } else {
                // --- رسالة نصية عادية ---
                console.log('💬 Text message:', textContent);
                
                await sendWAPilotMessage(
                    from, 
                    "📸 *مرحباً بك في بوت تصحيح الأوراق!*\n\n" +
                    "من فضلك أرسل صورة واضحة لورقة الإجابة.\n\n" +
                    "سأقوم بـ:\n" +
                    "✅ استخراج النص من الصورة\n" +
                    "✅ تصحيح الأخطاء الإملائية\n" +
                    "✅ الإجابة عن الأسئلة"
                );
            }

        } catch (error) {
            console.error("❌ General Error:", error.message);
        }

        res.status(200).json({ success: true });
        return;
    }

    res.status(404).send('Not Found');
};
