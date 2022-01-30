console.log('--- in the browser main loop ---');

// the kiri api starts around line `260` of `src/kiri/main.js`
kiri.load(function(api) {
    console.log('--- kiri startup complete ---');

    // send data to our "/postit" endpoint
    fetch("/postit", {
        method: "POST",
        body: "this is a test of the POST url endpoint"
    }).then(res => res.text()).then(text => {
        console.log({server_said: text});
    });
});
