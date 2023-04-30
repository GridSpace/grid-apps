/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

gapp.register("kiri-mode.sla.x_cxdlp", [], (root, exports) => {

const default_values = {
    magic1: 'CXSW3DV2',
    magic2: 'CXSW3DV2',
    model: 'CL-89',
    version: 1,
    layer_count: 0,
    res_x: 3840,
    res_y: 2400,
    height: 0,
    thumb: undefined,
    preview1: undefined,
    preview2: undefined,
    dim_x: '192.000000',
    dim_y: '120.000000',
    layer: '0.050000',
    light_on: 6,
    light_off: 2,
    light_pwm: 255,
    lift_dist: 6,
    lift_speed: 60,
    down_speed: 150,
    base_layers: 8,
    base_light_on: 60,
    base_light_pwm: 255,
    base_lift_dist: 5,
    base_lift_speed: 60
};
const data_term = 0x0d0a;

// https://github.com/sn4k3/UVtools/blob/v2.20.4/UVtools.Core/FileFormats/CXDLPFile.cs
// CL-60  1620 x 2560
// CL-89  3840 x 2400
// CL-133 3840 x 2160

class CXDLP {
    constructor() {
        Object.assign(this, default_values);
    }

    // takes a DataView Object
    read(view) {
        let read = new DataReader(view, 0);

        function read_string(dbl) {
            let len = read.readU32();
            let str = '';
            while (--len > 0) {
                if (dbl) {
                    read.readU8();
                    len--;
                }
                str += String.fromCharCode(read.readU8());
            }
            if (!dbl) {
                read.skip(1); // null term on byte strings
            }
            return str;
        }

        let meta = {
            view,
            magic1: read_string(),
            version: read.readU16(),
            model: read_string(),
            layer_count: read.readU16(),
            res_x: read.readU16(),
            res_y: read.readU16(),
            height: read.readU32(),
            skip: read.skip(60),
            thumb: read.readBytes(26912),
            skip: read.skip(2), // 0xd0a term
            preview1: read.readBytes(168200),
            skip: read.skip(2), // 0xd0a term
            preview2: read.readBytes(168200),
            skip: read.skip(2), // 0xd0a term
            dim_x: read_string(true),
            dim_y: read_string(true),
            layer: read_string(true),
            light_on: read.readU16(),
            light_off: read.readU16(),
            base_light_on: read.readU16(),
            base_layers: read.readU16(),
            base_lift_dist: read.readU16(),
            base_lift_speed: read.readU16(),
            lift_dist: read.readU16(),
            lift_speed: read.readU16(),
            down_speed: read.readU16(),
            base_light_pwm: read.readU16(),
            light_pwm: read.readU16()
        };

        // read layer record lengths
        let layers = this.layers = [];
        for (let i=0; i<meta.layer_count; i++) {
            layers.push({ length: read.readU32() });
        }
        if (read.readU16() !== data_term) {
            throw `invalid data term @ ${read.pos - 2}`;
        }

        // read layer meta data, not line data
        for (let i=0; i<meta.layer_count; i++) {
            let size = read.readU32();
            if (size !== layers[i].length) {
                throw `layer length mismatch: ${size} != ${layers[i].length} @ i=${i}`;
            }
            let lines = read.readU32();
            layers[i].lines = lines;
            layers[i].pos = read.pos; // store line data position
            // skip line data and check data term is valid
            read.skip(lines * 6);
            if (read.readU16() !== data_term) {
                throw `invalid data term @ ${read.pos - 2}`;
            }
        }

        // read trailing magic
        meta.magic2 = read_string();

        // compute checksum and verify
        let cksum = 0;
        for (let i=0; i<read.pos; i++) {
            cksum = cksum ^ view.getUint8(i);
        }

        meta.checksum = cksum;

        if (cksum !== read.readU32()) {
            throw `checksum mismatch`;
        }

        delete meta.skip;
        Object.assign(this, meta);

        return this;
    }

    get_layer_lines(layer) {
        if (this.view) {
            if (layer > this.layers.length) {
                throw `layer out of range 0-${this.layers.length}`;
            }
            let out = [];
            let rec = this.layers[layer];
            let { lines, pos } = rec;
            for (let j=0; j<lines; j++) {
                let d1 = this.view.getUint16(pos); pos += 2;
                let d2 = this.view.getUint16(pos); pos += 2;
                let d3 = this.view.getUint16(pos); pos += 2;
                let y_start = d1 >> 3;
                let y_end = ((d1 & 0b111) << 10) | (d2 >> 6);
                let x_end = ((d2 & 0b111111) << 8) | (d3 >> 8);
                let color = d3 & 0xff;
                out.push({y_start, y_end, x_end, color});
            }
            return out;
        } else {
            throw "missing data view";
        }
    }

    write() {
        let output = new ArrayWriter();

        output.write_string = function write_string(str, dbl = false) {
            let len = str.length;
            output.writeU32(dbl ? len * 2 : len + 1);
            let pos = 0;
            while (pos < len) {
                if (dbl) {
                    output.writeU8(0);
                }
                output.writeU8(str.charCodeAt(pos++));
            }
            if (!dbl) {
                output.writeU8(0);
            }
        }

        output.write_bytes = function(array, len) {
            if (!array) {
                output.skip(len);
            } else if (array.byteLength) {
                if (len !== array.byteLength) {
                    throw `invalid array length: ${array.byteLength} != ${len}`;
                }
                // ArrayBuffer
                let read = new DataReader(array);
                for (let i=0; i<array.byteLength; i++) {
                    output.writeU8(read.readU8());
                }
            } else if (array.length) {
                if (len !== array.length) {
                    throw `invalid array length: ${array.length} != ${len}`;
                }
                // standard array
                output.writeBytes(array);
            } else {
                throw "invalid byte array";
            }
        };

        let layers = this.layers;
        this.layer_count = layers.length;
        output.write_string(this.magic1);
        output.writeU16(this.version);
        output.write_string(this.model);
        output.writeU16(this.layer_count);
        output.writeU16(this.res_x);
        output.writeU16(this.res_y);
        output.writeU32(this.height);
        output.skip(60);
        output.write_bytes(this.thumb, 26912); // thumb
        output.writeU16(data_term);
        output.write_bytes(this.preview1, 168200); // preview1
        output.writeU16(data_term);
        output.write_bytes(this.preview2, 168200); // preview1
        output.writeU16(data_term);
        output.write_string(this.dim_x, true);
        output.write_string(this.dim_y, true);
        output.write_string(this.layer, true);
        output.writeU16(this.light_on);
        output.writeU16(this.light_off);
        output.writeU16(this.base_light_on);
        output.writeU16(this.base_layers);
        output.writeU16(this.base_lift_dist);
        output.writeU16(this.base_lift_speed);
        output.writeU16(this.lift_dist);
        output.writeU16(this.lift_speed);
        output.writeU16(this.down_speed);
        output.writeU16(this.base_light_pwm);
        output.writeU16(this.light_pwm);

        // write placeholder layer length to capture position
        for (let layer of layers) {
            layer.l1 = output.pos;
            output.writeU32(0);
        }
        output.writeU16(data_term);

        // write out encoded layers
        for (let layer of layers) {
            layer.l2 = output.pos;
            // placeholder to be written post
            output.writeU32(0);
            output.writeU32(layer.lines.length);
            let start = output.pos;
            for (let line of layer.lines) {
                let b1 = (line.y_start >> 5);
                let b2 = ((line.y_start << 3) | (line.y_end >> 10)) & 0xff;
                let b3 = (line.y_end >> 2) & 0xff;
                let b4 = ((line.y_end << 6) | (line.x_end >> 8)) & 0xff;
                let b5 = (line.x_end) & 0xff;
                output.writeU8(b1);
                output.writeU8(b2);
                output.writeU8(b3);
                output.writeU8(b4);
                output.writeU8(b5);
                output.writeU8(line.color);
            }
            layer.length = output.pos - start;
            output.writeU16(data_term);
        }

        output.write_string(this.magic2);
        let ckpos = output.pos;

        // retrace and write layer lengths
        for (let layer of layers) {
            output.seek(layer.l1);
            output.writeU32(layer.length);
            output.seek(layer.l2);
            output.writeU32(layer.length);
        }

        output.seek(ckpos);
        // compute xor checksum
        let cksum = 0;
        let array = output.array;
        for (let i=0; i<array.length; i++) {
            cksum = cksum ^ (array[i] || 0);
        }
        output.writeU32(cksum);

        return output.toBuffer();
    }
}

CXDLP.export = function(params) {
    let { settings, width, height, slices } = params;
    let { thumb, preview1, preview2 } = params;
    let { device, process } = settings;

    let cxdlp = new CXDLP();

    if (width === 1620 && height === 2560) {
        cxdlp.model = "CL-60";
    } else
    if (width === 3840 && height === 2400) {
        cxdlp.model = "CL-89";
    } else
    if (width === 3840 && height === 2160) {
        cxdlp.model = "CL-133";
    } else {
        throw `invalid printer dimensions ${width} x ${height}`;
    }

    cxdlp.layers = slices.map(a => {return { lines: a }});
    cxdlp.res_x = device.resolutionX;
    cxdlp.res_y = device.resolutionY;
    cxdlp.dim_x = device.bedWidth.toFixed(5);
    cxdlp.dim_y = device.bedDepth.toFixed(5);
    cxdlp.layer = process.slaSlice.toFixed(5);
    cxdlp.thumb = thumb;
    cxdlp.preview1 = preview1;
    cxdlp.preview2 = preview2;
    cxdlp.light_on = process.slaLayerOn;
    cxdlp.light_off = process.slaLayerOff;
    // cxdlp.light_pwm = 255;
    cxdlp.lift_dist = process.slaPeelDist;
    cxdlp.lift_speed = process.slaPeelLiftRate * 60;
    cxdlp.base_layers = process.slaBaseLayers;
    cxdlp.base_light_on = process.slaBaseOn;
    // cxdlp.base_light_pwm = 255;
    cxdlp.base_lift_dist = process.slaBasePeelDist;
    cxdlp.base_lift_speed = process.slaBasePeelLiftRate * 60;

    return cxdlp.write();
};

CXDLP.render = function(params) {
    let { width, height, index, widgets, scaleX, scaleY  } = params;
    let width2 = width / 2, height2 = height / 2;
    let array = [];
    let count = 0;
    let area = 0;

    function scaleMovePoly(poly) {
        let points = poly.points;
        poly._bounds = undefined;
        for (let i=0, il=points.length; i<il; i++) {
            let p = points[i];
            p.y = height - (p.y * scaleY + height2);
            p.x = p.x * scaleX + width2;
        }
        if (poly.inner) {
            for (let i=0, ia=poly.inner, il=poly.inner.length; i<il; i++) {
                scaleMovePoly(ia[i]);
            }
        }
    }

    // serialize poly into wasm heap memory
    function writePoly(writer, poly) {
        let pos = writer.skip(2);
        let inner = poly.inner;
        writer.writeU16(inner ? inner.length : 0, true);
        let points = poly.points;
        let bounds = poly.bounds;
        writer.writeU16(points.length, true);
        writer.writeU16(bounds.minx, true);
        writer.writeU16(bounds.maxx, true);
        writer.writeU16(bounds.miny, true);
        writer.writeU16(bounds.maxy, true);
        for (let j=0, jl=points.length; j<jl; j++) {
            let point = points[j];
            writer.writeF32(point.x, true);
            writer.writeF32(point.y, true);
        }
        if (inner && inner.length) {
            for (let i=0, il=inner.length; i<il; i++) {
                writePoly(writer, inner[i]);
            }
        }
        // write total struct length at struct head
        writer.view.setUint16(pos, writer.pos - pos, true);
    }

    widgets.forEach(widget => {
        let slice = widget.slices[index];
        if (slice) {
            if (slice.synth) count++;
            let polys = slice.unioned;
            if (!polys) polys = slice.tops.map(t => t.poly);
            if (slice.supports) polys.appendAll(slice.supports);
            array.appendAll(polys.map(poly => {
                return poly.clone(true).move(widget.track.pos);
            }));
            count += polys.length;
        }
    });

    let wasm = kiri.driver.SLA.wasm;
    let imagelen = width * height;
    let writer = new self.DataWriter(new DataView(wasm.memory.buffer), imagelen);
    writer.writeU16(width, true);
    writer.writeU16(height, true);
    writer.writeU16(array.length, true);

    // scale and move all polys to fit in rendered platform coordinates
    for (let i=0, il=array.length; i<il; i++) {
        let poly = array[i];
        area += poly.areaDeep();
        scaleMovePoly(poly);
        writePoly(writer, poly);
    }
    wasm.render(0, imagelen, 0);
    let image = wasm.heap;//.slice(0, imagelen);
    let lines = [];
    for (let x=0; x<width; x++) {
        let y_start = 0;
        let lastv = 0;
        for (let y=0; y<height; y++) {
            let v = image[x * height + y];
            if (v !== lastv) {
                if (lastv) {
                    // emit any non-zero sequence
                    lines.push({y_start, y_end: y, x_end: x, color: lastv});
                }
                if (v) {
                    // start a new sequence
                    y_start = y;
                }
            }
            lastv = v;
        }
    }
    return { lines, area };
}

if (!self.navigator && self.process && self.process.env) {
    let fs = require('fs');
    eval(fs.readFileSync("src/add/class.js").toString());
    let args = process.argv.slice(2);
    let file = args.shift();
    // let fpos = 0;
    let view = new DataView(fs.readFileSync(file).buffer);
    let read = new DataReader(view, 0);
    let cxdlp = new CXDLP().read(view);
    console.log({
        cxdlp,
        layers5: cxdlp.layers.slice(0,5),
        lines1: cxdlp.get_layer_lines(1)
    });
} else if (self.navigator) {
    self.CXDLP = CXDLP;
}

});
