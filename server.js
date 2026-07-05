const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();

// ============================================
// ⚙️ إعدادات CORS المحسّنة
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
// 🔍 النظام الذكي لاستخراج الـ Headers (محسّن)
// ============================================

function getHeaders(url, refererOverride = null, originOverride = null) {
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'ar-EG,ar;q=0.9,en-US;q=0.8,en;q=0.7',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'cross-site',
    };

    try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname;
        const protocol = urlObj.protocol;

        // ============================================
        // 🎯 خريطة مخصصة للـ Headers حسب الـ Domain
        // ============================================
        const domainMap = {
            'vertyuz': {
                origin: 'https://tv.vertyuz.xyz',
                referer: 'https://tv.vertyuz.xyz/ch2.php'
            },
            'foozlive': {
                origin: 'https://912acsss8af382.shootny.com',
                referer: 'https://912acsss8af382.shootny.com/'
            },
            'kora-plus': {
                origin: (h) => `https://${h}`,
                referer: (h) => `https://${h}/`
            },
            'kora-yalla': {
                origin: 'https://news.sites10.top',
                referer: 'https://news.sites10.top/'
            },
            'floravon': {
                origin: 'https://coursatk.online',
                referer: 'https://coursatk.online/'
            },
            'b-cdn.net': {
                origin: 'https://cdn.mediadelivery.net',
                referer: 'https://www.mediadelivery.net/'
            },
            'mediadelivery': {
                origin: 'https://www.mediadelivery.net',
                referer: 'https://www.mediadelivery.net/'
            },
            'cloudflare': {
                origin: (h) => `https://${h}`,
                referer: (h) => `https://${h}/`
            }
        };

        // ============================================
        // 🔄 البحث عن الـ Domain المطابق
        // ============================================
        let foundOrigin = null;
        let foundReferer = null;

        for (const [key, config] of Object.entries(domainMap)) {
            if (hostname.includes(key)) {
                foundOrigin = typeof config.origin === 'function' 
                    ? config.origin(hostname) 
                    : config.origin;
                foundReferer = typeof config.referer === 'function' 
                    ? config.referer(hostname) 
                    : config.referer;
                break;
            }
        }

        // ============================================
        // 🔄 القيم الافتراضية الذكية
        // ============================================
        if (!foundOrigin) {
            foundOrigin = `${protocol}//${hostname}`;
            foundReferer = `${protocol}//${hostname}/`;
        }

        // ============================================
        // 🔒 السماح بـ Override من الـ Request
        // ============================================
        headers.Origin = originOverride || foundOrigin;
        headers.Referer = refererOverride || foundReferer;

    } catch (e) {
        console.warn('⚠️ Error parsing URL:', e.message);
        headers.Origin = 'https://www.mediadelivery.net';
        headers.Referer = 'https://www.mediadelivery.net/';
    }

    return headers;
}

// ============================================
// 🔄 تعديل الروابط الداخلية لـ M3U8 (محسّن)
// ============================================

function fixM3U8Links(data, baseUrl, proxyBase) {
    let modifiedCount = 0;

    // 1️⃣ تعديل روابط .ts
    data = data.replace(/^([^#][^\s]+\.ts[^\s]*)$/gm, (match, p1) => {
        try {
            const trimmed = p1.trim();
            const absoluteUrl = new URL(trimmed, baseUrl).href;
            modifiedCount++;
            return `${proxyBase}?url=${encodeURIComponent(absoluteUrl)}`;
        } catch (e) {
            return match;
        }
    });

    // 2️⃣ تعديل روابط .m3u8 الفرعية
    data = data.replace(/^([^#][^\s]+\.m3u8[^\s]*)$/gm, (match, p1) => {
        try {
            const trimmed = p1.trim();
            const absoluteUrl = new URL(trimmed, baseUrl).href;
            modifiedCount++;
            return `${proxyBase}?url=${encodeURIComponent(absoluteUrl)}`;
        } catch (e) {
            return match;
        }
    });

    // 3️⃣ تعديل روابط .key (للتشفير)
    data = data.replace(/URI="([^"]+)"/g, (match, p1) => {
        try {
            const absoluteUrl = new URL(p1, baseUrl).href;
            modifiedCount++;
            return `URI="${proxyBase}?url=${encodeURIComponent(absoluteUrl)}"`;
        } catch (e) {
            return match;
        }
    });

    // 4️⃣ تعديل سيجمنتات .woff2 المقنّعة
    data = data.replace(/^([^#][^\s]+\.woff2[^\s]*)$/gm, (match, p1) => {
        try {
            const trimmed = p1.trim();
            const absoluteUrl = new URL(trimmed, baseUrl).href;
            modifiedCount++;
            return `${proxyBase}?url=${encodeURIComponent(absoluteUrl)}`;
        } catch (e) {
            return match;
        }
    });

    console.log(`📝 تم تعديل ${modifiedCount} رابط داخل M3U8`);
    return data;
}

