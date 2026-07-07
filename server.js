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
            },
            'jdwel.com': {
                origin: 'https://jdwel.com',
                referer: 'https://jdwel.com/'
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
        headers.Origin = 'https://jdwel.com';
        headers.Referer = 'https://jdwel.com/';
    }

    return headers;
}

// ============================================
// 🔄 تعديل الروابط الداخلية لـ M3U8 (محسّن)
// ============================================

function pickQuality(data, mode) {
    if (!data.includes('#EXT-X-STREAM-INF')) return data;
    if (mode !== 'low' && mode !== 'high') return data;

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

    if (targetIndex === -1) return data;

    const header = lines.filter(l => l.startsWith('#EXTM3U') || l.startsWith('#EXT-X-VERSION'));
    const streamLine = lines[targetIndex];
    const urlLine = lines[targetIndex + 1];

    return [...header, streamLine, urlLine].join('\n');
}

function fixM3U8Links(data, baseUrl, proxyBase) {
    let modifiedCount = 0;

    data = data.replace(/(https?:\/\/[^\s"']+\.(?:ts|m3u8|key|woff2))/g, (match) => {
        try {
            const absoluteUrl = new URL(match, baseUrl).href;
            modifiedCount++;
            return `${proxyBase}?url=${encodeURIComponent(absoluteUrl)}`;
        } catch (e) {
            return match;
        }
    });

    data = data.replace(/^([^#][^\s]+\.(?:ts|m3u8|key|woff2)[^\s]*)$/gm, (match, p1) => {
        try {
            const absoluteUrl = new URL(p1, baseUrl).href;
            modifiedCount++;
            return `${proxyBase}?url=${encodeURIComponent(absoluteUrl)}`;
        } catch (e) {
            return match;
        }
    });

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
// 🌍 بروكسي متعدد الأغراض (نصوص، JSON، بيانات، M3U8)
// ============================================

// معالج بروكسي جديد يدعم طلبات JSON و HTML و M3U8
app.get('/api/proxy', async (req, res) => {
    const targetUrl = req.query.url;
    
    if (!targetUrl) {
        return res.status(400).json({ error: 'Missing url parameter' });
    }

    try {
        console.log(`🔗 بروكسي: ${targetUrl}`);
        
        const headers = getHeaders(targetUrl);
        const agent = getAgent(targetUrl);

        const response = await fetch(targetUrl, {
            headers,
            agent,
            timeout: 15000
        });

        if (!response.ok) {
            console.warn(`⚠️ Server returned ${response.status}`);
        }

        const contentType = response.headers.get('content-type') || '';
        
        // حدد نوع الرد بناءً على content-type
        let body;
        if (contentType.includes('application/json')) {
            body = await response.json();
            res.type('application/json').send(body);
        } else if (contentType.includes('text/html')) {
            body = await response.text();
            res.type('text/html').send(body);
        } else if (contentType.includes('application/x-mpegURL') || contentType.includes('text/plain') || targetUrl.includes('.m3u8')) {
            body = await response.text();
            
            // إذا كان M3U8، عدّل الروابط الداخلية
            if (targetUrl.includes('.m3u8')) {
                const baseUrl = new URL(targetUrl);
                baseUrl.pathname = baseUrl.pathname.substring(0, baseUrl.pathname.lastIndexOf('/'));
                const proxyBase = `${req.protocol}://${req.get('host')}/api/stream`;
                body = fixM3U8Links(body, baseUrl.href, proxyBase);
            }
            
            res.type('application/vnd.apple.mpegurl').send(body);
        } else {
            body = await response.buffer();
            res.type(contentType).send(body);
        }

    } catch (error) {
        console.error('❌ خطأ في البروكسي:', error.message);
        res.status(500).json({ 
            error: 'Proxy error',
            message: error.message 
        });
    }
});

// معالج البث المحسّن (للـ streaming والـ segments)
app.get('/api/stream', async (req, res) => {
    const targetUrl = req.query.url;
    const qualityMode = req.query.quality || 'auto';
    const refererOverride = req.query.referer || null;
    const originOverride = req.query.origin || null;

    if (!targetUrl) {
        return res.status(400).json({ error: 'Missing url parameter' });
    }

    try {
        console.log(`🎬 بث: ${targetUrl.substring(0, 80)}...`);

        const headers = getHeaders(targetUrl, refererOverride, originOverride);
        
        // أضف Range header إذا كان المتصفح طلبه
        if (req.headers.range) {
            headers.Range = req.headers.range;
        }

        const agent = getAgent(targetUrl);

        const response = await fetch(targetUrl, {
            headers,
            agent,
            timeout: 30000
        });

        // معالجة محتوى M3U8
        if (targetUrl.includes('.m3u8')) {
            let text = await response.text();
            
            // اختر جودة إذا طُلب ذلك
            if (qualityMode === 'low' || qualityMode === 'high') {
                text = pickQuality(text, qualityMode);
            }
            
            // عدّل الروابط الداخلية
            const baseUrl = new URL(targetUrl);
            baseUrl.pathname = baseUrl.pathname.substring(0, baseUrl.pathname.lastIndexOf('/'));
            const proxyBase = `${req.protocol}://${req.get('host')}/api/stream`;
            text = fixM3U8Links(text, baseUrl.href, proxyBase);

            res.type('application/vnd.apple.mpegurl').send(text);
            return;
        }

        // معالجة البيانات الثنائية (segments، keys، وغيرها)
        const outContentType = response.headers.get('content-type') || 'application/octet-stream';
        res.status(response.status);
        res.setHeader('Content-Type', outContentType);

        const contentLength = response.headers.get('content-length');
        if (contentLength) res.setHeader('Content-Length', contentLength);

        const contentRange = response.headers.get('content-range');
        if (contentRange) res.setHeader('Content-Range', contentRange);

        res.setHeader('Accept-Ranges', 'bytes');

        response.body.pipe(res);

        response.body.on('error', (err) => {
            console.error('❌ خطأ أثناء الـ streaming:', err.message);
            if (!res.headersSent) res.status(502).end();
            else res.end();
        });

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
                    word-break: break-all;
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
                    <h2>✨ الميزات</h2>
                    <ul class="feature-list">
                        <li>📡 بروكسي CORS شامل (JSON، HTML، M3U8)</li>
                        <li>⚡ Streaming مباشر (Pipe) بدل تحميل السيجمنت كامل</li>
                        <li>🔌 Keep-Alive Agent لتقليل زمن الاتصال</li>
                        <li>🎯 دعم كامل للـ Range Requests</li>
                        <li>📦 تقليل الـ Redirects وتعديل M3U8 تلقائي</li>
                        <li>🔧 دعم متقدم للـ Headers والـ User Agents</li>
                    </ul>
                </div>

                <div class="section">
                    <h2>📖 نقاط النهاية</h2>
                    <h3 style="color: #555; margin-top: 10px;">🎬 بث الفيديو:</h3>
                    <code>GET /api/stream?url=https://example.com/playlist.m3u8</code>
                    <h3 style="color: #555; margin-top: 15px;">📄 البيانات و CORS:</h3>
                    <code>GET /api/proxy?url=https://api.example.com/data</code>
                </div>

                <div class="section">
                    <h2>⚙️ خيارات متقدمة</h2>
                    <code>GET /api/stream?url=...&quality=low&referer=https://...</code>
                    <p style="margin-top: 10px; color: #666;">
                        <strong>quality</strong>: low | high | auto (افتراضي)<br>
                        <strong>referer</strong>: Referer مخصص<br>
                        <strong>origin</strong>: Origin مخصص
                    </p>
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
║     🚀 وكيل البث المتقدم بدأ يعمل بنجاح! 🚀                 ║
║                                                                ║
║  📡 الخادم:   http://${hostname}:${port}
║  🎬 البث:    http://${hostname}:${port}/api/stream
║  📄 البروكسي:  http://${hostname}:${port}/api/proxy
║  📊 اللوحة:   http://${hostname}:${port}/
║                                                                ║
║  ✨ الميزات:                                                  ║
║     • بروكسي CORS شامل (JSON + HTML + M3U8)                 ║
║     • Streaming مباشر بدل buffer كامل                       ║
║     • Keep-Alive Agent للاتصال بالمصدر                     ║
║     • دعم كامل للـ Range requests                           ║
║     • تعديل M3U8 تلقائي + تقليل redirects                 ║
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
