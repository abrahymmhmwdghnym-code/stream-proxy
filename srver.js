const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(cors());

// ============================================
// 💾 كاش السيجمنتات (يقلل التقطيع)
// ============================================

const segmentCache = new Map();
const CACHE_TTL = 30000; // 30 ثانية

// ============================================
// 🔍 النظام الذكي لاستخراج الـ Headers
// ============================================

function getHeaders(url, refererOverride = null, originOverride = null) {
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36',
        'Accept': '*/*',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'ar-EG,ar;q=0.9,en-EG;q=0.8,en-US;q=0.7,en;q=0.6',
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

        const domainMap = {
            '360-sport': {
                origin: 'https://y2.sites10.top',
                referer: 'https://y2.sites10.top/',
                userAgent: 'Mozilla/5.0 (Linux; Android 15; CPH2591 Build/AP3A.240617.008) AppleWebKit/537.36 (KHTML, like Gecko) Abck/4.0 Chrome/149.0.7827.159 Mobile Safari/537.36',
                secChUa: '"Android WebView";v="149", "Chromium";v="149", "Not)A;Brand";v="24"',
                xRequestedWith: 'com.mycompany.app.soulbrowser'
            },
            'kora-yalla': {
                origin: 'https://y2.sites10.top',
                referer: 'https://y2.sites10.top/',
                userAgent: 'Mozilla/5.0 (Linux; Android 15; CPH2591 Build/AP3A.240617.008) AppleWebKit/537.36 (KHTML, like Gecko) Abck/4.0 Chrome/149.0.7827.159 Mobile Safari/537.36',
                secChUa: '"Android WebView";v="149", "Chromium";v="149", "Not)A;Brand";v="24"',
                xRequestedWith: 'com.mycompany.app.soulbrowser'
            },
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
            'floravon': {
                origin: 'https://coursatk.online',
                referer: 'https://coursatk.online/'
            },
            'b-cdn.net': {
                origin: 'https://iframe.mediadelivery.net',
                referer: 'https://iframe.mediadelivery.net/'
            }
        };

        let foundOrigin = null;
        let foundReferer = null;
        let foundUserAgent = null;
        let foundSecChUa = null;
        let foundXRequestedWith = null;

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
                foundXRequestedWith = config.xRequestedWith || null;
                break;
            }
        }

        if (!foundOrigin) {
            if (url.includes('iframe.mediadelivery.net') || url.includes('iframe')) {
                foundOrigin = 'https://iframe.mediadelivery.net';
                foundReferer = 'https://iframe.mediadelivery.net/';
            } else {
                foundOrigin = `https://${hostname}`;
                foundReferer = `https://${hostname}/`;
            }
        }

        headers.Origin = originOverride || foundOrigin;
        headers.Referer = refererOverride || foundReferer;
        
        if (foundUserAgent) headers['User-Agent'] = foundUserAgent;
        if (foundSecChUa) headers['sec-ch-ua'] = foundSecChUa;
        if (foundXRequestedWith) headers['X-Requested-With'] = foundXRequestedWith;

    } catch (e) {
        console.warn('⚠️ Error parsing URL:', e.message);
        headers.Origin = 'https://y2.sites10.top';
        headers.Referer = 'https://y2.sites10.top/';
    }

    return headers;
}

// ============================================
// 🔄 تعديل الروابط الداخلية لـ M3U8 (محسّن)
// ============================================

function fixM3U8Links(data, baseUrl, proxyBase) {
    let modifiedCount = 0;

    // تعديل كل الروابط في تمريرة واحدة (أسرع)
    data = data.replace(/(https?:\/\/[^\s"']+\.(?:ts|m3u8|key|woff2))/g, (match) => {
        try {
            const absoluteUrl = new URL(match, baseUrl).href;
            modifiedCount++;
            return `${proxyBase}?url=${encodeURIComponent(absoluteUrl)}`;
        } catch (e) {
            return match;
        }
    });

    // تعديل الروابط النسبية
    data = data.replace(/^([^#][^\s]+\.(?:ts|m3u8|key|woff2)[^\s]*)$/gm, (match, p1) => {
        try {
            const absoluteUrl = new URL(p1, baseUrl).href;
            modifiedCount++;
            return `${proxyBase}?url=${encodeURIComponent(absoluteUrl)}`;
        } catch (e) {
            return match;
        }
    });

    // تعديل روابط KEY داخل URI=""
    data = data.replace(/URI="([^"]+)"/g, (match, p1) => {
        try {
            const absoluteUrl = new URL(p1, baseUrl).href;
            modifiedCount++;
            return `URI="${proxyBase}?url=${encodeURIComponent(absoluteUrl)}"`;
        } catch (e) {
            return match;
        }
    });

    console.log(`📝 تم تعديل ${modifiedCount} رابط داخل M3U8`);
    return data;
}

// ============================================
// 📡 جلب مع Redirects (محسّن)
// ============================================

