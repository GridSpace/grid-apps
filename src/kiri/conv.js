let fs = require('fs');
var clone = Object.clone = function(o) {
    return JSON.parse(JSON.stringify(o));
};
var self = { kiri: { api: { clone } } };

eval( fs.readFileSync("src/kiri/conf.js").toString() );

let arg = process.argv.slice(2);
let mode = arg.shift();
let umode = mode.toUpperCase();
let lmode = mode.toLowerCase();
let kiri = self.kiri;
let conf = kiri.conf;
for (let file of arg) {
    let code = JSON.parse(fs.readFileSync(file).toString());
    let devi = conf.device_from_code(code, umode);
    conf.fill_cull_once(devi, conf.defaults[lmode].d);
    delete devi.new;
    delete devi.internal;
    delete devi.deviceName;
    // console.log({code, devi});
    console.log(JSON.stringify(code,undefined,4));
}
