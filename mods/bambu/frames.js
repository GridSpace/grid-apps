/**
 * this utility takes a BBL printer host and LAN code
 * and stores the resulting jpeg stream into frame files
 */

const hexer = require('hexer');
const util = require('util');
const args = process.argv.slice(2);
const tls = require('tls');
const fs = require('fs');
const [host, code, prefix] = args;

if (!(host && code)) {
    console.log('usage: frames [host] [code] (file-prefix)');
    return;
}

const abuf = new ArrayBuffer(80);
const view = new DataView(abuf);
const encoder = new TextEncoder();
const userBytes = encoder.encode('bblp');
const codeBytes = encoder.encode(code);

view.setInt32(0, 0x0040, true);
view.setInt32(4, 0x3000, true);
new Uint8Array(abuf, 0x10, userBytes.length).set(userBytes);
new Uint8Array(abuf, 0x30, codeBytes.length).set(codeBytes);

const bufr = Buffer.from(abuf);
// console.log(hexer(bufr));

let pic;
let ind = 0;

const remoteSocket = tls.connect({
    host,
    port: 6000,
    rejectUnauthorized: false
}, () => {
    // send authentication to start jpeg frame stream
    remoteSocket.write(bufr);
});

remoteSocket.on('data', (data) => {
    // console.log('-- cam said --', data.length);
    // console.log(hexer(data));
    if (data.length === 16) {
        // start of frame
        if (pic) {
            // dump last completed frame
            fs.writeFileSync(`${prefix || "frame"}-${(++ind).toString().padStart(5,0)}.jpg`, pic);
            console.log('received frame', ind);
            pic = undefined;
        }
    } else {
        pic = pic ? Buffer.concat([pic,data]) : data;
    }
});

remoteSocket.on('error', (err) => {
    console.error('Remote connection error:', err.message);
    clientSocket.destroy();
});
