console.log('--- in the browser main loop ---');

// the kiri api starts around line `260` of `src/kiri/main.js`
kiri.load(function(api) {
    console.log('--- kiri startup complete ---');
});
