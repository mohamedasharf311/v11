// api/webhook.js
const axios = require('axios');
const vision = require('@google-cloud/vision');
const { GoogleGenerativeAI } = require("@google/generative-ai");

// --- إعدادات WAPILOT V2 ---
const INSTANCE_ID = "instance3532";
const WAPILOT_TOKEN = "yzWzEjmxZpbifuOx6lWafYT3Ng69gaFpJGAdTsVc6N";
const WAPILOT_API_URL = "https://api.wapilot.net/api/v2";

// --- إعدادات Google ---
const GEMINI_API_KEY = process.env.Gemini_API_Key || process.env.GEMINI_API_KEY || '';
const GOOGLE_VISION_API_KEY = process.env.GOOGLE_VISION_API_KEY || '';

// --- تهيئة Gemini ---
let genAI;
let model;
let geminiInitialized = false;

if (GEMINI_API_KEY) {
    try {
        genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        geminiInitialized = true;
        console.log('✅ Gemini Ready');
    } catch (error) {
        console.error('❌ Gemini Error:', error.message);
    }
}

// --- دالة OCR باستخدام Google Vision (بدون Billing لو استخدمت API Key) ---
async function extractTextFromImage(imageUrl) {
    console.log('👁️ Starting Google Vision OCR...');
    
    try {
        const visionClient = new vision.ImageAnnotatorClient({
            apiKey: GOOGLE_VISION_API_KEY
        });
        
        const [result] = await visionClient.textDetection(imageUrl);
        const detections = result.textAnnotations;
        
        if (detections && detections.length > 0) {
            const text = detections[0].description;
            console.log('✅ Vision OCR completed:', text.length, 'chars');
            return text.trim();
        } else {
            return "عذراً، لم يتم التعرف على نص.";
        }
        
    } catch (error) {
        console.error('❌ Vision Error:', error.message);
        
        // لو فيه مشكلة Billing، نرجع OCR.Space كبديل
        if (error.message.includes('billing')) {
            console.log('⚠️ Falling back to OCR.Space...');
            return await fallbackOCR(imageUrl);
        }
        
        return "خطأ في استخراج النص.";
    }
}

// --- دالة OCR احتياطية (OCR.Space) ---
async function fallbackOCR(imageUrl) {
    try {
        const formData = new URLSearchParams();
        formData.append('apikey', '72d9a2c76e88957');
        formData.append('url', imageUrl);
        formData.append('language', 'ara');
        formData.append('OCREngine', '2');
        
        const response = await axios.post('https://api.ocr.space/parse/image', formData, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 30000
        });
        
        const data = response.data;
        const parsedText = data.ParsedResults?.[0]?.ParsedText || '';
        return parsedText || "عذراً، لم يتم التعرف على نص.";
        
    } catch (error) {
        return "خطأ في استخراج النص.";
    }
}

// --- دالة إرسال رسالة ---
async function sendWAPilotMessage(chatId, text) {
    try {
        await axios.post(
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
        return true;
    } catch (error) {
        return false;
    }
}

// --- الدالة الرئيسية ---
module.exports = async (req, res) => {
    
    const url = req.url || '';
    const method = req.method || 'GET';
    
    if (method === 'GET' && url === '/api/webhook') {
        return res.status(200).json({ status: 'active' });
    }

    if (method === 'GET' && (url === '/' || url === '')) {
        return res.status(200).send(`
            <!DOCTYPE html>
            <html dir="rtl">
            <head><title>بوت تصحيح الأوراق</title></head>
            <body style="font-family: Arial; text-align: center; padding: 50px; background: #1a1a2e; color: white;">
                <h1>🤖 بوت تصحيح الأوراق</h1>
                <p>✅ النظام شغال</p>
                <p>🧠 Gemini: ${geminiInitialized ? '✅' : '❌'} | 👁️ Vision: ${GOOGLE_VISION_API_KEY ? '✅' : '❌'}</p>
            </body>
            </html>
        `);
    }

    if (method === 'POST' && url === '/api/webhook') {
        const data = req.body;
        
        let rawChatId = null;
        let mediaUrl = null;
        
        if (data.payload) {
            rawChatId = data.payload.from || data.payload.chatId;
            if (data.payload.media?.url && data.payload.mediaType === 'image') {
                mediaUrl = data.payload.media.url;
            }
        }
        
        if (!rawChatId) return res.status(200).json({ ok: false });
        
        let chatId = rawChatId.includes('@') ? rawChatId : `${rawChatId}@c.us`;
        
        if (mediaUrl) {
            await sendWAPilotMessage(chatId, "⏳ جاري تحليل الصورة...");
            
            const extractedText = await extractTextFromImage(mediaUrl);
            
            let aiResponse = "";
            if (extractedText.length > 5 && !extractedText.includes("خطأ")) {
                if (model) {
                    try {
                        const prompt = `أنت مصحح آلي. صحح الأخطاء الإملائية وأجب عن أي سؤال:\n\n"${extractedText}"\n\nأجب بالعربية.`;
                        const aiResult = await model.generateContent(prompt);
                        aiResponse = aiResult.response.text();
                    } catch (e) {
                        aiResponse = "خطأ في التحليل.";
                    }
                } else {
                    aiResponse = "Gemini غير مهيأ.";
                }
            } else {
                aiResponse = "لم يتم استخراج نص كافٍ.";
            }
            
            const finalMessage = `📝 *النص:*\n${extractedText}\n━━━━━━━━\n🤖 *التحليل:*\n${aiResponse}`;
            await sendWAPilotMessage(chatId, finalMessage);
        } else {
            await sendWAPilotMessage(chatId, "📸 أرسل صورة ورقة الإجابة");
        }
        
        return res.status(200).json({ ok: true });
    }
    
    res.status(404).send('Not Found');
};