// ============================================
// 📡 متابعة الـ Redirects (محسّنة)
// ============================================

async function fetchWithRedirects(url, headers, maxRedirects = 10, timeout = 20000) {
    let currentUrl = url;
    let redirectChain = [currentUrl];

    for (let i = 0; i < maxRedirects; i++) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            const response = await fetch(currentUrl, {
                headers,
                redirect: 'manual',
                signal: controller.signal,
                compress: true
            });

            clearTimeout(timeoutId);

            if ([301, 302, 307, 308].includes(response.status)) {
                const location = response.headers.get('location') || '';

                // ❌ منع التحويلات الضارة
                if (location.includes('google.com') || 
                    location.includes('captcha') ||
                    location.includes('challenge')) {
                    throw new Error('BLOCKED_REDIRECT');
                }

                if (!location) {
                    return response;
                }

                try {
                    currentUrl = new URL(location, currentUrl).href;
                    redirectChain.push(currentUrl);
                    console.log(`🔄 Redirect ${i + 1}: ${currentUrl}`);
                    continue;
                } catch (e) {
                    console.warn('⚠️ Invalid redirect location:', location);
                    return response;
                }
            }

            console.log(`✅ Final URL: ${currentUrl}`);
            return response;

        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('REQUEST_TIMEOUT');
            }
            throw error;
        }
    }

    throw new Error('TOO_MANY_REDIRECTS');
}

// ============================================
// 📡 نقطة نهاية الوكيل الرئيسية (محسّنة)
// ============================================

