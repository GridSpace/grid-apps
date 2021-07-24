(function() {
    if (!this.navigator && this.process && this.process.env) {
        let fs = require('fs');
        let args = process.argv.slice(2);
        let file = args.shift();
        let fpos = 0;
        let view = new DataView(fs.readFileSync(file).buffer);

        function skip(len) {
            fpos += len;
            return fpos;
        }

        function nextU8() {
            return view.getUint8(fpos++);
        }

        function nextU16() {
            let u32 = view.getUint16(fpos);
            fpos += 2;
            return u32;
        }

        function nextU32() {
            let u32 = view.getUint32(fpos);
            fpos += 4;
            return u32;
        }

        function read_string(dbl) {
            let len = nextU32();
            let str = '';
            while (--len > 0) {
                if (dbl) {
                    nextU8();
                    len--;
                }
                str += String.fromCharCode(nextU8());
            }
            if (!dbl) {
                fpos++;
            }
            return str;
        }
        console.log({
            file,
            magic: read_string(),
            version: nextU16(),
            model: read_string(),
            layers: nextU16(),
            res_x: nextU16(),
            res_y: nextU16(),
            height: nextU32(),
            skip: skip(60),
            thumb: skip(26914),
            prev1: skip(168202),
            prev2: skip(168202),
            len_x: read_string(true),
            len_y: read_string(true),
            layer: read_string(true),
            layer_light_on: nextU16(),
            layer_light_off: nextU16(),
            base_light_on: nextU16(),
            base_layers: nextU16(),
            base_lift_dist: nextU16(),
            base_lift_speed: nextU16(),
            layer_lift_dist: nextU16(),
            layer_lift_speed: nextU16(),
            down_speed: nextU16(),
            base_light_pwm: nextU16(),
            layer_light_pwm: nextU16(),
        });
    }
}());
