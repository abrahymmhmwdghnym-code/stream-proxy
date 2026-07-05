const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();

// ============================================
// ⚙️ إعدادات CORS
// ============================================
const corsOptions = {
    origin: '*',
    credentials: true,
    optionsSuccessStatus: 200,
    methods: ['GET', 'POST', 'OPTIONS', 'HEAD'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'Referer']
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// ============================================
// 📡 نقطة نهاية الوكيل - ترجع البيانات النصية
// ============================================
app.get('/api/stream', async (req, res) => {
    const url = req.query.url;

    if (!url) {
        return res.status(400).json({
            error: 'Missing url parameter',
            example: '/api/stream?url=https://example.com/playlist.m3u8'
        });
    }

    console.log(`\n${'='.repeat(70)}`);
    console.log(`🔄 طلب جديد في ${new Date().toLocaleTimeString('ar-EG')}`);
    console.log(`📍 الرابط: ${url}`);
    console.log(`${'='.repeat(70)}\n`);

    try {
        // ============================================
        // 🔥 الـ Headers المطلوبة بالضبط
        // ============================================
        const headers = {
            'Cookie': 'googtrans=/auto/ar',
            'Accept': 'application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
            'Referer': url, // نفس الرابط
            'User-Agent': 'Mozilla/5.0 (Linux; Android 15; CPH2591 Build/AP3A.240617.008) AppleWebKit/537.36 (KHTML, like Gecko) Abck/4.0 Chrome/149.0.7827.159 Mobile Safari/537.36',
            'Accept-Encoding': 'identity',
            'Host': 'vz-8b2563a6-02a.b-cdn.net',
            'Connection': 'Keep-Alive'
        };

        console.log('📌 الـ Headers المرسلة:');
        console.log(JSON.stringify(headers, null, 2));

        // ============================================
        // 📡 إرسال الطلب
        // ============================================
        const response = await fetch(url, {
            method: 'GET',
            headers: headers,
            redirect: 'manual'
        });

        // ============================================
        // 📊 عرض كل حاجة عن الرد
        // ============================================
        const statusCode = response.status;
        const statusText = response.statusText;
        const responseHeaders = {};
        response.headers.forEach((value, key) => {
            responseHeaders[key] = value;
        });

        // جلب النص
        let bodyText = '';
        try {
            bodyText = await response.text();
        } catch (e) {
            bodyText = '⚠️ تعذر قراءة النص';
        }

        // ============================================
        // 📤 الرد بالبيانات كاملة
        // ============================================
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Access-Control-Allow-Origin', '*');
        
        const responseData = {
            success: response.ok,
            status: {
                code: statusCode,
                text: statusText
            },
            headers: responseHeaders,
            body: bodyText,
            bodyLength: bodyText.length,
            url: url
        };

        console.log(`✅ تم بنجاح! الحالة: ${statusCode}`);
        res.json(responseData);

    } catch (error) {
        console.error('❌ خطأ:', error.message);
        
        res.status(500).json({
            success: false,
            error: error.message,
            url: url,
            timestamp: new Date().toISOString()
        });
    }
});

// ============================================
// 🏠 الصفحة الرئيسية
// ============================================
app.get('/', (req, res) => {
    res.type('text/html').send(`
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>📡 وكيل البث - عرض البيانات</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    min-height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 20px;
                }
                .container {
                    background: white;
                    border-radius: 15px;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                    max-width: 900px;
                    width: 100%;
                    padding: 40px;
                }
                h1 {
                    color: #667eea;
                    margin-bottom: 10px;
                    font-size: 28px;
                }
                .status {
                    background: #d4edda;
                    border: 2px solid #28a745;
                    color: #155724;
                    padding: 15px;
                    border-radius: 8px;
                    margin: 20px 0;
                    font-weight: 600;
                }
                .section {
                    margin: 30px 0;
                    padding: 20px;
                    background: #f8f9fa;
                    border-radius: 10px;
                    border-right: 5px solid #667eea;
                }
                .section h2 {
                    color: #333;
                    font-size: 20px;
                    margin-bottom: 15px;
                }
                code {
                    background: #2d2d2d;
                    color: #f8f8f2;
                    padding: 12px 15px;
                    border-radius: 6px;
                    display: block;
                    margin: 10px 0;
                    overflow-x: auto;
                    font-size: 12px;
                    line-height: 1.6;
                    word-break: break-all;
                }
                .example {
                    background: #fff3cd;
                    border: 1px solid #ffc107;
                    padding: 15px;
                    border-radius: 5px;
                    margin: 15px 0;
                }
                .footer {
                    margin-top: 40px;
                    padding-top: 20px;
                    border-top: 1px solid #ddd;
                    text-align: center;
                    color: #999;
                    font-size: 13px;
                }
                .badge {
                    display: inline-block;
                    background: #667eea;
                    color: white;
                    padding: 4px 8px;
                    border-radius: 4px;
                    font-size: 12px;
                    margin-left: 8px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>📡 وكيل عرض البيانات <span class="badge">v3.0</span></h1>
                <div class="status">
                    <span style="font-size: 22px;">✅</span>
                    <span>السيرفر جاهز لعرض بيانات الـ M3U8</span>
                </div>

                <div class="section">
                    <h2>📖 كيفية الاستخدام</h2>
                    <code>GET /api/stream?url=https://vz-8b2563a6-02a.b-cdn.net/b93e9b40-8622-4b48-8458-ec85e6b8a6aa/playlist.m3u8</code>
                    <div class="example">
                        <strong>📌 النتيجة:</strong> هترجع JSON فيه كل بيانات الطلب (الحالة، الهيدرز، والنص)
                    </div>
                </div>

                <div class="section">
                    <h2>🔧 مثال عملي</h2>
                    <code>https://stream-proxy-production-9ae1.up.railway.app/api/stream?url=https://vz-8b2563a6-02a.b-cdn.net/b93e9b40-8622-4b48-8458-ec85e6b8a6aa/playlist.m3u8</code>
                </div>

                <div class="footer">
                    <p>🔧 تم التعديل لعرض البيانات بدلاً من الفيديو</p>
                </div>
            </div>
        </body>
        </html>
    `);
});

// ============================================
// 🚀 بدء السيرفر
// ============================================
const port = process.env.PORT || 3000;

app.listen(port, '0.0.0.0', () => {
    console.log(`
╔═══════════════════════════════════════════════════════════════════════╗
║                                                                       ║
║           📡 وكيل عرض البيانات بدأ يعمل بنجاح! 🚀                   ║
║                                                                       ║
║  📡 الخادم:  http://0.0.0.0:${port}
║  🌐 نقطة الوكيل:  /api/stream?url=<رابط_الـ_M3U8>
║                                                                       ║
║  📌 المميزات:                                                        ║
║     • يبعث الطلب بالـ Headers المطلوبة بالضبط                      ║
║     • يرجع الرد كامل (الحالة، الهيدرز، النص)                       ║
║     • يعرض البيانات بصيغة JSON                                      ║
║                                                                       ║
╚═══════════════════════════════════════════════════════════════════════╝
    `);
});

// ============================================
// 🛑 معالجة الأخطاء
// ============================================
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
});
