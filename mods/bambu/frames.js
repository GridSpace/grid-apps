/**
 * this utility takes a BBL printer host and LAN code
 * and stores the resulting jpeg stream into frame files
 */

const { bblCA } = require('./certs');
const EventEmitter = require('events');
const tls = require('tls');
const debug = false;

class FrameStream extends EventEmitter {
    #remoteSocket;

    constructor(host, code, serial) {
        super();

        const abuf = new ArrayBuffer(80);
        const view = new DataView(abuf);
        const encoder = new TextEncoder();
        const userBytes = encoder.encode('bblp');
        const codeBytes = encoder.encode(code);
        const useCA = false;

        view.setInt32(0, 0x0040, true);
        view.setInt32(4, 0x3000, true);
        new Uint8Array(abuf, 0x10, userBytes.length).set(userBytes);
        new Uint8Array(abuf, 0x30, codeBytes.length).set(codeBytes);

        let frame;
        const remoteSocket = this.#remoteSocket = tls.connect(Object.assign({}, {
            host,
            port: 6000
        }, useCA ? {
            ca: bblCA,
            servername: serial
        } : {
            rejectUnauthorized: false,
            checkServerIdentity: () => {}
        }), () => {
            // send authentication to start jpeg frame stream
            remoteSocket.write(Buffer.from(abuf));
            this.emit('connect', host);
        });
        debug && console.log('start frames', serial);

        remoteSocket.on('data', (data) => {
            if (data.length === 16) {
                if (frame) {
                    this.emit('frame', frame);
                    debug && console.log('frame', serial);
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
            debug && console.log('close frames', serial);
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
