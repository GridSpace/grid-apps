(function() {

    const default_values = {
        magic1: 'CXSW3DV2',
        magic2: '',
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
                thumb: read.skip(26914),
                preview1: read.skip(168202),
                preview2: read.skip(168202),
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
                light_pwm: read.readU16(),
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
                    throw `layer length mismatch: ${size} != ${layer_sizes[i]}}`;
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
            // TODO
        }
    }

    if (!this.navigator && this.process && this.process.env) {
        let fs = require('fs');
        let self = this;
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
    } else if (this.navigator) {
        window.CXDLP = CXDLP;
    }
}());