async function fetchWithRedirects(url, headers, maxRedirects = 3) {
    let currentUrl = url;

    for (let i = 0; i < maxRedirects; i++) {
        const response = await fetch(currentUrl, { 
            headers, 
            redirect: 'manual',
            timeout: 10000
        });

        if ([301, 302, 307, 308].includes(response.status)) {
            const location = response.headers.get('location') || '';
            if (location.includes('google.com') || location.includes('captcha')) {
                throw new Error('BLOCKED_REDIRECT');
            }
            if (!location) return response;
            try {
                currentUrl = new URL(location, currentUrl).href;
                continue;
            } catch (e) {
                return response;
            }
        }
        return response;
    }
    throw new Error('TOO_MANY_REDIRECTS');
}

// ============================================
// 📡 نقطة نهاية الوكيل الرئيسية (مع كاش)
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
    try { url = decodeURIComponent(url); } catch (e) {}

    const originOverride = req.query.origin ? decodeURIComponent(req.query.origin) : null;
    const refererOverride = req.query.referer ? decodeURIComponent(req.query.referer) : null;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`🔄 طلب جديد في ${new Date().toLocaleTimeString()}`);
    console.log(`📍 الرابط: ${url}`);
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

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Type, Cache-Control');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

        if (isM3U8) {
            // ===== M3U8 =====
            let data = await response.text();
            console.log(`📄 M3U8 الأصلي: ${data.length} byte`);
            
            data = fixM3U8Links(data, baseUrl, proxyBase);
            console.log(`✅ M3U8 المعدل: ${data.length} byte`);
            
            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
            res.send(data);
        } else {
            // ===== السيجمنتات مع كاش =====
            const cacheKey = url;
            
            // التحقق من الكاش
            if (segmentCache.has(cacheKey)) {
                const cached = segmentCache.get(cacheKey);
                if (Date.now() - cached.timestamp < CACHE_TTL) {
                    console.log(`✅ من الكاش: ${url.substring(0, 60)}...`);
                    res.setHeader('Content-Type', cached.contentType);
                    res.setHeader('X-Cache', 'HIT');
                    res.send(cached.data);
                    return;
                } else {
                    segmentCache.delete(cacheKey);
                }
            }

            const buffer = await response.buffer();
            const isFakeFontSegment = cleanPath.endsWith('.woff2');
            const outContentType = isFakeFontSegment
                ? 'video/mp2t'
                : (contentType || 'video/mp2t');
            
            // تخزين في الكاش
            segmentCache.set(cacheKey, {
                data: buffer,
                contentType: outContentType,
                timestamp: Date.now()
            });

            console.log(`📦 سيجمنت: ${buffer.length} bytes | Type: ${outContentType} | Cache: MISS`);
            res.setHeader('Content-Type', outContentType);
            res.setHeader('Content-Length', buffer.length);
            res.setHeader('X-Cache', 'MISS');
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
            <title>📡 وكيل البث</title>
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
                <h1>🚀 وكيل البث المحسّن</h1>
                <div class="status">
                    <span style="font-size: 20px;">✅</span>
                    <span>الخادم يعمل بكفاءة عالية</span>
                </div>

                <div class="section">
                    <h2>✨ التحسينات الجديدة</h2>
                    <ul class="feature-list">
                        <li>🚀 كاش السيجمنتات (يقلل التقطيع)</li>
                        <li>⚡ تحسين سرعة تعديل الروابط</li>
                        <li>📦 تقليل الـ Redirects</li>
                        <li>🔧 دعم أفضل لـ 360-sport و kora-yalla</li>
                        <li>💾 تقليل استهلاك الباندويث</li>
                    </ul>
                </div>

                <div class="section">
                    <h2>📖 كيفية الاستخدام</h2>
                    <code>GET /api/stream?url=https://example.com/playlist.m3u8</code>
                </div>

                <div class="section">
                    <h2>⚙️ خيارات متقدمة</h2>
                    <code>GET /api/stream?url=...&origin=https://...&referer=https://...</code>
                    <p style="margin-top: 10px; color: #666;">تخصيص Origin و Referer يدوياً</p>
                </div>

                <div class="footer">
                    <p>تم البناء بـ ❤️ | آخر تحديث: ${new Date().toLocaleString('ar-EG')}</p>
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
║        🚀 وكيل البث المحسّن بدأ يعمل بنجاح! 🚀              ║
║                                                                ║
║  📡 الخادم:  http://${hostname}:${port}
║  🌐 الوكيل:  http://${hostname}:${port}/api/stream
║  📊 اللوحة:  http://${hostname}:${port}/
║                                                                ║
║  ✨ التحسينات:                                               ║
║     • كاش السيجمنتات (30 ثانية)                            ║
║     • تعديل أسرع للروابط                                   ║
║     • تقليل الـ Redirects                                  ║
║     • دعم 360-sport و kora-yalla                          ║
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

// تنظيف الكاش كل دقيقة
setInterval(() => {
    const now = Date.now();
    for (const [key, value] of segmentCache.entries()) {
        if (now - value.timestamp > CACHE_TTL) {
            segmentCache.delete(key);
        }
    }
}, 60000);