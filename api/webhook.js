const axios = require('axios');
const vision = require('@google-cloud/vision');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require('fs');
const path = require('path');

const INSTANCE_ID = "instance3532";
const WAPILOT_TOKEN = "yzWzEjmxZpbifuOx6lWafYT3Ng69gaFpJGAdTsVc6N";
const BASE_URL = "https://api.wapilot.com/v1";

const GEMINI_API_KEY = process.env.Gemini_API_Key || process.env.GEMINI_API_KEY || '';
const GOOGLE_VISION_API_KEY = process.env.GOOGLE_VISION_API_KEY || '';

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
        console.error('Gemini Error:', error.message);
    }
}

let visionClient;
let visionInitialized = false;

if (GOOGLE_VISION_API_KEY) {
    try {
        visionClient = new vision.ImageAnnotatorClient({ apiKey: GOOGLE_VISION_API_KEY });
        visionInitialized = true;
        console.log('✅ Vision Ready');
    } catch (error) {
        console.error('Vision Error:', error.message);
    }
}

async function sendWAPilotMessage(to, text) {
    try {
        const shortText = text.length > 4000 ? text.substring(0, 3990) + "..." : text;
        await axios.post(`${BASE_URL}/send-message`, {
            instance_id: INSTANCE_ID,
            token: WAPILOT_TOKEN,
            phone: to,
            message: shortText
        });
    } catch (error) {
        console.error("Send Error:", error.message);
    }
}

async function getWAPilotMedia(mediaId) {
    try {
        const response = await axios.get(`${BASE_URL}/media`, {
            params: { instance_id: INSTANCE_ID, token: WAPILOT_TOKEN, media_id: mediaId }
        });
        return response.data.url || response.data.base64 || response.data.file_url;
    } catch (error) {
        return null;
    }
}

module.exports = async (req, res) => {
    const url = req.url || '';
    const method = req.method || 'GET';
    
    console.log(`${method} ${url}`);

    // الصفحة الرئيسية
    if (method === 'GET' && (url === '/' || url === '')) {
        try {
            const htmlPath = path.join(process.cwd(), 'public', 'index.html');
            if (fs.existsSync(htmlPath)) {
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                res.status(200).send(fs.readFileSync(htmlPath, 'utf8'));
            } else {
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

    // استقبال رسائل واتساب
    if (method === 'POST' && url === '/api/webhook') {
        const { body } = req;
        
        try {
            let from = null;
            let messageType = null;
            let mediaId = null;
            
            if (body.message) {
                from = body.message.from || body.message.chatId;
                messageType = body.message.type;
                if (body.message.media) mediaId = body.message.media.id;
            }
            if (!from && body.from) from = body.from;
            if (!messageType && body.type) messageType = body.type;
            if (!mediaId && body.mediaId) mediaId = body.mediaId;
            
            if (!from) {
                res.status(200).json({ ok: false });
                return;
            }

            if (messageType === 'image' || mediaId) {
                await sendWAPilotMessage(from, "⏳ جاري تحليل الصورة...");
                
                const imageUrl = await getWAPilotMedia(mediaId);
                if (!imageUrl) {
                    await sendWAPilotMessage(from, "❌ لم أتمكن من تحميل الصورة");
                    res.status(200).json({ ok: false });
                    return;
                }

                let extractedText = "";
                if (visionClient) {
                    try {
                        const [result] = await visionClient.textDetection(imageUrl);
                        if (result.textAnnotations?.length > 0) {
                            extractedText = result.textAnnotations[0].description;
                        } else {
                            extractedText = "لم يتم التعرف على نص";
                        }
                    } catch (e) {
                        extractedText = "خطأ في استخراج النص";
                    }
                }

                let aiResponse = "";
                if (extractedText.length > 5 && model) {
                    try {
                        const prompt = `صحح الأخطاء الإملائية في النص التالي وأجب عن أي سؤال:\n"${extractedText}"`;
                        const result = await model.generateContent(prompt);
                        aiResponse = result.response.text();
                    } catch (e) {
                        aiResponse = "خطأ في التحليل";
                    }
                } else {
                    aiResponse = "لم يتم استخراج نص كافٍ";
                }

                let finalMessage = `📝 النص:\n${extractedText.substring(0, 400)}\n━━━━━━━━\n🤖 التحليل:\n${aiResponse.substring(0, 600)}`;
                await sendWAPilotMessage(from, finalMessage);
            } else {
                await sendWAPilotMessage(from, "📸 أرسل صورة ورقة الإجابة");
            }
        } catch (error) {
            console.error("Error:", error.message);
        }
        res.status(200).json({ ok: true });
        return;
    }

    res.status(404).send('Not Found');
};
