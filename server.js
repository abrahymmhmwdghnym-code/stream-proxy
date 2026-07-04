const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const crypto = require('crypto');

const app = express();
app.use(cors());

// ============================================
// 🔑 الثوابت
// ============================================
const AUTH_TOKEN = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjo4NDczNSwicm9sZSI6InN0dWRlbnQiLCJ1dWlkIjoiNTY3YjdlZTdlNmUxNTJmYjhjMWQxN2JlZjAxNjUxMDEifQ.NgT1XJYopir7dgNNwpIK-BGbghqwdhw9u-Gf9lrd3Dw';
const CACHE_KEYS = new Map(); // سخان: نخزن المفاتيح هنا عشان ما نطلبش نفس المفتاح مرتين

// ============================================
// 🎯 بناء Headers حسب الـ Domain
// ============================================

function getHeadersForRequest(url) {
    const baseHeaders = {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36',
        'Accept': '*/*',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'ar-EG,ar;q=0.9,en-EG;q=0.8,en-US;q=0.7,en;q=0.6',
        'sec-ch-ua': '"Google Chrome";v="149", "Chromium";v="149", "Not)A;Brand";v="24"',
        'sec-ch-ua-mobile': '?1',
        'sec-ch-ua-platform': '"Android"',
        'Origin': 'https://coursatk.online',
        'Referer': 'https://coursatk.online/',
    };

    // لو الطلب على `api.coursatk.online` (الـ M3U8 والمفتاح)
    if (url.includes('api.coursatk.online')) {
        return {
            ...baseHeaders,
            'Authorization': AUTH_TOKEN,
            'Sec-Fetch-Site': 'same-site',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Dest': 'empty',
            'Priority': 'u=1, i',
        };
    }

    // لو الطلب على `cloud3.cloudfrount.shop` (قطع الفيديو)
    if (url.includes('cloud3.cloudfrount.shop')) {
        return {
            ...baseHeaders,
            'Sec-Fetch-Site': 'cross-site',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Dest': 'empty',
            'Priority': 'u=1, i',
            // ❌ لا نبعت Authorization على CloudFront
        };
    }

    return baseHeaders;
}

// ============================================
// 🔐 جلب المفتاح من الـ Auth Endpoint
// ============================================

async function fetchEncryptionKey(videoHash) {
    // تحقق: هل في سخان؟
    if (CACHE_KEYS.has(videoHash)) {
        console.log(`♻️ استخدام المفتاح من الكاش: ${videoHash}`);
        return CACHE_KEYS.get(videoHash);
    }

    const keyUrl = `https://api.coursatk.online/api/v1/user/auth/${videoHash}`;
    
    try {
        console.log(`🔑 جلب المفتاح من: ${keyUrl}`);
        const headers = getHeadersForRequest(keyUrl);
        
        const response = await fetch(keyUrl, { 
            headers,
            timeout: 10000 
        });

        if (!response.ok) {
            throw new Error(`فشل جلب المفتاح: ${response.status}`);
        }

        const keyBuffer = await response.buffer();
        console.log(`✅ المفتاح جاهز: ${keyBuffer.length} bytes`);
        
        // نخزنه في الكاش (30 دقيقة)
        CACHE_KEYS.set(videoHash, keyBuffer);
        setTimeout(() => CACHE_KEYS.delete(videoHash), 30 * 60 * 1000);
        
        return keyBuffer;
    } catch (error) {
        console.error(`❌ خطأ في جلب المفتاح: ${error.message}`);
        return null;
    }
}

// ============================================
// 📺 جلب M3U8 وتعديله
// ============================================

