const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(cors());

// ============================================
// 🎨 إضافة لوجو/إعلان على الفيديو (Subtitle Track)
// ============================================

function addOverlayToM3U8(data, overlayText, websiteUrl) {
    // إنشاء ملف WebVTT للإعلان (يظهر طول الفيديو)
    const vttContent = `WEBVTT

00:00:00.000 --> 99:59:59.000
${overlayText}
${websiteUrl}

00:00:00.000 --> 99:59:59.000
تابعنا الآن`;

    // تحويل إلى Base64 عشان نضيفه مباشرة في M3U8
    const vttBase64 = Buffer.from(vttContent).toString('base64');
    
    // إضافة مسار الترجمات في M3U8
    const subtitleTag = `#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="إعلان",DEFAULT=YES,AUTOSELECT=YES,URI="data:text/vtt;base64,${vttBase64}"`;
    
    const lines = data.split('\n');
    let result = [];
    let hasExtM3U = false;
    let hasStreamInf = false;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // إضافة الترجمة بعد #EXTM3U
        if (line.startsWith('#EXTM3U')) {
            result.push(line);
            result.push(subtitleTag);
            hasExtM3U = true;
            continue;
        }
        
        // إضافة مجموعة الترجمات لـ #EXT-X-STREAM-INF
        if (line.startsWith('#EXT-X-STREAM-INF')) {
            // لو مش موجودة SUBTITLES نضيفها
            if (!line.includes('SUBTITLES="subs"')) {
                result.push(line.replace(/(RESOLUTION=[^,]+,)/, `$1SUBTITLES="subs",`));
                hasStreamInf = true;
                continue;
            }
        }
        
        result.push(line);
    }
    
    // لو مفيش #EXTM3U (نادر)، نضيفها من الأول
    if (!hasExtM3U) {
        result.unshift('#EXTM3U');
        result.splice(1, 0, subtitleTag);
    }
    
    return result.join('\n');
}

// ============================================
// 🔍 النظام الذكي لاستخراج الـ Headers
// ============================================

function getHeaders(url, refererOverride = null, originOverride = null) {
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36',
        'Accept': '*/*',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'ar-EG,ar;q=0.9,en-EG;q=0.8,en-US;q=0.7,en;q=0.6',
        'X-Requested-With': 'com.mycompany.app.soulbrowser',
        'sec-ch-ua': '"Android WebView";v="149", "Chromium";v="149", "Not)A;Brand";v="24"',
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
            'instreams': {
                origin: 'https://bstream.live',
                referer: 'https://bstream.live/',
                userAgent: 'Mozilla/5.0 (Linux; Android 15; CPH2591 Build/AP3A.240617.008) AppleWebKit/537.36 (KHTML, like Gecko) Abck/4.0 Chrome/149.0.7827.159 Mobile Safari/537.36',
                secChUa: '"Android WebView";v="149", "Chromium";v="149", "Not)A;Brand";v="24"'
            },
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
        let foundUserAgent = null;
        let foundSecChUa = null;

        for (const [key, config] of Object.entries(domainMap)) {
            if (hostname.includes(key)) {
                foundOrigin = typeof config.origin === 'function' 
                    ? config.origin(hostname) 
                    : config.origin;
                foundReferer = typeof config.referer === 'function' 
                    ? config.referer(hostname) 
                    : config.referer;
                foundUserAgent = config.userAgent || null;
                foundSecChUa = config.secChUa || null;
                break;
            }
        }

        // ============================================
        // 🔄 النظام الذكي: لو ما لقيش domain معروف
        // ============================================
        if (!foundOrigin) {
            if (url.includes('iframe.mediadelivery.net') || url.includes('iframe')) {
                foundOrigin = 'https://iframe.mediadelivery.net';
                foundReferer = 'https://iframe.mediadelivery.net/';
            } else {
                foundOrigin = `https://${hostname}`;
                foundReferer = `https://${hostname}/`;
            }
        }

        // ============================================
        // 🔒 تطبيق الـ Headers المخصصة
        // ============================================
        headers.Origin = originOverride || foundOrigin;
        headers.Referer = refererOverride || foundReferer;
        
        if (foundUserAgent) {
            headers['User-Agent'] = foundUserAgent;
        }
        if (foundSecChUa) {
            headers['sec-ch-ua'] = foundSecChUa;
        }

    } catch (e) {
        console.warn('⚠️ Error parsing URL:', e.message);
        headers.Origin = 'https://bstream.live';
        headers.Referer = 'https://bstream.live/';
    }

    return headers;
}

