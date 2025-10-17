// --- configurable ---
const CACHE_VERSION = 'boot-001';
const BUNDLE_URL = '/boot/bundle.bin';
const VERSION_KEY = '/__version__';

let loaded = 0;
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
    const data = e.data || {};
    const { clear, disable, version } = data;
    if (clear) {
        clearCache();
    }
    if (disable) {
        mode = 'transparent';
        broadcast('transparent mode');
        unregister();
    } else if (version !== undefined) {
        mode = 'cached';
        log('version', version);
        ensureVersion(version);
    }
});

// --- unregister current service worker ---
async function unregister() {
    await self.registration.unregister();
}

// --- erase existing cache ---
async function clearCache() {
    log('clearing cache');
    await caches.delete(CACHE_VERSION);
}

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
            log(`mismatch ${stored} ≠ ${incomingVersion} → preload`);
            needPreload = true;
        }
    }

    if (needPreload) {
        await preloadBundle();
        await cache.put(
            VERSION_KEY,
            new Response(String(incomingVersion), { headers: { 'Content-Type': 'text/plain' } })
        );
        broadcast(`preload added ${loaded} files`);
    } else {
        broadcast('preload cached');
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

    if (mode == 'transparent') {
        e.respondWith(fetch_safe(e.request));
        return;
    }

    if (url.pathname.endsWith("/")) {
        return e.respondWith(redirectOr404(appendURL(url, 'index.html').pathname));
    } else if (url.pathname.indexOf(".") < 0) {
        return e.respondWith(redirectOr404(appendURL(url, '/index.html').pathname));
    } else {
        e.respondWith(fromCacheOrNetwork(request));
    }
});

// --- helpers ---
function appendURL(url, append) {
    return new URL(url.origin + url.pathname + append + url.search);
}

async function redirectOr404(path) {
    const cache = await caches.open(CACHE_VERSION);
    const hit = await cache.match(path, { ignoreSearch: true });
    if (hit) {
        return Response.redirect(path, 302);
    } else {
        return new Response('Not Found', { status: 404, statusText: 'Not Found' });
    }
}

async function fromCacheOrNetwork(req) {
    const cache = await caches.open(CACHE_VERSION);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) {
        return hit;
    }
    const net = await fetch_safe(req);
    cache.put(req, net.clone());
    log(`put: ${net.url}`);
    return net;
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
    loaded = 0;
    const cache = await caches.open(CACHE_VERSION);
    const res = await fetch(BUNDLE_URL, { cache: 'no-store' });
    const buf = await res.arrayBuffer();
    const files = await unpackBundle(buf);
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
            const resp = new Response(blob, { headers });
            loaded++;
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

    const files = {};
    for (const { name, offset, len } of table)
        files[name] = buf.slice(offset, offset + len);

    return files;
}
