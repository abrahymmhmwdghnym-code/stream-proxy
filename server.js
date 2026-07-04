const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(cors());

app.get('/api/stream', async (req, res) => {
    const url = req.query.url;
    if (!url) return res.status(400).send('Missing url');

    const headers = {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36',
        'Origin': 'https://news.sites10.top',
        'Referer': 'https://news.sites10.top/',
        'Accept': '*/*'
    };

    try {
        const response = await fetch(url, { headers });
        response.body.pipe(res);
    } catch (error) {
        res.status(500).send('Error');
    }
});

app.get('/', (req, res) => res.send('Proxy is running'));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Running on port ${port}`));
