#!/usr/bin/env node
// Bridges Kiri:Moto's OctoPrint-format file send to CNCjs's /api/gcode endpoint.
// No external dependencies — uses only Node.js built-ins.

const http = require('http');

const CNCJS = 'http://127.0.0.1:8000';
const PORT = 5310;

let cachedToken = null;

// Parse multipart/form-data body, return { filename, content } for the first file field
function parseMultipart(body, contentType) {
    const match = contentType.match(/boundary=([^\s;]+)/);
    if (!match) throw new Error('no boundary in content-type');
    const boundary = '--' + match[1];
    const parts = body.split(boundary).slice(1); // skip preamble
    for (const part of parts) {
        if (part.startsWith('--')) break; // epilogue
        const split = part.indexOf('\r\n\r\n');
        if (split === -1) continue;
        const headers = part.slice(0, split);
        // strip leading \r\n and trailing \r\n before next boundary
        const content = part.slice(split + 4, part.lastIndexOf('\r\n'));
        const dispMatch = headers.match(/Content-Disposition:[^\r\n]*name="file"[^\r\n]*/i);
        if (!dispMatch) continue;
        const fnMatch = headers.match(/filename="([^"]+)"/i);
        return { filename: fnMatch ? fnMatch[1] : 'kiri.gcode', content };
    }
    throw new Error('no file field in multipart body');
}

function post(url, body, headers = {}) {
    return new Promise((resolve, reject) => {
        const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
        const u = new URL(url);
        const req = http.request({
            hostname: u.hostname, port: u.port || 80, path: u.pathname,
            method: 'POST',
            headers: { 'Content-Length': buf.length, ...headers }
        }, res => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }));
        });
        req.on('error', reject);
        req.write(buf);
        req.end();
    });
}

function get(url, headers = {}) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        http.get({ hostname: u.hostname, port: u.port || 80, path: u.pathname, headers }, res => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }));
        }).on('error', reject);
    });
}

async function getToken() {
    if (cachedToken) return cachedToken;
    const res = await post(`${CNCJS}/api/signin`, JSON.stringify({ token: '' }), {
        'Content-Type': 'application/json'
    });
    cachedToken = JSON.parse(res.body).token;
    return cachedToken;
}

async function getPort(token) {
    const res = await get(`${CNCJS}/api/controllers`, { Authorization: `Bearer ${token}` });
    const data = JSON.parse(res.body);
    const ports = Array.isArray(data) ? data.map(c => c.port) : Object.keys(data);
    return ports.find(Boolean) || null;
}

function cors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Api-Key, Authorization');
}

const server = http.createServer((req, res) => {
    cors(res);
    if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

    const isUpload = req.url === '/api/files/local' || req.url === '/server/files/upload';
    if (req.method !== 'POST' || !isUpload) {
        res.writeHead(404); res.end('not found'); return;
    }

    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', async () => {
        try {
            const body = Buffer.concat(chunks).toString('binary');
            const { filename, content } = parseMultipart(body, req.headers['content-type'] || '');
            const token = await getToken();
            const port = await getPort(token);
            if (!port) {
                res.writeHead(503);
                res.end(JSON.stringify({ error: 'No connected CNCjs controller — connect to a machine in CNCjs first.' }));
                return;
            }
            const payload = JSON.stringify({ port, name: filename, gcode: content });
            const result = await post(`${CNCJS}/api/gcode`, payload, {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            });
            console.log(`[bridge] sent ${filename} to CNCjs port ${port} → ${result.status}`);
            res.writeHead(result.status < 300 ? 200 : result.status);
            res.end(result.body);
        } catch (e) {
            console.error('[bridge] error:', e.message);
            cachedToken = null;
            res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
        }
    });
});

server.listen(PORT, () => console.log(`[bridge] kiri→cncjs bridge listening on :${PORT}`));
