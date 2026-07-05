const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const { PassThrough } = require('stream');

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
// 🔍 نظام الـ Headers الذكي
// ============================================
function getHeaders(url, refererOverride = null, originOverride = null) {
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': 'ar-EG,ar;q=0.9,en-US;q=0.8,en;q=0.7',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'cross-site',
        'Cookie': 'googtrans=/auto/ar'
    };

    try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname;
        const protocol = urlObj.protocol;

        // خريطة مخصصة للـ Headers
        const domainMap = {
            'b-cdn.net': {
                origin: 'https://vz-8b2563a6-02a.b-cdn.net',
                referer: 'https://vz-8b2563a6-02a.b-cdn.net/'
            },
            'mediadelivery': {
                origin: 'https://www.mediadelivery.net',
                referer: 'https://www.mediadelivery.net/'
            }
        };

        let foundOrigin = null;
        let foundReferer = null;

        for (const [key, config] of Object.entries(domainMap)) {
            if (hostname.includes(key)) {
                foundOrigin = config.origin;
                foundReferer = config.referer;
                break;
            }
        }

        if (!foundOrigin) {
            foundOrigin = `${protocol}//${hostname}`;
            foundReferer = `${protocol}//${hostname}/`;
        }

        headers.Origin = originOverride || foundOrigin;
        headers.Referer = refererOverride || foundReferer;

    } catch (e) {
        console.warn('⚠️ Error parsing URL:', e.message);
    }

    return headers;
}

// ============================================
// 🔄 تعديل الروابط الداخلية لـ M3U8
// ============================================
function fixM3U8Links(data, baseUrl, proxyBase) {
    let modifiedCount = 0;

    // تعديل روابط .ts, .m4s, .mp4
    data = data.replace(/^([^#][^\s]+\.(?:ts|m4s|mp4)[^\s]*)$/gm, (match, p1) => {
        try {
            const trimmed = p1.trim();
            const absoluteUrl = new URL(trimmed, baseUrl).href;
            modifiedCount++;
            return `${proxyBase}?url=${encodeURIComponent(absoluteUrl)}`;
        } catch (e) {
            return match;
        }
    });

    // تعديل روابط .m3u8 الفرعية
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

    // تعديل روابط .key
    data = data.replace(/URI="([^"]+)"/g, (match, p1) => {
        try {
            const absoluteUrl = new URL(p1, baseUrl).href;
            modifiedCount++;
            return `URI="${proxyBase}?url=${encodeURIComponent(absoluteUrl)}"`;
        } catch (e) {
            return match;
        }
    });

    // تعديل EXT-X-MAP
    data = data.replace(/EXT-X-MAP:URI="([^"]+)"/g, (match, p1) => {
        try {
            const absoluteUrl = new URL(p1, baseUrl).href;
            modifiedCount++;
            return `EXT-X-MAP:URI="${proxyBase}?url=${encodeURIComponent(absoluteUrl)}"`;
        } catch (e) {
            return match;
        }
    });

    console.log(`📝 تم تعديل ${modifiedCount} رابط داخل M3U8`);
    return data;
}

