// --- configurable ---
const CACHE_VERSION = 'boot';
const VERSION_KEY = '/__version__';
const cacheOpen = caches.open(CACHE_VERSION);

let loaded = 0;
let debug = false;
let mode = 'cached';
let BUNDLE_URL = '/boot/bundle.bin';

// --- logging ---
const log = (...a) => console.log('[SW]', ...a);
log('cache version', CACHE_VERSION);

// --- lifecycle ---
self.addEventListener('install', _install);
self.addEventListener('activate', _activate);
self.addEventListener('fetch', _fetch);
self.skipWaiting();

// --- mode control ---
self.addEventListener('message', e => {
    const data = e.data || {};
    const { clear, disable, version } = data;
    debug = data.debug ?? debug;
    if (clear) {
        clearCache();
    }
    if (disable) {
        mode = 'transparent';
        broadcast('transparent mode');
        unregister();
    } else if (version !== undefined) {
        mode = 'cached';
        BUNDLE_URL = `/boot/bundle-${version}.bin`;
        log('version', version);
        ensureVersion(version);
    } else if (data.mode) {
        mode = data.mode;
    }
});

async function _install(e) {
    log('install');
    if (e.addRoutes) {
        for (let pre of ["font","mesh","kiri","lib","wasm"]) {
            e.addRoutes({
                condition: { urlPattern: new URLPattern({ pathname: `/${pre}/.*` }) },
                source: { cacheName: CACHE_VERSION }
            });
        }
    }
}

async function _activate(event) {
    log('activate');
    event.waitUntil(clients.claim())
}

// --- unregister current service worker ---
async function unregister() {
    await self.registration.unregister();
}

// --- cache helpers ---
async function cacheGetText(key) {
    const cache = await cacheOpen;
    const entry = await cache.match(key);
    if (entry) {
        return entry.text();
    } else {
        return undefined;
    }
}

async function cachePutText(key, value) {
    const cache = await cacheOpen;
    return cache.put( key, new Response(String(value), {
        headers: { 'Content-Type': 'text/plain' }
    }) );
}

async function clearCache() {
    log('clearing cache');
    await caches.delete(CACHE_VERSION);
}

// --- version check and preload ---
async function ensureVersion(incomingVersion) {
    const cache = await cacheOpen;
    let needPreload = false;

    const existing = await cacheGetText(VERSION_KEY);
    if (!existing) {
        log('no version stored → preload');
        needPreload = true;
    } else {
        // const stored = await existing.text();
        if (existing !== incomingVersion) {
            log(`mismatch ${existing} ≠ ${incomingVersion} → preload`);
            needPreload = true;
        }
    }

    if (needPreload) {
        await preloadBundle();
        await cachePutText(VERSION_KEY, incomingVersion);
        broadcast(`preload added ${loaded} files`);
    } else {
        broadcast('preload cached');
    }
}

// --- fetch with redirect handler ---
async function fetch_safe(req) {
    const res = await fetch(req);
    if (res.redirected) {
        log({ redirect_clone: res.url });
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
async function _fetch(e) {
    const { request } = e;
    const url = new URL(request.url);

    if (debug) log({ method: request.method, url: request.url });

    if (request.method !== 'GET') return;

    if (mode == 'transparent') {
        e.respondWith(fetch(e.request));
        return;
    }

    if (url.pathname.endsWith("/")) {
        return e.respondWith(redirectToUrl(appendURL(url, 'index.html').pathname, request));
    } else if (url.pathname.indexOf(".") < 0 || url.pathname.endsWith("/boot")) {
        return e.respondWith(redirectToUrl(appendURL(url, '/index.html').pathname, request));
    } else {
        e.respondWith(fromCacheOrNetwork(request));
    }
}

// --- helpers ---
function appendURL(url, append) {
    return new URL(url.origin + url.pathname + append + url.search);
}

async function redirectToUrl(path, request) {
    if (debug) log('REDIRECT', path);
    return Response.redirect(path, 302);
}

async function fromCacheOrNetwork(req) {
    const cache = await cacheOpen;
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) {
        if (debug) log('CACHE HIT', req.url);
        return hit;
    }
    if (debug) log('CACHE MISS', req.url);
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
    const cache = await cacheOpen;
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
