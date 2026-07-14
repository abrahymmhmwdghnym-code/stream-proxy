const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const http = require('http');
const https = require('https');
const crypto = require('crypto');

const app = express();
app.use(cors());

// ============================================
// 🔑 مفاتيح التشفير (من الـ m3u8 و x-km)
// ============================================

const SEGMENT_KEY = Buffer.from('5bdac8809dc3c9c5b50ca0c85f7ab632', 'hex');
const SEGMENT_IV = Buffer.from('e6cadcf5874d0150c10b830db924cd5b', 'hex');

// ============================================
// 🔌 Keep-Alive Agents
// ============================================

const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 256 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 256 });

function getAgent(targetUrl) {
    return targetUrl.startsWith('https') ? httpsAgent : httpAgent;
}

// ============================================
// 🔍 نظام استخراج الـ Headers
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

        if (hostname.includes('thanawica.com')) {
            headers.Origin = 'https://thanawica.com';
            headers.Referer = 'https://thanawica.com/sw.js';
            // Cookies من الطلب الأصلي
            headers.Cookie = 'student_code=60261231; student_session=b814937e84ba002c21f188c013cea0b3d42872307f494fae71f8ebeb48a3334a; student_device=ebcd96d3d82250c2b23bdb6b8ceb84cddd19de32cbd427f4aa05f70f9df70ee4; cf_clearance=7NQmb9SgeHaljPdFoe9oWfSLpDqrzSllx5.b4XUIp20-1784038991-1.2.1.1-pkzSCS3GBLITWA5_wcZ6k61StmRIy2L62R25z3Dcnpg6TYHhJH7uwTYPC.S5eZZtN_v9Ah1TldgpwuQ_sbCSjR4.167RPxy0HKFBi4rEb4N5p780GXQZp4PLv9eX2o1CcDZCeKDv_PnOWpqewpZRvtwkEGIC51_WbzIKPDgbIN7JnPkj301A6HMM139mISKUJvg7rvSgyO.QqmPZYvXplKLNReUOw5DN_xXGrgL.UBvpv2pHlds0p4Q1gS3gm2aZcVtlml82Dh8P87LpBPUWOGeKJ3Zyp2DnxJn9UElkAufvngMQ6i4pvSKNKND5yDBfVqII8M.C.XTA.Y._uqKOdA; student_device_proof=60261231.9adfc84af4086a313436855f2eb2a600a446a43657802f6337eaaa365b7c412a.b11650d95b1bc57d3a5ca05c866829f0eb7e637efe638f70e1d91381ae0a3833.1784039171.ulij4_PnGYJmUxOOQFEGbdUgw6z5rXPzNBvGrizeUZs';
        }
    } catch (e) {
        console.warn('⚠️ Error parsing URL:', e.message);
    }

    return headers;
}

// ============================================
// 🔓 فك تشفير القطعة (AES-128-CBC)
// ============================================

function decryptSegment(encryptedData) {
    const decipher = crypto.createDecipheriv('aes-128-cbc', SEGMENT_KEY, SEGMENT_IV);
    let decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()]);
    
    // إزالة padding (PKCS7)
    const padLen = decrypted[decrypted.length - 1];
    return decrypted.slice(0, decrypted.length - padLen);
}

// ============================================
// 📡 نقطة نهاية وكيل الفيديو (مع فك التشفير)
// ============================================

