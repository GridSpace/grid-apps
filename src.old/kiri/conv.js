// device legacy format converter

const arg = process.argv.slice(2);
const mode = arg.shift();
const umode = mode.toUpperCase();
const lmode = mode.toLowerCase();

const fs = require('fs');
const self = {};

eval( fs.readFileSync("src/main/gapp.js").toString() );
const gapp = self.gapp;

eval( fs.readFileSync("src/add/array.js").toString() );
eval( fs.readFileSync("src/data/local.js").toString() );
eval( fs.readFileSync("src/kiri/conf.js").toString() );

gapp.main(undefined, undefined, root => {
    let kiri = root.kiri;
    let conf = kiri.conf;

    for (let file of arg) {
        let code = JSON.parse(fs.readFileSync(file).toString());
        let devi = conf.device_from_code(code, umode);
        conf.fill_cull_once(devi, conf.defaults[lmode].d);
        delete devi.new;
        delete devi.internal;
        delete devi.deviceName;
        // console.log(JSON.stringify(code, undefined, 4));
        console.log(JSON.stringify([code, "-----", devi], undefined, 2));
    }
});
