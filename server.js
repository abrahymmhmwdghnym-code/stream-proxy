const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const crypto = require('crypto');
const https = require('https');

const app = express();

// ============================================
// ⚙️ إعدادات CORS
// ============================================
const corsOptions = {
    origin: '*',
    credentials: true,
    optionsSuccessStatus: 200,
    methods: ['GET', 'POST', 'OPTIONS', 'HEAD'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'Referer', 'Range']
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// ============================================
// 🔑 المفتاح و IV
// ============================================
const VIDEO_KEY = Buffer.from('dcc25dc94dd0ec69facff5177c8e5f6f3cf3f331ed88f95c7d25298703ca4b5aeda35b751638e1f8abcb34ede96ce0155cacb8ffe3c68543370385e29a26ae66494d3f371565954b57d328ff4de60a61885a728668', 'hex');
const VIDEO_IV = Buffer.from('e9bc498fb7755a8201bc06656f42d9d3', 'hex');

// ============================================
// 🛠️ فك تشفير
// ============================================
function decryptSegment(encryptedData) {
    const key = VIDEO_KEY.subarray(0, 32);
    const decipher = crypto.createDecipheriv('aes-128-cbc', key, VIDEO_IV);
    decipher.setAutoPadding(true);
    let decrypted = decipher.update(encryptedData);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted;
}

// ============================================
// 🔥 بناء الـ Headers بالضبط زي الطلب
// ============================================
function buildHeaders(url, req) {
    const headers = {
        'sec-ch-ua-platform': '"Android"',
        'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36',
        'sec-ch-ua': '"Google Chrome";v="149", "Chromium";v="149", "Not)A;Brand";v="24"',
        'sec-ch-ua-mobile': '?1',
        'accept': '*/*',
        'sec-fetch-site': 'cross-site',
        'sec-fetch-mode': 'cors',
        'sec-fetch-dest': 'empty',
        'referer': 'https://coursatk.online/',
        'accept-encoding': 'gzip, deflate, br, zstd',
        'accept-language': 'ar-EG,ar;q=0.9,en-EG;q=0.8,en-US;q=0.7,en;q=0.6',
        'priority': 'u=1, i',
        'origin': 'https://coursatk.online',
        'authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjo4NDc0Miwicm9sZSI6InN0dWRlbnQiLCJ1dWlkIjoiNTY3YjdlZTdlNmUxNTJmYjhjMWQxN2JlZjAxNjUxMDEifQ.l3sVixAA1PY76vRo9hCbu2BlETCBpiFLFFMf5o_b4d8'
    };

    // Range header
    if (req.headers['range']) {
        headers.Range = req.headers['range'];
    }

    return headers;
}

// ============================================
// 🌐 fetch مع Agent
// ============================================
const agent = new https.Agent({
    rejectUnauthorized: false,
    keepAlive: true
});

// ============================================
// 📡 نقطة الوكيل
// ============================================
app.get('/api/stream', async (req, res) => {
    const url = req.query.url;

    if (!url) {
        return res.status(400).json({ error: 'Missing url parameter' });
    }

    console.log(`\n🎬 طلب: ${url.substring(0, 100)}...`);

    try {
        const headers = buildHeaders(url, req);
        
        // لو المطلوب هو مفتاح التشفير
        if (url.includes('/auth/')) {
            console.log('🔑 جلب مفتاح التشفير...');
            const response = await fetch(url, {
                method: 'GET',
                headers: headers,
                agent: agent,
                timeout: 30000
            });

            if (!response.ok) {
                return res.status(response.status).json({ error: `HTTP ${response.status}` });
            }

            const buffer = await response.buffer();
            res.setHeader('Content-Type', 'application/octet-stream');
            res.send(buffer);
            return;
        }

        // طلب عادي
        const response = await fetch(url, {
            method: 'GET',
            headers: headers,
            agent: agent,
            timeout: 30000,
            compress: false
        });

        if (!response.ok) {
            console.error(`❌ HTTP ${response.status} - ${url}`);
            return res.status(response.status).json({ 
                error: `HTTP ${response.status}`,
                url: url
            });
        }

        const contentType = response.headers.get('content-type') || '';
        const isM3U8 = contentType.includes('mpegurl') || 
                       contentType.includes('m3u') ||
                       url.includes('.m3u8');

        // ===== M3U8 =====
        if (isM3U8) {
            let text = await response.text();
            console.log(`📄 M3U8: ${text.length} bytes`);
            
            const proxyBase = '/api/stream';
            const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);
            
            // تعديل روابط القطع
            text = text.replace(/^([^#][^\s]+\.(?:ts|woff2|m4s|mp4|key)[^\s]*)$/gm, (match) => {
                try {
                    const trimmed = match.trim();
                    if (trimmed.startsWith('http')) {
                        return `${proxyBase}?url=${encodeURIComponent(trimmed)}`;
                    }
                    const absoluteUrl = new URL(trimmed, baseUrl).href;
                    return `${proxyBase}?url=${encodeURIComponent(absoluteUrl)}`;
                } catch (e) {
                    return match;
                }
            });

            // تعديل URI
            text = text.replace(/URI="([^"]+)"/g, (match, p1) => {
                try {
                    if (p1.startsWith('http')) {
                        return `URI="${proxyBase}?url=${encodeURIComponent(p1)}"`;
                    }
                    const absoluteUrl = new URL(p1, baseUrl).href;
                    return `URI="${proxyBase}?url=${encodeURIComponent(absoluteUrl)}"`;
                } catch (e) {
                    return match;
                }
            });

            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.send(text);
            console.log('✅ M3U8 تم تعديله');
        } 
        // ===== المقطع =====
        else {
            const buffer = await response.buffer();
            
            // فك تشفير المقاطع
            if (url.includes('.woff2') || url.includes('.ts')) {
                try {
                    const decrypted = decryptSegment(buffer);
                    res.setHeader('Content-Type', 'video/mp4');
                    res.setHeader('Content-Length', decrypted.length);
                    res.setHeader('Access-Control-Allow-Origin', '*');
                    res.send(decrypted);
                    console.log(`🔓 فك تشفير: ${decrypted.length} bytes`);
                } catch (e) {
                    console.error('❌ فشل الفك:', e.message);
                    res.setHeader('Content-Type', contentType || 'video/mp4');
                    res.setHeader('Access-Control-Allow-Origin', '*');
                    res.send(buffer);
                }
            } else {
                res.setHeader('Content-Type', contentType || 'video/mp4');
                res.setHeader('Content-Length', buffer.length);
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.send(buffer);
                console.log(`📦 مقطع: ${buffer.length} bytes`);
            }
        }

    } catch (error) {
        console.error('❌ خطأ:', error.message);
        if (!res.headersSent) {
            res.status(500).json({ 
                error: error.message,
                url: url
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
        <html dir="rtl">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>🎬 مشغل الفيديو</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                    font-family: Arial, sans-serif;
                    background: #0a0a0a;
                    min-height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 20px;
                }
                .container {
                    background: #1a1a1a;
                    border-radius: 15px;
                    max-width: 900px;
                    width: 100%;
                    padding: 30px;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.8);
                }
                h1 {
                    color: #667eea;
                    text-align: center;
                    margin-bottom: 20px;
                }
                .player-container {
                    background: #000;
                    border-radius: 10px;
                    overflow: hidden;
                }
                video {
                    width: 100%;
                    display: block;
                }
                .controls {
                    display: flex;
                    gap: 10px;
                    flex-wrap: wrap;
                    margin-top: 15px;
                    justify-content: center;
                }
                .btn {
                    padding: 12px 25px;
                    background: #667eea;
                    color: white;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 600;
                    transition: all 0.3s;
                }
                .btn:hover {
                    transform: scale(1.05);
                    opacity: 0.9;
                }
                .btn-green { background: #28a745; }
                .btn-orange { background: #fd7e14; }
                .status {
                    color: #aaa;
                    text-align: center;
                    margin-top: 15px;
                    font-size: 13px;
                }
                .url-box {
                    background: #2d2d2d;
                    color: #0f0;
                    padding: 10px;
                    border-radius: 5px;
                    margin-top: 10px;
                    font-size: 11px;
                    word-break: break-all;
                    text-align: left;
                    font-family: monospace;
                }
                .error {
                    color: #ff6b6b;
                    text-align: center;
                    margin-top: 10px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🎬 مشغل الفيديو</h1>
                <div class="player-container">
                    <video id="videoPlayer" controls playsinline></video>
                </div>
                <div class="controls">
                    <button class="btn btn-green" onclick="playVideo()">▶️ تشغيل</button>
                    <button class="btn" onclick="playQuality('360p')">360p</button>
                    <button class="btn" onclick="playQuality('480p')">480p</button>
                    <button class="btn btn-orange" onclick="playQuality('720p')">720p</button>
                </div>
                <div class="status" id="status">✅ جاهز للتشغيل</div>
                <div class="url-box" id="urlBox">انتظر التحميل...</div>
                <div class="error" id="errorBox"></div>
            </div>

            <script>
                const video = document.getElementById('videoPlayer');
                const status = document.getElementById('status');
                const urlBox = document.getElementById('urlBox');
                const errorBox = document.getElementById('errorBox');
                const baseUrl = window.location.origin;

                const videoId = 'ff43e6194101060c9ca844f95f6e80fe';
                const qualities = {
                    '360p': 'https://cloud3.cloudfrount.shop/videos/' + videoId + '/360/playlist.m3u8?code=474578901&expires=1783302246',
                    '480p': 'https://cloud3.cloudfrount.shop/videos/' + videoId + '/480/playlist.m3u8?code=474578901&expires=1783302246',
                    '720p': 'https://cloud3.cloudfrount.shop/videos/' + videoId + '/720/playlist.m3u8?code=474578901&expires=1783302246'
                };

                let currentQuality = '360p';
                let hls = null;

                function playQuality(quality) {
                    currentQuality = quality;
                    status.textContent = '🔄 جاري تحميل ' + quality + '...';
                    errorBox.textContent = '';
                    if (hls) {
                        hls.destroy();
                        hls = null;
                    }
                    playVideo();
                }

                function playVideo() {
                    const m3u8Url = qualities[currentQuality];
                    if (!m3u8Url) {
                        status.textContent = '❌ جودة غير متوفرة';
                        return;
                    }

                    const proxyUrl = baseUrl + '/api/stream?url=' + encodeURIComponent(m3u8Url);
                    urlBox.textContent = '📡 ' + proxyUrl;
                    
                    if (Hls.isSupported()) {
                        hls = new Hls({
                            debug: false,
                            enableWorker: true,
                            lowLatencyMode: true,
                            fragLoadingTimeOut: 60000,
                            manifestLoadingTimeOut: 60000,
                            xhrSetup: function(xhr, url) {
                                xhr.withCredentials = false;
                            }
                        });
                        hls.loadSource(proxyUrl);
                        hls.attachMedia(video);
                        hls.on(Hls.Events.MANIFEST_PARSED, () => {
                            video.play();
                            status.textContent = '▶️ تشغيل ' + currentQuality + ' | ✅ تم فك التشفير';
                        });
                        hls.on(Hls.Events.ERROR, (e, data) => {
                            if (data.fatal) {
                                errorBox.textContent = '❌ خطأ: ' + data.type + ' - حاول إعادة التحميل';
                                status.textContent = '❌ فشل التشغيل';
                            }
                        });
                    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                        video.src = proxyUrl;
                        video.play();
                        status.textContent = '▶️ تشغيل ' + currentQuality;
                    } else {
                        errorBox.textContent = '❌ متصفحك لا يدعم HLS';
                        status.textContent = '❌ غير مدعوم';
                    }
                }

                window.onload = function() {
                    const script = document.createElement('script');
                    script.src = 'https://cdn.jsdelivr.net/npm/hls.js@latest';
                    script.onload = function() {
                        playVideo();
                    };
                    script.onerror = function() {
                        errorBox.textContent = '❌ فشل تحميل HLS.js';
                    };
                    document.head.appendChild(script);
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
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║    🎬 وكيل البث مع فك التشفير - يعمل بنجاح! 🚀           ║
║                                                              ║
║    📡 السيرفر: http://localhost:${port}
║    🔑 فك التشفير: AES-128-CBC (مفعل)                      ║
║    🎯 الفيديو: ff43e6194101060c9ca844f95f6e80fe           ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
    `);
});
