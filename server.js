const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const crypto = require('crypto');

const app = express();
app.use(cors());

// ============================================
// 🔍 استخراج الـ Headers لكل موقع
// ============================================

function getHeaders(url) {
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 15; CPH2591 Build/AP3A.240617.008) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.7827.159 Mobile Safari/537.36',
        'Accept': '*/*',
        // ⚠️ من غير br/zstd عشان node-fetch v2 مش بيفك ضغطهم (هترجع بيانات تالفة لو سابناهم)
        'Accept-Encoding': 'gzip, deflate',
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

        if (hostname.includes('foozlive')) {
            headers.Origin = 'https://912acsss8af382.shootny.com';
            headers.Referer = 'https://912acsss8af382.shootny.com/';
        } else if (hostname.includes('kora-plus')) {
            headers.Origin = `https://${hostname}`;
            headers.Referer = `https://${hostname}/sw.js`;
        } else if (hostname.includes('kora-yalla')) {
            headers.Origin = 'https://news.sites10.top';
            headers.Referer = 'https://news.sites10.top/';
        } else if (hostname.includes('vertyuz')) {
            headers.Origin = `https://${hostname}`;
            headers.Referer = `https://${hostname}/`;
        } else {
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
// 🔧 Hex → Buffer
// ============================================

function hexToBuffer(hex) {
    if (!hex) return null;
    const clean = hex.replace(/^0x/i, '');
    return Buffer.from(clean, 'hex');
}

// ============================================
// 🔑 جلب مفتاح التشفير (لو موجود)
// ============================================

async function fetchKey(keyUrl, headers) {
    try {
        const response = await fetch(keyUrl, { headers });
        if (!response.ok) throw new Error(`Key fetch failed: ${response.status}`);
        return Buffer.from(await response.arrayBuffer());
    } catch (error) {
        console.error('❌ Key fetch error:', error);
        return null;
    }
}

// ============================================
// 🔄 تعديل الـ M3U8 (بيدعم سيجمنتات من غير امتداد .ts + فك التشفير الاختياري)
// ============================================

async function processM3U8(data, baseUrl, proxyBase, headers) {
    // 1. لو فيه EXT-X-KEY، جيب الـ key والـ IV
    const keyLineMatch = data.match(/#EXT-X-KEY:.*URI="([^"]+)"/);
    const ivMatch = data.match(/IV=0x([0-9a-fA-F]+)/i);

    let key = null;
    let iv = null;

    if (keyLineMatch) {
        const keyUrl = new URL(keyLineMatch[1], baseUrl).href;
        key = await fetchKey(keyUrl, headers);
        if (key) console.log(`✅ Key fetched: ${key.length} bytes`);
    }
    if (ivMatch) {
        iv = hexToBuffer(ivMatch[1]);
        console.log(`✅ IV: ${iv ? iv.toString('hex') : 'null'}`);
    }

    // 2. سيجمنتات: أي سطر مش تعليق (#) ومش .m3u8 — يشمل روابط من غير امتداد (زي /image/uuid المتنكرة)
    let modified = data.replace(/^([^#][^\s]+)$/gm, (match, p1) => {
        if (p1.includes('.m3u8')) return match; // سيبها للخطوة اللي بعدها
        try {
            const absoluteUrl = new URL(p1, baseUrl).href;
            let proxied = `${proxyBase}?url=${encodeURIComponent(absoluteUrl)}`;
            if (key) {
                proxied += `&key=${encodeURIComponent(key.toString('base64'))}`;
                if (iv) proxied += `&iv=${iv.toString('hex')}`;
            }
            return proxied;
        } catch (e) {
            return match;
        }
    });

    // 3. روابط الـ .key نفسها تتحول عن طريق البروكسي برضه (بس من غير ما نحاول نفك تشفيرها هي نفسها)
    modified = modified.replace(/URI="([^"]+)"/g, (match, p1) => {
        try {
            const absoluteUrl = new URL(p1, baseUrl).href;
            return `URI="${proxyBase}?url=${encodeURIComponent(absoluteUrl)}"`;
        } catch (e) {
            return match;
        }
    });

    // 4. الـ Master Playlist (روابط .m3u8 فرعية)
    modified = modified.replace(/^([^#][^\s]+\.m3u8[^\s]*)$/gm, (match, p1) => {
        try {
            const absoluteUrl = new URL(p1, baseUrl).href;
            return `${proxyBase}?url=${encodeURIComponent(absoluteUrl)}`;
        } catch (e) {
            return match;
        }
    });

    return modified;
}

// ============================================
// 🔓 فك تشفير AES-128-CBC لسيجمنت
// ============================================

function decryptSegment(encryptedData, keyBase64, ivHex) {
    try {
        const key = Buffer.from(keyBase64, 'base64');
        const iv = Buffer.from(ivHex, 'hex');

        if (key.length !== 16) console.warn(`⚠️ Key length is ${key.length}, expected 16`);
        if (iv.length !== 16) console.warn(`⚠️ IV length is ${iv.length}, expected 16`);

        const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
        decipher.setAutoPadding(true);

        let decrypted = decipher.update(encryptedData);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted;
    } catch (error) {
        console.error('❌ Decryption error:', error);
        return null;
    }
}

// ============================================
// 🔁 فولو للـ redirects (ما عدا التحويل لجوجل)
// ============================================

async function fetchWithRedirects(url, headers, maxRedirects = 5) {
    let currentUrl = url;

    for (let i = 0; i < maxRedirects; i++) {
        const response = await fetch(currentUrl, { headers, redirect: 'manual' });

        if ([301, 302, 307, 308].includes(response.status)) {
            const location = response.headers.get('location') || '';
            if (location.includes('google.com')) throw new Error('BLOCKED_REDIRECT');
            if (!location) return response;
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
    // استخراج الـ url يدويًا من raw query string عشان الـ & جوه اللينك الأصلي متتقطعش
    const rawQuery = req.originalUrl.split('?').slice(1).join('?');
    const urlMatch = rawQuery.match(/^url=([^&]+(?:&(?!key=|iv=)[^&]*)*)/);
    // ملحوظة: لو عندك key/iv كـ query params منفصلة (من السيجمنت نفسه)، بنستثنيهم من الـ url match

    if (!urlMatch) {
        return res.status(400).send('Missing url parameter');
    }

    let url = urlMatch[1];
    try { url = decodeURIComponent(url); } catch (e) {}

    // key و iv بييجوا كـ query params منفصلة على الطلب الخاص بالسيجمنت (مش جوه الـ url المشفر)
    const afterUrlParams = rawQuery.slice(rawQuery.indexOf(urlMatch[0]) + urlMatch[0].length);
    const keyParam = new URLSearchParams(afterUrlParams.replace(/^&/, '')).get('key');
    const ivParam = new URLSearchParams(afterUrlParams.replace(/^&/, '')).get('iv');

    console.log(`🔄 Proxying: ${url}`);
    if (keyParam) console.log(`🔑 Key provided (${keyParam.length} chars)`);

    try {
        const headers = getHeaders(url);
        console.log(`📌 Using Referer: ${headers.Referer}`);

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

        // ============================================
        // 🔓 لو الطلب ده لسيجمنت ومعاه مفتاح فك تشفير
        // ============================================
        if (keyParam && ivParam) {
            const encryptedData = Buffer.from(await response.arrayBuffer());
            const decrypted = decryptSegment(encryptedData, keyParam, ivParam);

            res.setHeader('Content-Type', 'video/MP2T');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Cache-Control', 'no-cache');
            return res.send(decrypted || encryptedData);
        }

        // ============================================
        // 📄 طلب عادي (M3U8 أو سيجمنت من غير تشفير)
        // ============================================
        const contentType = response.headers.get('content-type') || '';

        // لو مش نص (يعني سيجمنت فيديو خام)، ابعته زي ما هو كـ binary من غير تحويله لـ text
        const looksLikeManifest = contentType.includes('mpegurl');

        if (looksLikeManifest) {
            let data = await response.text();
            const proxyBase = `/api/stream`;
            const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);
            data = await processM3U8(data, baseUrl, proxyBase, headers);

            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Expose-Headers', 'Content-Length');
            res.setHeader('Cache-Control', 'no-cache');
            return res.send(data);
        }

        // ممكن يكون سيجمنت من غير content-type واضح لكن النص بيبدأ بـ #EXTM3U
        const buffer = Buffer.from(await response.arrayBuffer());
        const asText = buffer.toString('utf8', 0, Math.min(20, buffer.length));

        if (asText.startsWith('#EXTM3U')) {
            let data = buffer.toString('utf8');
            const proxyBase = `/api/stream`;
            const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);
            data = await processM3U8(data, baseUrl, proxyBase, headers);

            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Cache-Control', 'no-cache');
            return res.send(data);
        }

        // سيجمنت فيديو خام (binary) — يتبعت زي ما هو من غير أي تحويل نصي
        res.setHeader('Content-Type', contentType || 'video/MP2T');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Expose-Headers', 'Content-Length');
        res.setHeader('Cache-Control', 'no-cache');
        res.send(buffer);

    } catch (error) {
        console.error('❌ Proxy error:', error);
        res.status(500).send('Proxy error: ' + error.message);
    }
});

app.get('/', (req, res) => res.send('🚀 Proxy is running'));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`✅ Proxy running on port ${port}`));
