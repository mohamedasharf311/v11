// ========== SYSTEM CONFIGURATION ==========
const OPENROUTER_API_KEY = 'your-api-key-here';
const MODEL = 'meta-llama/llama-3.2-3b-instruct:free';

// ========== SESSION MANAGER ==========
class SessionManager {
    constructor() {
        this.sessions = new Map();
    }

    getSession(userId) {
        if (!this.sessions.has(userId)) {
            this.sessions.set(userId, {
                subject: null,        // math, science, arabic, english, general
                intent: null,         // explain, question, answer, practice, general
                mode: null,           // teaching, testing, practicing
                lastQuestion: null,   // آخر سؤال تم طرحه
                lastSubject: null,    // آخر مادة تم التعامل معها
                conversationHistory: [],
                pendingAnswer: false   // هل ننتظر إجابة على سؤال؟
            });
        }
        return this.sessions.get(userId);
    }

    updateSession(userId, updates) {
        const session = this.getSession(userId);
        Object.assign(session, updates);
        
        // تحديث سجل المحادثة
        if (updates.lastMessage) {
            session.conversationHistory.push({
                message: updates.lastMessage,
                timestamp: Date.now(),
                subject: session.subject,
                intent: session.intent
            });
            
            // الاحتفاظ بآخر 20 رسالة فقط
            if (session.conversationHistory.length > 20) {
                session.conversationHistory.shift();
            }
        }
        
        this.sessions.set(userId, session);
        return session;
    }
}

const sessionManager = new SessionManager();

// ========== RULE-BASED DETECTION (سريع واقتصادي) ==========
class RuleBasedDetector {
    constructor() {
        // قواعد المواد
        this.subjectRules = {
            math: {
                keywords: ['رياضيات', 'حساب', 'جبر', 'هندسة', 'معادلة', 'رقم', 'عدد', 'مسألة', 'عملية حسابية'],
                patterns: [
                    /\d+[\+\-\*x÷]\d+/,           // 5+3
                    /ما ناتج|كم ناتج|احسب|أوجد/,   // كم ناتج 5+3
                    /جمع|طرح|ضرب|قسمة/,            // عمليات حسابية
                    /معادلة|مجهول|س\s*=\s*\d+/     // معادلات
                ]
            },
            science: {
                keywords: ['علوم', 'فيزياء', 'كيمياء', 'أحياء', 'مادة', 'عنصر', 'مركب', 'طاقة', 'قوة', 'خلية', 'حامض', 'قاعدة'],
                patterns: [
                    /h2o|co2|nacl|الـ?ماء/i,      // مركبات كيميائية
                    /الضوء|الصوت|الحرارة/,         // فيزياء
                    /النبات|الحيوان|الإنسان/,      // أحياء
                    /يتفاعل|ينتج|يتحول/            // تفاعلات
                ]
            },
            arabic: {
                keywords: ['عربي', 'لغة', 'نحو', 'صرف', 'بلاغة', 'إملاء', 'قواعد', 'فعل', 'اسم', 'حرف', 'جملة', 'إعراب'],
                patterns: [
                    /ما إعراب|أعرب|علامة إعراب/,
                    /جمع|مفرد|مذكر|مؤنث/,
                    /فعل ماض|فعل مضارع|فعل أمر/
                ]
            },
            english: {
                keywords: ['english', 'انجليزي', 'grammar', 'vocabulary', 'verb', 'noun', 'sentence', 'translation', 'ترجمة'],
                patterns: [
                    /what is|how to|translate/i,
                    /past tense|present|future/i,
                    /\b(is|am|are|was|were)\b.*\?/i
                ]
            }
        };
        
        // قواعد النوايا
        this.intentRules = {
            explain: {
                keywords: ['اشرح', 'شرح', 'وضح', 'فسر', 'عرف', 'ما معنى', 'كيف يعمل', 'ماذا يعني'],
                patterns: [
                    /ما هو|ما هي|ماذا/,           // ما هو الماء؟
                    /كيف (يعمل|تحدث|تتكون)/,      // كيف تعمل الخلية؟
                    /لماذا/                        // لماذا السماء زرقاء؟
                ]
            },
            question: {
                keywords: ['سؤال', 'حل', 'أوجد', 'احسب', 'كم', 'كم ناتج', 'ما حل', 'طريقة حل'],
                patterns: [
                    /^\d+[\+\-\*x÷]\d+/,           // 5+3
                    /ما.*\?$/,                     // جملة استفهامية
                    /كم يساوي/,                    // كم يساوي 5+3
                    /أوجد قيمة/,                   // أوجد قيمة س
                    /حل المسألة/                   // حل المسألة
                ]
            },
            answer: {
                keywords: ['الإجابة', 'الجواب', 'الناتج', 'الحل', 'يساوي'],
                patterns: [
                    /^\d+$/,                       // رقم فقط (ممكن يكون إجابة)
                    /الناتج هو/,                   // الناتج هو 8
                    /الإجابة الصحيحة/              // الإجابة الصحيحة هي...
                ]
            },
            practice: {
                keywords: ['تدرب', 'تمرين', 'تمارين', 'أريد حل', 'أريد مسائل', 'أختبر نفسي', 'أسئلة'],
                patterns: [
                    /أريد تمارين/,                 // أريد تمارين رياضيات
                    /دربني على/,                   // دربني على الجمع
                    /امتحان/,                      // امتحان في العلوم
                    /اختبرني/                      // اختبرني في العربي
                ]
            }
        };
    }
    
