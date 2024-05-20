// code for a ServiceWorker that provides support for running cached/offline

const version = self.gapp.version;
const origin = self.location.origin;
const stats = {
    hit: 0,
    miss: 0,
    fetch: 0,
    cache: 0,
    bypass: 0,
    preload: 0,
    timer: undefined
};

function debug() {
    console.log(`[${version}]`, ...arguments);
}

function update() {
    clearTimeout(stats.timer);
    stats.timer = setTimeout(report, 1000);
}

function report() {
    console.log('sw cache', Object.assign({}, stats));
    stats.hit = stats.miss = stats.fetch = stats.cache = stats.bypass = stats.preload = 0;
}

debug('sw entry point');

const addResourcesToCache = async (resources) => {
    // debug('cache resources', resources);
    const cache = await caches.open('v'+version);
    await cache.addAll(resources);
};

const putInCache = async (request, response) => {
    const cache = await caches.open('v'+version);
    // debug('cache', request.url);
    update(stats.cache++);
    await cache.put(request, response);
};

const cacheFirst = async ({
    request,
    preloadResponsePromise,
    fallbackUrl
}) => {
    // must await this promise when present to avoid errors
    const preloadResponse = preloadResponsePromise ? await preloadResponsePromise : undefined;

    // try to get the resource from the cache
    const cache = await caches.open('v'+version);
    const responseFromCache = await cache.match(request);

    if (responseFromCache) {
        // debug('cached', request.url);
        update(stats.hit++);
        return responseFromCache;
    } else {
        // debug('miss', request.url);
        update(stats.miss++);
    }

    // try to use the preloaded response, if it's there
    if (preloadResponse) {
        update(stats.preload++);
        debug('using preload response', preloadResponse);
        putInCache(request, preloadResponse.clone());
        return preloadResponse;
    }

    // try to get the resource from the network
    try {
        // debug('fetch', request.url);
        update(fetch.fetch++);
        const responseFromNetwork = await fetch(request);
        // response may be used only once
        // we need to save clone to put one copy in cache and serve second one
        putInCache(request, responseFromNetwork.clone());
        return responseFromNetwork;
    } catch (error) {
        debug({fallback_error: error});
        const cache = await caches.open('v'+version);
        const fallbackResponse = await cache.match(fallbackUrl);
        if (fallbackResponse) {
            return fallbackResponse;
        }
        // when even the fallback response is not available,
        // there is nothing we can do, but we must always
        // return a Response object
        return new Response('Network error happened', {
            headers: { 'Content-Type': 'text/plain' },
            status: 408
        });
    }
};

const enableNavigationPreload = async () => {
    if (self.registration.navigationPreload) {
        // Enable navigation preloads!
        // debug('sw preload');
        try {
            await self.registration.navigationPreload.enable();
        } catch (e) {
            debug('sw preload fail', e);
        }

    }
};

self.addEventListener('activate', (event) => {
    const vkey = 'v'+version;
    // debug('sw activate');
    // event.waitUntil(enableNavigationPreload());
    // cleanup old caches
    event.waitUntil(
        caches.keys()
            .then( keylist => keylist
                .filter(key => key != vkey)
                .map(key => { debug('sw delete cache', key); return caches.delete(key); }) )
            .then( deletes => Promise.all(deletes) )
    );
    event.waitUntil(new Promise((resolve, reject) => {
        setTimeout(resolve, 5000);
    }));
    debug('sw activated');
});

self.addEventListener('install', (event) => {
    // debug('sw install');
    // event.waitUntil( addResourcesToCache([ ]) );
    self.skipWaiting();
    debug('sw installed');
});

self.addEventListener('fetch', (event) => {
    const { request,preloadResponse } = event;
    if (request.url.indexOf(origin) !== 0 || request.method !== 'GET') {
        debug('no-cache', request.url);
        stats.bypass++;
        event.respondWith(fetch(request));
        return;
    }

    event.respondWith(
        cacheFirst({
            request: request,
            preloadResponsePromise: preloadResponse,
            fallbackUrl: '//static.grid.space/img/logo_gs.png',
        })
    );
});

self.addEventListener('message', (event) => {
    // debug({ onmessage: event, clients });
});
