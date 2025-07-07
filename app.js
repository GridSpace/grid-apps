/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

// ensure each app gets a local version-specific copy, not shared
function require_fresh(path) {
    const rpa = require.resolve(path);
    delete require.cache[rpa];
    return require(rpa);
}

const fs = require('fs');
const uglify = require('uglify-js');
const moment = require('moment');
const agent = require('express-useragent');
const license = require_fresh('./src/moto/license.js');
const version = license.version || "rogue";
const netdb = require('@gridspace/net-level-client');
const PATH = require('path');

const append = { mesh:'', kiri:'' };
const code = {};
const mods = {};
const load = [];
const synth = {};
const api = {};

let forceUseCache = false;
let serviceWorker = true;
let crossOrigin = false;
let setupFn;
let cacheDir;
let startTime;
let oversion;
let dversion;
let lastmod;
let logger;
let debug;
let http;
let util;
let dir;
let log;

const EventEmitter = require('events');
class AppEmitter extends EventEmitter {}
const events = new AppEmitter();

netdb.create = async function(map = {}) {
    if (util.isfile(map.conf)) {
        Object.assign(map, JSON.parse(fs.readFileSync(map.conf)));
    }
    const client = new netdb();
    if (map.host && map.port) await client.open(map.host, map.port);
    if (map.user && map.pass) await client.auth(map.user, map.pass);
    if (map.base) await client.use(map.base);
    logger.log({ netdb: map.host, user: map.user, base: map.base });
    return client;
};

function init(mod) {
    const ENV = mod.env;

    startTime = time();
    lastmod = mod.util.lastmod;
    logger = mod.log;
    debug = ENV.debug || mod.meta.debug;
    oversion = ENV.over || mod.meta.over;
    crossOrigin = ENV.xorigin || mod.meta.xorigin || false;
    serviceWorker = (ENV.service || mod.meta.service) !== false;
    http = mod.http;
    util = mod.util;
    dir = mod.dir;
    log = mod.log;

    if (ENV.single) console.log({ cwd: process.cwd(), env: ENV });
    dversion = debug ? `_${version}` : version;
    cacheDir = ENV.cache || mod.util.datadir("cache");
    if (ENV.single) logger.log({ cacheDir });
    forceUseCache = ENV.cache ? true : false;

    const approot = PATH.join("main","gapp");
    const refcache = {};
    const callstack = [];
    let xxxx = false;

    generateDevices();

    mod.on.test((req) => {
        let cookie = cookieValue(req.headers.cookie, "version") || undefined;
        let vmatch = mod.meta.version || "*";
        if (!Array.isArray(vmatch)) {
            vmatch = [ vmatch ];
        }
        if (vmatch.indexOf("*") >= 0) {
            return true;
        }
        return vmatch.indexOf(cookie) >= 0;
    });

    mod.add(handleSetup);
    mod.add(handleOptions);
    mod.add(serveWasm);
    mod.add(serveCode);
    mod.add(fullpath({
        "/kiri"            : redir("/kiri/", 301),
        "/mesh"            : redir("/mesh/", 301),
        "/meta"            : redir("/meta/", 301),
        "/kiri/index.html" : redir("/kiri/", 301),
        "/mesh/index.html" : redir("/mesh/", 301),
        "/meta/index.html" : redir("/meta/", 301)
    }));
    mod.add(handleVersion);
    mod.add(fixedmap("/api/", api));
    if (debug) {
        mod.static("/mod/", "mod");
        mod.static("/mods/", "mods");
        mod.sync("/reload", () => {
            mod.reload();
            return "reload";
        });
    }
    mod.add(rewriteHtmlVersion);
    // example of how to use the new middleware
    // mod.add(appendContent('/kiri/index.html', '<script>console.log("hello")</script>'));
    mod.static("/lib/", "src");
    mod.static("/obj/", "web/obj");
    mod.static("/font/", "web/font");
    mod.static("/fon2/", "web/fon2");
    mod.static("/mesh/", "web/mesh");
    mod.static("/moto/", "web/moto");
    mod.static("/kiri/", "web/kiri");

    function load_modules(root, force) {
        // load modules
        lastmod(`${dir}/${root}`) && fs.readdirSync(`${dir}/${root}`).forEach(mdir => {
            const modpath = `${root}/${mdir}`;
            if (dir.charAt(0) === '.' && !ENV.single) return;
            const stats = fs.lstatSync(`${mod.dir}/${modpath}`);
            if (!(stats.isDirectory() || stats.isSymbolicLink())) return;
            if (util.isfile(PATH.join(mod.dir,modpath,".disable"))) return;
            const isDebugMod = util.isfile(PATH.join(mod.dir,modpath,".debug"));
            const isElectronMod = util.isfile(PATH.join(mod.dir,modpath,".electron"));
            if (force || (ENV.electron && !isElectronMod)) return;
            if (force || (!ENV.electron && isElectronMod && !isDebugMod)) return;
            try {
                loadModule(mod, modpath);
            } catch (error) {
                console.log({ module: mdir, error });
            }
        });
    }

    // load development and 3rd party modules
    load_modules('mod');

    // load optional local modules
    load_modules('mods');

    // run loads injected by modules
    while (load.length) {
        try {
            load.shift()();
        } catch (e) {
            logger.log({on_load_fail: e});
        }
    }

    // minify appends
    if (!debug) {
        for (let key of Object.keys(append)) {
            append[key] = minify(append[key]);
        }
    }
};

