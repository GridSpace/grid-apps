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
const api = {};

let forceUseCache = false;
let serviceWorker = true;
let crossOrigin = false;
let setupFn;
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
let pre;
let alt;

const EventEmitter = require('events');
class AppEmitter extends EventEmitter {}
const events = new AppEmitter();

netdb.create = async function(map = {}) {
    if (util.isfile(map.conf)) {
        Object.assign(map, JSON.parse(fs.readFileSync(map.conf)));
    }
    const client = new netdb();
    try {
        if (map.host && map.port) await client.open(map.host, map.port);
        if (map.user && map.pass) await client.auth(map.user, map.pass);
        if (map.base) await client.use(map.base);
    } catch (e) {
        logger.log({ netdb_setup_error: e });
    }
    logger.log({ netdb: map.host, user: map.user, base: map.base });
    return client;
};

function init(mod) {
    const ENV = mod.env;

    startTime = time();
    lastmod = mod.util.lastmod;
    logger = mod.log;
    alt = ENV.alt;
    pre = ENV.pre || mod.meta.pre;
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
    forceUseCache = ENV.cache ? true : false;

    if (!ENV.electron) {
        generateDevices();
    }

    if (pre) {
        for (let [k,v] of Object.entries(productionMap)) {
            productionMap[`${pre}${k}`] = `${pre}${v}`;
        }
    }

    mod.on.test((req) => {
        if (req.app?.path?.startsWith(pre)) {
            req.url = req.url.substring(pre.length);
            req.app.path = req.app.path.substring(pre.length);
            req.app.ispre = true;
            return true;
        }
        let cookie = cookieValue(req.headers.cookie, "version") || '';
        let vmatch = mod.meta.version || "*";
        if (!Array.isArray(vmatch)) {
            vmatch = [ vmatch ];
        }
        if (vmatch.indexOf("*") >= 0) {
            return true;
        }
        return vmatch.indexOf(cookie) >= 0;
    });

    mod.on.testv((version) => {
        let vmatch = mod.meta.version || "*";
        if (!Array.isArray(vmatch)) {
            vmatch = [ vmatch ];
        }
        if (vmatch.indexOf("*") >= 0) {
            return true;
        }
        return vmatch.indexOf(version) >= 0;
    });

    mod.add(handleSetup);
    mod.add(handleOptions);
    mod.add(serveWasm);
    mod.add(serveCode);
    mod.add(fullpath({
        "/boot"            : redir((pre??"") + "/boot/", 301),
        "/kiri"            : redir((pre??"") + "/kiri/", 301),
        "/mesh"            : redir((pre??"") + "/mesh/", 301),
        "/meta"            : redir((pre??"") + "/meta/", 301),
        "/kiri/index.html" : redir((pre??"") + "/kiri/", 301),
        "/mesh/index.html" : redir((pre??"") + "/mesh/", 301),
        "/meta/index.html" : redir((pre??"") + "/meta/", 301)
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
    mod.static("/lib/", "src");
    mod.static("/obj/", "web/obj");
    mod.static("/font/", "web/font");
    mod.static("/fon2/", "web/fon2");
    mod.static("/mesh/", "web/mesh");
    mod.static("/moto/", "web/moto");
    mod.static("/kiri/", "web/kiri");
    mod.static("/boot/", "web/boot");

    // module loader
    function load_modules(root, force) {
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

    // run load functions injected by modules
    while (load.length) {
        try {
            load.shift()();
        } catch (e) {
            logger.log({on_load_fail: e});
        }
    }

    // minify appends in production mode
    if (!debug) {
        for (let key of Object.keys(append)) {
            append[key] = minify(append[key]);
        }
    }

    if (alt) {
        for (let [ key, val ] of Object.entries(append)) {
            let src = `src/main/${key}.js`;
            if (!fs.existsSync(src)) {
                logger.log('missing:', src);
                continue;
            }
            fs.mkdirSync(`alt/main`, { recursive: true });
            let body = fs.readFileSync(src);
            fs.writeFileSync(`alt/main/${key}.js`, body + val);
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
    // either load the module, or if it's not a module
    // directory, serve the module as static content
    // bound to the root
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
            setver(ver) { oversion = ver },
            crossOrigin(bool) { crossOrigin = bool }
        },
        events,
        const: {
            args: {},
            meta: mod.meta,
            debug,
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
            guid,
            time,
            log: logger.log,
            logger: log.new,
            mkdirs: util.mkdir,
            confdir: util.confdir,
            datadir: util.datadir,
            lastmod: lastmod,
            isfile: util.isfile,
            getCookieValue: cookieValue,
            obj2string(o) { return JSON.stringify(o) },
            string2obj(s) { return JSON.parse(s) },
        },
        path: {
            any(arg) { mod.add(arg) },
            code() {
                const [ path, file ] = [ ...arguments ];
                if (lastmod(file)) {
                    code[path] = fs.readFileSync(file);
                    // console.log({ CODE: path, file });
                } else if (lastmod(mod.dir + '/' + file)) {
                    const alt = mod.dir + '/' + file;
                    code[path] = fs.readFileSync(alt);
                    // console.log({ CODE: path, alt });
                } else {
                    console.log({ MISSING_CODE: path, file });
                }
            },
            full(arg) { mod.add(fullpath(arg)) },
            map(arg) { mod.add(fixedmap(arg)) },
            pre(arg) { mod.add(prepath(arg)) },
            redir: redir,
            remap: remap,
            setup(fn) { setupFn = fn },
            static(root, pre) {
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
        inject(code, file, opt = {}) {
            const path = mod.dir + '/' + dir + '/' + file;
            try {
                const body = fs.readFileSync(path);
                logger.log({ inject: code, file, opt });
                if (opt.first) {
                    append[code] = body.toString() + '\n' + append[code];
                } else {
                    append[code] += body.toString() + '\n';
                }
            } catch (e) {
                logger.log({ missing_file: path, dir, mod });
            }
        },
        onload(fn) {
            load.push(fn);
        },
        onexit(fn) {
            mod.on.exit(fn);
        }
    });
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

function handleSetup(req, res, next) {
    if (setupFn) {
      setupFn(req, res, next);
    } else {
      next();
    }
}

const productionMap = {
    '/lib/mesh/work.js' : '/lib/pack/mesh-work.js',
    '/lib/main/mesh.js' : '/lib/pack/mesh-main.js',
    '/lib/main/kiri.js' : '/lib/pack/kiri-main.js',
    '/lib/kiri/run/engine.js' : '/lib/pack/kiri-eng.js',
    '/lib/kiri/run/minion.js' : '/lib/pack/kiri-pool.js',
    '/lib/kiri/run/worker.js' : '/lib/pack/kiri-work.js',
};

const redirList = [
    "/kiri/",
    "/mesh/"
];

function handleVersion(req, res, next) {
    let vstr = oversion || dversion || version;
    if (!req.app.ispre && redirList.indexOf(req.app.path) === 0 && req.url.indexOf(vstr) < 0) {
        if (req.url.indexOf("?") > 0) {
            return http.redirect(res, `${req.url},ver:${vstr}`);
        } else {
            return http.redirect(res, `${req.url}?ver:${vstr}`);
        }
    } else if (!debug) {
        // in production serve packed bundles
        let { path } = req.app;
        let mapped = productionMap[path];
        if (mapped) {
            req.url = mapped;
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
    let root = PATH.join(dir,"src","kiri","dev");
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
    util.mkdir(PATH.join(dir,"src","pack"));
    fs.writeFileSync(PATH.join(dir,"src","pack","kiri-devs.js"), `export const devices = ${dstr};`);
    if (alt) {
        fs.mkdirSync('alt/pack', { recursive: true });
        fs.writeFileSync(PATH.join(dir,"alt","pack","kiri-devs.js"), `export const devices = ${dstr};`);
    }
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
        let query = req.url.split('?')[1];
        let rpath = path;
        if (query && path.indexOf('?') < 0) {
            rpath += `?${query}`;
        }
        // console.log({ redir: req.url, to: path, query, new_path: rpath });
        http.redirect(res, rpath, type);
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
        "/lib/kiri/run/worker.js",
        "/lib/kiri/run/minion.js",
        "/lib/kiri/run/engine.js",
        "/lib/kiri/run/frame.js"
    ].indexOf(req.app.path) >= 0) {
        addCorsHeaders(req, res);
    }
    if ([
        "/lib/main/kiri.js",
        "/lib/main/mesh.js"
    ].indexOf(req.app.path) >= 0) {
        addCorsHeaders(req, res);
        // const data = append[req.app.path.split('/')[3].split('.')[0]];
        const data = append[req.app.path.split('.')[0].split('/').pop()];

        if (!data) return next();
        if (debug) logger.log({ append: req.app.path, data: data.length });

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
