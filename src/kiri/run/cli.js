/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

/** updated to use esbuild bundle output instead of eval-based gapp loader */

import fs from 'fs';
import path from 'path';

let args = process.argv.slice(2);
let root = path.resolve(import.meta.dirname, '../../..');
let opts = {
    dir: root,
    output: "-",
    model: "web/obj/cube.stl",
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
        "   --dir=[dir]         | root directory for file paths (default: repo root)",
        "   --model=[file]      | model file to load (or last parameter)",
        "   --tools=[file]      | tools array for CAM mode",
        "   --device=[file]     | device definition file (json)",
        "   --process=[file]    | process definition file (json)",
        "   --controller=[file] | controller definition file (json)",
        "   --output=[file]     | gcode output to file or '-' for stdout",
        "   --position=x,y,z    | move loaded model to position x,y,z",
        "   --rotate=x,y,z      | rotate loaded model x,y,z radians",
        "   --scale=x,y,z       | scale loaded model in x,y,z",
        "   --move=x,y,z        | move loaded model x,y,z millimeters"
    ].join("\r\n"));
    process.exit(0);
}

let { dir, verbose, model, output, position, move, scale, rotate } = opts;

// resolve paths relative to dir
function resolve(file) {
    if (path.isAbsolute(file)) return file;
    return path.join(dir, file);
}

// read json config file (supports trailing commas like the cli configs)
function readJSON(file) {
    let raw = fs.readFileSync(resolve(file)).toString();
    // strip trailing commas before } or ] (relaxed json)
    raw = raw.replace(/,\s*([\]}])/g, '$1');
    return JSON.parse(raw);
}

// node is missing browser globals used during bundle import
let noop = () => {};
let mockCtx = new Proxy({}, { get: (t, p) => typeof p === 'symbol' ? undefined : () => mockCtx });
let mockEl = () => ({
    getContext: () => mockCtx, style: {}, appendChild: noop,
    addEventListener: noop, setAttribute: noop, removeEventListener: noop,
    classList: { add: noop, remove: noop, contains: () => false },
    width: 256, height: 256, getBoundingClientRect: () => ({}),
    querySelector: () => null, querySelectorAll: () => [],
    innerHTML: '', insertBefore: noop, removeChild: noop, contains: () => false
});

globalThis.self = globalThis;
globalThis.window = globalThis;
globalThis.navigator = { userAgent: 'node', hardwareConcurrency: 0, language: 'en-US' };
globalThis.location = { hostname: 'localhost', port: 0, protocol: 'file:', search: '', hash: '', host: 'localhost', href: 'http://localhost/' };
globalThis.document = {
    createElement: mockEl, createElementNS: () => mockEl(),
    addEventListener: noop, body: { appendChild: noop, style: {}, contains: () => false },
    head: { appendChild: noop }, querySelectorAll: () => [],
    getElementById: () => null, documentElement: { style: {} }
};
globalThis.HTMLCanvasElement = class {};
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 16);
globalThis.cancelAnimationFrame = noop;
globalThis.WebSocket = class { addEventListener() {} close() {} send() {} };
globalThis.XMLHttpRequest = class { open() {} send() {} setRequestHeader() {} };
globalThis.Blob = class { constructor() {} };
globalThis.URL.createObjectURL = () => 'blob:fake';
globalThis.URL.revokeObjectURL = noop;
globalThis.ResizeObserver = class { observe() {} disconnect() {} };
globalThis.MutationObserver = class { observe() {} disconnect() {} };
globalThis.getComputedStyle = () => new Proxy({}, { get: () => '' });
globalThis.matchMedia = () => ({ matches: false, addEventListener: noop });
globalThis.localStorage = { getItem: () => null, setItem: noop, removeItem: noop };
globalThis.sessionStorage = { getItem: () => null, setItem: noop };
globalThis.DOMParser = class { parseFromString() { return { querySelector: () => null, querySelectorAll: () => [] } } };
globalThis.Image = class { set src(v) {} addEventListener() {} };
globalThis.indexedDB = null;
globalThis.atob = (a) => Buffer.from(a, 'base64').toString('binary');
globalThis.btoa = (b) => Buffer.from(b, 'binary').toString('base64');

