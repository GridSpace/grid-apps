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

class GXWriter {
    constructor(gcode, bmp, time, length) {
        gcode = fs.readFileSync(gcode); // raw gcode
        bmp = fs.readFileSync(bmp); // any 80x60 pixel bmp

        const header = new Buffer(58);
        header.write("xgcode 1.0\n\u0000\u0000\u0000\u0000\u0000", 0);
        header.writeUInt32LE(58, 16); // bmp offset
        header.writeUInt32LE(58 + bmp.length, 20); // gcode offset
        header.writeUInt32LE(58 + bmp.length, 24); // gcode offset
        header.writeUInt32LE(time || 100, 28); // print seconds
        header.writeUInt32LE(length || 100, 32); // print filament len mm
        header.writeUInt32LE(  0, 36); // ?
        header.writeUInt16LE(  1, 40); // ?
        header.writeUInt16LE(200, 42); // ?
        header.writeUInt16LE( 20, 44); // ?
        header.writeUInt16LE(  3, 46); // ?
        header.writeUInt16LE( 60, 48); // ?
        header.writeUInt16LE(110, 50); // ?
        header.writeUInt16LE(220, 52); // ?
        header.writeUInt16LE(220, 54); // ?
        header.writeUInt8   (  1, 56); // ?
        header.writeUInt8   (  1, 57); // ?

        this.output = Buffer.concat([header, bmp, gcode]);
    }

    write(file) {
        fs.writeFileSync(file, this.output);
        return this;
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
                let okidx = line.indexOf("ok");
                if (okidx >= 0) {
                    if (okidx > 0) this.output.push(line);
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

    sendBuffer(buf, callback) {
        this.queue.push({cmd: buf, cb: callback});
        this.doSendTimer();
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

function uint32b(val) {
    return new Buffer([
        (val >> 24) & 0xff,
        (val >> 16) & 0xff,
        (val >>  8) & 0xff,
        (val >>  0) & 0xff
    ]);
}

class GXSender {
    constructor(file, host, port, filename) {
        const buffer = fs.readFileSync(file);
        const ctrl = new FFControl(host, port);
        ctrl.sendCommand("M601 S1", lines => { console.log(lines) });
        // ctrl.sendCommand("M115", lines => { console.log(lines) });
        // ctrl.sendCommand("M119", lines => { console.log(lines) });
        // ctrl.sendCommand("M114", lines => { console.log(lines) });
        // ctrl.sendCommand("M105", lines => { console.log(lines) });
        // ctrl.sendCommand("M650", lines => { console.log(lines) });
        // ctrl.sendCommand("M27", lines => { console.log(lines) });
        filename = " 0:/user/" + (filename || "kirimoto.gx");
        ctrl.sendCommand("M28 " + buffer.length + filename, lines => { console.log(lines) });
        const slices = Math.ceil(buffer.length / 4096);
        const preamble = new Buffer([0x5a, 0x5a, 0xa5, 0xa5]);
        const length = uint32b(4096);
        for (let slice = 0; slice < slices; slice++) {
            let chunk = buffer.slice(slice * 4096, slice * 4096 + 4096);
            if (chunk.length  < 4096) {
                chunk = Buffer.concat([chunk, new Buffer(4096-chunk.length).fill(0)]);
            }
            let crc = crc32.unsigned(chunk);
            let block = Buffer.concat([
                preamble,
                uint32b(slice),
                length,
                uint32b(crc),
                chunk
            ]);
            // console.log(block);
            // console.log(block.slice(4080));
            // console.log(block.length);
            ctrl.sendBuffer(block, lines => { console.log(lines) });
        }
        ctrl.sendCommand("M29", lines => { console.log(lines) }); // end of send
        ctrl.sendCommand("M23 " + filename, lines => { console.log(lines) }); // start print
        this.ctrl = ctrl;
        this.monitor();
    }

    monitor() {
        const ctrl = this.ctrl;
        ctrl.sendCommand("M119", lines => { console.log(lines) });
        ctrl.sendCommand("M105", lines => { console.log(lines) });
        ctrl.sendCommand("M27", lines => { console.log(lines) });
        setTimeout(() => { this.monitor() }, 1000);
    }
}

const crc32 = require('buffer-crc32');
const net   = require('net');
const fs    = require('fs');

const arg = process.argv.slice(2);
const cmd = arg.shift();

switch (cmd) {
    case 'read':
        new GXReader(arg.shift());
        break;
    case 'make':
        let output = arg.shift();
        new GXWriter(arg.shift(), arg.shift(), parseInt(arg.shift() || 100), parseInt(arg.shift() || 100)).write(output);
        break;
    case 'send':
        new GXSender(arg.shift(), arg.shift(), parseInt(arg.shift()));
        break;
    default:
        console.log([
            "invalid command: " + cmd,
            "usage:",
            "  read [file]",
            "  make [outfile] [gcode] [bmp] <time> <length>",
            "  send [file] [host] [port] <filename>",
            "  print [file]"
        ].join("\n"));
        break;
}