// ============================================
// 📡 نقطة نهاية الوكيل الرئيسية (تشغيل الفيديو)
// ============================================
app.get('/api/stream', async (req, res) => {
    const url = req.query.url;

    if (!url) {
        return res.status(400).json({
            error: 'Missing url parameter',
            example: '/api/stream?url=https://example.com/playlist.m3u8'
        });
    }

    const originOverride = req.query.origin || null;
    const refererOverride = req.query.referer || null;

    console.log(`\n${'='.repeat(70)}`);
    console.log(`🔄 طلب فيديو: ${new Date().toLocaleTimeString('ar-EG')}`);
    console.log(`📍 الرابط: ${url}`);
    console.log(`${'='.repeat(70)}\n`);

    try {
        const headers = getHeaders(url, refererOverride, originOverride);
        console.log(`📌 Origin: ${headers.Origin}`);
        console.log(`📌 Referer: ${headers.Referer}`);

        // ============================================
        // 📡 جلب المحتوى
        // ============================================
        const response = await fetch(url, {
            headers: headers,
            redirect: 'follow',
            timeout: 30000
        });

        if (!response.ok) {
            console.error(`❌ HTTP ${response.status}`);
            return res.status(response.status).json({
                error: `HTTP Error ${response.status}`,
                details: response.statusText
            });
        }

        const contentType = response.headers.get('content-type') || '';
        const cleanPath = url.toLowerCase().split('?')[0];
        
        // ============================================
        // 🎯 تحديد نوع المحتوى
        // ============================================
        const isM3U8 = contentType.includes('mpegurl') ||
                       contentType.includes('m3u') ||
                       cleanPath.endsWith('.m3u8');

        const proxyBase = `/api/stream`;
        const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);

        // ============================================
        // 🎬 إعدادات الـ Headers للرد
        // ============================================
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Type, Content-Range');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        if (isM3U8) {
            // 📝 معالجة M3U8
            let text = await response.text();
            console.log(`📄 M3U8: ${text.length} bytes`);

            // تعديل الروابط
            text = fixM3U8Links(text, baseUrl, proxyBase);

            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
            res.send(text);

        } else {
            // 🎬 معالجة المقاطع (video segments, init.mp4, etc.)
            const buffer = await response.buffer();
            
            const outContentType = contentType || 'video/mp4';
            
            res.setHeader('Content-Type', outContentType);
            res.setHeader('Content-Length', buffer.length);
            res.setHeader('Accept-Ranges', 'bytes');

            console.log(`📦 سيجمنت: ${buffer.length} bytes | Type: ${outContentType}`);
            res.send(buffer);
        }

        console.log(`✅ تم بنجاح!\n`);

    } catch (error) {
        console.error('❌ خطأ:', error.message);
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
// 🏠 الصفحة الرئيسية
// ============================================
app.get('/', (req, res) => {
    res.type('text/html').send(`
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>🎬 وكيل البث - تشغيل الفيديو</title>
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
                .player-container {
                    background: #000;
                    border-radius: 10px;
                    overflow: hidden;
                    margin: 20px 0;
                }
                video {
                    width: 100%;
                    display: block;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🎬 وكيل البث المتقدم <span class="badge">v3.0</span></h1>
                <div class="status">
                    <span style="font-size: 22px;">✅</span>
                    <span>السيرفر جاهز لتشغيل الفيديو!</span>
                </div>

                <div class="player-container">
                    <video id="videoPlayer" controls playsinline>
                        <source id="videoSource" src="" type="application/vnd.apple.mpegurl">
                        متصفحك لا يدعم تشغيل الفيديو
                    </video>
                </div>

                <div class="section">
                    <h2>📖 كيفية الاستخدام</h2>
                    <code>GET /api/stream?url=https://example.com/playlist.m3u8</code>
                    <div class="example">
                        <strong>🎯 مثال:</strong>
                        <br>
                        <code style="background: #f5f5f5; color: #333; margin-top: 10px;">
                            /api/stream?url=https://vz-8b2563a6-02a.b-cdn.net/b93e9b40-8622-4b48-8458-ec85e6b8a6aa/vp9_720p/video.m3u8
                        </code>
                    </div>
                </div>

                <div class="section">
                    <h2>🔧 روابط جاهزة للتشغيل</h2>
                    <button onclick="playVideo('720p')" style="padding:10px 20px; margin:5px; background:#667eea; color:white; border:none; border-radius:5px; cursor:pointer;">▶️ 720p</button>
                    <button onclick="playVideo('480p')" style="padding:10px 20px; margin:5px; background:#667eea; color:white; border:none; border-radius:5px; cursor:pointer;">▶️ 480p</button>
                    <button onclick="playVideo('360p')" style="padding:10px 20px; margin:5px; background:#667eea; color:white; border:none; border-radius:5px; cursor:pointer;">▶️ 360p</button>
                </div>

                <div class="footer">
                    <p>🔧 تم التعديل لتشغيل الفيديو مباشرة</p>
                </div>
            </div>

            <script>
                const baseUrl = window.location.origin;
                const video = document.getElementById('videoPlayer');
                const source = document.getElementById('videoSource');

                function playVideo(quality) {
                    const qualities = {
                        '720p': 'vp9_720p/video.m3u8',
                        '480p': 'vp9_480p/video.m3u8',
                        '360p': 'vp9_360p/video.m3u8'
                    };
                    
                    const url = baseUrl + '/api/stream?url=' + encodeURIComponent(
                        'https://vz-8b2563a6-02a.b-cdn.net/b93e9b40-8622-4b48-8458-ec85e6b8a6aa/' + qualities[quality]
                    );
                    
                    source.src = url;
                    video.load();
                    video.play();
                    console.log('🎬 تشغيل:', url);
                }

                // تشغيل 480p تلقائياً عند فتح الصفحة
                window.onload = function() {
                    playVideo('480p');
                };
            </script>
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
║           🎬 وكيل البث - تشغيل الفيديو 🚀                           ║
║                                                                       ║
║  📡 الخادم:  http://0.0.0.0:${port}
║  🌐 نقطة الوكيل:  /api/stream?url=<رابط_الـ_M3U8>
║                                                                       ║
║  📌 المميزات:                                                        ║
║     • يشغل الفيديو مباشرة في المتصفح                               ║
║     • يدعم HLS و MPEG-DASH                                          ║
║     • يعالج الروابط الداخلية تلقائياً                              ║
║     • واجهة مستخدم مع مشغل فيديو                                   ║
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
