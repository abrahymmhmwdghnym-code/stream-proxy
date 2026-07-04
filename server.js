const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const https = require('https');
const crypto = require('crypto');

const app = express();
app.use(cors());

// ============================================
// 🔐 Agent لتجاوز مشاكل SSL
// ============================================
const agent = new https.Agent({
    rejectUnauthorized: false,
    keepAlive: true
});

// ============================================
// 🔍 استخراج الـ Headers لكل موقع
// ============================================

function getHeaders(url) {
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 15; CPH2591 Build/AP3A.240617.008) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.7827.159 Mobile Safari/537.36',
        'Accept': '*/*',
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
// 🔧 تحويل Hex إلى Buffer
// ============================================

function hexToBuffer(hex) {
    if (!hex) return null;
    const clean = hex.replace(/^0x/, '');
    return Buffer.from(clean, 'hex');
}

// ============================================
// 🔑 استخراج المفتاح من الـ M3U8
// ============================================

async function fetchKey(keyUrl, headers) {
    try {
        const response = await fetch(keyUrl, { headers, agent });
        if (!response.ok) throw new Error(`Key fetch failed: ${response.status}`);
        return Buffer.from(await response.arrayBuffer());
    } catch (error) {
        console.error('❌ Key fetch error:', error);
        return null;
    }
}

// ============================================
// 🔄 تعديل الـ M3U8 مع فك التشفير
// ============================================

async function processM3U8(data, baseUrl, proxyBase, headers) {
    // 1. استخرج الـ Key و IV
    const keyMatch = data.match(/URI="([^"]+)"/);
    const ivMatch = data.match(/IV=0x([0-9a-fA-F]+)/);
    
    let key = null;
    let iv = null;
    
    if (keyMatch) {
        const keyUrl = new URL(keyMatch[1], baseUrl).href;
        key = await fetchKey(keyUrl, headers);
        if (key) {
            console.log(`✅ Key fetched: ${key.length} bytes`);
        }
    }
    
    if (ivMatch) {
        iv = hexToBuffer(ivMatch[1]);
        console.log(`✅ IV: ${iv ? iv.toString('hex') : 'null'}`);
    }
    
    // 2. عدل روابط .ts عشان تعدي على الـ Proxy
    let modified = data.replace(/^([^#][^\s]+\.ts[^\s]*)$/gm, (match, p1) => {
        try {
            const absoluteUrl = new URL(p1, baseUrl).href;
            // لو عندنا مفتاح، نمرر المفتاح والـ IV مع الطلب
            let url = `${proxyBase}?url=${encodeURIComponent(absoluteUrl)}`;
            if (key) {
                url += `&key=${key.toString('base64')}`;
                if (iv) url += `&iv=${iv.toString('hex')}`;
            }
            return url;
        } catch (e) {
            return match;
        }
    });
    
    // 3. عدل روابط .key (مفاتيح التشفير)
    modified = modified.replace(/URI="([^"]+)"/g, (match, p1) => {
        try {
            const absoluteUrl = new URL(p1, baseUrl).href;
            return `URI="${proxyBase}?url=${encodeURIComponent(absoluteUrl)}"`;
        } catch (e) {
            return match;
        }
    });
    
    // 4. عدل الروابط الفرعية (Master Playlist)
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
// 🎬 معالجة طلب الـ .ts (فك التشفير)
// ============================================

async function decryptSegment(encryptedData, keyBase64, ivHex) {
    try {
        const key = Buffer.from(keyBase64, 'base64');
        const iv = Buffer.from(ivHex, 'hex');
        
        // التحقق من طول المفتاح (يجب أن يكون 16 بايت لـ AES-128)
        if (key.length !== 16) {
            console.warn(`⚠️ Key length is ${key.length}, expected 16`);
        }
        
        // التحقق من طول الـ IV (يجب أن يكون 16 بايت)
        if (iv.length !== 16) {
            console.warn(`⚠️ IV length is ${iv.length}, expected 16`);
        }
        
        // فك التشفير باستخدام AES-128-CBC
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
// 📡 نقطة نهاية الوكيل (Proxy)
// ============================================

app.get('/api/stream', async (req, res) => {
    const url = req.query.url;
    const key = req.query.key; // مفتاح base64
    const iv = req.query.iv; // IV hex
    
    if (!url) {
        return res.status(400).send('Missing url parameter');
    }

    console.log(`🔄 Proxying: ${url}`);
    if (key) console.log(`🔑 Key provided: ${key.length} chars`);
    if (iv) console.log(`🔐 IV provided: ${iv}`);

    try {
        const headers = getHeaders(url);
        console.log(`📌 Using Referer: ${headers.Referer}`);

        // ============================================
        // 🔥 لو الطلب جاي من ملف .ts مع مفتاح → فك التشفير
        // ============================================
        if (key && iv && (url.includes('.ts') || url.includes('max1-'))) {
            console.log('🔓 Decrypting segment...');
            
            const response = await fetch(url, { headers, agent });
            if (!response.ok) {
                console.error(`❌ Response Error: ${response.status}`);
                return res.status(response.status).send(`Error: ${response.status}`);
            }
            
            const encryptedData = await response.arrayBuffer();
            const decrypted = await decryptSegment(Buffer.from(encryptedData), key, iv);
            
            if (decrypted) {
                res.setHeader('Content-Type', 'video/MP2T');
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('Cache-Control', 'no-cache');
                return res.send(decrypted);
            } else {
                // لو فشل فك التشفير، نرجع البيانات المشفرة (قد تشتغل في بعض المشغلات)
                console.warn('⚠️ Decryption failed, returning encrypted data');
                res.setHeader('Content-Type', 'video/MP2T');
                res.setHeader('Access-Control-Allow-Origin', '*');
                return res.send(Buffer.from(encryptedData));
            }
        }

        // ============================================
        // 📄 الطلب العادي (M3U8 أو Key)
        // ============================================
        const response = await fetch(url, { headers, agent });

        if (!response.ok) {
            console.error(`❌ Response Error: ${response.status}`);
            return res.status(response.status).send(`Error: ${response.status}`);
        }

        const contentType = response.headers.get('content-type') || '';
        let data = await response.text();

        const proxyBase = `/api/stream`;
        const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);

        // ============================================
        // 🎯 لو كان M3U8، عدله وضيف المفاتيح
        // ============================================
        if (contentType.includes('mpegurl') || data.trim().startsWith('#EXTM3U')) {
            data = await processM3U8(data, baseUrl, proxyBase, headers);
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

app.get('/', (req, res) => res.send('🚀 Smart Proxy is running'));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`✅ Proxy running on port ${port}`));