async function fetchAndModifyM3U8(m3u8Url) {
    try {
        console.log(`📺 جلب M3U8 من: ${m3u8Url}`);
        const headers = getHeadersForRequest(m3u8Url);
        
        const response = await fetch(m3u8Url, { 
            headers,
            timeout: 10000 
        });

        if (!response.ok) {
            throw new Error(`فشل جلب M3U8: ${response.status}`);
        }

        let m3u8Data = await response.text();
        console.log(`✅ M3U8 جاهز (${m3u8Data.length} حرف)`);

        // استخرج رابط المفتاح من الـ M3U8
        // مثال: URI="https://cloud3.cloudfrount.shop/videos/hash/480/key.key?..."
        const keyUrlMatch = m3u8Data.match(/URI="([^"]+)"/);
        let encryptionKey = null;

        if (keyUrlMatch) {
            const keyUrl = keyUrlMatch[1];
            const videoHashMatch = keyUrl.match(/\/videos\/([a-f0-9]+)\//);
            
            if (videoHashMatch) {
                const videoHash = videoHashMatch[1];
                console.log(`🔍 استخرجنا hash الفيديو: ${videoHash}`);
                encryptionKey = await fetchEncryptionKey(videoHash);
            }
        }

        // اآن بنعدل الـ M3U8:
        // 1. نستبدل رابط المفتاح بـ data URI من المفتاح الحقيقي
        if (encryptionKey) {
            const keyBase64 = encryptionKey.toString('base64');
            m3u8Data = m3u8Data.replace(
                /URI="([^"]+)"/g,
                `URI="data:application/octet-stream;base64,${keyBase64}"`
            );
            console.log(`🔐 المفتاح وضع في M3U8`);
        }

        // 2. نعدل روابط القطع عشان تعدي من الـ Proxy بتاعنا
        const baseUrl = m3u8Url.substring(0, m3u8Url.lastIndexOf('/') + 1);
        m3u8Data = m3u8Data.replace(/^([^#][^\s]+)$/gm, (match, url) => {
            // تجاهل التعليقات والعناوين
            if (url.startsWith('#') || url.startsWith('data:')) {
                return match;
            }

            // اذا كان قطعة (seg-, .ts, .m3u8)
            if (/seg-|\.ts$|\.m3u8$/i.test(url)) {
                try {
                    const absoluteUrl = new URL(url, baseUrl).href;
                    return `/api/segment?url=${encodeURIComponent(absoluteUrl)}`;
                } catch (e) {
                    return match;
                }
            }

            return match;
        });

        console.log(`📝 M3U8 عدل وجاهز`);
        return m3u8Data;

    } catch (error) {
        console.error(`❌ خطأ في معالجة M3U8: ${error.message}`);
        return null;
    }
}

// ============================================
// 📥 جلب قطعة من الفيديو
// ============================================

async function fetchSegment(segmentUrl) {
    try {
        console.log(`📥 جلب القطعة من: ${segmentUrl.substring(0, 80)}...`);
        const headers = getHeadersForRequest(segmentUrl);
        
        const response = await fetch(segmentUrl, { 
            headers,
            timeout: 15000 
        });

        if (!response.ok) {
            console.error(`❌ فشل جلب القطعة: ${response.status}`);
            return null;
        }

        const buffer = await response.buffer();
        console.log(`✅ القطعة جاهزة: ${buffer.length} bytes`);
        return buffer;

    } catch (error) {
        console.error(`❌ خطأ في جلب القطعة: ${error.message}`);
        return null;
    }
}

// ============================================
// 🌐 نقاط النهاية (Endpoints)
// ============================================

// 1️⃣ طلب الـ M3U8 المعدل
app.get('/api/m3u8', async (req, res) => {
    const m3u8Url = req.query.url;

    if (!m3u8Url) {
        return res.status(400).json({ error: 'يلزم رابط الـ M3U8' });
    }

    try {
        const decodedUrl = decodeURIComponent(m3u8Url);
        const modifiedM3u8 = await fetchAndModifyM3U8(decodedUrl);

        if (!modifiedM3u8) {
            return res.status(500).json({ error: 'فشل جلب الـ M3U8' });
        }

        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'no-cache, no-store');
        res.send(modifiedM3u8);

    } catch (error) {
        console.error(`❌ خطأ في endpoint M3U8: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// 2️⃣ طلب قطعة من الفيديو
app.get('/api/segment', async (req, res) => {
    const segmentUrl = req.query.url;

    if (!segmentUrl) {
        return res.status(400).json({ error: 'يلزم رابط القطعة' });
    }

    try {
        const decodedUrl = decodeURIComponent(segmentUrl);
        const segmentBuffer = await fetchSegment(decodedUrl);

        if (!segmentBuffer) {
            return res.status(500).json({ error: 'فشل جلب القطعة' });
        }

        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.setHeader('Content-Length', segmentBuffer.length);
        res.send(segmentBuffer);

    } catch (error) {
        console.error(`❌ خطأ في endpoint القطعة: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// 3️⃣ Health Check
app.get('/', (req, res) => {
    res.json({
        status: '✅ الوكيل شغال',
        endpoints: {
            m3u8: '/api/m3u8?url=...',
            segment: '/api/segment?url=...'
        }
    });
});

// ============================================
// 🚀 تشغيل السيرفر
// ============================================

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`✅ الوكيل شغال على البورت ${port}`);
    console.log(`📍 افتح: http://localhost:${port}`);
});
                    
