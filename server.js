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
    allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'Referer', 'Range', 'If-None-Match', 'If-Modified-Since']
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// ============================================
// 🔥 بناء الـ Headers بالضبط زي طلبات المتصفح
// ============================================
function buildHeaders(url, req) {
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 15; CPH2591 Build/AP3A.240617.008; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/149.0.7827.159 Mobile Safari/537.36',
        'Accept': '*/*',
        'Accept-Encoding': 'identity;q=1, *;q=0',
        'Accept-Language': 'ar-EG,ar;q=0.9,en-EG;q=0.8,en-US;q=0.7,en;q=0.6',
        'Connection': 'keep-alive',
        'Cookie': 'googtrans=/auto/ar',
        'Sec-Ch-Ua': '"Android WebView";v="149", "Chromium";v="149", "Not)A;Brand";v="24"',
        'Sec-Ch-Ua-Mobile': '?1',
        'Sec-Ch-Ua-Platform': '"Android"',
        'Sec-Fetch-Dest': 'video',
        'Sec-Fetch-Mode': 'no-cors',
        'Sec-Fetch-Site': 'same-origin',
        'X-Requested-With': 'com.mycompany.app.soulbrowser',
        'Priority': 'i',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
    };

    // ============================================
    // 🎯 إضافة Referer و Origin
    // ============================================
    try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname;
        const protocol = urlObj.protocol;

        // Referer: نفس الرابط الأساسي
        const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);
        headers.Referer = baseUrl.includes('playlist.m3u8') ? baseUrl : baseUrl + 'playlist.m3u8';
        
        // Origin
        headers.Origin = `${protocol}//${hostname}`;

        // Host
        headers.Host = hostname;

    } catch (e) {
        console.warn('⚠️ Error parsing URL:', e.message);
    }

    // ============================================
    // 📥 نقل الـ Headers من الطلب الأصلي (لو موجودة)
    // ============================================
    if (req.headers['range']) {
        headers.Range = req.headers['range'];
    }

    if (req.headers['if-none-match']) {
        headers['If-None-Match'] = req.headers['if-none-match'];
    }

    if (req.headers['if-modified-since']) {
        headers['If-Modified-Since'] = req.headers['if-modified-since'];
    }

    // ============================================
    // 🔄 Override من الـ Query (لو المستخدم حطها)
    // ============================================
    if (req.query.origin) {
        headers.Origin = req.query.origin;
    }
    if (req.query.referer) {
        headers.Referer = req.query.referer;
    }
    if (req.query.cookie) {
        headers.Cookie = req.query.cookie;
    }

    return headers;
}

// ============================================
// 🔄 تعديل الروابط في M3U8
// ============================================
function fixM3U8Links(data, baseUrl, proxyBase) {
    let modifiedCount = 0;

    // تعديل روابط .ts, .m4s, .mp4, .m3u8, .key
    const patterns = [
        /^([^#][^\s]+\.(?:ts|m4s|mp4|m3u8|key)[^\s]*)$/gm,
        /URI="([^"]+)"/g,
        /EXT-X-MAP:URI="([^"]+)"/g
    ];

    patterns.forEach(pattern => {
        data = data.replace(pattern, (match, p1) => {
            try {
                const trimmed = p1.trim();
                const absoluteUrl = new URL(trimmed, baseUrl).href;
                modifiedCount++;
                return match.includes('URI=') || match.includes('EXT-X-MAP') 
                    ? match.replace(p1, `${proxyBase}?url=${encodeURIComponent(absoluteUrl)}`)
                    : `${proxyBase}?url=${encodeURIComponent(absoluteUrl)}`;
            } catch (e) {
                return match;
            }
        });
    });

    console.log(`📝 تم تعديل ${modifiedCount} رابط داخل M3U8`);
    return data;
}

