const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(cors());

// ============================================
// 🔑 التوكن الثابت (من الطلب)
// ============================================
const AUTH_TOKEN = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjo4NDczNSwicm9sZSI6InN0dWRlbnQiLCJ1dWlkIjoiNTY3YjdlZTdlNmUxNTJmYjhjMWQxN2JlZjAxNjUxMDEifQ.NgT1XJYopir7dgNNwpIK-BGbghqwdhw9u-Gf9lrd3Dw';

// ============================================
// 🔍 استخراج الـ Headers المناسبة
// ============================================

function getHeaders(url) {
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36',
        'Accept': '*/*',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'ar-EG,ar;q=0.9,en-EG;q=0.8,en-US;q=0.7,en;q=0.6',
        'Sec-Fetch-Site': 'same-site',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Dest': 'empty',
        'Priority': 'u=1, i',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Origin': 'https://coursatk.online',
        'Referer': 'https://coursatk.online/'
    };

    // لو الرابط فيه api.coursatk.online، نضيف التوكن
    if (url && url.includes('api.coursatk.online')) {
        headers['Authorization'] = AUTH_TOKEN;
    }

    // لو الرابط فيه cloud3.cloudfrount.shop (قطع الفيديو)، نشيل التوكن
    if (url && url.includes('cloud3.cloudfrount.shop')) {
        delete headers.Authorization;
        headers['Sec-Fetch-Site'] = 'cross-site';
    }

    return headers;
}

// ============================================
// 🔑 دالة جلب المفتاح من السيرفر
// ============================================

async function fetchKey(keyUrl) {
    try {
        console.log(`🔑 جاري جلب المفتاح من: ${keyUrl}`);
        const headers = getHeaders(keyUrl);
        const response = await fetch(keyUrl, { headers });
        
        if (!response.ok) {
            throw new Error(`فشل جلب المفتاح: ${response.status}`);
        }
        
        const buffer = await response.arrayBuffer();
        console.log(`✅ تم جلب المفتاح: ${buffer.byteLength} بايت`);
        return Buffer.from(buffer);
    } catch (error) {
        console.error('❌ خطأ في جلب المفتاح:', error.message);
        return null;
    }
}

// ============================================
// 🔄 تعديل الـ M3U8 (بيعدل الروابط ويضيف المفتاح)
// ============================================

async function fixM3U8Links(data, baseUrl, proxyBase) {
    let modifiedData = data;
    let keyBase64 = null;

    // ============================================
    // 👣 الخطوة 1: استخراج رابط المفتاح من الـ M3U8
    // ============================================
    const keyMatch = data.match(/URI="([^"]+)"/);
    
    if (keyMatch) {
        const keyUrl = keyMatch[1];
        console.log(`🔑 تم العثور على رابط المفتاح: ${keyUrl}`);
        
        // جلب المفتاح من السيرفر
        const keyBuffer = await fetchKey(keyUrl);
        if (keyBuffer) {
            keyBase64 = keyBuffer.toString('base64');
            console.log(`🔑 المفتاح تم تحويله لـ base64: ${keyBase64.substring(0, 20)}...`);
        }
    } else {
        console.warn('⚠️ لا يوجد مفتاح في الـ M3U8');
    }

    // ============================================
    // 👣 الخطوة 2: تعديل روابط القطع (.woff2, .ts)
    // ============================================
    modifiedData = modifiedData.replace(/^([^#][^\s]+)$/gm, (match, p1) => {
        // نفحص إذا كان الرابط يبدو كمقطع فيديو
        const isSegment = p1.includes('seg-') || 
                          p1.includes('.ts') || 
                          p1.includes('.m3u8') ||
                          p1.includes('.key') ||
                          p1.includes('.woff2') ||
                          /seg-\d+/.test(p1);
        
        if (isSegment) {
            try {
                const absoluteUrl = new URL(p1, baseUrl).href;
                return `${proxyBase}?url=${encodeURIComponent(absoluteUrl)}`;
            } catch (e) {
                return match;
            }
        }
        return match;
    });

    // ============================================
    // 👣 الخطوة 3: إضافة المفتاح في الـ M3U8
    // ============================================
    if (keyBase64) {
        modifiedData = modifiedData.replace(/URI="([^"]+)"/g, () => {
            return `URI="data:text/plain;base64,${keyBase64}"`;
        });
        console.log('✅ تم إضافة المفتاح في الـ M3U8');
    }

    return modifiedData;
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

    console.log(`🔄 جاري الـ Proxy: ${url}`);

    try {
        const headers = getHeaders(url);
        const response = await fetchWithRedirects(url, headers);

        if (!response.ok) {
            console.error(`❌ خطأ في الرد: ${response.status}`);
            return res.status(response.status).send(`Error: ${response.status}`);
        }

        const contentType = response.headers.get('content-type') || '';
        let data = await response.text();

        const proxyBase = `/api/stream`;
        const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);

        // ============================================
        // 🎯 لو كان M3U8، نعدله
        // ============================================
        if (contentType.includes('mpegurl') || data.trim().startsWith('#EXTM3U')) {
            console.log('📄 تم استلام M3U8، جاري التعديل...');
            data = await fixM3U8Links(data, baseUrl, proxyBase);
            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        } else {
            res.setHeader('Content-Type', contentType || 'text/plain');
        }

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Expose-Headers', 'Content-Length');
        res.setHeader('Cache-Control', 'no-cache');
        res.send(data);

    } catch (error) {
        console.error('❌ خطأ في الـ Proxy:', error.message);
        res.status(500).send('Proxy error: ' + error.message);
    }
});

// ============================================
// ✅ مسار صحي (Health Check)
// ============================================

app.get('/', (req, res) => res.send('🚀 Smart Proxy is running'));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`✅ Proxy running on port ${port}`));
