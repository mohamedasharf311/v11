// استقبال رسائل واتساب (POST)
if (method === 'POST' && url === '/api/webhook') {
    const data = req.body;
    
    console.log('📨 FULL BODY:', JSON.stringify(data).substring(0, 1000));
    
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
        
        // 🔥 فحص الميديا بكل الطرق
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
    
    // 🔥 فحص إضافي: لو فيه media في الـ root
    if (!hasMedia && data.media) {
        hasMedia = true;
        mediaId = data.media.id || data.media;
    }
    
    // 🔥 فحص: لو النوع image في الـ root
    if (!isImage && data.type === 'image') {
        isImage = true;
        hasMedia = true;
        mediaId = data.id || data.mediaId;
    }
    
    if (!rawChatId) {
        console.log('⚠️ No chat_id found');
        console.log('Available keys:', Object.keys(data));
        return res.status(200).json({ success: false });
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
    // 🔥🔥🔥 معالجة الصورة (الأولوية للصورة)
    // =============================================
    if ((hasMedia || mediaId) && (isImage || mediaType === 'image' || !mediaType)) {
        console.log('🖼️🖼️🖼️ PROCESSING IMAGE 🖼️🖼️🖼️');
        
        await sendWAPilotMessage(chatId, "⏳ جاري تحليل الصورة واستخراج النص...");
        
        // جلب الصورة
        const imageUrl = await getWAPilotMedia(mediaId);
        
        if (!imageUrl) {
            await sendWAPilotMessage(chatId, "❌ لم أتمكن من تحميل الصورة. جرب صورة أخرى.");
            return res.status(200).json({ success: false });
        }
        
        console.log('🔗 Image URL obtained');
        
        // OCR
        let extractedText = "";
        if (visionClient) {
            try {
                const [result] = await visionClient.textDetection(imageUrl);
                if (result.textAnnotations?.length > 0) {
                    extractedText = result.textAnnotations[0].description;
                    console.log('📝 OCR Success:', extractedText.length, 'characters');
                    console.log('📝 Preview:', extractedText.substring(0, 100));
                } else {
                    extractedText = "عذراً، لم يتم التعرف على أي نص في الصورة.";
                }
            } catch (e) {
                console.error('❌ OCR Error:', e.message);
                extractedText = "خطأ في استخراج النص من الصورة.";
            }
        } else {
            extractedText = "Vision API غير مهيأة.";
        }
        
        // Gemini
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
3. أجب باللغة العربية الفصحى.`;

                    const aiResult = await model.generateContent(prompt);
                    aiResponse = aiResult.response.text();
                    console.log('🤖 Gemini Success');
                } catch (e) {
                    console.error('❌ Gemini Error:', e.message);
                    aiResponse = "خطأ في تحليل النص بالذكاء الاصطناعي.";
                }
            } else {
                aiResponse = "Gemini غير مهيأ.";
            }
        } else {
            aiResponse = extractedText.length <= 5 ? 
                "النص المستخرج قصير جداً. تأكد من وضوح الصورة." : 
                "لم يتم استخراج نص كافٍ للتحليل.";
        }
        
        const finalMessage = `📝 *النص المستخرج:*\n${extractedText.substring(0, 600)}\n\n━━━━━━━━━━━━━━━\n\n🤖 *تحليل Gemini:*\n${aiResponse.substring(0, 1000)}`;
        
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
        "✅ الإجابة عن الأسئلة"
    );
    
    return res.status(200).json({ success: true, processed: 'text' });
}
