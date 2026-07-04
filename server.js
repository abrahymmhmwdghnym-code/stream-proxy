const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const https = require('https');
const http = require('http');

const app = express();
app.use(cors());

// ============================================
// 🧠 Agent مخصص للتعامل مع مشاكل الـ SSL
// ============================================
const agent = new https.Agent({
    rejectUnauthorized: false, // يتجاهل مشاكل الشهادات
    keepAlive: true
});

// ============================================
// 🔍 استخراج الـ Headers المناسبة
// ============================================

function extractReferer(url) {
    try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname;

        const refererMap = {
            'kora-yalla.blog': 'https://news.sites10.top/',
            'kora-yalla.com': 'https://news.sites10.top/',
            'yalla-shoot.io': 'https://yalla-shoot.io/',
            'yallashoot.live': 'https://yallashoot.live/',
            'koora-live.com': 'https://koora-live.com/',
            'kooora.com': 'https://kooora.com/',
            'kora-plus.app': `${urlObj.protocol}//${urlObj.hostname}/sw.js`,
            'vertyuz.xyz': `${urlObj.protocol}//${urlObj.hostname}/`,
            'vertyuz.com': `${urlObj.protocol}//${urlObj.hostname}/`,
        };

        for (const [domain, referer] of Object.entries(refererMap)) {
            if (hostname.includes(domain)) {
                return referer;
            }
        }

        return `${urlObj.protocol}//${urlObj.hostname}/`;
    } catch (e) {
        return 'https://news.sites10.top/';
    }
}

function extractOrigin(url) {
    try {
        const urlObj = new URL(url);
        return `${urlObj.protocol}//${urlObj.hostname}`;
    } catch (e) {
        return 'https://news.sites10.top';
    }
}

function extractUserAgent(url) {
    const mobileUA = 'Mozilla/5.0 (Linux; Android 15; CPH2591) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.7827.159 Mobile Safari/537.36';
    const desktopUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36';
    
    try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname;
        const mobileSites = ['kora-plus', 'yalla-shoot', 'yallashoot', 'vertyuz'];
        for (const site of mobileSites) {
            if (hostname.includes(site)) return mobileUA;
        }
        return desktopUA;
    } catch (e) {
        return mobileUA;
    }
}

// ============================================
// 🔍 استخراج رابط M3U8 من HTML (فقط لو الرابط مش M3U8)
// ============================================

function extractM3U8FromHTML(html, baseUrl) {
    // جيب أي رابط M3U8 من جوة النص
    const m3u8Regex = /https?:\/\/[^\s"']+\.m3u8[^\s"']*/gi;
    const matches = html.match(m3u8Regex);
    if (matches && matches.length > 0) {
        return matches[0];
    }

    // جيب أي رابط فيه m3u8 (حتى لو مش مكتوب كامل)
    const partialRegex = /["']([^"']*\.m3u8[^"']*)["']/gi;
    let match;
    while ((match = partialRegex.exec(html)) !== null) {
        let url = match[1];
        if (!url.startsWith('http')) {
            try {
                url = new URL(url, baseUrl).href;
            } catch (e) { continue; }
        }
        return url;
    }

    return null;
}

// ============================================
// 📡 نقطة نهاية الوكيل (Proxy)
// ============================================

app.get('/api/stream', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) {
        return res.status(400).send('Missing url parameter');
    }

    // 🛡️ حماية: لو الرابط مش مكتوب كامل، نكمله
    let fullUrl = targetUrl;
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
        fullUrl = 'https://' + targetUrl;
    }

    const referer = extractReferer(fullUrl);
    const origin = extractOrigin(fullUrl);
    const userAgent = extractUserAgent(fullUrl);

    // 🔥 بناء الرؤوس (Headers) ديناميكياً
    const headers = {
        'User-Agent': userAgent,
        'Origin': origin,
        'Referer': referer,
        'Accept': '*/*',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'ar-EG,ar;q=0.9,en-EG;q=0.8,en-US;q=0.7,en;q=0.6',
        'Sec-Fetch-Site': 'cross-site',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Dest': 'empty',
        'X-Requested-With': 'com.mycompany.app.soulbrowser',
        'Connection': 'keep-alive'
    };

    console.log(`🔄 Proxying: ${fullUrl}`);
    console.log(`📌 Using Referer: ${referer}`);
    console.log(`📌 Using Origin: ${origin}`);

    try {
        // 🧠 استخدام Agent مخصص عشان نتجاوز مشاكل SSL
        const response = await fetch(fullUrl, { 
            headers,
            agent: fullUrl.startsWith('https') ? agent : undefined,
            timeout: 30000 // 30 ثانية مهلة
        });

        // لو الرد مش ناجح
        if (!response.ok) {
            console.error(`❌ Response Error: ${response.status} ${response.statusText}`);
            return res.status(response.status).send(`Error: ${response.status} ${response.statusText}`);
        }

        const contentType = response.headers.get('content-type') || '';

        // ============================================
        // 🔥 حالة خاصة: الرابط مش M3U8 (صفحة HTML)
        // ============================================
        if (!fullUrl.includes('.m3u8') && contentType.includes('text/html')) {
            const html = await response.text();
            const m3u8Url = extractM3U8FromHTML(html, fullUrl);

            if (m3u8Url) {
                console.log(`✅ Found M3U8 in HTML: ${m3u8Url}`);
                // حول المستخدم تلقائياً للرابط الجديد
                return res.redirect(`/api/stream?url=${encodeURIComponent(m3u8Url)}`);
            } else {
                // لو ملقتش رابط، ارجع الـ HTML نفسه
                res.setHeader('Content-Type', 'text/html');
                return res.send(html);
            }
        }

        // ============================================
        // 🎯 الحالة العادية: الرابط M3U8
        // ============================================
        const data = await response.text();

        // لو مش M3U8 حقيقي، حاول تستخرج الرابط
        if (!data.trim().startsWith('#EXTM3U')) {
            const m3u8Url = extractM3U8FromHTML(data, fullUrl);
            if (m3u8Url) {
                console.log(`✅ Found M3U8 in response: ${m3u8Url}`);
                return res.redirect(`/api/stream?url=${encodeURIComponent(m3u8Url)}`);
            }
        }

        // عدل الروابط الداخلية (نفس النظام القديم)
        const baseUrl = fullUrl.substring(0, fullUrl.lastIndexOf('/') + 1);
        const modified = data
            .replace(/^([^#][^\s]+\.ts)$/gm, (match, p1) => {
                try {
                    const absoluteUrl = new URL(p1, baseUrl).href;
                    return `/api/stream?url=${encodeURIComponent(absoluteUrl)}`;
                } catch (e) {
                    return match;
                }
            })
            .replace(/URI="([^"]+)"/g, (match, p1) => {
                try {
                    const absoluteUrl = new URL(p1, baseUrl).href;
                    return `URI="/api/stream?url=${encodeURIComponent(absoluteUrl)}"`;
                } catch (e) {
                    return match;
                }
            });

        // إضافة CORS headers
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Expose-Headers', 'Content-Length');
        res.setHeader('Cache-Control', 'no-cache');
        
        res.send(modified);

    } catch (error) {
        console.error('❌ Proxy error:', error);
        // ارسال خطأ مفصل
        res.status(500).json({ 
            error: 'Proxy error', 
            message: error.message,
            url: fullUrl
        });
    }
});

// ============================================
// ✅ مسار صحي (Health Check)
// ============================================

app.get('/', (req, res) => res.send('🚀 Smart Proxy is running'));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`✅ Proxy running on port ${port}`));
