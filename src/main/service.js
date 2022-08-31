async function start_service_worker() {
    // install service worker
    console.log('registering service worker');

    try {
        // const reg = await navigator.serviceWorker.register("/src/moto/service.js?013", { scope: "/" });
        const reg = await navigator.serviceWorker.register("/code/service.js?021", { scope: "/" });
        if (reg.installing) {
            console.log('service worker installing');
        } else if (reg.waiting) {
            console.log('service worker waiting');
        } else if (reg.active) {
            console.log('service worker active');
        } else {
            console.log({ service_worker: reg });
        }
    } catch (err) {
        console.log('service worker registration failed');
    }
}
if (navigator.serviceWorker) start_service_worker();
