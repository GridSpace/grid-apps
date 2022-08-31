console.log('service worker running 021');

const addResourcesToCache = async (resources) => {
    console.log('cache resources', resources);
    const cache = await caches.open('v4');
    await cache.addAll(resources);
};

const putInCache = async (request, response) => {
    const cache = await caches.open('v4');
    console.log('cache', request.request.url);
    await cache.put(request, response);
};

const cacheFirst = async ({
    request,
    preloadResponsePromise,
    fallbackUrl
}) => {
    // First try to get the resource from the cache
    const responseFromCache = await caches.match(request);
    if (responseFromCache) {
        console.log('sw cached', request.url);
        return responseFromCache;
    }

    // Next try to use the preloaded response, if it's there
    // const preloadResponse = await preloadResponsePromise;
    // if (preloadResponse) {
    //     console.info('using preload response', preloadResponse);
    //     putInCache(request, preloadResponse.clone());
    //     return preloadResponse;
    // }

    // Next try to get the resource from the network
    try {
        console.log('fetch', request.request.url);
        const responseFromNetwork = await fetch(request);
        // response may be used only once
        // we need to save clone to put one copy in cache
        // and serve second one
        putInCache(request, responseFromNetwork.clone());
        return responseFromNetwork;
    } catch (error) {
        const fallbackResponse = await caches.match(fallbackUrl);
        if (fallbackResponse) {
            return fallbackResponse;
        }
        // when even the fallback response is not available,
        // there is nothing we can do, but we must always
        // return a Response object
        return new Response('Network error happened', {
            status: 408,
            headers: {
                'Content-Type': 'text/plain'
            },
        });
    }
};

const enableNavigationPreload = async () => {
    if (self.registration.navigationPreload) {
        // Enable navigation preloads!
        console.log('sw preload');
        try {
            await self.registration.navigationPreload.enable();
        } catch (e) {
            console.log('sw preload fail', e);
        }

    }
};

self.addEventListener('activate', (event) => {
    console.log('sw activate preload');
    // event.waitUntil(enableNavigationPreload());
    // console.log('sw clients claim');
    // event.waitUntil(clients.claim());
});

self.addEventListener('install', (event) => {
    console.log('sw install');
    event.waitUntil(
        addResourcesToCache([
            // '/',
        ])
    );
});

self.addEventListener('fetch', (event) => {
    // console.log('sw fetch', event.request.url);
    event.respondWith(
        cacheFirst({
            request: event.request,
            preloadResponsePromise: event.preloadResponse,
            fallbackUrl: '//static.grid.space/img/logo_gs.png',
        })
    );
});