app.get('/api/stream', async (req, res) => {
    const rawQuery = req.originalUrl.split('?').slice(1).join('?');
    const urlMatch = rawQuery.match(/^url=(.+?)(?:&|$)/);

    if (!urlMatch) {
        return res.status(400).json({
            error: 'Missing url parameter',
            example: '/api/stream?url=https://example.com/playlist.m3u8'
        });
    }

    let url = urlMatch[1];
    try {
        url = decodeURIComponent(url);
    } catch (e) {
        console.warn('⚠️ Error decoding URL:', e.message);
    }

    // 🔒 استخراج Override من الـ Query (لو في)
    const originOverride = req.query.origin ? decodeURIComponent(req.query.origin) : null;
    const refererOverride = req.query.referer ? decodeURIComponent(req.query.referer) : null;

    console.log(`\n${'='.repeat(70)}`);
    console.log(`🔄 طلب جديد في ${new Date().toLocaleTimeString('ar-EG')}`);
    console.log(`📍 الرابط: ${url}`);
    if (originOverride) console.log(`🔒 Origin Override: ${originOverride}`);
    if (refererOverride) console.log(`🔒 Referer Override: ${refererOverride}`);
    console.log(`${'='.repeat(70)}\n`);

    try {
        const headers = getHeaders(url, refererOverride, originOverride);
        console.log(`📌 Origin: ${headers.Origin}`);
        console.log(`📌 Referer: ${headers.Referer}`);

        let response;
        try {
            response = await fetchWithRedirects(url, headers, 10, 25000);
        } catch (e) {
            if (e.message === 'BLOCKED_REDIRECT') {
                console.error('❌ تم حجب التحويل (Captcha أو Google)!');
                return res.status(403).json({ 
                    error: 'المحتوى محمي بـ Captcha أو مرشحات أمان',
                    details: 'جرب استخدام origin و referer مخصصة'
                });
            }
            if (e.message === 'REQUEST_TIMEOUT') {
                console.error('❌ انتهت مهلة الطلب (Timeout)');
                return res.status(504).json({
                    error: 'Gateway Timeout',
                    details: 'الخادم استغرق وقتاً طويلاً في الرد'
                });
            }
            throw e;
        }

        if (!response.ok) {
            console.error(`❌ HTTP ${response.status}`);
            return res.status(response.status).json({
                error: `HTTP Error ${response.status}`,
                details: response.statusText
            });
        }

        // ============================================
        // 🎯 تحديد نوع المحتوى
        // ============================================
        const contentType = response.headers.get('content-type') || '';
        const contentLength = response.headers.get('content-length');
        const cleanPath = url.toLowerCase().split('?')[0];
        
        const isM3U8 = contentType.includes('mpegurl') ||
                       contentType.includes('m3u') ||
                       cleanPath.endsWith('.m3u8');

        const proxyBase = `/api/stream`;
        const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);

        // ============================================
        // 📤 إرسال الرد مع الـ Headers الصحيحة
        // ============================================
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Type, Cache-Control, Content-Range');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        if (isM3U8) {
            // 📝 معالجة M3U8 النصية
            const text = await response.text();
            console.log(`📄 M3U8 الأصلي: ${text.length} byte`);

            let data = fixM3U8Links(text, baseUrl, proxyBase);
            console.log(`✅ M3U8 المعدل: ${data.length} byte`);

            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
            res.setHeader('Content-Length', Buffer.byteLength(data, 'utf8'));
            res.send(data);

        } else {
            // 📦 معالجة السيجمنتات والملفات الثنائية
            const buffer = await response.buffer();

            // 🎭 التعامل مع .woff2 المقنّعة
            const isFakeFontSegment = cleanPath.endsWith('.woff2');
            const outContentType = isFakeFontSegment ? 'video/mp2t' : (contentType || 'video/mp2t');

            res.setHeader('Content-Type', outContentType);
            res.setHeader('Content-Length', buffer.length);
            res.setHeader('Accept-Ranges', 'bytes');

            console.log(`📦 سيجمنت: ${buffer.length} bytes | Type: ${outContentType}`);
            res.send(buffer);
        }

        console.log(`✅ تم بنجاح!\n`);

    } catch (error) {
        console.error('❌ خطأ في الوكيل:', error.message);
        console.error(error.stack);

        if (!res.headersSent) {
            res.status(500).json({
                error: 'Proxy error',
                message: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }
});

// ============================================
// 📊 لوحة معلومات محسّنة
// ============================================

app.get('/', (req, res) => {
    res.type('text/html').send(`
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>📡 وكيل البث المتقدم</title>
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
                    max-width: 800px;
                    width: 100%;
                    padding: 40px;
                }
                h1 {
                    color: #667eea;
                    margin-bottom: 10px;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    font-size: 28px;
                }
                .status {
                    background: #d4edda;
                    border: 2px solid #28a745;
                    color: #155724;
                    padding: 15px;
                    border-radius: 8px;
                    margin: 20px 0;
                    display: flex;
                    align-items: center;
                    gap: 10px;
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
                    display: flex;
                    align-items: center;
                    gap: 8px;
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
                    font-family: 'Courier New', monospace;
                    border-left: 3px solid #667eea;
                }
                .feature-list {
                    list-style: none;
                    margin: 15px 0;
                }
                .feature-list li {
                    padding: 10px 0;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    color: #555;
                    font-size: 15px;
                }
                .feature-list li:before {
                    content: "✓";
                    color: #28a745;
                    font-weight: bold;
                    font-size: 18px;
                    min-width: 20px;
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
                .note {
                    background: #fff3cd;
                    border: 1px solid #ffc107;
                    color: #856404;
                    padding: 12px;
                    border-radius: 5px;
                    margin: 15px 0;
                    font-size: 14px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🚀 وكيل البث المتقدم <span class="badge">v2.0</span></h1>
                <div class="status">
                    <span style="font-size: 22px;">✅</span>
                    <span>الخادم يعمل بكفاءة عالية</span>
                </div>

                <div class="section">
                    <h2>📖 كيفية الاستخدام الأساسي</h2>
                    <code>GET /api/stream?url=https://example.com/playlist.m3u8</code>
                    <div class="note">
                        ℹ️ الرابط يجب أن يكون محموعاً بـ URL encoding إذا احتوى على أحرف خاصة
                    </div>
                </div>

                <div class="section">
                    <h2>⚙️ الخيارات المتقدمة</h2>
                    <code>GET /api/stream?url=...&origin=https://example.com&referer=https://example.com/</code>
                    <p style="margin-top: 10px; color: #666; font-size: 14px;">
                        📌 يمكنك تخصيص Origin و Referer يدوياً إذا كانت القيم التلقائية لا تعمل
                    </p>
                </div>

                <div class="section">
                    <h2>✨ الميزات الرئيسية</h2>
                    <ul class="feature-list">
                        <li>دعم تلقائي وذكي لجميع الروابط والدومينات</li>
                        <li>استخراج Headers ديناميكي ومتطور</li>
                        <li>معالجة آمنة وذكية للتحويلات (Redirects)</li>
                        <li>حماية قوية من Captcha والمرشحات الأمنية</li>
                        <li>دعم كامل لـ M3U8 playlists والسيجمنتات</li>
                        <li>التعامل مع الملفات المقنّعة (.woff2 وغيرها)</li>
                        <li>CORS محسّن ومتقدم للتوافقية الكاملة</li>
                        <li>معالجة timeouts ذكية وأخطاء شاملة</li>
                        <li>دعم الضغط (gzip, br, deflate)</li>
                        <li>تسجيل تفصيلي للعمليات (Logging)</li>
                    </ul>
                </div>

                <div class="section">
                    <h2>🔧 أمثلة عملية</h2>
                    <code>/api/stream?url=https://vz-8b2563a6-02a.b-cdn.net/b93e9b40/playlist.m3u8</code>
                    <code style="margin-top: 10px;">/api/stream?url=https://example.com/video.m3u8&origin=https://custom.com&referer=https://custom.com/play</code>
                </div>

                <div class="section">
                    <h2>🐛 استكشاف الأخطاء</h2>
                    <ul class="feature-list">
                        <li><strong>HTTP 403:</strong> المحتوى محمي بـ Captcha - حاول إضافة origin و referer مخصصة</li>
                        <li><strong>HTTP 404:</strong> الرابط غير موجود أو خادم غير صحيح</li>
                        <li><strong>HTTP 504:</strong> انتهت مهلة الطلب - جرب الرابط مرة أخرى</li>
                        <li><strong>CORS Error:</strong> الوكيل يدعم CORS بشكل كامل - تأكد من استخدام الرابط الصحيح</li>
                    </ul>
                </div>

                <div class="footer">
                    <p>🔧 تم البناء بـ ❤️ | آخر تحديث: ${new Date().toLocaleString('ar-EG')}</p>
                    <p style="margin-top: 10px;">🌐 هذا الخادم يوفر خدمة وكيل آمنة وموثوقة للبث</p>
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
const hostname = process.env.HOSTNAME || '0.0.0.0';

const server = app.listen(port, hostname, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════════════════╗
║                                                                       ║
║           🚀 وكيل البث المتقدم بدأ يعمل بنجاح! 🚀                   ║
║                                                                       ║
║  📡 الخادم يستمع على:  http://${hostname}:${port}
║  🌐 نقطة الوكيل:       http://${hostname}:${port}/api/stream
║  📊 لوحة المعلومات:    http://${hostname}:${port}/
║                                                                       ║
║  ⚙️  معاملات الطلب:                                                 ║
║     ?url=<رابط الفيديو أو M3U8>                                   ║
║     &origin=<custom-origin> (اختياري)                              ║
║     &referer=<custom-referer> (اختياري)                            ║
║                                                                       ║
║  ✨ المميزات الجديدة في هذا الإصدار:                               ║
║     • دعم أوتوماتيكي محسّن لجميع الروابط                         ║
║     • Headers ذكية وديناميكية ومرنة جداً                          ║
║     • معالجة آمنة للـ Redirects مع حماية من Captcha               ║
║     • دعم كامل لـ M3U8 والسيجمنتات والملفات المشفرة               ║
║     • معالجة timeouts وأخطاء محسّنة                               ║
║     • تسجيل تفصيلي للعمليات لتسهيل التصحيح                        ║
║                                                                       ║
║  📚 التوثيق: زر http://${hostname}:${port}/ للمزيد من المعلومات
║                                                                       ║
╚═══════════════════════════════════════════════════════════════════════╝
    `);
});

// ============================================
// 🛑 معالجة الأخطاء والإشارات
// ============================================

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    // لا نغلق السيرفر - نحاول الاستمرار
});

process.on('SIGTERM', () => {
    console.log('📍 تم استقبال SIGTERM - يتم إيقاف الخادم بأمان');
    server.close(() => {
        console.log('✅ تم إيقاف الخادم');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('📍 تم استقبال SIGINT - يتم إيقاف الخادم بأمان');
    server.close(() => {
        console.log('✅ تم إيقاف الخادم');
        process.exit(0);
    });
});
