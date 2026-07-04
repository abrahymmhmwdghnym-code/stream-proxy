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

        // خريطة المواقع المعروفة (Referer مخصص لكل موقع)
        const refererMap = {
            'kora-yalla.blog': 'https://news.sites10.top/',
            'kora-yalla.com': 'https://news.sites10.top/',
            'yalla-shoot.io': 'https://yalla-shoot.io/',
            'yallashoot.live': 'https://yallashoot.live/',
            'koora-live.com': 'https://koora-live.com/',
            'kooora.com': 'https://kooora.com/',
            'kora-plus.app': `${urlObj.protocol}//${urlObj.hostname}/sw.js`,
            'goal.com': 'https://goal.com/',
            'bein.net': 'https://bein.net/',
        };

        for (const [domain, referer] of Object.entries(refererMap)) {
            if (hostname.includes(domain)) {
                return referer;
            }
        }

        // لو مش في القائمة، استخدم الـ Referer العام
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
    // User-Agent متعدد حسب الموقع
    const mobileUA = 'Mozilla/5.0 (Linux; Android 15; CPH2591) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.7827.159 Mobile Safari/537.36';
    const desktopUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36';
    
    try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname;
        // المواقع اللي بتحب الموبايل
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
// 📡 نقطة نهاية الوكيل (Proxy)
// ============================================

app.get('/api/stream', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) {
        return res.status(400).send('Missing url parameter');
    }

    // استخراج الرؤوس المناسبة
    const referer = extractReferer(targetUrl);
    const origin = extractOrigin(targetUrl);
    const userAgent = extractUserAgent(targetUrl);

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
        'X-Requested-With': 'com.mycompany.app.soulbrowser'
    };

    console.log(`🔄 Proxying: ${targetUrl}`);
    console.log(`📌 Using Referer: ${referer}`);
    console.log(`📌 Using Origin: ${origin}`);

    try {
        const response = await fetch(targetUrl, { headers });

        // تحديد نوع المحتوى
        const contentType = targetUrl.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl'
                          : targetUrl.endsWith('.key') ? 'application/octet-stream'
                          : 'video/MP2T';

        res.setHeader('Content-Type', contentType);
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Expose-Headers', 'Content-Length');

        // تدفق البيانات (Stream)
        response.body.pipe(res);
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