// fake fetch reads files from disk, resolving paths relative to repo root
globalThis.fetch = function(url) {
    if (typeof url !== 'string') return Promise.resolve({ ok: false });
    // handle relative paths from bundle location (e.g. '../wasm/manifold.wasm')
    if (url.startsWith('../') || url.startsWith('./')) {
        url = path.resolve(root, 'src/pack', url);
    } else if (!path.isAbsolute(url) && !url.startsWith('http')) {
        url = resolve(url);
    }
    if (verbose) console.log({fetch: url});
    try {
        let buf = fs.readFileSync(url);
        return Promise.resolve({
            ok: true,
            arrayBuffer: () => Promise.resolve(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)),
            text: () => Promise.resolve(buf.toString()),
            json: () => Promise.resolve(JSON.parse(buf.toString()))
        });
    } catch (e) {
        return Promise.resolve({ ok: false });
    }
};

// suppress async errors from optional wasm modules (manifold-3d)
process.on('unhandledRejection', () => {});
process.on('uncaughtException', (err) => {
    if (err && err.message && err.message.includes('Aborted')) return;
    process.stderr.write(err.stack || err.message || String(err));
    process.exit(1);
});
process.abort = noop;

// imitate worker process using in-process message bridge
// tracks all workers so pool minions don't steal the main channel
let workerOnMessage = null;
let workers = [];

globalThis.Worker = class {
    constructor(url) {
        if (verbose) console.log({worker: url});
        this.onmessage = null;
        this._id = workers.length;
        workers.push(this);
    }
    postMessage(msg, xfer) {
        // pool management messages (cmd) are not handled by the worker
        if (msg && msg.cmd) return;
        setImmediate(() => { if (workerOnMessage) workerOnMessage({ data: msg }) });
    }
    terminate() {}
    addEventListener(type, fn) {
        if (type === 'message') {
            this.onmessage = (e) => fn(e);
        }
    }
};

// worker calls postMessage to send results back to the main worker (first created)
globalThis.postMessage = function(msg, xfer) {
    setImmediate(() => {
        let w = workers[0];
        if (w && w.onmessage) w.onmessage({ data: msg });
    });
};

globalThis.createWorker = () => new Worker();

// redirect console.log to stderr so stdout stays clean for gcode piping
let _log = console.log;
console.log = (...args) => {
    if (verbose) process.stderr.write(args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ') + '\n');
};

// load worker bundle first to register message handler
await import(root + '/src/pack/kiri-work.js').catch(() => {});
workerOnMessage = self.onmessage;

// load engine bundle
let { newEngine } = await import(root + '/src/pack/kiri-eng.js');

async function run() {
    let tools = readJSON(opts.tools);
    let device = readJSON(opts.device);
    let procset = readJSON(opts.process);
    let controller = readJSON(opts.controller);

    let engine = newEngine();
    engine.setController({ threaded: false });

    let modelPath = resolve(model);
    if (!fs.existsSync(modelPath)) {
        process.stderr.write(`model not found: ${modelPath}\n`);
        process.exit(1);
    }
    let data = fs.readFileSync(modelPath);
    let buf = new Uint8Array(data).buffer;

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
        .then(() => engine.setProcess(procset))
        .then(() => { if (device.mode === 'CAM') engine.setTools(tools) })
        .then(() => { if (device.mode) engine.setMode(device.mode) })
        .then(eng => engine.slice())
        .then(eng => engine.prepare())
        .then(eng => engine.export())
        .then(gcode => {
            if (output === '-') {
                process.stdout.write(gcode);
            } else {
                let outpath = resolve(output);
                fs.writeFileSync(outpath, gcode);
                process.stderr.write(`wrote ${gcode.length} bytes to ${outpath}\n`);
            }
            process.exit(0);
        })
        .catch(error => {
            process.stderr.write(JSON.stringify({error}) + '\n');
            process.exit(1);
        });
}

run();
