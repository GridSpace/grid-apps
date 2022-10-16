/** example of how to use Kiri:Moto's slicer engine from the command-line */
let fs = require('fs');
let args = process.argv.slice(2);
let opts = {
    dir: process.cwd(),
    output: "-",
    model: "web/obj/cube.stl",
    source: "src/cli/kiri-source.json",
    controller: "src/cli/kiri-controller.json",
    process: "src/cli/kiri-fdm-process.json",
    device: "src/cli/kiri-fdm-device.json",
    tools: "src/cli/kiri-cam-tools.json"
};
for (let i=0; i<args.length; i++) {
    let arg = args[i].split('=');
    let [ key, val ] = arg;
    if (arg.length === 2) {
        key = arg[0];
        val = arg[1];
    } else if (key.indexOf('--') === 0) {
        val = true;
    } else if (key.indexOf('-') === 0) {
        val = args[++i];
    } else {
        val = undefined;
    }
    if (key && val) {
        key = key.replace(/-/g,'');
        opts[key.trim()] = val;
    } else {
        key = "model";
        val = arg;
    }
}
if (opts.help) {
    console.log([
        "cli <options> <file>",
        "   --verbose           | enable verbose logging",
        "   --dir=[dir]         | root directory for file paths (default: '.')",
        "   --model=[file]      | model file to load (or last parameter)",
        "   --tools=[file]      | tools array for CAM mode",
        "   --source=[file]     | source file list (defaults to kiri engine)",
        "   --device=[file]     | device definition file (json)",
        "   --process=[file]    | process definition file (json)",
        "   --controller=[file] | controller definition file (json)",
        "   --output=[file]     | gcode output to file or '-' for stdout",
        "   --position=x,y,z    | move loaded model to position x,y,z",
        "   --rotate=x,y,z      | rotate loaded model x,y,z radians",
        "   --scale=x,y,z       | scale loaded model in x,y,z",
        "   --move=x,y,z        | move loaded model x,y,z millimeters"
    ].join("\r\n"));
    return;
}

let { dir, verbose, model, output, position, move, scale, rotate } = opts;
let exports_save = exports,
    navigator = { userAgent: "" },
    module_save = module,
    THREE = {},
    gapp = {},
    geo = {},
    noop = () => { },
    self = this.self = {
        gapp,
        THREE,
        location: { hostname: 'local', port: 0, protocol: 'fake' },
        postMessage: (msg) => {
            self.kiri.client.onmessage({data:msg});
        }
    };

// fake fetch for worker to get wasm, if needed
let fetch = function(url, opts = {}) {
    if (verbose) console.log({fetch: url});
    if (!url.startsWith('/')) {
        url = `${dir}/${url}`;
    }
    let buf = fs.readFileSync(url);
    return new Promise((resolve, reject) => {
        resolve(new Promise((resolve, reject) => {
            if (opts.format === 'string') {
                return resolve(buf.toString());
            }
            if (opts.format === 'buffer') {
                return resolve(buf);
            }
            if (opts.format === 'eval') {
                return resolve(eval('(' + buf + ')'));
            }
            resolve({
                arrayBuffer: function() {
                    return buf;
                }
            });
        }));
    });
};

// imitate worker process
class Worker {
    constructor(url) {
        if (verbose) console.log({worker: url});
    }

    postMessage(msg) {
        setImmediate(() => {
            self.kiri.worker.onmessage({data:msg});
        });
    }

    onmessage(msg) {
        // if we end up here, something went wrong
        console.trace('worker-recv', msg);
    }

    terminate() {
        // if we end up here, something went wrong
        console.trace('worker terminate');
    }
}

// node is missing these functions so put them in scope during eval
function atob(a) {
    return Buffer.from(a).toString('base64');
}

function btoa(b) {
    return Buffer.from(b, 'base64').toString();
}

async function run() {
    let files = await fetch(opts.source, { format: "eval" } );
    let tools = await fetch(opts.tools, { format: "eval" } );
    let device = await fetch(opts.device, { format: "eval" } );
    let process = await fetch(opts.process, { format: "eval" } );

    for (let file of files.map(p => `${dir}/src/${p}.js`)) {
        let isPNG = file.indexOf("/pngjs") > 0;
        let isClip = file.indexOf("/clip") > 0;
        let isEarcut = file.indexOf("/earcut") > 0;
        let isTHREE = file.indexOf("/three") > 0;
        if (isTHREE) {
            // THREE.js kung-fu fake-out
            exports = {};
        }
        let swapMod = isEarcut;
        if (swapMod) {
            module = { exports: {} };
        }
        let clearMod = isPNG || isClip;
        if (clearMod) {
            module = undefined;
        }
        try {
            if (verbose) console.log(`loading ... ${file}`);
            eval(fs.readFileSync(`${file}`).toString());
        } catch (e) {
            throw e;
        }
        if (isClip) {
            ClipperLib = self.ClipperLib;
        }
        if (isTHREE) {
            Object.assign(THREE, exports);
            // restore exports after faking out THREE.js
            exports = exports_save;
        }
        if (isEarcut) {
            self.earcut = module.exports;
        }
        if (clearMod || swapMod) {
            module = module_save;
        }
    }

    let { kiri, moto, load } = self;

    console.log({version: kiri.version});

    let engine = kiri.newEngine();
    let data = await fetch(model)
    let buf = new Uint8Array(data.arrayBuffer()).buffer;

    return engine.parse(buf)
        .then(data => { if (verbose) console.log({loaded: data}) })
        .then(() => {
            if (position) {
                let [ x, y, z ] = position.split(',').map(v => parseFloat(v || 0));
                if (verbose) console.log('moveTo', {x, y, z});
                engine.moveTo(x,y,z);
            }
            if (move) {
                let [ x, y, z ] = move.split(',').map(v => parseFloat(v || 0));
                if (verbose) console.log('move', {x, y, z});
                engine.move(x,y,z);
            }
            if (scale) {
                let [ x, y, z ] = scale.split(',').map(v => parseFloat(v || 0));
                if (verbose) console.log('scale', {x, y, z});
                engine.scale(x,y,z);
            }
            if (rotate) {
                let [ x, y, z ] = rotate.split(',').map(v => parseFloat(v || 0));
                if (verbose) console.log('rotate', {x, y, z});
                engine.rotate(x,y,z);
            }
        })
        .then(() => engine.setDevice(device))
        .then(() => engine.setProcess(process))
        .then(() => { if (device.mode === 'CAM') engine.setTools(tools) })
        .then(() => engine.setMode(device.mode))
        .then(eng => eng.slice())
        .then(eng => eng.prepare())
        .then(eng => engine.export())
        .then(gcode => {
            if (output === '-') {
                console.log({gcode});
            } else {
                fs.writeFileSync(output, gcode);
            }
        })
        .catch(error => {
            console.log({error});
        });
}

run();
