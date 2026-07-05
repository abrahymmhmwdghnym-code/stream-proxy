const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(cors());

// ============================================
// 🔍 النظام الذكي لاستخراج الـ Headers (يشتغل على أي رابط)
// ============================================

function getHeaders(url, refererOverride = null, originOverride = null) {
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36',
        'Accept': '*/*',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'ar-EG,ar;q=0.9,en-EG;q=0.8,en-US;q=0.7,en;q=0.6',
        'X-Requested-With': 'com.mycompany.app.soulbrowser',
        'sec-ch-ua': '"Google Chrome";v="149", "Chromium";v="149", "Not)A;Brand";v="24"',
        'sec-ch-ua-mobile': '?1',
        'sec-ch-ua-platform': '"Android"',
        'Sec-Fetch-Site': 'cross-site',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Dest': 'empty',
        'Priority': 'u=1, i',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    };

    try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname;

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
                referer: (h) => `https://${h}/sw.js`
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
                origin: 'https://iframe.mediadelivery.net',
                referer: 'https://iframe.mediadelivery.net/'
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
        // 🔄 النظام الذكي: لو ما لقيش domain معروف
        // ============================================
        if (!foundOrigin) {
            // حاول تستنتج من الـ URL نفسه
            if (url.includes('iframe.mediadelivery.net') || url.includes('iframe')) {
                foundOrigin = 'https://iframe.mediadelivery.net';
                foundReferer = 'https://iframe.mediadelivery.net/';
            } else {
                // القيمة الافتراضية الديناميكية
                foundOrigin = `https://${hostname}`;
                foundReferer = `https://${hostname}/`;
            }
        }

        // ============================================
        // 🔒 السماح بـ Override من الـ Request
        // ============================================
        headers.Origin = originOverride || foundOrigin;
        headers.Referer = refererOverride || foundReferer;

    } catch (e) {
        console.warn('⚠️ Error parsing URL:', e.message);
        headers.Origin = 'https://iframe.mediadelivery.net';
        headers.Referer = 'https://iframe.mediadelivery.net/';
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
            const absoluteUrl = new URL(p1, baseUrl).href;
            modifiedCount++;
            return `${proxyBase}?url=${encodeURIComponent(absoluteUrl)}`;
        } catch (e) {
            return match;
        }
    });

    // 2️⃣ تعديل روابط .m3u8 الفرعية
    data = data.replace(/^([^#][^\s]+\.m3u8[^\s]*)$/gm, (match, p1) => {
        try {
            const absoluteUrl = new URL(p1, baseUrl).href;
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
            const absoluteUrl = new URL(p1, baseUrl).href;
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

async function fetchWithRedirects(url, headers, maxRedirects = 5) {
    let currentUrl = url;
    let redirectChain = [currentUrl];

    for (let i = 0; i < maxRedirects; i++) {
        const response = await fetch(currentUrl, { 
            headers, 
            redirect: 'manual',
            timeout: 15000
        });

        if ([301, 302, 307, 308].includes(response.status)) {
            const location = response.headers.get('location') || '';

            // ❌ منع التحويلات الضارة
            if (location.includes('google.com') || location.includes('captcha')) {
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
    }

    throw new Error('TOO_MANY_REDIRECTS');
}

// ============================================
// 📡 نقطة نهاية الوكيل الرئيسية
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
    } catch (e) {}

    // 🔒 استخراج Override من الـ Query (لو في)
    const originOverride = req.query.origin ? decodeURIComponent(req.query.origin) : null;
    const refererOverride = req.query.referer ? decodeURIComponent(req.query.referer) : null;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`🔄 طلب جديد في ${new Date().toLocaleTimeString()}`);
    console.log(`📍 الرابط: ${url}`);
    if (originOverride) console.log(`🔒 Origin Override: ${originOverride}`);
    if (refererOverride) console.log(`🔒 Referer Override: ${refererOverride}`);
    console.log(`${'='.repeat(60)}\n`);

    try {
        const headers = getHeaders(url, refererOverride, originOverride);
        console.log(`📌 Origin: ${headers.Origin}`);
        console.log(`📌 Referer: ${headers.Referer}`);

        let response;
        try {
            response = await fetchWithRedirects(url, headers);
        } catch (e) {
            if (e.message === 'BLOCKED_REDIRECT') {
                console.error('❌ تم حجب التحويل (Captcha أو Google)!');
                return res.status(403).json({ error: 'المحتوى محمي بـ Captcha أو مرشحات أمان' });
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
        res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Type, Cache-Control');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        if (isM3U8) {
            // 📝 معالجة M3U8 النصية
            let data = await response.text();
            console.log(`📄 M3U8 الأصلي: ${data.length} byte`);
            
            data = fixM3U8Links(data, baseUrl, proxyBase);
            console.log(`✅ M3U8 المعدل: ${data.length} byte`);
            
            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
            res.send(data);
        } else {
            // 📦 معالجة السيجمنتات والملفات الثنائية
            const buffer = await response.buffer();
            
            // 🎭 التعامل مع .woff2 المقنّعة (floravon.shop و غيرها)
            const isFakeFontSegment = cleanPath.endsWith('.woff2');
            const outContentType = isFakeFontSegment
                ? 'video/mp2t'
                : (contentType || 'video/mp2t');
            
            res.setHeader('Content-Type', outContentType);
            res.setHeader('Content-Length', buffer.length);
            
            console.log(`📦 سيجمنت: ${buffer.length} bytes | Type: ${outContentType}`);
            res.send(buffer);
        }

        console.log(`✅ تم بنجاح!\n`);

    } catch (error) {
        console.error('❌ خطأ في الوكيل:', error.message);
        res.status(500).json({ 
            error: 'Proxy error',
            message: error.message 
        });
    }
});

// ============================================
// 📊 لوحة معلومات بسيطة
// ============================================

app.get('/', (req, res) => {
    res.type('text/html').send(`
        <!DOCTYPE html>
        <html dir="rtl">
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
                    max-width: 700px;
                    width: 100%;
                    padding: 40px;
                }
                h1 {
                    color: #667eea;
                    margin-bottom: 10px;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                .status {
                    background: #d4edda;
                    border: 1px solid #c3e6cb;
                    color: #155724;
                    padding: 12px 15px;
                    border-radius: 5px;
                    margin: 20px 0;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                .section {
                    margin: 30px 0;
                    padding: 20px;
                    background: #f8f9fa;
                    border-radius: 10px;
                    border-right: 4px solid #667eea;
                }
                .section h2 {
                    color: #333;
                    font-size: 18px;
                    margin-bottom: 15px;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                code {
                    background: #2d2d2d;
                    color: #f8f8f2;
                    padding: 12px;
                    border-radius: 5px;
                    display: block;
                    margin: 10px 0;
                    overflow-x: auto;
                    font-size: 13px;
                    line-height: 1.5;
                }
                .feature-list {
                    list-style: none;
                    margin: 15px 0;
                }
                .feature-list li {
                    padding: 8px 0;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    color: #555;
                }
                .feature-list li:before {
                    content: "✓";
                    color: #28a745;
                    font-weight: bold;
                    font-size: 18px;
                }
                .footer {
                    margin-top: 40px;
                    padding-top: 20px;
                    border-top: 1px solid #ddd;
                    text-align: center;
                    color: #999;
                    font-size: 13px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🚀 وكيل البث المتقدم</h1>
                <div class="status">
                    <span style="font-size: 20px;">✅</span>
                    <span>الخادم يعمل بكفاءة عالية</span>
                </div>

                <div class="section">
                    <h2>📖 كيفية الاستخدام</h2>
                    <code>GET /api/stream?url=https://example.com/playlist.m3u8</code>
                </div>

                <div class="section">
                    <h2>⚙️ الخيارات المتقدمة</h2>
                    <code>GET /api/stream?url=...&origin=https://...&referer=https://...</code>
                    <p style="margin-top: 10px; color: #666;">يمكنك تخصيص Origin و Referer إذا لم يعملوا تلقائياً</p>
                </div>

                <div class="section">
                    <h2>✨ الميزات</h2>
                    <ul class="feature-list">
                        <li>دعم تلقائي لجميع الروابط</li>
                        <li>معالجة Headers ذكية</li>
                        <li>إعادة توجيه آمنة (Redirects)</li>
                        <li>حماية من Captcha و Google</li>
                        <li>دعم M3U8 والسيجمنتات</li>
                        <li>دعم الملفات المقنّعة (.woff2)</li>
                        <li>CORS متقدم</li>
                    </ul>
                </div>

                <div class="section">
                    <h2>🔧 أمثلة عملية</h2>
                    <code>/api/stream?url=https://vz-8b2563a6-02a.b-cdn.net/b93e9b40-8622-4b48-8458-ec85e6b8a6aa/playlist.m3u8</code>
                    <code style="margin-top: 10px;">/api/stream?url=https://example.com/video.m3u8&origin=https://custom.com&referer=https://custom.com/</code>
                </div>

                <div class="footer">
                    <p>تم البناء بـ ❤️ | تم الآخر تحديث: ${new Date().toLocaleString('ar-EG')}</p>
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
const hostname = process.env.HOSTNAME || 'localhost';

app.listen(port, () => {
    console.log(`
╔════════════════════════════════════════════════════════════════╗
║                                                                ║
║           🚀 وكيل البث المتقدم بدأ يعمل بنجاح! 🚀            ║
║                                                                ║
║  📡 الخادم يستمع على:  http://${hostname}:${port}
║  🌐 الوكيل:            http://${hostname}:${port}/api/stream
║  📊 لوحة المعلومات:    http://${hostname}:${port}/
║                                                                ║
║  ⚙️  الخيارات:                                               ║
║     ?url=<رابط الفيديو>                                     ║
║     &origin=<custom-origin> (اختياري)                       ║
║     &referer=<custom-referer> (اختياري)                     ║
║                                                                ║
║  ✨ الميزات الجديدة:                                         ║
║     • دعم أوتوماتيكي لجميع الروابط                         ║
║     • Headers ذكية ومرنة                                    ║
║     • معالجة آمنة للـ Redirects                             ║
║     • دعم كامل لـ M3U8 والسيجمنتات                          ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
    `);
});

// ============================================
// 🛑 التعامل مع الأخطاء غير المتوقعة
// ============================================

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
});
    
