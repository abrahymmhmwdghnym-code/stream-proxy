const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const http = require('http');
const https = require('https');
const crypto = require('crypto');

const app = express();
app.use(cors());

// ============================================
// 🔌 Keep-Alive Agents
// ============================================
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 256 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 256 });

function getAgent(targetUrl) {
    return targetUrl.startsWith('https') ? httpsAgent : httpAgent;
}

// ============================================
// 🗺️ Cache للمفاتيح المستخرجة من x-km
// ============================================
const keyCache = new Map(); // key: baseUrl (أو videoId), value: { key: Buffer, ivMap: Map (segmentName -> IV) }

// ============================================
// 🔑 استخراج المفتاح من x-km
// ============================================
function extractKeyFromXKm(xKmHeader) {
    try {
        const decoded = Buffer.from(xKmHeader, 'base64').toString('utf-8');
        const json = JSON.parse(decoded);
        // نبحث عن أول مفتاح ينتهي بـ "_k_0.key" أو أي مفتاح
        for (const [keyName, keyValue] of Object.entries(json)) {
            if (keyName.endsWith('_k_0.key') || keyName.includes('_k_0')) {
                return keyValue;
            }
        }
        // إذا لم نجد، نأخذ أول قيمة
        const firstKey = Object.values(json)[0];
        return firstKey;
    } catch (e) {
        console.error('❌ فشل فك x-km:', e.message);
        return null;
    }
}

// ============================================
// 🔓 فك تشفير قطعة (AES-128-CBC)
// ============================================
function decryptSegment(encryptedData, keyBuffer, ivBuffer) {
    const decipher = crypto.createDecipheriv('aes-128-cbc', keyBuffer, ivBuffer);
    let decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()]);
    const padLen = decrypted[decrypted.length - 1];
    return decrypted.slice(0, decrypted.length - padLen);
}

// ============================================
// 🔍 نظام استخراج الـ Headers (معدل لـ Thanawica)
// ============================================
function getHeaders(url, refererOverride = null, originOverride = null) {
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36',
        'Accept': '*/*',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'ar-EG,ar;q=0.9,en-EG;q=0.8,en-US;q=0.7,en;q=0.6',
        'sec-ch-ua': '"Google Chrome";v="149", "Chromium";v="149", "Not)A;Brand";v="24"',
        'sec-ch-ua-mobile': '?1',
        'sec-ch-ua-platform': '"Android"',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Dest': 'empty',
        'Priority': 'u=1, i',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    };

    try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname;

        // ===== معالجة خاصة لـ Thanawica =====
        if (hostname.includes('thanawica.com')) {
            headers.Origin = 'https://thanawica.com';
            headers.Referer = 'https://thanawica.com/sw.js';
            // Cookies من الطلب الأصلي (ثابتة حالياً)
            headers.Cookie = 'student_code=60261231; student_session=b814937e84ba002c21f188c013cea0b3d42872307f494fae71f8ebeb48a3334a; student_device=ebcd96d3d82250c2b23bdb6b8ceb84cddd19de32cbd427f4aa05f70f9df70ee4; cf_clearance=EVk.t9ncEQagN8yx.XsNYSGbKsgREnZqF75Kl.ikeoE-1784041322-1.2.1.1-eCDQiKLh8oRnqpmicKA6oyAjcdfaj16.5eG1DGhA1uWLsEDl5ynZoIdFGrG813gsw36bKLzC7zxDxbkw1cR0Sc9YIImyJ8v8_nvKLKpPpOp_0JTqIin0bee33elvndnCj2iS0_3fqXV8A4VvCeecZZPZjxQhVyVE7cQBvzGFQlIRlYYvn3UCQnhh7M6o3zIYuJo7bBDJKI.s2eWYIq2XTwbTIg6JrU3KCr.G13G1e9b4X_lzLUCYU2HHb.DiIE.zS_Amc0zCFw5dd4B2WiBtnmvSrddUfVz7GIO8bFr06I.Z99StxsYFa93PIYFViMvJNEQS92PcDafXX3.qaO8.sw; student_device_proof=60261231.9adfc84af4086a313436855f2eb2a600a446a43657802f6337eaaa365b7c412a.b11650d95b1bc57d3a5ca05c866829f0eb7e637efe638f70e1d91381ae0a3833.1784041503.c-m_19MMFdUguyPZUgiUM5SGVSzt2Ddp_tvKcjJcO68';
            
            // السماح بتجاوز الـ Referer و Origin
            if (refererOverride) headers.Referer = refererOverride;
            if (originOverride) headers.Origin = originOverride;
            
            return headers;
        }

        // ===== باقي المواقع (كما في الكود الأصلي) =====
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
// 📝 تعديل الروابط في M3U8 (مع إضافة IV)
// ============================================
function fixM3U8Links(data, baseUrl, proxyBase, videoId) {
    const lines = data.split('\n');
    const newLines = [];
    let currentIV = null;
    let modifiedCount = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        newLines.push(line);

        // البحث عن IV في سطر #EXT-X-KEY
        if (line.startsWith('#EXT-X-KEY') && line.includes('IV=0x')) {
            const match = line.match(/IV=0x([a-fA-F0-9]+)/);
            if (match) {
                currentIV = match[1];
                // نضيف IV إلى cache لكل قطعة قادمة
            }
        }

        // إذا كان السطر يحتوي على رابط قطعة (لا يبدأ بـ #)
        if (line && !line.startsWith('#') && !line.startsWith('http') && line.includes('.dat')) {
            const segmentName = line.trim();
            // إذا كان هناك IV محفوظ، نضيفه كـ query param
            let newUrl = segmentName;
            if (currentIV) {
                const separator = segmentName.includes('?') ? '&' : '?';
                newUrl = `${segmentName}${separator}iv=${currentIV}`;
            }
            // تعديل الرابط ليصبح عبر الوكيل
            try {
                const absoluteUrl = new URL(newUrl, baseUrl).href;
                const proxiedUrl = `${proxyBase}?url=${encodeURIComponent(absoluteUrl)}`;
                newLines[newLines.length - 1] = proxiedUrl;
                modifiedCount++;
            } catch (e) {
                // في حال فشل التحويل، نتركه كما هو
            }
            // إعادة تعيين IV بعد استخدامه (لأن كل قطعة لها IV خاص بها)
            currentIV = null;
        }
    }

    console.log(`📝 تم تعديل ${modifiedCount} رابط داخل M3U8 (مع IV)`);
    return newLines.join('\n');
}