// either add module assets to path or require(init.js)
function loadModule(mod, dir) {
    if (dir.indexOf('node_modules') >= 0) {
        return;
    }
    if (lastmod(`${mod.dir}/${dir}/.ignore`)) {
        return;
    }
    lastmod(`${mod.dir}/${dir}/init.js`) ?
        initModule(mod, `./${dir}/init.js`, dir) :
        mod.static("/", `${mod.dir}/${dir}`);
}

// load module and call returned function with helper object
function initModule(mod, file, dir) {
    logger.log({ module: file, dir });
    require_fresh(file)({
        // express functions added here show up at "/api/" url root
        api: api,
        adm: {
            setver: (ver) => { oversion = ver },
            crossOrigin: (bool) => { crossOrigin = bool }
        },
        events,
        const: {
            args: {},
            meta: mod.meta,
            debug: debug,
            moddir: dir,
            rootdir: mod.dir,
            version: oversion || version
        },
        env: mod.env,
        pkg: {
            agent,
            moment,
            netdb,
        },
        mod: mods,
        util: {
            log: logger.log,
            time: time,
            guid: guid,
            mkdirs: util.mkdir,
            isfile: util.isfile,
            confdir: util.confdir,
            datadir: util.datadir,
            lastmod: lastmod,
            obj2string: obj2string,
            string2obj: string2obj,
            getCookieValue: cookieValue,
            logger: log.new
        },
        inject: (code, file, opt = {}) => {
            const body = fs.readFileSync(dir + '/' + file);
            if (opt.first) {
                append[code] = body.toString() + '\n' + append[code];
            } else {
                append[code] += body.toString() + '\n';
            }
        },
        path: {
            any: arg => { mod.add(arg) },
            code() {
                const [ path, file ] = [ ...arguments ];
                code[path] = fs.readFileSync(file);
            },
            full: arg => { mod.add(fullpath(arg)) },
            map: arg => { mod.add(fixedmap(arg)) },
            pre: arg => { mod.add(prepath(arg)) },
            redir: redir,
            remap: remap,
            setup: fn => { setupFn = fn },
            static: (root, pre) => {
                mod.static(pre || "/", root);
            },
        },
        handler: {
            addCORS: addCorsHeaders,
            redirect: http.redirect,
            reply404: http.reply404,
            decodePost: http.decodePost,
            reply: quickReply
        },
        ws: {
            register: mod.wss
        },
        onload: (fn) => {
            load.push(fn);
        },
        onexit: (fn) => {
            mod.on.exit(fn);
        }
    });
}

// prevent caching of specified modules
const cachever = {};

