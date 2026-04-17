# WhatsApp OCR Bot - بوت تصحيح أوراق الإجابة

بوت واتساب يستخدم Google Vision لاستخراج النص العربي من الصور و Gemini AI لتحليله وتصحيحه.

## المميزات
- ✅ استقبال صور أوراق الإجابة عبر واتساب
- ✅ استخراج النص العربي باستخدام Google Vision OCR
- ✅ تحليل وتصحيح النص باستخدام Gemini 1.5 Flash
- ✅ الرد التلقائي على المستخدم

## الإعدادات المطلوبة في Vercel

| المتغير | الوصف |
|---------|-------|
| `GEMINI_API_KEY` | مفتاح API من Google AI Studio |
| `GOOGLE_VISION_API_KEY` | مفتاح API من Google Cloud Console |

## النشر على Vercel

1. ارفع المشروع على GitHub
2. اربط المستودع مع Vercel
3. أضف Environment Variables
4. انشر المشروع

## إعداد Webhook في WAPilot

- الرابط: `https://your-project.vercel.app/api/webhook`
- الأحداث: Incoming Messages

## التكلفة التقريبية (500 طالب/شهر)

- Google Vision: ~$2
- Gemini Flash: ~$3-5
- WAPilot: حسب باقتك
- Vercel: مجاني (Hobby Plan)

**الإجمالي التقريبي: ~$10-15 شهرياً**
