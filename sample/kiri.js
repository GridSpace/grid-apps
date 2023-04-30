console.log('--- kiri main module start ---');

// the kiri api starts around line `260` of `src/kiri/main.js`
kiri.load(function(api) {
    console.log('--- kiri main module started ---');

    // send data to our "/postit" endpoint
    fetch("/postit", {
        method: "POST",
        body: "this is a test of the POST url endpoint"
    }).then(res => res.text()).then(text => {
        console.log({server_said: text});
    });
});