function promise(resolve, reject) {
    return new Promise(resolve, reject);
}

function rval() {
    return (Math.round(Math.random()*0xffffffff)).toString(36);
}

function guid() {
    return time().toString(36)+rval()+rval()+rval();
}

function time() {
    return Date.now();
}

function obj2string(o) {
    return JSON.stringify(o);
}

function string2obj(s) {
    return JSON.parse(s);
}

function handleSetup(req, res, next) {
    if (setupFn) {
      setupFn(req, res, next);
    } else {
      next();
    }
}

function handleVersion(req, res, next) {
    let vstr = oversion || dversion || version;
    if (["/kiri/","/mesh/"].indexOf(req.app.path) >= 0 && req.url.indexOf(vstr) < 0) {
        if (req.url.indexOf("?") > 0) {
            return http.redirect(res, `${req.url},ver:${vstr}`);
        } else {
            return http.redirect(res, `${req.url}?ver:${vstr}`);
        }
    } else if (!debug) {
        // in production serve packed bundles
        let { path } = req.app;
        if (path === '/lib/mesh/work.js') {
            req.url = req.app.path = '/lib/pack/mesh-work.js';
        } else if (path === '/lib/main/mesh.js') {
            req.url = req.app.path = '/lib/pack/mesh-main.js';
        } else if (path === '/lib/kiri-run/minion.js') {
            req.url = req.app.path = '/lib/pack/kiri-pool.js';
        } else if (path === '/lib/kiri-run/worker.js') {
            req.url = req.app.path = '/lib/pack/kiri-work.js';
        } else if (path === '/lib/main/kiri.js') {
            req.url = req.app.path = '/lib/pack/kiri-main.js';
        }
        // add cors headers on rewrite
        if (path !== req.url) {
            console.log('rewrite', path, req.url);
            addCorsHeaders(req, res);
        }
        next();
    } else {
        next();
    }
}

function handleOptions(req, res, next) {
    try {
        req.app.ua = agent.parse(req.headers['user-agent'] || '');
    } catch (e) {
        logger.log("ua parse error on : "+req.headers['user-agent']);
    }
    res.setHeader("Service-Worker-Allowed", "/");
    if (req.method === 'OPTIONS') {
        addCorsHeaders(req, res);
        res.end();
    } else {
        next();
    }
}

function serveCode(req, res, next) {
    let { path } = req.app;
    if (path.startsWith("/code/")) {
        path = path.split('/')[2].split('.')[0];
        if (code[path]) {
            res.setHeader('Content-Type', 'application/javascript');
            res.setHeader('Cache-Control', 'public, max-age=600');
            return res.end(code[path]);
        }
    }
    next();
}

function serveWasm(req, res, next) {
    let file = req.app.path.split('/').pop();
    let ext = (file || '').split('.')[1];
    let path = PATH.join(dir,"src","wasm",file);
    let mod = lastmod(path);

    if (ext === 'wasm' && mod) {
        let imd = ifModifiedDate(req);
        if (imd && mod <= imd) {
            res.writeHead(304, "Not Modified");
            return res.end();
        }
        res.writeHead(200, {
            'Content-Type': 'application/wasm',
            'Cache-Control': 'public, max-age=600',
            'Last-Modified': new Date(mod).toGMTString(),
        });
        res.end(fs.readFileSync(path));
    } else {
        next();
    }
}

// pack/concat device script strings to inject into /code/ scripts
function generateDevices() {
    let root = PATH.join(dir,"src","kiri-dev");
    let devs = {};
    fs.readdirSync(root).forEach(type => {
        let map = devs[type] = devs[type] || {};
        fs.readdirSync(PATH.join(root,type)).forEach(device => {
            let deviceName = device.endsWith('.json')
                ? device.substring(0,device.length-5)
                : device;
            map[deviceName] = JSON.parse(fs.readFileSync(PATH.join(root,type,device)));
        });
    });
    let dstr = JSON.stringify(devs);
    synth.devices = `self.devices = ${dstr};`;
    fs.writeFileSync(PATH.join(dir,"src","pack","devices.js"), `export const devices = ${dstr};`);
}

