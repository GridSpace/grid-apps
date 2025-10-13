// --- configurable ---
const CACHE_VERSION = 'boot-v001';
const BUNDLE_URL = '/boot/bundle.bin';
const VERSION_KEY = '/__version__';

let mode = 'cached';
let currentVersion = null;

// --- logging ---
const log = (...a) => console.log('[SW]', ...a);
self.addEventListener('install', e => log('install'));
self.addEventListener('activate', e => log('activate'));
// self.addEventListener('fetch', e => log('fetch', e.request.url));

// --- lifecycle ---
self.skipWaiting();
self.addEventListener('activate', e => e.waitUntil(clients.claim()));

// --- mode control ---
self.addEventListener('message', e => {
    log({ message: e.data });
    const data = e.data || {};
    if (data.mode) mode = data.mode;
    if (data.mode === 'cached' && data.version !== undefined) {
        ensureVersion(data.version);
    }
});

// --- version check and preload ---
async function ensureVersion(incomingVersion) {
    const cache = await caches.open(CACHE_VERSION);
    let needPreload = false;

    const existing = await cache.match(VERSION_KEY);
    if (!existing) {
        log('no version stored → preload');
        needPreload = true;
    } else {
        const stored = await existing.text();
        if (stored !== incomingVersion) {
            log(`version mismatch ${stored} ≠ ${incomingVersion} → preload`);
            needPreload = true;
        } else {
            log(`version OK (${stored})`);
        }
    }

    if (needPreload) {
        await preloadBundle();
        await cache.put(
            VERSION_KEY,
            new Response(String(incomingVersion), { headers: { 'Content-Type': 'text/plain' } })
        );
        broadcast('preload-complete');
    } else {
        broadcast('preload-cached');
    }
}

// --- fetch with redirect handler ---
async function fetch_safe(req) {
    const res = await fetch(req);
    if (res.redirected) {
        log({ was_redirected_cloning: res.url });
        // clone into a fresh non-redirect response
        const clone = res.clone();
        return new Response(await clone.blob(), {
            headers: clone.headers,
            status: 200,
            statusText: 'OK'
        });
    }
    return res;
}

// --- fetch handler ---
self.addEventListener('fetch', e => {
    const { request } = e;
    const url = new URL(request.url);

    if (request.method !== 'GET') return;

    if (mode === 'transparent') {
        e.respondWith(fetch_safe(e.request));
        return;
    }

    e.respondWith(fromCacheOrNetwork(request));
});

// --- helpers ---
async function fromCacheOrNetwork(req) {
    const cache = await caches.open(CACHE_VERSION);
    const hit = await cache.match(req);
    if (hit) {
        // log({ hit: hit.url || req.url });
        return hit;
    }
    const net = await fetch_safe(req);
    cache.put(req, net.clone());
    log({ put: net.url });
    return net;
}

async function serveIndex() {
    const cache = await caches.open(CACHE_VERSION);
    const hit = await cache.match('/kiri/index.html');
    log({ serve_index: hit, cache });
    if (hit) return hit;
    return fetch_safe('/kiri/index.html');
}

async function broadcast(message) {
    const clientsList = await clients.matchAll({ type: 'window' });
    for (const client of clientsList) {
        client.postMessage(message);
    }
}

const sec_headers = {
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp'
};

// --- preload & unpack bundle ---
async function preloadBundle() {
    // return;
    const cache = await caches.open(CACHE_VERSION);
    const res = await fetch(BUNDLE_URL, { cache: 'no-store' });
    const buf = await res.arrayBuffer();
    const files = await unpackBundle(buf);
    log({ files });
    await Promise.all(
        Object.entries(files).map(([path, blob]) => {
            const ext = path.split('.').pop();
            const type =
                ext === 'html' ? 'text/html' :
                ext === 'js' ? 'application/javascript' :
                ext === 'css' ? 'text/css' :
                ext === 'json' ? 'application/json' :
                ext === 'wasm' ? 'application/wasm' :
                ext === 'svg' ? 'image/svg+xml' :
                        'application/octet-stream';
            const headers = { 'Content-Type': type, ...sec_headers };
            // Object.assign(headers, sec_headers);
            const resp = new Response(blob, { headers });
            return cache.put('/' + path, resp);
        })
    );
}

// --- simple bundle format ---
// [count:uint32][entries...][file data...]
// entry: [nlen:uint16][name][offset:uint32][length:uint32]
async function unpackBundle(buf) {
    const view = new DataView(buf);
    let pos = 0;
    const count = view.getUint32(pos, true); pos += 4;
    const decoder = new TextDecoder();
    const table = [];

    for (let i = 0; i < count; i++) {
        const nlen = view.getUint16(pos, true); pos += 2;
        const name = decoder.decode(new Uint8Array(buf, pos, nlen)); pos += nlen;
        const offset = view.getUint32(pos, true); pos += 4;
        const len = view.getUint32(pos, true); pos += 4;
        table.push({ name, offset, len });
    }
    log({ table });

    const files = {};
    for (const { name, offset, len } of table)
        files[name] = buf.slice(offset, offset + len);

    return files;
}