    detectSubject(message, session) {
        const msg = message.toLowerCase();
        
        // 1. استخدام السياق السابق
        if (session.lastSubject && this.isContextRelevant(msg, session)) {
            return session.lastSubject;
        }
        
        // 2. فحص القواعد
        for (const [subject, rules] of Object.entries(this.subjectRules)) {
            // فحص الكلمات المفتاحية
            for (const keyword of rules.keywords) {
                if (msg.includes(keyword)) {
                    return subject;
                }
            }
            
            // فحص الأنماط
            for (const pattern of rules.patterns) {
                if (pattern.test(msg)) {
                    return subject;
                }
            }
        }
        
        return 'general';
    }
    
    detectIntent(message, session) {
        const msg = message.toLowerCase();
        
        // 1. حالة انتظار الإجابة
        if (session.pendingAnswer && this.looksLikeAnswer(message, session)) {
            return 'answer';
        }
        
        // 2. أرقام فقط (قد تكون إجابة)
        if (/^\d+(\.\d+)?$/.test(msg.trim())) {
            if (session.lastQuestion && session.mode === 'question') {
                return 'answer';
            }
            return 'question';
        }
        
        // 3. فحص القواعد
        for (const [intent, rules] of Object.entries(this.intentRules)) {
            for (const keyword of rules.keywords) {
                if (msg.includes(keyword)) {
                    return intent;
                }
            }
            
            for (const pattern of rules.patterns) {
                if (pattern.test(msg)) {
                    return intent;
                }
            }
        }
        
        // 4. الاستفهام التلقائي
        if (msg.includes('؟') || msg.includes('?')) {
            return 'question';
        }
        
        return 'general';
    }
    
    isContextRelevant(message, session) {
        // التحقق مما إذا كانت الرسالة مرتبطة بالسياق السابق
        const timeSinceLastInteraction = Date.now() - (session.conversationHistory[session.conversationHistory.length - 1]?.timestamp || 0);
        return timeSinceLastInteraction < 300000; // 5 دقائق
    }
    
    looksLikeAnswer(message, session) {
        const msg = message.toLowerCase();
        
        // إجابة برقم
        if (/^\d+(\.\d+)?$/.test(msg.trim())) {
            return true;
        }
        
        // إجابة مختصرة
        const shortAnswers = ['نعم', 'لا', 'صح', 'غلط', 'true', 'false', 'yes', 'no'];
        if (shortAnswers.includes(msg)) {
            return true;
        }
        
        // إجابة مع وحدات
        if (/\d+\s*(سم|م|كجم|لتر|ثانية|دقيقة|ساعة)/.test(msg)) {
            return true;
        }
        
        return false;
    }
}

