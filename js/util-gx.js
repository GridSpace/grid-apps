/** Copyright 2014-2017 Stewart Allen -- All Rights Reserved */
"use strict";

class GXReader {
    constructor(file) {
        this.buf = fs.readFileSync(file);
        this.pos = 16;
        this.magic = this.buf.slice(0,16).toString().trim();

        console.log({
            magic: this.magic,
            bmpoff: this.u32(),
            gc1off: this.u32(),
            gc2off: this.u32(),
            prsecs: this.u32(),
            prfila: this.u32(),
            unk01:  this.u32(),
            unk02:  this.u16(),
            unk03:  this.u16(),
            unk04:  this.u16(),
            unk05:  this.u16(),
            unk06:  this.u16(),
            unk07:  this.u16(),
            unk08:  this.u16(),
            unk09:  this.u16(),
            unk10:  this.u8(),
            unk11:  this.u8(),
            index:  this.pos
        });
    }

    inc(inc) {
        const ret = this.pos;
        this.pos += inc;
        return ret;
    }

    u8() {
        return this.buf.readUInt8(this.inc(1));
    }

    u16() {
        return this.buf.readUInt16LE(this.inc(2));
    }

    u32() {
        return this.buf.readUInt32LE(this.inc(4));
    }

    string() {

    }
}

class LineBuffer {

    constructor(stream) {
        this.buffer = null;
        this.stream = stream;
        this.stream.on("data", data => {
            if (this.buffer) {
                this.buffer = Buffer.concat([this.buffer, data]);
            } else {
                this.buffer = data;
            }
            this.nextLine()
        });
    }

    nextLine() {
        let left = 0;
        const data = this.buffer;
        const cr = data.indexOf("\r");
        const lf = data.indexOf("\n");
        if (lf && cr + 1 == lf) { left = 1 }
        if (lf >= 0) {
            this.stream.emit("line", data.slice(0, lf - left));
            this.buffer = data.slice(lf + 1);
            this.nextLine();
        }
    }

}

class FFControl {
    constructor(host, port) {
        const socket = new net.Socket().connect({
            host: host,
            port: port
        })
            .on("connect", () => {
                console.log({connected: [host, port]});
                this.connected = true;
                this.doSendTimer();
            })
            .on("line", line => {
                line = line.toString();
                if (line == "ok") {
                    if (this.next) {
                        if (this.next.cb) this.next.cb(this.output);
                    } else {
                        console.log({reply_no_cmd: this.output});
                    }
                    this.output = [];
                    this.timer = null;
                    this.doSendTimer();
                } else {
                    this.output.push(line);
                }
            })
            .on("error", (error) => {
                console.log({error: error});
            })
            .on("end", () => {
                console.log({end: [host,port]});
            })
            .on("close", () => {
                console.log({close: [host,port]});
            })
            ;

        socket.lineBuffer = new LineBuffer(socket);

        this.connected = false;
        this.socket = socket;
        this.queue = [];
        this.timer = null;
        this.next = null;
        this.output = [];
    }

    sendCommand(cmd, callback) {
        this.queue.push({cmd: "~" + cmd + "\r\n", cb: callback});
        this.doSendTimer();
    }

    doSendTimer() {
        if (!this.connected || this.timer) return;
        if (this.queue.length > 0) this.timer = setTimeout(() => {
            this.doSend()
        }, 0);
    }

    doSend() {
        const next = this.queue.shift();
        this.next = next;
        this.socket.write(next.cmd);
    }
}


class GXSender {
    constructor(host, port, file) {
        const buffer = fs.readFileSync(file);
        const ctrl = new FFControl(host, port);
        ctrl.sendCommand("M601 S1", lines => { console.log(lines) });
        ctrl.sendCommand("M115", lines => { console.log(lines) });
        ctrl.sendCommand("M27", lines => { console.log(lines) });
    }
}

const arg = process.argv.slice(2);
const cmd = arg.shift();
const net = require('net');
const fs  = require('fs');

switch (cmd) {
    case 'read':
        new GXReader(arg.shift());
        break;
    case 'send':
        new GXSender(arg.shift(), parseInt(arg.shift()), arg.shift());
        break;
    default:
        console.log([
            "invalid command: " + cmd,
            "usage:",
            "  read [file]",
            "  print [host] [file]"
        ].join("\n"));
        break;
}