app.get('/api/stream', async (req, res) => {
    const rawQuery = req.originalUrl.split('?').slice(1).join('?');
    const urlMatch = rawQuery.match(/^url=(.+?)(?:&|$)/);

    if (!urlMatch) {
        return res.status(400).json({ 
            error: 'Missing url parameter',
            example: '/api/stream?url=https://thanawica.com/api/c/.../seg_0.dat?v=...&tok=...'
        });
    }

    let url = urlMatch[1];
    try { url = decodeURIComponent(url); } catch (e) {}

    try {
        const headers = getHeaders(url);

        // تمرير Range header لو المشغل طلب جزء معين
        if (req.headers.range) {
            headers.Range = req.headers.range;
        }

        // جلب القطعة المشفرة
        const response = await fetch(url, { 
            headers, 
            timeout: 30000,
            agent: getAgent(url)
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

        // لو كانت M3U8 (قائمة تشغيل) - نعدلها عشان تمر على الوكيل
        if (contentType.includes('mpegurl') || contentType.includes('m3u') || cleanPath.endsWith('.m3u8')) {
            let data = await response.text();
            
            // تعديل الروابط عشان تمر على الوكيل
            const proxyBase = '/api/stream';
            const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);
            
            data = data.replace(/(https?:\/\/[^\s"']+\.(?:ts|m3u8|key|dat))/g, (match) => {
                try {
                    const absoluteUrl = new URL(match, baseUrl).href;
                    return `${proxyBase}?url=${encodeURIComponent(absoluteUrl)}`;
                } catch (e) {
                    return match;
                }
            });

            data = data.replace(/^([^#][^\s]+\.(?:ts|m3u8|key|dat)[^\s]*)$/gm, (match, p1) => {
                try {
                    const absoluteUrl = new URL(p1, baseUrl).href;
                    return `${proxyBase}?url=${encodeURIComponent(absoluteUrl)}`;
                } catch (e) {
                    return match;
                }
            });

            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            return res.send(data);
        }

        // ===== قطعة فيديو مشفرة (.dat) =====
        if (cleanPath.endsWith('.dat') || cleanPath.includes('/c/')) {
            console.log(`🔐 تحميل قطعة مشفرة: ${url}`);
            
            // تحميل البيانات المشفرة
            const encryptedData = await response.buffer();
            console.log(`📦 حجم البيانات المشفرة: ${encryptedData.length} بايت`);

            // فك التشفير
            try {
                const decryptedData = decryptSegment(encryptedData);
                console.log(`✅ فك التشفير نجح - الحجم: ${decryptedData.length} بايت`);

                // إرسال الفيديو المفكك
                res.setHeader('Content-Type', 'video/mp4');
                res.setHeader('Content-Length', decryptedData.length);
                res.setHeader('Accept-Ranges', 'bytes');
                res.setHeader('Cache-Control', 'no-cache');
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.send(decryptedData);
            } catch (decryptError) {
                console.error('❌ فشل فك التشفير:', decryptError.message);
                
                // لو فشل الفك، نرسل البيانات المشفرة (قد يكون مش قطعة فيديو)
                res.setHeader('Content-Type', contentType || 'application/octet-stream');
                res.send(encryptedData);
            }
        } else {
            // أي ملف تاني (مفاتيح، صور، إلخ)
            const data = await response.buffer();
            res.setHeader('Content-Type', contentType || 'application/octet-stream');
            res.send(data);
        }

    } catch (error) {
        console.error('❌ خطأ في الوكيل:', error.message);
        res.status(500).json({ 
            error: 'Proxy error',
            message: error.message 
        });
    }
});

// ============================================
// 🎬 مشغل فيديو (مع دعم فك التشفير)
// ============================================

app.get('/player', (req, res) => {
    res.type('text/html').send(`
        <!DOCTYPE html>
        <html dir="rtl">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
            <title>🎬 مشغل الفيديو - Thanawica</title>
            <link href="https://vjs.zencdn.net/8.10.0/video-js.css" rel="stylesheet" />
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                    background: #0a0a0a;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    min-height: 100vh;
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    padding: 20px;
                }
                .container {
                    width: 100%;
                    max-width: 900px;
                    background: #1a1a1a;
                    border-radius: 16px;
                    padding: 20px;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.8);
                }
                .video-wrapper {
                    position: relative;
                    background: #000;
                    border-radius: 12px;
                    overflow: hidden;
                }
                #my-video {
                    width: 100%;
                    height: auto;
                    aspect-ratio: 16 / 9;
                }
                .video-js .vjs-big-play-button {
                    background: rgba(102, 126, 234, 0.8) !important;
                    border-radius: 50% !important;
                    width: 80px !important;
                    height: 80px !important;
                    line-height: 80px !important;
                    margin-left: -40px !important;
                    margin-top: -40px !important;
                    border: 3px solid rgba(255,255,255,0.3) !important;
                }
                .video-js .vjs-big-play-button:hover {
                    background: #667eea !important;
                }
                .info {
                    margin-top: 15px;
                    padding: 15px;
                    background: #222;
                    border-radius: 8px;
                    color: #aaa;
                    font-size: 14px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    flex-wrap: wrap;
                    gap: 10px;
                }
                .info .status {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .info .status .dot {
                    width: 10px;
                    height: 10px;
                    border-radius: 50%;
                    display: inline-block;
                }
                .dot.green { background: #4caf50; }
                .dot.yellow { background: #ffc107; }
                .dot.red { background: #f44336; }
                .controls {
                    display: flex;
                    gap: 10px;
                    align-items: center;
                }
                .controls input {
                    padding: 8px 12px;
                    border-radius: 6px;
                    border: 1px solid #444;
                    background: #333;
                    color: #fff;
                    font-size: 13px;
                    width: 200px;
                }
                .controls button {
                    padding: 8px 16px;
                    border: none;
                    border-radius: 6px;
                    background: #667eea;
                    color: #fff;
                    cursor: pointer;
                    font-size: 13px;
                    transition: background 0.3s;
                }
                .controls button:hover {
                    background: #764ba2;
                }
                .controls button:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
                @media (max-width: 600px) {
                    .container { padding: 10px; }
                    .controls { flex-wrap: wrap; }
                    .controls input { width: 100%; }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="video-wrapper">
                    <video
                        id="my-video"
                        class="video-js vjs-big-play-centered vjs-16-9"
                        controls
                        preload="auto"
                        poster=""
                        data-setup='{"fluid": true, "autoplay": false, "preload": "auto"}'
                    >
                        <source src="" type="video/mp4" id="video-source">
                        <p class="vjs-no-js">
                            لتشغيل هذا الفيديو، يرجى تفعيل JavaScript في متصفحك.
                        </p>
                    </video>
                </div>

                <div class="info">
                    <div class="status">
                        <span class="dot green" id="statusDot"></span>
                        <span id="statusText">جاهز للتشغيل</span>
                    </div>
                    <div class="controls">
                        <input type="text" id="videoIdInput" placeholder="أدخل ID الفيديو (مثال: 1667)" value="1667">
                        <button id="loadBtn">🎬 تحميل</button>
                    </div>
                </div>
            </div>

            <script src="https://vjs.zencdn.net/8.10.0/video.min.js"></script>
            <script>
                const player = videojs('my-video');
                const videoSource = document.getElementById('video-source');
                const statusDot = document.getElementById('statusDot');
                const statusText = document.getElementById('statusText');
                const loadBtn = document.getElementById('loadBtn');
                const videoIdInput = document.getElementById('videoIdInput');

                function setStatus(type, text) {
                    statusDot.className = 'dot ' + type;
                    statusText.textContent = text;
                }

                function loadVideo(videoId) {
                    setStatus('yellow', 'جاري التحميل...');
                    
                    // بناء رابط الـ M3U8
                    const m3u8Url = \`https://thanawica.com/lectures/\${videoId}/videos/1665\`;
                    
                    // استخدام الوكيل لجلب الـ M3U8
                    const proxyUrl = \`/api/stream?url=\${encodeURIComponent(m3u8Url)}\`;
                    
                    // نطلب الـ M3U8 من الوكيل
                    fetch(proxyUrl)
                        .then(response => response.text())
                        .then(m3u8Data => {
                            // استخراج رابط القطعة الأولى من الـ M3U8
                            const lines = m3u8Data.split('\\n');
                            let segmentUrl = null;
                            
                            for (const line of lines) {
                                if (line.includes('.dat') && !line.startsWith('#')) {
                                    segmentUrl = line.trim();
                                    break;
                                }
                            }
                            
                            if (!segmentUrl) {
                                setStatus('red', '❌ لم يتم العثور على قطعة فيديو');
                                return;
                            }
                            
                            // إذا كان الرابط نسبي، نحوله لمطلق
                            if (segmentUrl.startsWith('/')) {
                                segmentUrl = \`https://thanawica.com\${segmentUrl}\`;
                            }
                            
                            // إضافة التوكن والمعاملات
                            // ملاحظة: التوكن ده من الطلب الأصلي، لازم تجدد بشكل دوري
                            const token = '_1CNUX3leyQ-Bl0EFVC9oA';
                            const v = 'f3a26296dc8b4a3b';
                            const iat = '1784038993';
                            
                            // نضيف المعاملات للرابط
                            const separator = segmentUrl.includes('?') ? '&' : '?';
                            segmentUrl = \`\${segmentUrl}\${separator}v=\${v}&iat=\${iat}&tok=\${token}\`;
                            
                            // نمرر الرابط على الوكيل عشان يفك التشفير
                            const finalUrl = \`/api/stream?url=\${encodeURIComponent(segmentUrl)}\`;
                            
                            // تحديث مصدر الفيديو
                            videoSource.src = finalUrl;
                            player.src({ src: finalUrl, type: 'video/mp4' });
                            player.load();
                            player.play();
                            
                            setStatus('green', '✅ جاري التشغيل');
                        })
                        .catch(error => {
                            console.error('Error:', error);
                            setStatus('red', '❌ فشل التحميل: ' + error.message);
                        });
                }

                // تحميل الفيديو عند الضغط على الزر
                loadBtn.addEventListener('click', () => {
                    const videoId = videoIdInput.value.trim() || '1667';
                    loadVideo(videoId);
                });

                // تحميل تلقائي عند فتح الصفحة
                window.addEventListener('load', () => {
                    loadVideo('1667');
                });
            </script>
        </body>
        </html>
    `);
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
            <title>🚀 وكيل Thanawica</title>
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
                .btn {
                    display: inline-block;
                    padding: 12px 30px;
                    background: #667eea;
                    color: #fff;
                    border-radius: 8px;
                    text-decoration: none;
                    font-weight: bold;
                    transition: background 0.3s;
                    margin-top: 10px;
                }
                .btn:hover {
                    background: #764ba2;
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
                .badge {
                    background: #28a745;
                    color: #fff;
                    padding: 2px 10px;
                    border-radius: 12px;
                    font-size: 12px;
                    display: inline-block;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🚀 وكيل Thanawica</h1>
                <div class="status">
                    <span style="font-size: 20px;">✅</span>
                    <span>الخادم يعمل مع دعم فك التشفير</span>
                    <span class="badge">AES-128-CBC</span>
                </div>

                <div class="section">
                    <h2>🎬 مشغل الفيديو</h2>
                    <p style="color: #666; margin-bottom: 10px;">شاهد الفيديوهات مباشرة مع فك التشفير التلقائي</p>
                    <a href="/player" class="btn">🚀 افتح المشغل</a>
                </div>

                <div class="section">
                    <h2>🔑 مفاتيح التشفير</h2>
                    <code>KEY: 5bdac8809dc3c9c5b50ca0c85f7ab632</code>
                    <code>IV:  e6cadcf5874d0150c10b830db924cd5b</code>
                </div>

                <div class="section">
                    <h2>📡 نقاط النهاية</h2>
                    <code>GET /api/stream?url=&lt;URL&gt;</code>
                    <p style="margin-top: 5px; color: #888; font-size: 13px;">يدعم M3U8 والقطع (.dat) مع فك التشفير</p>
                    <code>GET /player</code>
                    <p style="margin-top: 5px; color: #888; font-size: 13px;">مشغل فيديو متكامل مع دعم فك التشفير</p>
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
║        🚀 وكيل Thanawica مع فك التشفير 🚀                    ║
║                                                                ║
║  📡 الخادم:  http://${hostname}:${port}
║  🌐 الوكيل:  http://${hostname}:${port}/api/stream
║  🎬 المشغل:  http://${hostname}:${port}/player
║  📊 اللوحة:  http://${hostname}:${port}/
║                                                                ║
║  🔑 مفتاح التشفير: 5bdac8809dc3c9c5b50ca0c85f7ab632          ║
║  🔑 IV:          e6cadcf5874d0150c10b830db924cd5b            ║
║                                                                ║
║  ✨ الميزات:                                                  ║
║     • فك تشفير AES-128-CBC تلقائي                            ║
║     • مشغل فيديو متكامل                                       ║
║     • دعم M3U8 والقطع (.dat)                                 ║
║     • Keep-Alive Agent                                       ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
    `);
});