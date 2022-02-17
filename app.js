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
const version = license.VERSION || "rogue";

const fileCache = {};
const code_src = {};
const code = {};
const mods = {};
const load = [];
const synth = {};
const api = {};

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

function init(mod) {
    startTime = time();
    lastmod = mod.util.lastmod;
    logger = mod.log;
    debug = mod.env.debug || mod.meta.debug;
    http = mod.http;
    util = mod.util;
    dir = mod.dir;
    log = mod.log;

    dversion = debug ? `_${version}` : version;
    cacheDir = mod.util.datadir("cache");

    let depcache = {};

    function find_deps(path, seen = []) {
        let cached = depcache[path];
        if (cached) {
            return cached;
        }
        if (seen.indexOf(path) >= 0) {
            if (debug > 1) {
                console.log(`circular dependency at ${path}`, seen);
            }
            return [];
        }
        seen.push(path);
        let deps = [ "main/gapp" ];
        let lines = fs.readFileSync(`${dir}/src/${path}.js`)
            .toString()
            .split('\n');
        for (let line of lines) {
            let dpos = line.indexOf('// dep:');
            if (dpos >= 0) {
                let dep = line.substring(dpos+7).trim().replace('.','/');
                if (deps.indexOf(dep) < 0) {
                    deps.push(dep);
                }
                let deep = find_deps(dep, seen);
                deps = deps.filter(p => deep.indexOf(p) < 0);
                // deeper dependencies go first
                deps = [...deep, ...deps];
            }
        }
        depcache[path] = deps;
        return deps;
    }

    // process script dependencies, expand paths
    for (let [key,val] of Object.entries(script)) {
        let nval = val.map(p => p.charAt(0) === '&' ? p.substring(1) : p);
        let modd = false;
        for (let path of val) {
            let fc = path.charAt(0);
            if (fc === '@') {
                continue;
            }
            if (fc === '&') {
                path = path.substring(1);
            } else {
                continue;
            }
            let deps = find_deps(path);
            if (deps) {
                // remove deps already in list
                deps = deps.filter(p => nval.indexOf(p) < 0);
                let ppos = nval.indexOf(path);
                if (ppos < 0) {
                    throw `missing ${path} in nval`;
                }
                // inject deps
                nval.splice(ppos,0,...deps);
                modd = true;
            }
            // if list is modified, substitute
            if (modd) {
                if (debug > 1) {
                    console.log({path, val, nval});
                }
                val = nval;
            }
        }
        script[key] = val.map(p => p.charAt(0) !== '@' ? `src/${p}.js` : p);
    }

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
    mod.add(fullpath({
        "/kiri"            : redir("/kiri/", 301),
        "/mesh"            : redir("/mesh/", 301),
        "/meta"            : redir("/meta/", 301),
        "/kiri/index.html" : redir("/kiri/", 301),
        "/mesh/index.html" : redir("/mesh/", 301),
        "/meta/index.html" : redir("/meta/", 301)
    }));
    mod.add(handleVersion);
    mod.add(prepath([
        [ "/code/", handleCode ],
        [ "/wasm/", handleWasm ]
    ]));
    mod.add(fixedmap("/api/", api));
    if (debug) {
        mod.static("/mod/", "mod");
        mod.sync("/reload", () => {
            mod.reload();
            return "reload";
        });
    }
    mod.add(rewriteHtmlVersion);
    mod.static("/src/", "src");
    mod.static("/obj/", "web/obj");
    mod.static("/font/", "web/font");
    mod.static("/mesh/", "web/mesh");
    mod.static("/moto/", "web/moto");
    mod.static("/meta/", "web/meta");
    mod.static("/kiri/", "web/kiri");

    // load modules
    lastmod(`${dir}/mod`) && fs.readdirSync(`${dir}/mod`).forEach(dir => {
        const modpath = `mod/${dir}`;
        if (dir.charAt(0) === '.') return;
        const stats = fs.lstatSync(`${mod.dir}/${modpath}`);
        if (!(stats.isDirectory() || stats.isSymbolicLink())) return;
        loadModule(mod, modpath);
    });

    // run loads injected by modules
    while (load.length) {
        try {
            load.shift()();
        } catch (e) {
            logger.log({on_load_fail: e});
        }
    }

    // runs after module loads / injects
    prepareScripts();
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
    logger.log({module: file});
    require_fresh(file)({
        // express functions added here show up at "/api/" url root
        api: api,
        adm: {
            reload: prepareScripts,
            setver: (ver) => { oversion = ver }
        },
        events,
        const: {
            args: {},
            meta: mod.meta,
            debug: debug,
            script: script,
            moddir: dir,
            rootdir: mod.dir,
            version: version
        },
        env: mod.env,
        pkg: {
            agent,
            moment
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
        inject: (code, file, options) => {
            if (!script[code]) {
                return logger.log(`inject missing target "${code}"`);
            }
            const opt = options || {};
            const path = `${dir}/${file}`;
            if (opt.end) {
                script[code].push(path);
            } else {
                script[code].splice(0, 0, path);
            }
            if (opt.cachever) {
                cachever[path] = opt.cachever;
            }
        },
        path: {
            any: arg => { mod.add(arg) },
            pre: arg => { mod.add(prepath(arg)) },
            map: arg => { mod.add(fixedmap(arg)) },
            full: arg => { mod.add(fullpath(arg)) },
            static: (root, pre) => {
                mod.static(pre || "/", root);
            },
            code: (endpoint, path) => {
                let fpath = mod.dir + "/" + path;
                if (debug) {
                    code[endpoint] = fs.readFileSync(fpath);
                } else {
                    code[endpoint] = minify(fpath);
                }
                code_src[endpoint] = {
                    endpoint,
                    path: path,
                    mod: lastmod(fpath)
                };
            },
            redir: redir,
            remap: remap,
            setup: fn => { setupFn = fn }
        },
        handler: {
            addCORS: addCorsHeaders,
            redirect: http.redirect,
            reply404: http.reply404,
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

const script = {
    kiri : [
        "main/gapp",
        "moto/license",
        "main/kiri",
        "ext/three",
        "ext/three-bgu",
        "ext/three-svg",
        "ext/jszip",
        "ext/clip2",
        "ext/tween",
        "ext/fsave",
        // "ext/earcut",
        "ext/base64",
        "add/array",
        "add/three",
        "geo/base",
        "geo/point",
        "geo/points",
        "geo/slope",
        "geo/line",
        "geo/bounds",
        "geo/polygons",
        "geo/polygon",
        "geo/mesh",
        "data/local",
        "data/index",
        "moto/ajax",
        "moto/orbit",
        "moto/space",
        "load/3mf",
        "load/obj",
        "load/stl",
        "load/svg",
        "load/url",
        "load/file",
        "moto/broker",
        "moto/webui",
        "kiri/ui",
        "kiri/do",
        "kiri/pack",
        "kiri/lang",
        "kiri/lang-en",
        "kiri/catalog",
        "kiri/slice",
        "kiri/layers",
        "kiri/client",
        "kiri-mode/fdm/fill",
        "kiri-mode/fdm/driver",
        "kiri-mode/fdm/client",
        "kiri-mode/sla/driver",
        "kiri-mode/sla/client",
        "kiri-mode/cam/driver",
        "kiri-mode/cam/client",
        "kiri-mode/cam/tool",
        "kiri-mode/cam/animate",
        "kiri-mode/laser/driver",
        "kiri/stack",
        "kiri/stacks",
        "kiri/widget",
        "kiri/codec",
        "kiri/conf",
        "kiri/main",
        "kiri/init",
        "kiri/export",
        "kiri/tools",
        "@devices",
        "@icons"
    ],
    kiri_work : [
        "main/gapp",
        "moto/license",
        "main/kiri",
        "ext/three",
        "ext/pngjs",
        "ext/jszip",
        "ext/clip2",
        "ext/earcut",
        "add/array",
        "add/three",
        "add/class",
        "geo/base",
        "geo/wasm",
        "geo/paths",
        "geo/point",
        "geo/points",
        "geo/slope",
        "geo/line",
        "geo/bounds",
        "geo/polygons",
        "geo/polygon",
        "geo/gyroid",
        "geo/slicer",
        "geo/mesh",
        // "moto/broker",
        "kiri/pack",
        "kiri/slice",
        "kiri/layers",
        "kiri-mode/fdm/fill",
        "kiri-mode/fdm/driver",
        "kiri-mode/fdm/slice",
        "kiri-mode/fdm/prepare",
        "kiri-mode/fdm/export",
        "kiri-mode/sla/driver",
        "kiri-mode/sla/slice",
        "kiri-mode/sla/export",
        "kiri-mode/sla/x_cxdlp",
        "kiri-mode/sla/x_photon",
        "kiri-mode/cam/slicer",
        "kiri-mode/cam/driver",
        "kiri-mode/cam/ops",
        "kiri-mode/cam/tool",
        "kiri-mode/cam/topo",
        "kiri-mode/cam/slice",
        "kiri-mode/cam/prepare",
        "kiri-mode/cam/export",
        "kiri-mode/cam/animate",
        "kiri-mode/laser/driver",
        "kiri/widget",
        "kiri/print",
        "kiri/codec",
        "kiri/worker"
    ],
    kiri_pool : [
        "main/gapp",
        "moto/license",
        "main/kiri",
        "ext/clip2",
        "ext/earcut",
        "add/array",
        "add/class",
        "geo/base",
        "geo/wasm",
        "geo/point",
        "geo/points",
        "geo/slope",
        "geo/line",
        "geo/bounds",
        "geo/polygons",
        "geo/polygon",
        "geo/gyroid",
        "geo/slicer",
        "kiri-mode/fdm/driver",
        "kiri-mode/fdm/slice",
        "kiri/slice",
        "kiri/layers",
        "kiri/widget",
        "kiri/codec",
        "kiri/minion"
    ],
    engine : [
        "main/gapp",
        "moto/license",
        "main/kiri",
        "ext/clip2",
        "data/local",
        "ext/three",
        "add/array",
        "add/three",
        "geo/base",
        "geo/point",
        "geo/points",
        "geo/slope",
        "geo/line",
        "geo/bounds",
        "geo/polygon",
        "geo/polygons",
        "moto/broker",
        "load/obj",
        "load/stl",
        "kiri/conf",
        "kiri/client",
        "kiri/slice",
        "kiri/layers",
        "kiri/widget",
        "kiri/codec",
        "kiri/engine"
    ],
    frame : [
        "main/gapp",
        "kiri/frame"
    ],
    meta : [
        "main/gapp",
        "moto/license",
        "main/meta",
    ],
    mesh : [
        "&main/mesh"
    ],
    mesh_work : [
        "ext/jscad",
        "&mesh/work"
    ],
    mesh_pool : [
        "&mesh/pool"
    ]
};

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
    if (["/kiri/","/mesh/","/meta/"].indexOf(req.app.path) >= 0 && req.url.indexOf(vstr) < 0) {
        if (req.url.indexOf("?") > 0) {
            return http.redirect(res, `${req.url},ver:${vstr}`);
        } else {
            return http.redirect(res, `${req.url}?ver:${vstr}`);
        }
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
    if (req.method === 'OPTIONS') {
        addCorsHeaders(req, res);
        res.end();
    } else {
        next();
    }
}

function handleWasm(req, res, next) {
    let [root, file] = req.app.path.split('/').slice(1);
    let ext = (file || '').split('.')[1];
    let path = `${dir}/src/wasm/${file}`;
    let mod = lastmod(path);

    if (root === 'wasm' && ext === 'wasm' && mod) {
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

function handleCode(req, res, next) {
    let key = req.app.path.split('/')[2].split('.')[0],
        ck = code_src[key],
        js = code[key];

    if (!js) {
        return http.reply404(req, res);
    }
    if (ck) {
        let mpath = `${dir}/${ck.path}`;
        let mod = lastmod(mpath);
        if (mod > ck.mod) {
            if (debug) {
                js = code[ck.endpoint] = fs.readFileSync(mpath);
            } else {
                js = code[ck.endpoint] = minify(mpath);
            }
            ck.mod = mod;
        }
    }

    addCorsHeaders(req, res);
    serveCode(req, res, {
        code: js,
        mtime: startTime
    });
}

function serveCode(req, res, code) {
    if (code.deny) {
        return http.reply404(req, res);
    }

    let imd = ifModifiedDate(req);
    if (imd && code.mtime <= imd && !code.nocache) {
        res.writeHead(304, "Not Modified");
        res.end();
        return;
    }

    let cacheControl = code.nocache ?
        'private, max-age=0' :
        'public, max-age=600';

    res.writeHead(200, {
        'Content-Type': 'application/javascript',
        'Cache-Control': cacheControl,
        'Last-Modified': new Date(code.mtime).toGMTString(),
    });
    res.end(code.code);
}

function generateIcons() {
    let root = `${dir}/src/kiri-ico`;
    let icos = {};
    fs.readdirSync(root).forEach(file => {
        let name = file.split(".")[0]   ;
        icos[name] = fs.readFileSync(`${root}/${file}`).toString();
    });
    synth.icons = `self.icons = ${JSON.stringify(icos)};`;
}

function generateDevices() {
    let root = `${dir}/src/kiri-dev`;
    let devs = {};
    fs.readdirSync(root).forEach(type => {
        let map = devs[type] = devs[type] || {};
        fs.readdirSync(`${root}/${type}`).forEach(device => {
            map[device] = JSON.parse(fs.readFileSync(`${root}/${type}/${device}`));
        });
    });
    synth.devices = `self.devices = ${JSON.stringify(devs)};`;
}

function prepareScripts() {
    generateIcons();
    generateDevices();
    for (let key of Object.keys(script)) {
        code[key] = concatCode(script[key]);
    }
}

function concatCode(array) {
    let code = [];
    let direct = array.filter(f => f.charAt(0) !== '@');
    let inject = array.filter(f => f.charAt(0) === '@').map(f => f.substring(1));

    // in debug mode, the script should load dependent
    // scripts instead of serving a complete bundle
    if (debug) {
        const code = [
            'self.debug=true;',
            '(function() { let load = [ '
        ];
        direct.forEach(file => {
            const vers = cachever[file] || dversion || version;
            code.push(`"/${file.replace(/\\/g,'/')}?${vers}",`);
        });
        code.push([
            ']; function load_next() {',
            'let file = load.shift();',
            'if (!file) return;',
            'if (!self.document) { importScripts(file); return load_next() }',
            'let s = document.createElement("script");',
            's.type = "text/javascript";',
            's.src = file;',
            's.onload = load_next;',
            'document.head.appendChild(s);',
            '} load_next(); })();'
        ].join('\n'));
        inject.forEach(key => {
            code.push(synth[key]);
        });
        return code.join('\n');
    }

    direct.forEach(file => {
        let cached = getCachedFile(file, function(path) {
            return minify(`${dir}/${file}`);
        });
        code.push(cached);
    });

    inject.forEach(key => {
        code.push(synth[key]);
    });

    return code.join('');
}

function getCachedFile(file, fn) {
    let filePath = `${dir}/${file}`;
    let cachePath = cacheDir + "/" + file
            .replace(/\//g,'_')
            .replace(/\\/g,'_')
            .replace(/:/g,'_'),
        cached = fileCache[filePath],
        now = time();

    if (cached) {
        if (now - cached.lastcheck > 60000) {
            let smod = lastmod(filePath),
                cmod = cached.mtime;

            if (!smod) {
                throw "missing source file";
            }
            if (smod > cmod) {
                cached = null;
            } else {
                cached.lastcheck = now;
            }
        }
    }

    if (!cached) {
        let smod = lastmod(filePath),
            cmod = lastmod(cachePath),
            cacheData;

        if (cmod >= smod) {
            cacheData = fs.readFileSync(cachePath);
        } else {
            logger.log({update_cache:filePath});
            cacheData = fn(filePath);
            fs.writeFileSync(cachePath, cacheData);
        }

        cached = {
            data: cacheData,
            mtime: cmod || now,
            lastcheck: now
        };

        fileCache[filePath] = cached;
    }

    return cached.data;
}

function minify(path) {
    let code = fs.readFileSync(path);
    if (path.indexOf("ext/three.js") > 0) {
        return code;
    }
    let mini = uglify.minify(code.toString());
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
    res.setHeader("Access-Control-Allow-Origin", req.headers['origin'] || '*');
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
    return (req, res, next) => http.redirect(res, path, type);
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
    if (["/kiri/","/mesh/","/meta/"].indexOf(req.app.path) >= 0) {
        let real_write = res.write;
        let real_end = res.end;
        let mlen = '{{version}}'.length;
        let vstr = dversion || version;
        if (vstr.length < mlen) {
            vstr = vstr.padStart(mlen,0);
        } else if (vstr.length > mlen) {
            vstr = vstr.substring(0,mlen);
        }
        res.write = function() {
            arguments[0] = arguments[0].toString().replace(/{{version}}/g,vstr);
            real_write.apply(res, arguments);
        };
        res.end = function() {
            if (arguments[0]) {
                arguments[0] = arguments[0].toString().replace(/{{version}}/g,vstr);
            }
            real_end.apply(res, arguments);
        };
    }

    next();
}

module.exports = init;