// ========== AI DETECTION (Fallback) ==========
class AIDetector {
    async detect(message, session) {
        const prompt = `أنت محلل ذكي للمحتوى التعليمي. حلل الرسالة التالية وحدد:

1. المادة (subject): math / science / arabic / english / general
2. النية (intent): explain / question / answer / practice / general
3. الثقة (confidence): رقم من 0 إلى 1

الرسالة: "${message}"

السياق السابق:
- آخر مادة تمت مناقشتها: ${session.lastSubject || 'لا يوجد'}
- آخر نية: ${session.intent || 'لا يوجد'}

أجب فقط بصيغة JSON:
{
    "subject": "math",
    "intent": "question",
    "confidence": 0.95,
    "reasoning": "الرسالة تحتوي على عملية حسابية"
}`;

        try {
            const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
                model: MODEL,
                messages: [{ role: "user", content: prompt }],
                temperature: 0,
                max_tokens: 200
            }, {
                headers: {
                    'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 5000 // 5 ثواني كحد أقصى
            });
            
            const content = response.data.choices[0].message.content;
            const parsed = JSON.parse(content);
            return parsed;
        } catch (error) {
            console.error('AI Detection failed:', error.message);
            return {
                subject: 'general',
                intent: 'general',
                confidence: 0,
                reasoning: 'Fallback to general'
            };
        }
    }
}

// ========== MAIN DETECTOR (Hybrid) ==========
class SmartDetector {
    constructor() {
        this.ruleDetector = new RuleBasedDetector();
        this.aiDetector = new AIDetector();
    }
    
    async detect(message, userId) {
        const session = sessionManager.getSession(userId);
        const startTime = Date.now();
        
        // الخطوة 1: المحاولة بالقواعد أولاً (سريعة)
        let subject = this.ruleDetector.detectSubject(message, session);
        let intent = this.ruleDetector.detectIntent(message, session);
        let method = 'rule-based';
        let confidence = 0.7; // ثقة افتراضية للقواعد
        
        // الخطوة 2: التحقق من جودة الكشف بالقواعد
        const needsAIFallback = (
            subject === 'general' || 
            intent === 'general' ||
            (subject === 'general' && intent === 'general')
        );
        
        // الخطوة 3: استخدام AI كـ Fallback فقط عند الحاجة
        if (needsAIFallback) {
            const aiResult = await this.aiDetector.detect(message, session);
            
            if (aiResult.confidence > 0.6) { // فقط إذا كان AI واثق
                subject = aiResult.subject;
                intent = aiResult.intent;
                method = 'ai-fallback';
                confidence = aiResult.confidence;
            }
        }
        
        // الخطوة 4: تحديث الجلسة
        sessionManager.updateSession(userId, {
            subject: subject,
            intent: intent,
            lastSubject: subject,
            lastMessage: message,
            lastQuestion: intent === 'question' ? message : session.lastQuestion,
            pendingAnswer: intent === 'question'
        });
        
        const detectionTime = Date.now() - startTime;
        
        return {
            subject,
            intent,
            method,
            confidence,
            detectionTime,
            session: sessionManager.getSession(userId)
        };
    }
    
    // دالة لتغيير المود تلقائياً
    determineMode(subject, intent) {
        if (subject === 'math') {
            if (intent === 'question') return 'solving';
            if (intent === 'practice') return 'practicing';
            return 'teaching';
        }
        
        if (subject === 'science') {
            if (intent === 'explain') return 'explaining';
            if (intent === 'question') return 'qna';
            return 'teaching';
        }
        
        if (subject === 'arabic' || subject === 'english') {
            if (intent === 'explain') return 'grammar';
            if (intent === 'practice') return 'exercises';
            return 'language';
        }
        
        return 'general';
    }
}