// ============================================
// 🔄 تعديل الروابط الداخلية لـ M3U8
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

    // 3️⃣ تعديل روابط .key
    data = data.replace(/URI="([^"]+)"/g, (match, p1) => {
        try {
            const absoluteUrl = new URL(p1, baseUrl).href;
            modifiedCount++;
            return `URI="${proxyBase}?url=${encodeURIComponent(absoluteUrl)}"`;
        } catch (e) {
            return match;
        }
    });

    // 4️⃣ تعديل سيجمنتات .woff2
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
// 📡 متابعة الـ Redirects
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
        console.log(`📌 User-Agent: ${headers['User-Agent']}`);

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

        const contentType = response.headers.get('content-type') || '';
        const cleanPath = url.toLowerCase().split('?')[0];
        const isM3U8 = contentType.includes('mpegurl') || 
                       contentType.includes('m3u') || 
                       cleanPath.endsWith('.m3u8');

        const proxyBase = `/api/stream`;
        const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);

        // ============================================
        // 🎨 إعدادات الإعلان (اللوجو)
        // ============================================
        const overlayText = 'لمشاهدة جميع المباريات تابع موقع إبراهيم لايف';
        const websiteUrl = 'https://livee-mauve.vercel.app';

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Type, Cache-Control');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        if (isM3U8) {
            let data = await response.text();
            console.log(`📄 M3U8 الأصلي: ${data.length} byte`);
            
            // 🔥 إضافة الإعلان على الفيديو (لأي بث)
            data = addOverlayToM3U8(data, overlayText, websiteUrl);
            console.log(`✅ تم إضافة الإعلان النصي`);
            
            data = fixM3U8Links(data, baseUrl, proxyBase);
            console.log(`✅ M3U8 المعدل: ${data.length} byte`);
            
            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
            res.send(data);
        } else {
            const buffer = await response.buffer();
            
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
// 📊 لوحة المعلومات
// ============================================

app.get('/', (req, res) => {
    res.type('text/html').send(`
        <!DOCTYPE html>
        <html dir="rtl">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>🚀 وكيل البث - إبراهيم لايف</title>
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
                .stream-card {
                    background: linear-gradient(135deg, #667eea15, #764ba215);
                    border: 2px solid #667eea;
                    border-radius: 10px;
                    padding: 15px;
                    margin: 15px 0;
                }
                .stream-card .label {
                    font-weight: bold;
                    color: #667eea;
                    font-size: 14px;
                }
                .stream-card .value {
                    margin: 5px 0 10px 0;
                    word-break: break-all;
                    font-size: 12px;
                    background: white;
                    padding: 8px;
                    border-radius: 5px;
                }
                .advert-box {
                    background: linear-gradient(135deg, #ff6b6b15, #ee5a2415);
                    border: 2px solid #ff6b6b;
                    border-radius: 10px;
                    padding: 15px;
                    margin: 15px 0;
                    text-align: center;
                }
                .advert-box .main-text {
                    font-size: 18px;
                    font-weight: bold;
                    color: #ff6b6b;
                }
                .advert-box .sub-text {
                    font-size: 14px;
                    color: #333;
                    margin-top: 5px;
                }
                .footer {
                    margin-top: 40px;
                    padding-top: 20px;
                    border-top: 1px solid #ddd;
                    text-align: center;
                    color: #999;
                    font-size: 13px;
                }
                .btn-copy {
                    background: #667eea;
                    color: white;
                    border: none;
                    padding: 8px 15px;
                    border-radius: 5px;
                    cursor: pointer;
                    font-size: 12px;
                }
                .btn-copy:hover {
                    background: #5a6fd6;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🚀 وكيل البث - إبراهيم لايف</h1>
                <div class="status">
                    <span style="font-size: 20px;">✅</span>
                    <span>الخادم يعمل بكفاءة عالية</span>
                </div>

                <div class="advert-box">
                    <div class="main-text">📺 لمشاهدة جميع المباريات</div>
                    <div class="sub-text">تابع موقع إبراهيم لايف</div>
                    <div class="sub-text" style="color: #667eea; font-weight: bold;">https://livee-mauve.vercel.app</div>
                </div>

                <div class="section">
                    <h2>📺 البث المباشر</h2>
                    <div class="stream-card">
                        <div class="label">🔗 رابط البث عبر الوكيل (مع الإعلان):</div>
                        <div class="value" id="proxyUrl">/api/stream?url=https%3A%2F%2Finstreams.live%2Flive%2Fgr5buv1irc.m3u8%3Fexpires%3D1783317278%26token%3DEIcvsMGjAAiNsLA8VF32Rw</div>
                        <button class="btn-copy" onclick="copyProxyUrl()">📋 نسخ رابط الوكيل</button>
                    </div>
                    <div class="stream-card" style="border-color: #28a745;">
                        <div class="label">🔄 للاستخدام مع أي رابط آخر:</div>
                        <div class="value">/api/stream?url=<strong>رابط_البث_الخاص_بك</strong></div>
                    </div>
                </div>

                <div class="section">
                    <h2>✨ الميزات</h2>
                    <ul class="feature-list">
                        <li>✅ إعلان نصي على الفيديو (Subtitle Track)</li>
                        <li>✅ يعمل مع <strong>أي بث</strong> M3U8</li>
                        <li>✅ دعم تلقائي لجميع الروابط</li>
                        <li>✅ معالجة Headers ذكية</li>
                        <li>✅ إعادة توجيه آمنة</li>
                    </ul>
                </div>

                <div class="footer">
                    <p>تم البناء بـ ❤️ | آخر تحديث: ${new Date().toLocaleString('ar-EG')}</p>
                </div>
            </div>

            <script>
                function copyProxyUrl() {
                    const el = document.getElementById('proxyUrl');
                    const fullUrl = window.location.origin + el.textContent;
                    navigator.clipboard.writeText(fullUrl);
                    alert('✅ تم نسخ رابط الوكيل!');
                }
            </script>
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
║     🚀 وكيل البث - إبراهيم لايف بدأ يعمل بنجاح! 🚀          ║
║                                                                ║
║  📡 الخادم:  http://${hostname}:${port}
║  🌐 الوكيل:  http://${hostname}:${port}/api/stream
║  📊 اللوحة:  http://${hostname}:${port}/
║                                                                ║
║  📺 الإعلان على الفيديو:                                      ║
║     "لمشاهدة جميع المباريات تابع موقع إبراهيم لايف"          ║
║     https://livee-mauve.vercel.app                           ║
║                                                                ║
║  ✨ الميزة الجديدة:                                          ║
║     • يعمل مع أي بث M3U8                                   ║
║     • إضافة إعلان نصي كـ Subtitle على الفيديو نفسه          ║
║     • يظهر طوال مدة البث                                    ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
    `);
});

// ============================================
// 🛑 التعامل مع الأخطاء
// ============================================

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
});