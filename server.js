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
        'User-Agent': 'Mozilla/5.0 (Linux; Android 15; CPH2591 Build/AP3A.240617.008) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.7827.159 Mobile Safari/537.36',
        'Accept': '*/*',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'ar-EG,ar;q=0.9,en-EG;q=0.8,en-US;q=0.7,en;q=0.6',
        'X-Requested-With': 'com.mycompany.app.soulbrowser',
        'Sec-Fetch-Site': 'cross-site',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Dest': 'empty',
        'Priority': 'u=1, i',
        'Cache-Control': 'no-cache'
    };

    try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname;

        // ============================================
        // 🎯 foozlive.co (النظام الجديد)
        // ============================================
        if (hostname.includes('foozlive')) {
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
        // 🎯 vertyuz.xyz
        // ============================================
        else if (hostname.includes('vertyuz')) {
            headers.Origin = `https://${hostname}`;
            headers.Referer = `https://${hostname}/`;
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
    // 1. تعديل روابط .ts (الجزئيات)
    data = data.replace(/^([^#][^\s]+\.ts[^\s]*)$/gm, (match, p1) => {
        try {
            const absoluteUrl = new URL(p1, baseUrl).href;
            return `${proxyBase}?url=${encodeURIComponent(absoluteUrl)}`;
        } catch (e) {
            return match;
        }
    });

    // 2. تعديل روابط .key (مفاتيح التشفير)
    data = data.replace(/URI="([^"]+)"/g, (match, p1) => {
        try {
            const absoluteUrl = new URL(p1, baseUrl).href;
            return `URI="${proxyBase}?url=${encodeURIComponent(absoluteUrl)}"`;
        } catch (e) {
            return match;
        }
    });

    // 3. 🆕 تعديل الروابط الفرعية (Master Playlist - زي الـ HD/SD)
    data = data.replace(/^([^#][^\s]+\.m3u8[^\s]*)$/gm, (match, p1) => {
        try {
            const absoluteUrl = new URL(p1, baseUrl).href;
            return `${proxyBase}?url=${encodeURIComponent(absoluteUrl)}`;
        } catch (e) {
            return match;
        }
    });

    return data;
}

// ============================================
// 📡 نقطة نهاية الوكيل (Proxy)
// ============================================

app.get('/api/stream', async (req, res) => {
    const url = req.query.url;
    if (!url) {
        return res.status(400).send('Missing url parameter');
    }

    console.log(`🔄 Proxying: ${url}`);

    try {
        const headers = getHeaders(url);
        console.log(`📌 Using Referer: ${headers.Referer}`);

        const response = await fetch(url, { 
            headers,
            redirect: 'manual'
        });

        // لو حصل ريديركت لجوجل، نمنعه
        if (response.status === 302 || response.status === 301) {
            const location = response.headers.get('location') || '';
            if (location.includes('google.com')) {
                console.error('❌ تم التحويل إلى جوجل!');
                return res.status(403).send('المحتوى محمي');
            }
        }

        if (!response.ok) {
            console.error(`❌ Response Error: ${response.status}`);
            return res.status(response.status).send(`Error: ${response.status}`);
        }

        const contentType = response.headers.get('content-type') || '';
        let data = await response.text();

        const proxyBase = `/api/stream`;
        const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);

        // لو كان M3U8، عدل الروابط
        if (contentType.includes('mpegurl') || data.trim().startsWith('#EXTM3U')) {
            data = fixM3U8Links(data, baseUrl, proxyBase);
            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        } else {
            res.setHeader('Content-Type', contentType || 'text/plain');
        }

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Expose-Headers', 'Content-Length');
        res.setHeader('Cache-Control', 'no-cache');
        res.send(data);

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
