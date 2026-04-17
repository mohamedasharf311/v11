// api/webhook.js
const axios = require('axios');
const vision = require('@google-cloud/vision');
const { GoogleGenerativeAI } = require("@google/generative-ai");

// --- إعدادات WAPilot ---
const INSTANCE_ID = "instance3532";
const WAPILOT_TOKEN = "yzWzEjmxZpbifuOx6lWafYT3Ng69gaFpJGAdTsVc6N";
const BASE_URL = "https://api.wapilot.com/v1";

// --- إعدادات Google (من Environment Variables) ---
const GEMINI_API_KEY = process.env.Gemini_API_Key;
const GOOGLE_VISION_API_KEY = process.env.GOOGLE_VISION_API_KEY;

// --- تهيئة Gemini (يدعم Vertex AI و Google AI Studio) ---
let genAI;
let model;

if (GEMINI_API_KEY) {
    try {
        // لو المفتاح بيبدأ بـ "AQ." يبقى Vertex AI
        if (GEMINI_API_KEY.startsWith('AQ.')) {
            console.log('✅ Using Vertex AI configuration');
            genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
            model = genAI.getGenerativeModel({ 
                model: "gemini-1.5-flash"
            }, {
                apiVersion: "v1beta"
            });
        } else {
            // Google AI Studio العادي
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
        // تقصير النص لو طويل جداً
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

// --- دالة Vercel الأساسية (Webhook لـ WAPilot) ---
module.exports = async (req, res) => {
    
    // استقبال POST من WAPilot
    if (req.method === 'POST') {
        const { body } = req;
        console.log('📨 Incoming webhook:', JSON.stringify(body).substring(0, 500));

        try {
            // محاولة استخراج البيانات من الصيغ المختلفة
            let from = null;
            let messageType = null;
            let mediaId = null;
            let textContent = null;
            
            // صيغة 1: WAPilot standard
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
            
            // صيغة 2: WhatsApp Web JS style
            if (!from && body.from) from = body.from;
            if (!messageType && body.type) messageType = body.type;
            if (!textContent && body.body) textContent = body.body;
            if (!mediaId && body.mediaId) mediaId = body.mediaId;
            if (!mediaId && body.media?.id) mediaId = body.media.id;
            
            // لو مفيش رقم مرسل
            if (!from) {
                console.log('⚠️ No sender found in payload');
                res.status(200).json({ success: false, error: "No sender" });
                return;
            }

            console.log(`📱 From: ${from} | Type: ${messageType}`);

            // --- معالجة الصورة ---
            if (messageType === 'image' || mediaId || (body.message?.media?.type === 'image')) {
                
                // إشعار بالمعالجة
                await sendWAPilotMessage(from, "⏳ جاري تحليل الصورة واستخراج النص...");

                // جلب الصورة
                const imageUrl = await getWAPilotMedia(mediaId);
                
                if (!imageUrl) {
                    await sendWAPilotMessage(from, "❌ لم أتمكن من تحميل الصورة. تأكد من إرسال صورة صالحة.");
                    res.status(200).json({ success: false, error: "No image URL" });
                    return;
                }

                console.log(`🖼️ Image URL received`);

                // استدعاء Google Vision OCR
                let extractedText = "";
                try {
                    const [result] = await visionClient.textDetection(imageUrl);
                    const detections = result.textAnnotations;
                    
                    if (detections && detections.length > 0) {
                        extractedText = detections[0].description;
                        console.log(`📝 OCR Success: ${extractedText.length} characters`);
                    } else {
                        extractedText = "عذراً، لم يتم التعرف على أي نص في الصورة.";
                    }
                } catch (ocrError) {
                    console.error("❌ OCR Error:", ocrError.message);
                    extractedText = "خطأ في استخراج النص من الصورة.";
                }

                // استدعاء Gemini للتحليل
                let aiResponse = "";
                if (extractedText.length > 5 && !extractedText.includes("عذراً") && !extractedText.includes("خطأ")) {
                    try {
                        if (!model) {
                            throw new Error("Gemini model not initialized. Check API key.");
                        }

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
                        aiResponse = "خطأ في تحليل النص بالذكاء الاصطناعي. تأكد من صلاحية مفتاح Gemini API.";
                    }
                } else {
                    aiResponse = "لم يتم استخراج نص كافٍ للتحليل. تأكد من وضوح الصورة.";
                }

                // تجهيز الرد النهائي
                let finalMessage = "";
                finalMessage += `📝 النص المستخرج:\n${extractedText.substring(0, 800)}\n`;
                finalMessage += `━━━━━━━━━━━━━━━\n`;
                finalMessage += `🤖 تحليل Gemini:\n${aiResponse.substring(0, 1200)}`;
                
                // إزالة الرموز الخاصة لو موجودة
                finalMessage = finalMessage.replace(/[*_~`]/g, '');
                
                await sendWAPilotMessage(from, finalMessage);
                
            } else {
                // رسالة نصية عادية
                await sendWAPilotMessage(
                    from, 
                    "📸 *مرحباً بك في بوت تصحيح الأوراق!*\n\nمن فضلك أرسل صورة واضحة لورقة الإجابة وسأقوم بـ:\n✅ استخراج النص المكتوب\n✅ تصحيح الأخطاء الإملائية\n✅ الإجابة عن الأسئلة\n\n*تأكد من أن الصورة واضحة ومضاءة جيداً.*"
                );
            }

        } catch (error) {
            console.error("❌ General Error:", error.message);
            if (body.from || body.message?.from) {
                await sendWAPilotMessage(
                    body.from || body.message?.from, 
                    "❌ حدث خطأ غير متوقع. يرجى المحاولة لاحقاً."
                );
            }
        }

        res.status(200).json({ success: true });
        return;
    }

    // طلب GET للتأكد من أن الخدمة تعمل
    res.status(200).send('✅ WAPilot OCR Bot is running!\n\nGemini: ' + (model ? 'Ready' : 'Not initialized'));
};
