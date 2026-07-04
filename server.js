const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(cors());

// ============================================
// 🧠 استخراج الـ Headers المناسبة تلقائياً
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
        const mobileSites = ['kora-plus', 'yalla-shoot', 'yallashoot'];
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

    const referer = extractReferer(targetUrl);
    const origin = extractOrigin(targetUrl);
    const userAgent = extractUserAgent(targetUrl);

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
        'X-Requested-With': 'com.mycompany.app.soulbrowser'
    };

    console.log(`🔄 Proxying: ${targetUrl}`);
    console.log(`📌 Using Referer: ${referer}`);

    try {
        const response = await fetch(targetUrl, { headers });
        const contentType = response.headers.get('content-type') || '';

        // ============================================
        // 🔥 حالة خاصة: الرابط مش M3U8 (صفحة HTML)
        // ============================================
        if (!targetUrl.includes('.m3u8') && contentType.includes('text/html')) {
            const html = await response.text();
            const m3u8Url = extractM3U8FromHTML(html, targetUrl);

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
        // 🎯 الحالة العادية: الرابط M3U8 (شغال زي الأول)
        // ============================================
        const data = await response.text();

        // لو مش M3U8 حقيقي، حاول تستخرج الرابط
        if (!data.trim().startsWith('#EXTM3U')) {
            const m3u8Url = extractM3U8FromHTML(data, targetUrl);
            if (m3u8Url) {
                console.log(`✅ Found M3U8 in response: ${m3u8Url}`);
                return res.redirect(`/api/stream?url=${encodeURIComponent(m3u8Url)}`);
            }
        }

        // عدل الروابط الداخلية (نفس النظام القديم)
        const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);
        const modified = data
            .replace(/^([^#][^\s]+\.ts)$/gm, (match, p1) => {
                const absoluteUrl = new URL(p1, baseUrl).href;
                return `/api/stream?url=${encodeURIComponent(absoluteUrl)}`;
            })
            .replace(/URI="([^"]+)"/g, (match, p1) => {
                const absoluteUrl = new URL(p1, baseUrl).href;
                return `URI="/api/stream?url=${encodeURIComponent(absoluteUrl)}"`;
            });

        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.send(modified);

    } catch (error) {
        console.error('❌ Proxy error:', error);
        res.status(500).send('Proxy error');
    }
});

// ============================================
// ✅ مسار صحي (Health Check)
// ============================================

app.get('/', (req, res) => res.send('🚀 Smart Proxy is running'));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`✅ Proxy running on port ${port}`));
