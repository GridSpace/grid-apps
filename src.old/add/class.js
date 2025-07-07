/** Copyright 2014-2019 Stewart Allen -- All Rights Reserved */

"use strict";

// use: add.array
gapp.register("add.class", [], (root, exports) => {

self.ArrayWriter = class ArrayWriter {
    constructor() {
        this.pos = 0;
        this.array = [];
    }

    seek(pos) {
        let last = this.pos;
        this.pos = pos;
        return last;
    }

    skip(len) {
        this.writeBytes(new Array(len).fill(0), len);
        return this.pos;
    }

    writeU8(v) {
        this.array[this.pos++] = v & 0xff;
    }

    writeU16(v) {
        this.array[this.pos++] = (v >> 8) & 0xff;
        this.array[this.pos++] = v & 0xff;
    }

    writeU32(v) {
        this.array[this.pos++] = (v >> 24) & 0xff;
        this.array[this.pos++] = (v >> 16) & 0xff;
        this.array[this.pos++] = (v >> 8) & 0xff;
        this.array[this.pos++] = v & 0xff;
    }

    writeBytes(bytes) {
        this.array.appendAll(bytes);
        this.pos += bytes.length;
    }

    toBuffer() {
        return new Uint8ClampedArray(this.array).buffer;
    }
};

self.DataWriter = class DataWriter {
    constructor(view, pos) {
        this.view = view;
        this.pos = pos || 0;
    }

    skip(v) {
        let p = this.pos;
        this.pos += v;
        return p;
    }

    writeU8(v) {
        try {
            this.view.setUint8(this.pos, v);
            return this.skip(1);
        } catch (err) {
            console.log({pos:this.pos, err})
            throw err;
        }
    }

    writeU16(v,le) {
        this.view.setUint16(this.pos, v, le);
        return this.skip(2);
    }

    writeU32(v,le) {
        this.view.setUint32(this.pos, v, le);
        return this.skip(4);
    }

    writeI32(v,le) {
        this.view.setInt32(this.pos, v, le);
        return this.skip(4);
    }

    writeUB64(v,le) {
        this.view.setBigUint64(this.pos, v, le);
        return this.skip(8);
    }

    writeB64(v,le) {
        this.view.setBigInt64(this.pos, v, le);
        return this.skip(8);
    }

    writeF32(v,le) {
        this.view.setFloat32(this.pos, v, le);
        return this.skip(4);
    }

    writeF64(v,le) {
        this.view.setFloat64(this.pos, v, le);
        return this.skip(8);
    }
}

self.DataReader = class DataReader {
    constructor(view, pos) {
        this.view = view;
        this.pos = pos || 0;
    }

    skip(v) {
        let p = this.pos;
        this.pos += v;
        return p;
    }

    readBytes(len) {
        let buf = this.view.buffer.slice(this.pos, this.pos + len);
        this.pos += len;
        return buf;
    }

    readU8() {
        return this.view.getUint8(this.pos++);
    }

    readU16(le) {
        let v = this.view.getUint16(this.pos, le);
        this.pos += 2;
        return v;
    }

    readU32(le) {
        let v = this.view.getUint32(this.pos, le);
        this.pos += 4;
        return v;
    }

    readI32(le) {
        let v = this.view.getInt32(this.pos, le);
        this.pos += 4;
        return v;
    }

    readB64(le) {
        let v = this.view.getBigInt64(this.pos, le);
        this.pos += 8;
        return v;
    }

    readUB64(le) {
        let v = this.view.getBigUint64(this.pos, le);
        this.pos += 8;
        return v;
    }

    readF32(le) {
        let v = this.view.getFloat32(this.pos, le);
        this.pos += 4;
        return v;
    }

    readF64(le) {
        let v = this.view.getFloat64(this.pos, le);
        this.pos += 8;
        return v;
    }
}

});
