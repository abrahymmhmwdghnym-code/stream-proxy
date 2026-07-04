const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(cors());

// ============================================
// 🔍 استخراج الـ Headers لكل موقع
// ============================================

function getHeaders(url) {
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 15; CPH2591 Build/AP3A.240617.008) AppleWebKit/537.36 (KHTML, like Gecko) Abck/4.0 Chrome/149.0.7827.159 Mobile Safari/537.36',
        'Accept': '*/*',
        'Accept-Encoding': 'gzip, deflate',
        'Accept-Language': 'ar-EG,ar;q=0.9,en-EG;q=0.8,en-US;q=0.7,en;q=0.6',
        'X-Requested-With': 'com.mycompany.app.soulbrowser',
        'sec-ch-ua': '"Android WebView";v="149", "Chromium";v="149", "Not)A;Brand";v="24"',
        'sec-ch-ua-mobile': '?1',
        'sec-ch-ua-platform': '"Android"',
        'Sec-Fetch-Site': 'same-site',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Dest': 'empty',
        'Priority': 'u=1, i',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    };

    try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname;

        // ============================================
        // 🎯 vertyuz.xyz (النظام الجديد) - بيشمل كل السب-دومينز زي stm.vertyuz.xyz
        // ============================================
        if (hostname.includes('vertyuz')) {
            headers.Origin = 'https://tv.vertyuz.xyz';
            headers.Referer = 'https://tv.vertyuz.xyz/ch2.php';
        }
        // ============================================
        // 🎯 foozlive.co
        // ============================================
        else if (hostname.includes('foozlive')) {
            headers.Origin = 'https://912acsss8af382.shootny.com';
            headers.Referer = 'https://912acsss8af382.shootny.com/';
        }
        // ============================================
        // 🎯 kora-plus.app
        // ============================================
        else if (hostname.includes('kora-plus')) {
            headers.Origin = `https://${hostname}`;
            headers.Referer = `https://${hostname}/sw.js`;
        }
        // ============================================
        // 🎯 kora-yalla.blog
        // ============================================
        else if (hostname.includes('kora-yalla')) {
            headers.Origin = 'https://news.sites10.top';
            headers.Referer = 'https://news.sites10.top/';
        }
        // ============================================
        // 📌 أي موقع تاني
        // ============================================
        else {
            headers.Origin = `https://${hostname}`;
            headers.Referer = `https://${hostname}/`;
        }
    } catch (e) {
        headers.Origin = 'https://news.sites10.top';
        headers.Referer = 'https://news.sites10.top/';
    }

    return headers;
}

// ============================================
// 🔄 تعديل الروابط الداخلية لـ M3U8
// ============================================

function fixM3U8Links(data, baseUrl, proxyBase) {
    // 1. تعديل روابط .ts
    data = data.replace(/^([^#][^\s]+\.ts[^\s]*)$/gm, (match, p1) => {
        try {
            const absoluteUrl = new URL(p1, baseUrl).href;
            return `${proxyBase}?url=${encodeURIComponent(absoluteUrl)}`;
        } catch (e) {
            return match;
        }
    });

    // 2. تعديل روابط .m3u8 الفرعية
    data = data.replace(/^([^#][^\s]+\.m3u8[^\s]*)$/gm, (match, p1) => {
        try {
            const absoluteUrl = new URL(p1, baseUrl).href;
            return `${proxyBase}?url=${encodeURIComponent(absoluteUrl)}`;
        } catch (e) {
            return match;
        }
    });

    // 3. تعديل روابط .key
    data = data.replace(/URI="([^"]+)"/g, (match, p1) => {
        try {
            const absoluteUrl = new URL(p1, baseUrl).href;
            return `URI="${proxyBase}?url=${encodeURIComponent(absoluteUrl)}"`;
        } catch (e) {
            return match;
        }
    });

    return data;
}

// ============================================
// 📡 متابعة الـ Redirects
// ============================================

async function fetchWithRedirects(url, headers, maxRedirects = 5) {
    let currentUrl = url;

    for (let i = 0; i < maxRedirects; i++) {
        const response = await fetch(currentUrl, { headers, redirect: 'manual' });

        if (response.status === 301 || response.status === 302 || response.status === 307 || response.status === 308) {
            const location = response.headers.get('location') || '';

            if (location.includes('google.com')) {
                throw new Error('BLOCKED_REDIRECT');
            }
            if (!location) {
                return response;
            }

            currentUrl = new URL(location, currentUrl).href;
            continue;
        }

        return response;
    }

    throw new Error('TOO_MANY_REDIRECTS');
}

// ============================================
// 📡 نقطة نهاية الوكيل (Proxy)
// ============================================

app.get('/api/stream', async (req, res) => {
    const rawQuery = req.originalUrl.split('?').slice(1).join('?');
    const urlMatch = rawQuery.match(/^url=(.+)$/);

    if (!urlMatch) {
        return res.status(400).send('Missing url parameter');
    }

    let url = urlMatch[1];
    try {
        url = decodeURIComponent(url);
    } catch (e) {}

    console.log(`🔄 Proxying: ${url}`);

    try {
        const headers = getHeaders(url);
        console.log(`📌 Using Referer: ${headers.Referer}`);
        console.log(`📌 Using Origin: ${headers.Origin}`);

        let response;
        try {
            response = await fetchWithRedirects(url, headers);
        } catch (e) {
            if (e.message === 'BLOCKED_REDIRECT') {
                console.error('❌ تم التحويل إلى جوجل!');
                return res.status(403).send('المحتوى محمي');
            }
            throw e;
        }

        if (!response.ok) {
            console.error(`❌ Response Error: ${response.status}`);
            return res.status(response.status).send(`Error: ${response.status}`);
        }

        const contentType = response.headers.get('content-type') || '';
        const isM3U8 = contentType.includes('mpegurl') || url.toLowerCase().split('?')[0].endsWith('.m3u8');

        const proxyBase = `/api/stream`;
        const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Expose-Headers', 'Content-Length');
        res.setHeader('Cache-Control', 'no-cache');

        // ============================================
        // 🎯 لو كان M3U8 (نص) عدل الروابط جواه
        // ⚠️ أي حاجة تانية (.ts / .key / صور) لازم تتبعت binary
        //    زي ما هي عشان متتبوظش (كانت المشكلة قبل كده)
        // ============================================
        if (isM3U8) {
            let data = await response.text();
            data = fixM3U8Links(data, baseUrl, proxyBase);
            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
            res.send(data);
        } else {
            const buffer = await response.buffer();
            res.setHeader('Content-Type', contentType || 'video/mp2t');
            res.send(buffer);
        }

    } catch (error) {
        console.error('❌ Proxy error:', error);
        res.status(500).send('Proxy error: ' + error.message);
    }
});

// ============================================
// ✅ مسار صحي (Health Check)
// ============================================

app.get('/', (req, res) => res.send('🚀 Proxy is running'));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`✅ Proxy running on port ${port}`));
        
