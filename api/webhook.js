<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>لوحة تحكم بوت تصحيح الأوراق</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Segoe UI', 'Tahoma', 'Arial', sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }

        .container {
            max-width: 700px;
            width: 100%;
            background: rgba(255, 255, 255, 0.98);
            border-radius: 24px;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
            padding: 40px;
            text-align: center;
        }

        h1 {
            color: #1a1a2e;
            font-size: 2.2rem;
            margin-bottom: 10px;
        }

        .subtitle {
            color: #666;
            font-size: 1.1rem;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 2px solid #e0e0e0;
        }

        .status-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }

        .status-card {
            background: #f8f9fa;
            border-radius: 16px;
            padding: 25px 20px;
            transition: all 0.3s ease;
            border: 2px solid transparent;
        }

        .status-card .icon {
            font-size: 3rem;
            margin-bottom: 15px;
        }

        .status-card h3 {
            color: #333;
            font-size: 1.2rem;
            margin-bottom: 15px;
        }

        .status-badge {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 8px 16px;
            border-radius: 50px;
            font-weight: bold;
            font-size: 0.95rem;
        }

        .online {
            background: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }

        .offline {
            background: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }

        .checking {
            background: #fff3cd;
            color: #856404;
            border: 1px solid #ffeeba;
        }

        .info-section {
            background: #e8f4fd;
            border-radius: 16px;
            padding: 20px;
            margin-bottom: 25px;
            text-align: right;
        }

        .info-section h4 {
            color: #004085;
            margin-bottom: 12px;
            font-size: 1.1rem;
        }

        .webhook-url {
            background: #1a1a2e;
            color: #00ff88;
            padding: 12px 15px;
            border-radius: 12px;
            font-family: 'Courier New', monospace;
            font-size: 0.9rem;
            direction: ltr;
            text-align: left;
            margin: 15px 0;
            word-break: break-all;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .copy-btn {
            background: #2d2d44;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 0.9rem;
        }

        .copy-btn:hover {
            background: #3d3d5c;
        }

        .refresh-btn {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            padding: 14px 30px;
            border-radius: 50px;
            font-size: 1.1rem;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.3s ease;
            margin-top: 10px;
        }

        .refresh-btn:hover {
            transform: scale(1.02);
            box-shadow: 0 10px 25px rgba(102, 126, 234, 0.4);
        }

        .key-status {
            margin-top: 15px;
            padding: 10px;
            background: #f1f3f4;
            border-radius: 10px;
            font-size: 0.9rem;
        }

        .loading {
            opacity: 0.7;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🤖 بوت تصحيح الأوراق</h1>
        <div class="subtitle">لوحة تحكم حالة النظام</div>

        <!-- حالة الخدمات -->
        <div class="status-grid">
            <div class="status-card">
                <div class="icon">🧠</div>
                <h3>Gemini AI</h3>
                <div id="gemini-status">
                    <span class="status-badge checking">⏳ جاري الفحص...</span>
                </div>
            </div>

            <div class="status-card">
                <div class="icon">👁️</div>
                <h3>Google Vision</h3>
                <div id="vision-status">
                    <span class="status-badge checking">⏳ جاري الفحص...</span>
                </div>
            </div>

            <div class="status-card">
                <div class="icon">📱</div>
                <h3>WAPilot</h3>
                <div id="wapilot-status">
                    <span class="status-badge checking">⏳ جاري الفحص...</span>
                </div>
            </div>
        </div>

        <!-- معلومات Webhook -->
        <div class="info-section">
            <h4>🔗 رابط Webhook للربط مع WAPilot</h4>
            <div class="webhook-url">
                <span id="url-text">جاري التحميل...</span>
                <button class="copy-btn" onclick="copyWebhookUrl()">📋 نسخ</button>
            </div>
        </div>

        <!-- حالة المفاتيح -->
        <div class="key-status" id="key-status">
            جاري فحص المفاتيح...
        </div>

        <button class="refresh-btn" onclick="checkAllStatus()">
            🔄 تحديث الحالة
        </button>

        <div style="margin-top: 20px; color: #888; font-size: 0.85rem;">
            Webhook Endpoint: <code style="background:#f0f0f0; padding:2px 6px; border-radius:4px;">/api/webhook</code>
        </div>
    </div>

    <script>
        const baseUrl = window.location.origin;
        const webhookUrl = baseUrl + '/api/webhook';
        document.getElementById('url-text').textContent = webhookUrl;

        function copyWebhookUrl() {
            navigator.clipboard.writeText(webhookUrl).then(() => {
                alert('✅ تم نسخ رابط Webhook!');
            }).catch(() => {
                prompt('انسخ الرابط يدوياً:', webhookUrl);
            });
        }

        async function checkAPI(endpoint) {
            try {
                const response = await fetch(baseUrl + endpoint);
                const text = await response.text();
                
                // محاولة تحويل النص لـ JSON
                try {
                    return JSON.parse(text);
                } catch (e) {
                    // لو مش JSON، نرجع النص كرسالة خطأ
                    return { status: 'error', message: 'Invalid response: ' + text.substring(0, 50) };
                }
            } catch (error) {
                return { status: 'error', message: error.message };
            }
        }

        function updateStatus(elementId, data, serviceName) {
            const element = document.getElementById(elementId);
            
            if (data.status === 'ok') {
                let extraInfo = '';
                if (data.model) extraInfo = `<br><small>${data.model}</small>`;
                if (data.instance) extraInfo = `<br><small>Instance: ${data.instance}</small>`;
                
                element.innerHTML = `
                    <span class="status-badge online">
                        ✅ متصل
                    </span>
                    ${extraInfo}
                `;
                return true;
            } else {
                element.innerHTML = `
                    <span class="status-badge offline">
                        ❌ غير متصل
                    </span>
                    <br><small style="color:#721c24;">${data.message || 'خطأ غير معروف'}</small>
                `;
                return false;
            }
        }

        async function checkAllStatus() {
            // إعادة ضبط الحالة
            document.getElementById('gemini-status').innerHTML = '<span class="status-badge checking">⏳ جاري الفحص...</span>';
            document.getElementById('vision-status').innerHTML = '<span class="status-badge checking">⏳ جاري الفحص...</span>';
            document.getElementById('wapilot-status').innerHTML = '<span class="status-badge checking">⏳ جاري الفحص...</span>';
            
            // فحص Webhook الرئيسي أولاً (عشان نعرف حالة المفاتيح)
            try {
                const webhookResponse = await fetch(baseUrl + '/api/webhook');
                const webhookText = await webhookResponse.text();
                
                // استخراج معلومات المفاتيح من النص
                const geminiReady = webhookText.includes('Gemini: Ready');
                const visionReady = webhookText.includes('Vision: Ready');
                const geminiKeyPresent = webhookText.includes('Gemini Key: Present');
                const visionKeyPresent = webhookText.includes('Vision Key: Present');
                
                document.getElementById('key-status').innerHTML = `
                    🔑 Gemini Key: ${geminiKeyPresent ? '✅ موجود' : '❌ مفقود'} | 
                    👁️ Vision Key: ${visionKeyPresent ? '✅ موجود' : '❌ مفقود'}<br>
                    <small>${webhookText.substring(0, 100)}...</small>
                `;
                
                // تحديث الحالات بناءً على النص
                if (geminiReady) {
                    document.getElementById('gemini-status').innerHTML = '<span class="status-badge online">✅ متصل (Gemini Ready)</span>';
                } else {
                    document.getElementById('gemini-status').innerHTML = '<span class="status-badge offline">❌ غير متصل</span>';
                }
                
                if (visionReady) {
                    document.getElementById('vision-status').innerHTML = '<span class="status-badge online">✅ متصل (Vision Ready)</span>';
                } else {
                    document.getElementById('vision-status').innerHTML = '<span class="status-badge offline">❌ غير متصل</span>';
                }
                
                document.getElementById('wapilot-status').innerHTML = '<span class="status-badge online">✅ متصل (Instance Ready)</span>';
                
            } catch (error) {
                console.error('Error checking status:', error);
                document.getElementById('key-status').innerHTML = '❌ خطأ في الاتصال بالخادم';
            }
        }

        // فحص تلقائي عند التحميل
        window.onload = () => {
            checkAllStatus();
        };
    </script>
</body>
</html>
