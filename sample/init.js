// this is called from the `app.js` function `initModule()` around line `200`
// from there you can get the structure passed in the "server" object
// which includes and `api` and other helper functions

module.exports = function(server) {

server.util.log("--- sample server-side module installed ---");

// insert script after all others in kiri main code
server.inject("kiri", "kiri.js", {end: true});

// insert script after all others in kiri worker code
server.inject("kiri_work", "work.js", {end: true});

server.onload(() => {
    server.util.log("--- called after all modules loaded ---");
});

// adding URL endpoints on the server
server.path.full({
    // register the endpoint "/postit"
    "/postit": (req, res, next) => {
        let chunks = [];
        req.on('data', data => {
            chunks.push(data.toString());
        });
        req.on('end', () => {
            let data = chunks.join('');
            server.util.log({server_received: data});
            res.end(`received ${data.length} bytes`);
        });
    }
});

};