// ============================================
// 📡 جلب مع Redirects
// ============================================
async function fetchWithRedirects(url, headers, maxRedirects = 3) {
    let currentUrl = url;

    for (let i = 0; i < maxRedirects; i++) {
        const response = await fetch(currentUrl, { 
            headers, 
            redirect: 'manual',
            timeout: 10000,
            agent: getAgent(currentUrl)
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
// 🌐 نقطة نهاية الوكيل الرئيسية
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

    try {
        const headers = getHeaders(url, refererOverride, originOverride);

        // تمرير Range header
        if (req.headers.range) {
            headers.Range = req.headers.range;
        }

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

        // ============================================
        // 📄 معالجة M3U8
        // ============================================
        if (isM3U8) {
            let data = await response.text();

            // استخراج المفتاح من x-km إذا كان الموقع Thanawica
            const xKm = response.headers.get('x-km');
            let videoId = null;
            if (xKm && url.includes('thanawica.com')) {
                const keyHex = extractKeyFromXKm(xKm);
                if (keyHex) {
                    // تخزين المفتاح في cache باستخدام baseUrl كمعرف
                    const cacheKey = baseUrl;
                    keyCache.set(cacheKey, {
                        key: Buffer.from(keyHex, 'hex'),
                        ivMap: new Map()
                    });
                    console.log(`🔑 تم تخزين المفتاح لـ ${cacheKey}: ${keyHex}`);
                    // استخراج videoId من الرابط لتحديد فريد
                    const match = url.match(/\/videos\/(\d+)/);
                    if (match) videoId = match[1];
                }
            }

            // تعديل الروابط مع إضافة IV
            data = fixM3U8Links(data, baseUrl, proxyBase, videoId);

            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
            res.send(data);
            return;
        }

        // ============================================
        // 🎬 معالجة القطع (.dat أو أي ملف)
        // ============================================
        // التحقق إذا كان طلب قطعة من Thanawica (تحتوي على /c/ و .dat)
        if (cleanPath.includes('/c/') && cleanPath.endsWith('.dat')) {
            console.log(`🔐 تحميل قطعة مشفرة: ${url}`);

            // جلب البيانات المشفرة
            const encryptedData = await response.buffer();
            console.log(`📦 حجم البيانات المشفرة: ${encryptedData.length} بايت`);

            // استخراج IV من query param (إذا كان موجوداً)
            const ivHex = req.query.iv;
            if (!ivHex) {
                console.warn('⚠️ لا يوجد IV في الطلب، إرسال البيانات كما هي');
                res.setHeader('Content-Type', contentType || 'video/mp2t');
                res.send(encryptedData);
                return;
            }

            // استرجاع المفتاح من cache باستخدام baseUrl
            const cacheKey = baseUrl;
            const cached = keyCache.get(cacheKey);
            if (!cached) {
                console.warn('⚠️ لم يتم العثور على مفتاح في cache، إرسال البيانات كما هي');
                res.setHeader('Content-Type', contentType || 'video/mp2t');
                res.send(encryptedData);
                return;
            }

            const keyBuffer = cached.key;
            const ivBuffer = Buffer.from(ivHex, 'hex');

            try {
                const decryptedData = decryptSegment(encryptedData, keyBuffer, ivBuffer);
                console.log(`✅ فك التشفير نجح - الحجم: ${decryptedData.length} بايت`);

                res.setHeader('Content-Type', 'video/mp4');
                res.setHeader('Content-Length', decryptedData.length);
                res.setHeader('Accept-Ranges', 'bytes');
                res.send(decryptedData);
            } catch (decryptError) {
                console.error('❌ فشل فك التشفير:', decryptError.message);
                // إرسال البيانات المشفرة كحل احتياطي
                res.setHeader('Content-Type', contentType || 'video/mp2t');
                res.send(encryptedData);
            }
            return;
        }

        // ============================================
        // 📦 أي ملف آخر (مفاتيح، صور، إلخ)
        // ============================================
        const data = await response.buffer();
        res.setHeader('Content-Type', contentType || 'application/octet-stream');
        res.send(data);

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
                    flex-wrap: wrap;
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
                        <input type="text" id="videoIdInput" placeholder="أدخل ID الفيديو (مثال: 1667)" value="1665">
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
                    
                    const proxyBase = window.location.origin + '/api/stream';
                    const m3u8Url = \`https://thanawica.com/lectures/\${videoId}/videos/\${videoId}\`;
                    const proxyUrl = \`\${proxyBase}?url=\${encodeURIComponent(m3u8Url)}\`;
                    
                    fetch(proxyUrl)
                        .then(response => {
                            if (!response.ok) throw new Error('HTTP ' + response.status);
                            return response.text();
                        })
                        .then(m3u8Data => {
                            // نبحث عن أول قطعة .dat في الـ m3u8
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
                            // نأخذ الرابط الكامل
                            const fullUrl = new URL(segmentUrl, window.location.origin).href;
                            videoSource.src = fullUrl;
                            player.src({ src: fullUrl, type: 'video/mp4' });
                            player.load();
                            player.play();
                            setStatus('green', '✅ جاري التشغيل');
                        })
                        .catch(error => {
                            console.error('Error:', error);
                            setStatus('red', '❌ فشل التحميل: ' + error.message);
                        });
                }

                loadBtn.addEventListener('click', () => {
                    const videoId = videoIdInput.value.trim() || '1665';
                    loadVideo(videoId);
                });

                window.addEventListener('load', () => {
                    loadVideo('1665');
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
                    <code>المفتاح المستخرج تلقائياً من x-km</code>
                    <code>IV يستخرج من m3u8 ويُمرر مع كل قطعة</code>
                </div>

                <div class="section">
                    <h2>📡 نقاط النهاية</h2>
                    <code>GET /api/stream?url=&lt;URL&gt;</code>
                    <p style="margin-top: 5px; color: #888; font-size: 13px;">يدعم M3U8 والقطع (.dat) مع فك التشفير لـ Thanawica</p>
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
║        🚀 وكيل Thanawica مع فك التشفير التلقائي 🚀          ║
║                                                                ║
║  📡 الخادم:  http://${hostname}:${port}
║  🌐 الوكيل:  http://${hostname}:${port}/api/stream
║  🎬 المشغل:  http://${hostname}:${port}/player
║  📊 اللوحة:  http://${hostname}:${port}/
║                                                                ║
║  ✨ الميزات:                                                  ║
║     • استخراج المفتاح تلقائياً من x-km                       ║
║     • فك تشفير AES-128-CBC لكل قطعة مع IV الخاص بها          ║
║     • تمرير الهيدرات الصحيحة (Referer, Cookies)              ║
║     • مشغل فيديو متكامل                                       ║
║     • دعم المواقع الأخرى (باستخدام domainMap)                ║
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