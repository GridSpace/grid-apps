/**
 * this utility takes a BBL printer host and LAN code
 * and stores the resulting jpeg stream into frame files
 */

const EventEmitter = require('events');
const tls = require('tls');
const { bblCA } = require('./certificates');

class FrameStream extends EventEmitter {
    #remoteSocket;

    constructor(host, code) {
        super();

        const abuf = new ArrayBuffer(80);
        const view = new DataView(abuf);
        const encoder = new TextEncoder();
        const userBytes = encoder.encode('bblp');
        const codeBytes = encoder.encode(code);

        view.setInt32(0, 0x0040, true);
        view.setInt32(4, 0x3000, true);
        new Uint8Array(abuf, 0x10, userBytes.length).set(userBytes);
        new Uint8Array(abuf, 0x30, codeBytes.length).set(codeBytes);

        let frame;

        const remoteSocket = this.#remoteSocket = tls.connect({
            host,
            port: 6000,
            ca: bblCA,
            checkServerIdentity: () => {} // TODO: use `servername: serial` instead
        }, () => {
            // send authentication to start jpeg frame stream
            remoteSocket.write(Buffer.from(abuf));
            this.emit('connect', host);
        });

        remoteSocket.on('data', (data) => {
            if (data.length === 16) {
                if (frame) {
                    this.emit('frame', frame);
                    frame = undefined;
                }
            } else {
                frame = frame ? Buffer.concat([frame, data]) : data;
            }
        });

        remoteSocket.on('error', (error) => {
            remoteSocket.destroy();
            this.emit('error', error);
        });

        remoteSocket.on('close', () => {
            this.emit('close');
        })
    }

    end() {
        this.#remoteSocket.end();
    }
}

if (require.main === module) {
    const fs = require('fs');
    const args = process.argv.slice(2);
    const [host, code, prefix] = args;

    if (!(host && code)) {
        console.log('usage: frames [host] [code] (file-prefix)');
        return;
    }

    console.log('frames extraction from', host);

    let ind = 0;
    new FrameStream(host, code)
        .on('connect', host => {
            console.log('connected to', host);
        })
        .on('frame', jpeg => {
            fs.writeFileSync(`${prefix || "frame"}-${(++ind).toString().padStart(5, 0)}.jpg`, jpeg);
            console.log('received frame', ind);
        });
}

module.exports = { FrameStream };
