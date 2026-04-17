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

// --- إعدادات OCR.Space (مجاني) ---
const OCR_SPACE_API_KEY = '72d9a2c76e88957'; // ✅ تم إضافة علامات التنصيص

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

// --- دالة OCR باستخدام OCR.Space (مجانية 100%) ---
async function extractTextFromImage(imageUrl) {
    console.log('👁️ Starting OCR.Space...');
    
    try {
        const response = await axios.get('https://api.ocr.space/parse/imageurl', {
            params: {
                apikey: OCR_SPACE_API_KEY,
                url: imageUrl,
                language: 'ara',
                isOverlayRequired: false,
                detectOrientation: true,
                scale: true,
                OCREngine: 2
            },
            timeout: 30000
        });
        
        const data = response.data;
        
        if (data.IsErroredOnProcessing) {
            console.error('❌ OCR Error:', data.ErrorMessage);
            return "خطأ في استخراج النص: " + (data.ErrorMessage || '');
        }
        
        const parsedText = data.ParsedResults?.[0]?.ParsedText || '';
        
        if (parsedText) {
            console.log('✅ OCR.Space completed');
            console.log('📝 Characters:', parsedText.length);
            return parsedText.trim();
        } else {
            return "عذراً، لم يتم التعرف على أي نص في الصورة.";
        }
        
    } catch (error) {
        console.error('❌ OCR.Space Error:', error.message);
        return "خطأ في استخراج النص من الصورة.";
    }
}

// --- دالة إرسال رسالة عبر WAPILOT V2 ---
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
        
        console.log('✅ Message sent');
        return true;
    } catch (error) {
        console.error('❌ Send Error:', error.message);
        return false;
    }
}

// --- الدالة الرئيسية لـ Vercel ---
module.exports = async (req, res) => {
    
    const url = req.url || '';
    const method = req.method || 'GET';
    
    console.log(`📥 ${method} ${url}`);

    // Webhook Verification (GET)
    if (method === 'GET' && url === '/api/webhook') {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        return res.status(200).json({ 
            status: 'active',
            instance_id: INSTANCE_ID,
            gemini: geminiInitialized ? 'ready' : 'not initialized',
            ocr: 'OCR.Space (Free)',
            api: 'WAPILOT V2'
        });
    }

    // الصفحة الرئيسية
    if (method === 'GET' && (url === '/' || url === '')) {
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
                    code { background: #1a1a2e; color: #10b981; padding: 15px; border-radius: 8px; display: block; margin: 20px 0; direction: ltr; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>🤖 بوت تصحيح الأوراق</h1>
                    <p>Webhook URL:</p>
                    <code>${req.headers.host}/api/webhook</code>
                    <div>
                        <span class="status online">🧠 Gemini: ${geminiInitialized ? '✅' : '❌'}</span>
                        <span class="status online">👁️ OCR: OCR.Space</span>
                        <span class="status online">📱 WAPilot: ✅</span>
                    </div>
                    <p style="margin-top: 20px; color: #10b981;">✅ مجاني 100% - 25,000 صورة/شهر</p>
                </div>
            </body>
            </html>
        `);
    }

    // استقبال رسائل واتساب (POST)
    if (method === 'POST' && url === '/api/webhook') {
        const data = req.body;
        
        console.log('📨 Webhook received');
        
        let rawChatId = null;
        let hasMedia = false;
        let mediaUrl = null;
        let isImage = false;
        
        if (data.payload) {
            rawChatId = data.payload.from || data.payload.chatId;
            hasMedia = data.payload.hasMedia || false;
            isImage = data.payload.mediaType === 'image';
            
            if (data.payload.media?.url) {
                mediaUrl = data.payload.media.url;
                console.log('✅ Found direct media URL');
            }
        }
        
        if (!rawChatId) {
            return res.status(200).json({ success: false });
        }
        
        let chatId = rawChatId;
        if (!chatId.includes('@')) {
            chatId = `${chatId}@c.us`;
        }
        
        console.log(`📱 From: ${chatId}`);
        
        // معالجة الصورة
        if (hasMedia && mediaUrl && isImage) {
            console.log('🖼️ Processing image...');
            
            await sendWAPilotMessage(chatId, "⏳ جاري تحليل الصورة واستخراج النص...");
            
            const extractedText = await extractTextFromImage(mediaUrl);
            
            console.log('📝 Extracted:', extractedText.substring(0, 100));
            
            let aiResponse = "";
            if (extractedText.length > 5 && !extractedText.includes("عذراً") && !extractedText.includes("خطأ")) {
                if (model) {
                    try {
                        const prompt = `أنت مصحح آلي. صحح الأخطاء الإملائية وأجب عن أي سؤال:\n\n"${extractedText}"\n\nأجب بالعربية.`;
                        const aiResult = await model.generateContent(prompt);
                        aiResponse = aiResult.response.text();
                        console.log('🤖 Gemini Success');
                    } catch (aiError) {
                        aiResponse = "خطأ في تحليل النص.";
                    }
                } else {
                    aiResponse = "Gemini غير مهيأ.";
                }
            } else {
                aiResponse = extractedText.length <= 5 ? "النص المستخرج قصير جداً." : extractedText;
            }
            
            let finalMessage = `📝 *النص المستخرج:*\n${extractedText.substring(0, 500)}\n`;
            finalMessage += `━━━━━━━━━━━━━━━\n`;
            finalMessage += `🤖 *تحليل Gemini:*\n${aiResponse.substring(0, 800)}`;
            
            await sendWAPilotMessage(chatId, finalMessage);
            console.log('✅ Response sent!');
            
            return res.status(200).json({ success: true });
        }
        
        // رسالة نصية
        await sendWAPilotMessage(
            chatId,
            "📸 *مرحباً بك في بوت تصحيح الأوراق!*\n\nمن فضلك أرسل صورة واضحة لورقة الإجابة."
        );
        
        return res.status(200).json({ success: true });
    }
    
    res.status(404).send('Not Found');
};
