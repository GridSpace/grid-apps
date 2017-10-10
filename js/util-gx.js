class GXReader {
    constructor(buffer) {
        this.buf = buffer;
        this.pos = 16;
        this.magic = buffer.slice(0,16).toString().trim();

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

const fs = require('fs');
const gx = new GXReader(fs.readFileSync(process.argv[2]));
