// api/webhook.js
const axios = require('axios');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require('fs');
const path = require('path');

// --- إعدادات WAPILOT V2 ---
const INSTANCE_ID = "instance3532";
const WAPILOT_TOKEN = "yzWzEjmxZpbifuOx6lWafYT3Ng69gaFpJGAdTsVc6N";
const WAPILOT_API_URL = "https://api.wapilot.net/api/v2";

// --- إعدادات Google Gemini ---
const GEMINI_API_KEY = process.env.Gemini_API_Key || process.env.GEMINI_API_KEY || '';

// --- إعدادات OCR.Space ---
const OCR_SPACE_API_KEY = '72d9a2c76e88957';

// --- تهيئة Gemini ---
let genAI;
let model;
let geminiInitialized = false;

if (GEMINI_API_KEY) {
    try {
        console.log('🔑 Initializing Gemini...');
        
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

// --- دالة OCR ---
async function extractTextFromImage(imageUrl) {
    console.log('👁️ Starting OCR.Space...');
    
    try {
        // 🔥 بدون تحديد language - نستخدم POST بدل GET
        const formData = new URLSearchParams();
        formData.append('apikey', OCR_SPACE_API_KEY);
        formData.append('url', imageUrl);
        formData.append('filetype', 'JPG');
        formData.append('isOverlayRequired', 'false');
        formData.append('detectOrientation', 'true');
        formData.append('scale', 'true');
        formData.append('OCREngine', '2');
        
        const response = await axios.post('https://api.ocr.space/parse/image', formData, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            timeout: 30000
        });
        
        const data = response.data;
        console.log('📦 OCR Response:', JSON.stringify(data).substring(0, 300));
        
        if (data.IsErroredOnProcessing) {
            console.error('❌ OCR Error:', data.ErrorMessage);
            return "خطأ في استخراج النص";
        }
        
        const parsedText = data.ParsedResults?.[0]?.ParsedText || '';
        
        if (parsedText) {
            console.log('✅ OCR completed:', parsedText.length, 'chars');
            return parsedText.trim();
        } else {
            return "عذراً، لم يتم التعرف على نص.";
        }
        
    } catch (error) {
        console.error('❌ OCR Error:', error.message);
        return "خطأ في استخراج النص.";
    }
}

// --- دالة إرسال رسالة ---
async function sendWAPilotMessage(chatId, text) {
    try {
        console.log(`📤 Sending to ${chatId}: ${text.substring(0, 50)}...`);
        
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
        
        console.log('✅ Message sent');
        return true;
    } catch (error) {
        console.error('❌ Send Error:', error.message);
        return false;
    }
}

// --- الدالة الرئيسية ---
module.exports = async (req, res) => {
    
    const url = req.url || '';
    const method = req.method || 'GET';
    
    console.log(`📥 ${method} ${url}`);

    if (method === 'GET' && url === '/api/webhook') {
        return res.status(200).json({ 
            status: 'active',
            gemini: geminiInitialized ? 'ready' : 'no',
            ocr: 'OCR.Space'
        });
    }

    if (method === 'GET' && (url === '/' || url === '')) {
        return res.status(200).send(`
            <!DOCTYPE html>
            <html dir="rtl">
            <head>
                <title>بوت تصحيح الأوراق</title>
                <style>
                    body { font-family: Arial; text-align: center; padding: 50px; background: #1a1a2e; color: white; }
                    .container { background: white; border-radius: 20px; padding: 40px; max-width: 500px; margin: 0 auto; color: #333; }
                    .status { display: inline-block; padding: 8px 20px; border-radius: 50px; margin: 5px; background: #10b981; color: white; }
                    code { background: #1a1a2e; color: #10b981; padding: 15px; border-radius: 8px; display: block; margin: 20px 0; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>🤖 بوت تصحيح الأوراق</h1>
                    <p>Webhook URL:</p>
                    <code>${req.headers.host}/api/webhook</code>
                    <div>
                        <span class="status">🧠 Gemini: ${geminiInitialized ? '✅' : '❌'}</span>
                        <span class="status">👁️ OCR: OCR.Space</span>
                        <span class="status">📱 WAPilot: ✅</span>
                    </div>
                    <p style="margin-top: 20px; color: #10b981;">✅ مجاني 100%</p>
                </div>
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
            console.log('🖼️ Processing image...');
            await sendWAPilotMessage(chatId, "⏳ جاري تحليل الصورة...");
            
            const extractedText = await extractTextFromImage(mediaUrl);
            
            let aiResponse = "";
            if (extractedText.length > 5 && !extractedText.includes("خطأ")) {
                if (model) {
                    try {
                        const prompt = `صحح الأخطاء الإملائية وأجب عن أي سؤال:\n\n"${extractedText}"\n\nأجب بالعربية.`;
                        const aiResult = await model.generateContent(prompt);
                        aiResponse = aiResult.response.text();
                    } catch (e) {
                        aiResponse = "خطأ في التحليل.";
                    }
                } else {
                    aiResponse = "Gemini غير مهيأ.";
                }
            } else {
                aiResponse = extractedText;
            }
            
            const finalMessage = `📝 *النص:*\n${extractedText.substring(0, 500)}\n━━━━━━━━\n🤖 *التحليل:*\n${aiResponse.substring(0, 800)}`;
            await sendWAPilotMessage(chatId, finalMessage);
        } else {
            await sendWAPilotMessage(chatId, "📸 أرسل صورة ورقة الإجابة");
        }
        
        return res.status(200).json({ ok: true });
    }
    
    res.status(404).send('Not Found');
};
