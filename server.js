const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const http = require('http');
const https = require('https');

const app = express();
app.use(cors());

// ============================================
// 🔌 Keep-Alive Agents (بيمنع فتح اتصال TLS جديد لكل سيجمنت)
// ============================================

const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 256 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 256 });

function getAgent(targetUrl) {
    return targetUrl.startsWith('https') ? httpsAgent : httpAgent;
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
                // الـ Referer لازم يطابق رقم القناة الفعلي (ch1, ch2, ...) مش ثابت
                // على ch2 دايمًا، وإلا السيرفر بيرفض الطلب
                referer: (h, urlObj) => {
                    const match = urlObj.pathname.match(/ch(\d+)/i);
                    const channel = match ? match[1] : '1';
                    return `https://tv.vertyuz.xyz/ch${channel}.php`;
                },
                userAgent: 'Mozilla/5.0 (Linux; Android 15; CPH2591 Build/AP3A.240617.008) AppleWebKit/537.36 (KHTML, like Gecko) Abck/4.0 Chrome/150.0.7871.46 Mobile Safari/537.36',
                secChUa: '"Not;A=Brand";v="8", "Chromium";v="150", "Android WebView";v="150"',
                xRequestedWith: 'com.mycompany.app.soulbrowser'
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
                    ? config.origin(hostname, urlObj) 
                    : config.origin;
                foundReferer = typeof config.referer === 'function' 
                    ? config.referer(hostname, urlObj) 
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

// اختيار جودة معينة من الـ Master Playlist (low = أقل جودة، high = أعلى جودة)
function pickQuality(data, mode) {
    if (!data.includes('#EXT-X-STREAM-INF')) return data; // مش master playlist أصلاً
    if (mode !== 'low' && mode !== 'high') return data; // auto أو أي حاجة تانية = زي ما هو

    const lines = data.split('\n');
    let targetBandwidth = mode === 'low' ? Infinity : -Infinity;
    let targetIndex = -1;

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('#EXT-X-STREAM-INF')) {
            const match = lines[i].match(/BANDWIDTH=(\d+)/);
            if (match) {
                const bw = parseInt(match[1], 10);
                const better = mode === 'low' ? (bw < targetBandwidth) : (bw > targetBandwidth);
                if (better) {
                    targetBandwidth = bw;
                    targetIndex = i;
                }
            }
        }
    }

    if (targetIndex === -1) return data; // مفيش BANDWIDTH ظاهر، رجّع زي ما هو

    const header = lines.filter(l => l.startsWith('#EXTM3U') || l.startsWith('#EXT-X-VERSION'));
    const streamLine = lines[targetIndex];
    const urlLine = lines[targetIndex + 1];

    return [...header, streamLine, urlLine].join('\n');
}

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

async function fetchWithRedirects(url, headers, maxRedirects = 3, signal = null) {
    let currentUrl = url;

    for (let i = 0; i < maxRedirects; i++) {
        // تايم-آوت حقيقي بيقفل الاتصال فعليًا لو المصدر سكت، بدل ما نعتمد على
        // الـ timeout الداخلي في node-fetch (اللي مش بيغطي كل حالات التعليق)
        const timeoutController = new AbortController();
        const timeoutId = setTimeout(() => timeoutController.abort(), 10000);

        // لو فيه signal جاي من الطلب الأساسي (يتلغي لو المستخدم قفل الاتصال)
        const onExternalAbort = () => timeoutController.abort();
        if (signal) signal.addEventListener('abort', onExternalAbort);

        let response;
        try {
            response = await fetch(currentUrl, {
                headers,
                redirect: 'manual',
                agent: getAgent(currentUrl),
                signal: timeoutController.signal
            });
        } finally {
            clearTimeout(timeoutId);
            if (signal) signal.removeEventListener('abort', onExternalAbort);
        }

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

    // AbortController خاص بالطلب ده: لو المستخدم قفل الاتصال (غيّر سيجمنت، قفل
    // البلاير، إلخ) بنلغي الفetch فورًا بدل ما نسيب الـ socket مشغول لحد ما
    // upstream يقرر يقفل لوحده. ده اللي كان بيسبب تراكم الـ sockets والتعليق.
    const abortController = new AbortController();
    req.on('close', () => abortController.abort());

    try {
        const headers = getHeaders(url, refererOverride, originOverride);

        // تمرير Range header لو المشغل طلب جزء معين (مهم للـ seeking وبعض المشغلات)
        if (req.headers.range) {
            headers.Range = req.headers.range;
        }

        let response;
        try {
            response = await fetchWithRedirects(url, headers, 3, abortController.signal);
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
            if (req.query.quality === 'low' || req.query.quality === 'high') {
                data = pickQuality(data, req.query.quality);
            }
            data = fixM3U8Links(data, baseUrl, proxyBase);
            
            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
            res.send(data);
        } else {
            // ===== السيجمنتات: Streaming مباشر بدل ما ننزل الملف كامل في الميموري =====
            const isFakeFontSegment = cleanPath.endsWith('.woff2');
            const outContentType = isFakeFontSegment
                ? 'video/mp2t'
                : (contentType || 'video/mp2t');

            res.status(response.status); // بيحافظ على 206 Partial Content لو فيه Range
            res.setHeader('Content-Type', outContentType);

            const contentLength = response.headers.get('content-length');
            if (contentLength) res.setHeader('Content-Length', contentLength);

            const contentRange = response.headers.get('content-range');
            if (contentRange) res.setHeader('Content-Range', contentRange);

            res.setHeader('Accept-Ranges', 'bytes');

            // بمجرد ما أول بايت يوصل من المصدر، بيتبعت على طول للمشغل
            response.body.pipe(res);

            response.body.on('error', (err) => {
                console.error('❌ خطأ أثناء الـ streaming:', err.message);
                if (!res.headersSent) res.status(502).end();
                else res.end();
            });

            return; // مهم عشان ما نكملش تنفيذ الكود اللي بعده
        }

    } catch (error) {
        if (error.name === 'AbortError' || abortController.signal.aborted) {
            // المستخدم قفل الاتصال أو حصل تايم-آوت طبيعي، مفيش داعي نبعت رد
            console.warn('⚠️ الطلب اتلغى (قفل اتصال أو تايم-آوت):', url);
            return;
        }
        console.error('❌ خطأ في الوكيل:', error.message);
        if (!res.headersSent) {
            res.status(500).json({ 
                error: 'Proxy error',
                message: error.message 
            });
        }
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
                        <li>⚡ Streaming مباشر (Pipe) بدل تحميل السيجمنت كامل</li>
                        <li>🔌 Keep-Alive Agent لتقليل زمن الاتصال بالمصدر</li>
                        <li>🎯 دعم Range Requests للـ Seeking</li>
                        <li>📦 تقليل الـ Redirects</li>
                        <li>🔧 دعم أفضل لـ 360-sport و kora-yalla</li>
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
║     • Streaming مباشر بدل buffer كامل                       ║
║     • Keep-Alive Agent للاتصال بالمصدر                     ║
║     • دعم Range requests                                   ║
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

