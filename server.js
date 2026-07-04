const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(cors());

// دالة الـ Headers للحفاظ على هوية الطلب
function getHeaders(url) {
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 15; CPH2591 Build/AP3A.240617.008) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.7827.159 Mobile Safari/537.36',
        'Accept': '*/*',
        'Referer': 'https://912acsss8af382.shootny.com/',
        'Origin': 'https://912acsss8af382.shootny.com'
    };
    return headers;
}

// دالة تعديل روابط .ts فقط
function fixM3U8Links(data, baseUrl, proxyBase) {
    // نعدل روابط الـ .ts لتمُر عبر الـ Proxy الخاص بك
    return data.replace(/^([^#][^\s]+\.ts[^\s]*)$/gm, (match, p1) => {
        try {
            const absoluteUrl = new URL(p1, baseUrl).href;
            return `${proxyBase}?url=${encodeURIComponent(absoluteUrl)}`;
        } catch (e) {
            return match;
        }
    });
}

app.get('/api/stream', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send('Missing url parameter');

    try {
        const headers = getHeaders(targetUrl);
        const response = await fetch(targetUrl, { headers });

        if (!response.ok) return res.status(response.status).send('Fetch error');

        const contentType = response.headers.get('content-type') || '';
        let data = await response.text();

        // إذا كان الملف M3U8، نقوم بتعديل الروابط الداخلية
        if (contentType.includes('mpegurl') || data.trim().startsWith('#EXTM3U')) {
            const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);
            const proxyBase = `/api/stream`;
            data = fixM3U8Links(data, baseUrl, proxyBase);
            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        } else {
            res.setHeader('Content-Type', contentType);
        }

        res.send(data);
    } catch (error) {
        res.status(500).send('Proxy error: ' + error.message);
    }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`✅ Proxy running on port ${port}`));
                                 