// ============================================
// 📡 نقطة نهاية الوكيل الرئيسية
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
    console.log(`🎬 طلب فيديو: ${new Date().toLocaleTimeString('ar-EG')}`);
    console.log(`📍 الرابط: ${url}`);
    console.log(`📥 Range: ${req.headers.range || 'none'}`);
    console.log(`${'='.repeat(70)}\n`);

    try {
        // ============================================
        // 🔥 بناء الـ Headers بالضبط
        // ============================================
        const headers = buildHeaders(url, req);
        console.log('📌 الـ Headers المرسلة:');
        console.log(JSON.stringify(headers, null, 2));

        // ============================================
        // 📡 إرسال الطلب
        // ============================================
        const fetchOptions = {
            method: 'GET',
            headers: headers,
            redirect: 'follow',
            timeout: 30000
        };

        // إضافة Range لو موجود
        if (req.headers['range']) {
            fetchOptions.headers.Range = req.headers['range'];
        }

        const response = await fetch(url, fetchOptions);

        // ============================================
        // 🎯 معالجة الرد
        // ============================================
        if (!response.ok && response.status !== 206) {
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
        res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Type, Content-Range, Accept-Ranges');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

        // نقل بعض الـ Headers من الرد الأصلي
        if (response.headers.get('content-range')) {
            res.setHeader('Content-Range', response.headers.get('content-range'));
        }
        if (response.headers.get('accept-ranges')) {
            res.setHeader('Accept-Ranges', response.headers.get('accept-ranges'));
        }
        if (response.headers.get('etag')) {
            res.setHeader('ETag', response.headers.get('etag'));
        }
        if (response.headers.get('last-modified')) {
            res.setHeader('Last-Modified', response.headers.get('last-modified'));
        }

        // ============================================
        // 📤 إرسال المحتوى
        // ============================================
        if (isM3U8) {
            // 📝 معالجة M3U8
            let text = await response.text();
            console.log(`📄 M3U8: ${text.length} bytes`);

            // تعديل الروابط
            text = fixM3U8Links(text, baseUrl, proxyBase);

            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
            res.send(text);

        } else {
            // 🎬 معالجة المقاطع (segments, init.mp4, etc.)
            const buffer = await response.buffer();
            
            const outContentType = contentType || 'video/mp4';
            
            res.setHeader('Content-Type', outContentType);
            res.setHeader('Content-Length', buffer.length);

            // لو فيه Range, نضبط Status 206
            if (response.status === 206) {
                res.status(206);
            }

            console.log(`📦 سيجمنت: ${buffer.length} bytes | Type: ${outContentType} | Status: ${response.status}`);
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
            <title>🎬 وكيل البث المتقدم</title>
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
                .btn-group {
                    display: flex;
                    gap: 10px;
                    flex-wrap: wrap;
                    margin: 10px 0;
                }
                .btn {
                    padding: 10px 20px;
                    background: #667eea;
                    color: white;
                    border: none;
                    border-radius: 5px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 600;
                    transition: all 0.3s;
                }
                .btn:hover {
                    background: #5a67d8;
                    transform: scale(1.02);
                }
                .btn-green {
                    background: #28a745;
                }
                .btn-green:hover {
                    background: #218838;
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
                <h1>🎬 وكيل البث المتقدم <span class="badge">v4.0</span></h1>
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
                    <h2>🎯 جودة الفيديو</h2>
                    <div class="btn-group">
                        <button class="btn" onclick="playVideo('720p')">▶️ 720p HD</button>
                        <button class="btn btn-green" onclick="playVideo('480p')">▶️ 480p</button>
                        <button class="btn" onclick="playVideo('360p')">▶️ 360p</button>
                    </div>
                </div>

                <div class="section">
                    <h2>📖 الروابط المباشرة</h2>
                    <code id="currentUrl">اختر جودة من الأعلى</code>
                </div>

                <div class="footer">
                    <p>🔧 وكيل بث متقدم - يدعم جميع طلبات الفيديو</p>
                </div>
            </div>

            <script>
                const baseUrl = window.location.origin;
                const video = document.getElementById('videoPlayer');
                const source = document.getElementById('videoSource');
                const currentUrl = document.getElementById('currentUrl');

                const videoId = 'b93e9b40-8622-4b48-8458-ec85e6b8a6aa';
                const baseVideoUrl = 'https://vz-8b2563a6-02a.b-cdn.net/' + videoId + '/';

                function playVideo(quality) {
                    const qualities = {
                        '720p': 'vp9_720p/video.m3u8',
                        '480p': 'vp9_480p/video.m3u8',
                        '360p': 'vp9_360p/video.m3u8'
                    };
                    
                    const m3u8Url = baseVideoUrl + qualities[quality];
                    const proxyUrl = baseUrl + '/api/stream?url=' + encodeURIComponent(m3u8Url);
                    
                    source.src = proxyUrl;
                    video.load();
                    video.play();
                    
                    currentUrl.textContent = proxyUrl;
                    console.log('🎬 تشغيل:', proxyUrl);
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
║           🎬 وكيل البث المتقدم - يعمل بنجاح! 🚀                    ║
║                                                                       ║
║  📡 الخادم:  http://0.0.0.0:${port}
║  🌐 نقطة الوكيل:  /api/stream?url=<رابط_الـ_M3U8>
║                                                                       ║
║  📌 المميزات الجديدة:                                               ║
║     • يقلد طلبات المتصفح بالضبط (Cookies, Headers, Range)          ║
║     • يدعم Range Requests (التدفق الجزئي)                          ║
║     • يتعامل مع ETag و If-Modified-Since                           ║
║     • واجهة مستخدم مع مشغل فيديو متكامل                           ║
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
