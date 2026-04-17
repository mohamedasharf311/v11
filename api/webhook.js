// api/webhook.js - كود تشخيصي
const axios = require('axios');

const INSTANCE_ID = "instance3532";
const WAPILOT_TOKEN = "yzWzEjmxZpbifuOx6lWafYT3Ng69gaFpJGAdTsVc6N";
const WAPILOT_API_URL = "https://api.wapilot.net/api/v2";

async function sendWAPilotMessage(chatId, text) {
    try {
        await axios.post(
            `${WAPILOT_API_URL}/${INSTANCE_ID}/send-message`,
            { chat_id: chatId, text: text },
            { headers: { "token": WAPILOT_TOKEN, "Content-Type": "application/json" } }
        );
        return true;
    } catch (error) {
        return false;
    }
}

module.exports = async (req, res) => {
    const url = req.url || '';
    const method = req.method || 'GET';
    
    if (method === 'GET') {
        return res.status(200).json({ status: 'ok' });
    }

    if (method === 'POST' && url === '/api/webhook') {
        const data = req.body;
        
        // 🔥 طباعة كل حاجة
        console.log('========== FULL PAYLOAD ==========');
        console.log(JSON.stringify(data, null, 2));
        console.log('===================================');
        
        let rawChatId = null;
        let mediaUrl = null;
        let hasMedia = false;
        let mediaType = null;
        
        if (data.payload) {
            rawChatId = data.payload.from || data.payload.chatId;
            hasMedia = data.payload.hasMedia || false;
            mediaType = data.payload.mediaType;
            
            console.log('📦 hasMedia:', hasMedia);
            console.log('📦 mediaType:', mediaType);
            console.log('📦 media:', data.payload.media);
            
            if (data.payload.media) {
                console.log('📦 media keys:', Object.keys(data.payload.media));
                if (data.payload.media.url) {
                    mediaUrl = data.payload.media.url;
                }
            }
        }
        
        if (!rawChatId) {
            return res.status(200).json({ ok: false });
        }
        
        let chatId = rawChatId.includes('@') ? rawChatId : `${rawChatId}@c.us`;
        
        // إرسال رد تشخيصي
        const debugMessage = `📊 تشخيص:
- hasMedia: ${hasMedia}
- mediaType: ${mediaType || 'none'}
- mediaUrl: ${mediaUrl ? 'موجود ✅' : 'مفقود ❌'}
- from: ${rawChatId}`;
        
        await sendWAPilotMessage(chatId, debugMessage);
        
        return res.status(200).json({ ok: true });
    }
    
    res.status(404).send('Not Found');
};