// ========== RESPONSE GENERATOR ==========
class ResponseGenerator {
    generateResponse(detection, message) {
        const { subject, intent, method, confidence, session } = detection;
        const mode = new SmartDetector().determineMode(subject, intent);
        
        let response = '';
        
        // إظهار معلومات التشخيص (للتطوير)
        const debug = `[${subject} | ${intent} | ${method} | ${(confidence * 100).toFixed(0)}% | ${mode}]`;
        
        switch (subject) {
            case 'math':
                if (intent === 'question') {
                    response = `🧮 سؤال رياضي جميل! دعني أساعدك في حله.\n${message}\n\nما هي خطوات الحل التي فكرت فيها؟`;
                } else if (intent === 'explain') {
                    response = `📐 شرح قاعدة رياضية:\n${message}\n\nهل تريد أمثلة تطبيقية؟`;
                } else if (intent === 'practice') {
                    response = `📝 تمارين رياضيات:\nسأعطيك 3 مسائل تدريبية...`;
                } else {
                    response = `🧮 في الرياضيات:\n${message}\n\nهل تريد شرحًا أم حل المسائل؟`;
                }
                break;
                
            case 'science':
                if (intent === 'explain') {
                    response = `🔬 شرح علمي رائع:\n${message}\n\nهل هناك تفصيل معين تريد معرفته؟`;
                } else if (intent === 'question') {
                    response = `⚛️ سؤال علمي مهم:\n${message}\n\nدعني أوضح لك الإجابة بالتفصيل...`;
                } else {
                    response = `🔭 في العلوم:\n${message}\n\nماذا تريد أن تعرف بالضبط؟`;
                }
                break;
                
            case 'arabic':
                response = `📖 في اللغة العربية:\n${message}\n\nكيف يمكنني مساعدتك في النحو أو البلاغة؟`;
                break;
                
            case 'english':
                response = `🇬🇧 In English:\n${message}\n\nHow can I help you with grammar or vocabulary?`;
                break;
                
            default:
                if (intent === 'answer') {
                    response = `✅ إجابة جيدة!\n${message}\n\nهل تريد التأكد من الإجابة؟`;
                } else {
                    response = `💡 ${message}\n\nكيف يمكنني مساعدتك بشكل أفضل؟ حدد المادة (رياضيات/علوم/عربي/إنجليزي)`;
                }
        }
        
        // إضافة اقتراحات ذكية
        if (confidence < 0.7) {
            response += `\n\n🤔 هل تقصد سؤالاً في ${subject === 'general' ? 'مادة معينة' : subject}؟`;
        }
        
        if (method === 'ai-fallback') {
            response += `\n\n✨ (تم استخدام الذكاء الاصطناعي لفهم سؤالك بشكل أفضل)`;
        }
        
        return {
            text: response,
            debug: debug,
            mode: mode,
            detection: detection
        };
    }
}

// ========== MAIN BOT CLASS ==========
class SmartBot {
    constructor() {
        this.detector = new SmartDetector();
        this.responseGenerator = new ResponseGenerator();
    }
    
    async processMessage(message, userId) {
        if (!message || message.trim() === '') {
            return { text: 'الرجاء كتابة رسالة للمساعدة', debug: '[empty]' };
        }
        
        // كشف النية والمادة
        const detection = await this.detector.detect(message, userId);
        
        // توليد الرد
        const response = this.responseGenerator.generateResponse(detection, message);
        
        return response;
    }
    
    // دالة للحصول على حالة الجلسة الحالية
    getSessionStatus(userId) {
        return sessionManager.getSession(userId);
    }
    
    // دالة لإعادة ضبط الجلسة
    resetSession(userId) {
        sessionManager.updateSession(userId, {
            subject: null,
            intent: null,
            mode: null,
            lastQuestion: null,
            lastSubject: null,
            conversationHistory: [],
            pendingAnswer: false
        });
        return { message: 'تم إعادة ضبط الجلسة بنجاح', userId };
    }
}

// ========== EXPORTS & USAGE ==========
const bot = new SmartBot();

// مثال على الاستخدام
async function test() {
    console.log('🤖 بدء اختبار البوت الذكي...\n');
    
    const testMessages = [
        '3 + 5',                          // Math + Question
        'اشرح لي H2O',                    // Science + Explain
        '12',                             // Math + Answer (بالسياق)
        'عايز أتدرب على الجمع',            // Math + Practice
        'ما إعراب كلمة "الكتاب"؟',        // Arabic + Question
        'مرحباً',                         // General + General
        '5 * 7'                           // Math + Question
    ];
    
    for (const msg of testMessages) {
        console.log(`\n👤 المستخدم: ${msg}`);
        const response = await bot.processMessage(msg, 'test-user-1');
        console.log(`🤖 البوت: ${response.text}`);
        console.log(`📊 التشخيص: ${response.debug}\n`);
        console.log('─'.repeat(50));
    }
}

// تشغيل الاختبار
// test();

module.exports = { SmartBot, sessionManager, bot };