function minify(code) {
    let mini = uglify.minify(code.toString(), {
        compress: {
            merge_vars: false,
            unused: false
        }
    });
    if (mini.error) {
        console.trace(mini.error);
        throw mini.error;
    }
    return mini.code;
}

function quickReply(res, code, msg) {
    res.writeHead(code);
    res.end(msg+"\n");
}

function ifModifiedDate(req) {
    let ims = req.headers['if-modified-since'];
    if (ims) {
        // because sys time has a higher resolution than
        // seconds converted from IMS header. so give it
        // an extra second
        return new Date(ims).getTime() + 1000;
    }
    return 0;
}

function addCorsHeaders(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'X-Moto-Ajax, Content-Type');
    res.setHeader('Access-Control-Allow-Origin', req.headers['origin'] || '*');
    if (req.headers['access-control-request-private-network'] === 'true') {
        res.setHeader('Access-Control-Allow-Private-Network', 'true');
    }
    // if (!crossOrigin) {
        res.setHeader("Cross-Origin-Opener-Policy", 'same-origin');
        res.setHeader("Cross-Origin-Embedder-Policy", 'require-corp');
    // }
    res.setHeader("Allow", "GET,POST,OPTIONS");
}

// dispatch for path prefixs
function prepath(pre) {

    function handle(req, res, next) {
        pre.uid = pre.uid || guid();
        req.ppi = req.ppi || {};

        let path = req.app.path,
            key, fn, i = req.ppi[pre.uid] || 0;

        while (i < pre.length) {
            key = pre[i][0];
            fn = pre[i++][1];
            if (path.indexOf(key) === 0) {
                return fn(req, res, () => {
                    req.ppi[pre.uid] = i;
                    handle(req, res, next);
                });
            }
        }

        next();
    }

    return handle;
}

// dispatch full fixed paths
function fullpath(map) {
    return (req, res, next) => {
        let fn = map[req.app.path];
        if (fn) fn(req, res, next);
        else next();
    };
}

// dispatch full paths based on a prefix and a function map
function fixedmap(prefix, map) {
    return (req, res, next) => {
        let path = req.app.path;
        if (path.indexOf(prefix) != 0) return next();
        let fn = map[path.substring(prefix.length)];
        if (fn) fn(req, res, next);
        else next();
    };
}

// HTTP 307 redirect
function redir(path, type) {
    return (req, res, next) => {
        http.redirect(res, path, type);
    }
}

// mangle request path
function remap(path) {
    return (req, res, next) => {
        req.url = req.app.path = path;
        next();
    }
}

function cookieValue(cookie,key) {
    if (!cookie) return null;
    key = (key || "key") + "=";
    let kpos = cookie.lastIndexOf(key);
    if (kpos >= 0) {
        return cookie.substring(kpos+key.length).split(';')[0];
    } else {
        return null;
    }
}

function rewriteHtmlVersion(req, res, next) {
    if ([
        "/kiri/",
        "/mesh/",
        "/lib/mesh/work.js",
        "/lib/kiri-run/worker.js",
        "/lib/kiri-run/minion.js"
    ].indexOf(req.app.path) >= 0) {
        addCorsHeaders(req, res);
    }
    if ([
        "/lib/main/kiri.js",
        "/lib/main/mesh.js",
    ].indexOf(req.app.path) >= 0) {
        const data = append[req.app.path.split('/')[3].split('.')[0]];
        // console.log({ append: req.app.path, data: data?.length });

        if (!data) return next();

        const real_write = res.write;
        const real_end = res.end;
        let body = '';

        res.write = function (chunk, encoding) {
            body += chunk.toString(encoding);
        };

        res.end = function (chunk, encoding) {
            if (chunk) {
                body += chunk.toString(encoding);
            }
            body += data;
            res.setHeader('Content-Length', Buffer.byteLength(body));
            real_write.call(res, body);
            real_end.call(res);
        };
    }

    next();
}

module.exports = init;
