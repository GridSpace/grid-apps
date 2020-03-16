/** Copyright Stewart Allen -- All Rights Reserved */

Array.prototype.contains = function(v) {
    return this.indexOf(v) >= 0;
};

Array.prototype.appendAll = function(a) {
    this.push.apply(this,a);
    return this;
};

const helper = {
    log: function() {
        console.log(
            moment().format('YYMMDD.HHmmss'),
            [...arguments]
                .map(v => util.inspect(v, {
                    maxArrayLength: null,
                    breakLength: Infinity,
                    colors: debug,
                    compact: true,
                    sorted: true,
                    depth: null
                }))
                .join(' ')
        );
    }
};

function log(o) {
    helper.log(o);
}

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

/**
 * @param {String[]} path
 */
function mkdirs(path) {
    let root = "";
    path.forEach(seg => {
        if (root) {
            root = root + "/" + seg;
        } else {
            root = seg;
        }
        lastmod(root) || fs.mkdirSync(root);
    });
}

/**
 * @param {String} o
 */
function obj2string(o) {
    return JSON.stringify(o);
}

function string2obj(s) {
    return JSON.parse(s);
}

/**
 * sync return mtime for file or 0 for no such file
 * @param {String} path
 * @returns {number}
 */
function lastmod(path) {
    try {
        return fs.statSync(path).mtime.getTime();
    } catch (e) {
        return 0;
    }
}

/**
 * @param {String} filePath
 * @param {Function} fn
 * @returns {*}
 */
function getCachedFile(filePath, cpath, fn) {
    let cachePath = ".cache/" + cpath
          .replace(/\//g,'_')
          .replace(/\\/g,'_')
          .replace(/:/g,'_'),
        cached = fileCache[filePath],
        now = time();

    if (cached) {
        if (now - cached.lastcheck > 60000) {
            let smod = lastmod(filePath),
                cmod = cached.mtime;

            if (!smod) throw "missing source file";
            if (smod > cmod) cached = null;

            cached.lastcheck = now;
        }
    }

    if (!cached) {
        let smod = lastmod(filePath),
            cmod = lastmod(cachePath),
            cacheData;

        if (cmod >= smod) {
            cacheData = fs.readFileSync(cachePath);
        } else {
            helper.log({update_cache:filePath});
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

/**
 * mangle, cache and concatenate scripts
 */
function prepareScripts() {
    code.kiri = concatCode(script.kiri);
    code.meta = concatCode(script.meta);
    code.work = concatCode(script.work);
    code.worker = concatCode(script.worker);
    inject.kiri_local = htmlScript(codePrefix, script.kiri);
    inject.meta_local = htmlScript(codePrefix, script.meta);
    inject.kiri = htmlScript("code/", ["kiri"]);
    inject.meta = htmlScript("code/", ["meta"]);
    fs.readdir("./web/kiri/filter/FDM", function(err, files) {
        filters_fdm = files || filters_fdm;
    });
    fs.readdir("./web/kiri/filter/CAM", function(err, files) {
        filters_cam = files || filters_cam;
    });
    fs.readdir("./web/kiri/filter/LASER", function(err, files) {
        filters_laser = files || filters_laser;
    });
}

/**
 * @param {String} name
 * @oaram {Array} list
 * @returns {String}
 */
function htmlScript(prefix, list) {
    let code = [];

    list.forEach(file => {
        code.push('\t<script src="/' + prefix + file + '.js/' + ver.VERSION + '"></script>');
    });

    return code.join("\n");
}

/**
 * @param {Array} array
 * @returns {String}
 */
function concatCode(array) {
    let code = [],
        cached,
        cachepath,
        filepath;

    array.forEach((file, index) => {
        if (file.charAt(0) === "/" || file.indexOf(":\\") > 0) {
            filepath = file;
            cachepath = "js_mod" + file
                .replace(/\//g,'_')
                .replace(/\\/g,'_')
                .replace(/:/g,'_');
            array[index] = cachepath.substring(3).replace('.js','');
            fileMap[cachepath.replace("js_","js/")] = filepath;
        } else {
            filepath = codePrefix + file + ".js";
            cachepath = filepath;
        }
        cached = getCachedFile(filepath, cachepath, function(path) {
            return minify(filepath);
        });
        code.push(cached);
    });
    return code.join('');
}

/**
 * @param {String} cookie
 * @param {String} [key]
 * @returns {String | null}
 */
function getCookieValue(cookie,key) {
    if (!cookie) return null;
    key = (key || "key") + "=";
    let kpos = cookie.lastIndexOf(key);
    if (kpos >= 0) {
        return cookie.substring(kpos+key.length).split(';')[0];
    } else {
        return null;
    }
}

/**
 * @param {String} ip
 */
function isNotLocal(ip) {
    return ipLocal.contains(ip) ? null : ip;
}

/**
 * @param {Object} req
 * @returns {String}
 */
function remoteIP(req) {
    let fwd = req.headers['x-forwarded-for'],
        sra = req.socket.remoteAddress,
        cra = req.connection.remoteAddress,
        ip = isNotLocal(fwd) || sra || cra || '',
        ipa = ip.split(',');
    if (ip === '' || ipa.length > 1) {
        helper.log({remote:ipa, fwd, sra, cra});
    }
    return ipa[0];
}

/**
 * @param {Object} res
 * @param {number} code
 * @param {String} msg
 */
function quickReply(res, code, msg) {
    res.writeHead(code);
    res.end(msg+"\n");
}

/**
 * @param {Object} req
 * @param {Object} res
 */
function reply404(req, res) {
    log({"404":req.url, ip:req.gs.ip});
    res.writeHead(404);
    res.end("[404]");
}

/**
 * @param {Object} res
 * @param {String} url
 */
function redirect(res, url) {
    res.writeHead(302, { "Location": url });
    res.end();
}

/**
 * @param {Array} array
 * @param {number} length
 * @param {number} timespan
 * @returns {number}
 */
function limit(array, length, timespan, inc) {
    let now = time(),
        add = inc || 1,
        limit = 0;
    // age out entries older than timespan
    while (array.length > 0 && now-array[0] > timespan) {
        array.shift();
    }
    // count elements over the limit
    while (array.length > length) {
        limit += add;
        array.shift();
    }
    return limit;
}

/**
 * @param {Object} req
 * @param {Object} res
 * @param {Function} next
 */
function setup(req, res, next) {
    let parsed = url.parse(req.url, true),
        ipaddr = remoteIP(req),
        dbikey = db.key(["ip",ipaddr]),
        path = parsed.pathname,
        time = new Date().getTime(),
        rec = ipCache[ipaddr] || {
            saved : 0,
            first: time,
            last: [],
            hits: 0,
            api: [],
            ip: ipaddr,
        },
        ua = 'unknown';

    try {
        ua = agent.parse(req.headers['user-agent'] || '');
    } catch (e) {
        helper.log("ua parse error on : "+req.headers['user-agent']);
    }

    // cache it
    if (rec.saved === 0) {
        ipCache[ipaddr] = rec;
        if (!rec.host) {
            // prevent overlapping lookups for the same address
            rec.host = 'unknown';
            try {
                dns.reverse(ipaddr, (err,addr) => {
                    rec.host = addr;
                });
            } catch (e) {
                helper.log({dns_err: ipaddr})
            }
        }
    }

    // grid.space request state
    req.gs = {
        ua: ua,
        ip: ipaddr,
        iprec: rec,
        local: ipLocal.contains(ipaddr),
        port: req.socket.address().port,
        url: parsed,
        path: parsed.pathname,
        query: parsed.query,
    };

    // fixup local addrs
    if (req.gs.local) req.gs.ip = "::1";

    // track clients & show first instance of IP
    rec.last.push(time);
    rec.hits++;

    // log request
    logger.emit([
        req.method,
        req.headers['host'],
        req.url,
        req.socket.remoteAddress,
        req.headers['origin'] || '',
        req.headers['user-agent'] || ''
        // m: req.method,
        // u: req.url,
        // i: ipaddr,
        // h: req.headers['host'],
        // o: req.headers['origin'],
        // a: req.headers['user-agent']
    ]);

    // update db ip record
    if (time - rec.saved > ipSaveDelay) db.get(dbikey)
        .then(dbrec => {
            // only on the first pull from disk
            if (dbrec && rec.saved === 0) {
                rec.first = dbrec.first;
                rec.hits += dbrec.hits;
                rec.last = dbrec.last.appendAll(rec.last);
                rec.api = dbrec.api.appendAll(rec.api);
            }
            rec.saved = time;
            return rec;
        })
        .then(dbrec => {
            if (rec.putTO) clearTimeout(rec.putTO);
            rec.putTO = setTimeout(() => {
                rec.putTO = null;
                db.put(dbikey, dbrec);
            }, ipSaveDelay);
        })
        .catch(error => {
            helper.log({dbikey, error});
        });

    // absolute limit on client requests per minute
    let rateinc = req.headers.host ? 1 : 50;
    if (limit(rec.last, 300, 60000, rateinc) && !req.gs.local) {
        res.writeHead(503);
        res.end("rate limited");
        return log({rate_limit:ipaddr, len:rec.last.length});
    }

    if (req.method === 'OPTIONS') {
        addCorsHeaders(req, res);
        res.end();
    } else {
        next();
    }
}

function addCorsHeaders(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'X-Moto-Ajax, Content-Type');
    res.setHeader("Access-Control-Allow-Origin", req.headers['origin'] || '*');
    res.setHeader("Allow", "GET,POST,OPTIONS");
}

/**
 * meta:moto data storage and retrieval url
 *
 * @param {Object} req
 * @param {Object} res
 * @param {Function} next
 */
function handleData(req, res, next) {
    addCorsHeaders(req, res);
    res.setHeader('Cache-Control', 'private, no-cache, max-age=0');

    let tok = req.gs.url.path.split('/'),
        muid = req.headers['x-moto-ajax'],
        space = tok[2] || null,
        version = tok[3],
        valid = space && space.length >= 4 && space.length <= 8;

    function genKey() {
        while (true) {
            let k = Math.round(Math.random() * 9999999999).toString(36);
            if (k.length >= 4 && k.length <= 8) return k;
        }
    }

    function countKey(space) {
        return db.key(['meta/counter',space]);
    }

    function ownerKey(space) {
        return db.key(['meta/owner',muid,'space',space]);
    }

    function recordKey(space, version) {
        return db.key(["meta/space",space,version]);
    }

    // retrieve latest space data
    if (valid && req.method === 'GET' && valid) {
        function send(rec, version) {
            if (rec) {
                res.write(obj2string({space:space,ver:version,rec:rec}));
                res.end();
            } else {
                res.end();
            }
        }

        function retrieve(version) {
            return db.get(recordKey(space,version))
                .then(record => {
                    send(record || null, version);
                })
        }

        if (version) {
            retrieve(version)
        } else {
            db.get(countKey(space)).then(version => retrieve(version));
        }

        return;

    } else if (valid && req.method === 'POST') {

        let dbOwner = null,
            dbVersion = null,
            postBody = null,
            iprec = req.gs.iprec,
            spacein = space,
            version = 0,
            body = '';

        function checkDone() {
            if (!(dbVersion && postBody)) return;
            // if not owner, assign new space id
            if (dbVersion > 1) {
                if (!dbOwner) {
                    space = genKey();
                    version = 1;
                    log({forked:space,from:spacein,by:muid});
                }
            }
            // log what we have
            log({
                space: space,
                ver: dbVersion,
                uid: muid,
                ip: iprec.ip,
                hits: iprec.hits,
                size: postBody.length
            });
            if (muid && muid.length > 0) {
                level.put(recordKey(space, dbVersion), body);
                level.put(ownerKey(space), {ip: iprec.ip, time: time(), ver: dbVersion});
                level.put(countKey(space), dbVersion);
            }
            res.end(obj2string({space: space, ver: dbVersion}));
        }

        // accumulate post body
        req.on('data', data => { body += data });
        req.on('end', () => {
            postBody = body;
            checkDone();
        });

        // fetch owner and version information
        db.get(ownerKey(space))
            .then(owner => {
                dbOwner = owner;
                return db.get(countKey(space));
             })
            .then(version => {
                dbVersion = parseInt(version || "0") + 1;
                checkDone();
            });

        return;
    }
}

function minify(path) {
    let code = fs.readFileSync(path);
    let mini = uglify.minify(code.toString());
    if (mini.error) {
        console.trace(mini.error);
        throw mini.error;
    }
    return mini.code;
}

/**
 * @param {Object} req
 * @param {Object} res
 * @param {Function} next
 */
function handleJS(req, res, next) {
    if (!(req.gs.local || debug || clearOK.indexOf(req.gs.path) >= 0)) {
        return reply404(req, res);
    }

    let spath = req.gs.path.substring(1),
        jspos = spath.indexOf(".js"),
        fpath = jspos > 0 ? spath.substring(0,jspos+3) : spath,
        cached = fileCache[fpath];

    if (fileMap[fpath]) {
        fpath = fileMap[fpath];
    }

    fs.stat(fpath, (err, f) => {
        if (err || !f) {
            return reply404(req, res);
        }

        let mtime = f.mtime.getTime();

        if (!cached || cached.mtime != mtime) {
            if (debug) {
                fs.readFile(fpath, null, function(err, code) {
                    if (err) {
                        return reply404(req,res);
                    }
                    serveCode(req, res, fileCache[fpath] = {
                        clear: true,
                        mtime: mtime,
                        code: code
                    });
                });
                return;
            } else {
                let start = new Date().getTime(),
                    code = minify(fpath),
                    end = new Date().getTime();

                log({minify:fpath, in:f.size, out:code.length,  time:(end-start)});

                cached = fileCache[fpath] = {
                    clear: false,
                    mtime: mtime,
                    code: code
                };
            }
        }

        serveCode(req, res, cached);
    });
}

/**
 * @param {Object} req
 * @param {Object} res
 * @param {Function} next
 */
function handleCode(req, res, next) {
    let cookie = getCookieValue(req.headers.cookie),
        key = req.gs.path.split('/')[2].split('.')[0],
        ck = code_src[key],
        js = code[key];

    if (!js) {
        return reply404(req, res);
    }

    if (ck) {
        let mod = lastmod(ck.path);
        if (mod > ck.mod) {
            if (debug) {
                js = code[ck.endpoint] = fs.readFileSync(ck.path);
            } else {
                js = code[ck.endpoint] = minify(ck.path);
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

/**
 * @param {Object} req
 * @param {Object} res
 * @param {Obejct} code
 */
function serveCode(req, res, code) {
    if (code.deny) {
        return reply404(req, res);
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

/**
 * @param {Object} req
 * @param {Object} res
 * @param {Function} next
 */
function rewriteHTML(req, res, next) {
    function sendHTML(entry) {
        let imd = ifModifiedDate(req);
        if (imd && entry.mtime <= imd) {
            res.writeHead(304, "Not Modified");
            res.end();
            return;
        }
        res.writeHead(200, {
            'Last-Modified': new Date(entry.mtime).toGMTString(),
            'Cache-Control': 'public, max-age=600',
            'Content-Type': 'text/html'
        });
        res.write(entry.data);
        res.end();
    }

    if (req.url.indexOf(".html") > 0) {
        let local = req.gs.local,
            key = local ? "local_" + req.url : req.url,
            path = "web" + req.gs.path,
            mtime = lastmod(path),
            cached = fileCache[key],
            replaced = false,
            magic;

        if (mtime === 0) return next();
        if (cached && mtime === cached.mtime) return sendHTML(cached);

        fs.readFile(path, (err, data) => {
            if (!data) return next();
            data = data.toString();

            injectKeys.forEach(key => {
                if (replaced) return;
                magic = "<!--{"+key+"}-->";
                if (data.indexOf(magic) > 0) {
                    data = data.replace(magic, inject[local ? key + "_local" : key]);
                    replaced = true;
                }
            });

            if (replaced) {
                cached = fileCache[key] = {
                    data: data,
                    mtime: mtime
                };
                sendHTML(cached);
            } else {
                next();
            }
        });
    } else {
        next();
    }
}

/* *********************************************
 * Setup / Global
 ********************************************* */

let debug = false,
    nolocal = false
    port = 8080,
    args = process.argv.slice(2);

args.forEach((arg, index) => {
    switch (arg) {
        case 'nolocal': nolocal = true; break;
        case 'debug': debug = true; break;
        case 'port': port = process.argv[index+3]; break;
    }
});

let ver = require('../js/license.js'),
    fs = require('fs'),
    url = require('url'),
    dns = require('dns'),
    util = require('util'),
    path = require('path'),
    valid = require('validator'),
    agent = require('express-useragent'),
    spawn = require('child_process').spawn,
    level = require('level')('./persist', {valueEncoding:"json"}),
    https = require('https'),
    moment = require('moment'),
    uglify = require('uglify-es'),
    connect = require('connect'),
    serveStatic = require('serve-static'),
    compression = require('compression')(),
    querystring = require('querystring'),
    ipLocal = nolocal ? [] : ["127.0.0.1", "::1", "::ffff:127.0.0.1"],
    currentDir = process.cwd(),
    ipSaveDelay = 2000,
    startTime = time(),
    codePrefix = "js/",
    fileCache = {},
    fileMap = {},
    filters_fdm = [],
    filters_cam = [],
    filters_laser = [],
    modPaths = [],
    ipCache = {},
    clearOK = [
        '/js/ext-three.js'
    ],
    script = {
        kiri : [
            "license",
            "ext-clip",
            "ext-tween",
            "ext-fsave",
            "add-array",
            "add-three",
            "geo",
            "geo-debug",
            "geo-render",
            "geo-point",
            "geo-slope",
            "geo-line",
            "geo-bounds",
            "geo-polygon",
            "geo-polygons",
            "geo-gyroid",
            "moto-kv",
            "moto-ajax",
            "moto-ctrl",
            "moto-space",
            "moto-load-stl",
            "moto-db",
            "moto-ui",
            "kiri-lang",
            "kiri-fill",
            "kiri-db",
            "kiri-slice",
            "kiri-slicer",
            "kiri-driver-fdm",
            "kiri-driver-cam",
            "kiri-driver-laser",
            "kiri-pack",
            "kiri-layer",
            "kiri-widget",
            "kiri-print",
            "kiri-codec",
            "kiri-work",
            "kiri-conf",
            "kiri",
            "kiri-init",
            "kiri-export"
        ],
        meta : [
            "license",
            "ext-tween",
            "ext-fsave",
            "add-array",
            "add-three",
            "moto-kv",
            "moto-ajax",
            "moto-ctrl",
            "moto-space",
            "moto-load-stl",
            "moto-db",
            "moto-ui",
            "kiri-db",
            "meta"
        ],
        work : [
            "license",
            "ext-n3d",
            "ext-clip",
            "add-array",
            "add-three",
            "geo",
            "geo-debug",
            "geo-point",
            "geo-slope",
            "geo-line",
            "geo-bounds",
            "geo-polygon",
            "geo-polygons",
            "geo-gyroid",
            "kiri-lang",
            "kiri-fill",
            "kiri-slice",
            "kiri-slicer",
            "kiri-driver-fdm",
            "kiri-driver-cam",
            "kiri-driver-laser",
            "kiri-pack",
            "kiri-widget",
            "kiri-print",
            "kiri-codec"
        ],
        worker : [
            "license",
            "kiri-worker"
        ]
    },
    code_src = {},
    code = {},
    inject = {},
    injectKeys = ["kiri", "meta"],
    WS = require('ws'),
    wss = new WS.Server({ noServer: true }),
    wss_roots = {},
    loads = [],
    exits = [],
    mods = {},
    logger = open_logger({dir: ".log-main"})
    ;

/* *********************************************
 * Promises-based leveldb interface
 ********************************************* */
const db = {
    // --------
    key: arr => arr.join("/"),
    // --------
    get: key => {
        if (Array.isArray(key)) key = db.key(key);
            return promise((resolve,reject) => {
                level.get(key,(err,record) => {
                resolve(record,err);
            });
        });
    },

    // --------
    put: (key, value) => {
    if (Array.isArray(key)) key = db.key(key);
        return promise((resolve,reject) => {
            level.put(key,value,(err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    },
    // --------
    del: key => {
    return promise((resolve,reject) => {
        level.del(key, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }
};

/* *********************************************
 * REST API (extensible in modules)
 ********************************************* */
const api = {

    rateLimit: (req, res, next) => {
        req.gs.iprec.api.push(time());

        // allow 60 calls in 60 seconds
        if (limit(req.gs.iprec.api, 60, 60000) && !req.gs.local) {
            quickReply(res, 503, "rate limited");
            try { log({rate_limit_api: req.gs.ip, url: req.gs.url}); } catch (e) { helper.log(e) }
        } else {
            next();
        }
    },

    "filters-fdm": (req, res, next) => {
        res.setHeader("Content-Type", "application/javascript");
        res.end(obj2string(filters_fdm));
    },

    "filters-cam": (req, res, next) => {
        res.setHeader("Content-Type", "application/javascript");
        res.end(obj2string(filters_cam));
    },

    "filters-laser": (req, res, next) => {
        res.setHeader("Content-Type", "application/javascript");
        res.end(obj2string(filters_laser));
    }

};

/* *********************************************
 * Dispatch Helpers
 ********************************************* */

// dispatch for path prefixs
function prepath(pre) {

    function handle(req, res, next) {
        pre.uid = pre.uid || guid();
        req.ppi = req.ppi || {};

        let path = req.gs.path,
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
        let fn = map[req.gs.path];
        if (fn) fn(req, res, next);
        else next();
    };
}

// dispatch full paths based on a prefix and a function map
function fixedmap(prefix, map) {
    return (req, res, next) => {
        let path = req.gs.path;
        if (path.indexOf(prefix) != 0) return next();
        let fn = map[path.substring(prefix.length)];
        if (fn) fn(req, res, next);
        else next();
    };
}

// HTTP 302 redirect
function redir(path) {
    return (req, res, next) => redirect(res, path);
}

// mangle request path
function remap(path) {
    return (req, res, next) => {
        req.url = req.gs.path = path;
        next();
    }
}

// load module and call returned function with helper object
function initModule(file, dir) {
    helper.log({module:file});
    require(file)({
        api: api,
        const: {
            args: args,
            debug: debug,
            script: script,
            moddir: dir,
            rootdir: currentDir,
            version: ver.VERSION
        },
        pkg: {
            agent,
            moment
        },
        mod: mods,
        util: {
            log: helper.log,
            time: time,
            guid: guid,
            mkdirs: mkdirs,
            lastmod: lastmod,
            obj2string: obj2string,
            string2obj: string2obj,
            getCookieValue: getCookieValue,
            logger: open_logger
        },
        db: {
            api: db,
            level: level
        },
        inject: (code, file, options) => {
            let opt = options || {};
            if (opt.end) {
                script[code].push(dir + "/" + file);
            } else {
                script[code].splice(0, 0, dir + "/" + file);
            }
        },
        path: {
            any: arg => { modPaths.push(arg) },
            pre: arg => { modPaths.push(prepath(arg)) },
            map: arg => { modPaths.push(fixedmap(arg)) },
            full: arg => { modPaths.push(fullpath(arg)) },
            static: (root, pre) => { modPaths.push(handleStatic(root, pre)) },
            code: (endpoint, path) => {
                if (debug) {
                    code[endpoint] = fs.readFileSync(path);
                } else {
                    code[endpoint] = minify(path);
                }
                code_src[endpoint] = {
                    endpoint,
                    path,
                    mod: lastmod(path)
                };
            },
            redir: redir,
            remap: remap
        },
        handler: {
            addCORS: addCorsHeaders,
            static: handleStatic,
            redirect: redirect,
            reply404: reply404,
            reply: quickReply
        },
        ws: {
            register: ws_register_root
        },
        onload: (fn) => {
            loads.push(fn);
        },
        onexit: (fn) => {
            exits.push(fn)
        }
    });
}

function handleStatic(root, pre) {
    let statServe = serveStatic(root);
    return function(req, res, next) {
        if (pre) {
            if (req.url.indexOf(pre) === 0) {
                if (req.url === pre) {
                    req.url = "/";
                } else {
                    req.url = req.url.substring(pre.length);
                }
                return statServe(req, res, next);
            }
            return next();
        }
        statServe(req, res, next);
    };
}

// add static assets to be served
function addStatic(dir, pre) {
    helper.log({static:dir});
    modPaths.push(handleStatic(dir, pre));
}

// either add module assets to path or require(init.js)
function loadModule(dir) {
    if (dir.indexOf('node_modules') >= 0) {
        return;
    }
    if (lastmod(dir + "/.ignore")) {
        return;
    }
    const modjs = dir + "/init.js";
    lastmod(modjs) ? initModule(modjs, dir) : addStatic(dir);
}

function ws_delete_root(path) {
    ws_register_root(path);
}

function ws_register_root(path, handler) {
    if (handler) {
        wss_roots[path] = handler;
    } else {
        delete wss_roots[path];
    }
}

function open_logger(options) {
    let opt = options || {
        dir: "logs"
    }
    let exiting = false;
    let logfile = null;
    let logstream = null;
    let pattern = opt.pattern || 'YY-MM-DD-HH';
    let last_pattern;
    let count_min = opt.min || 1000;
    let count = 0;

    try {
        fs.mkdirSync(opt.dir);
    } catch (e) { }

    // create file write stream
    function open_file_stream() {
        close_file_stream();
        logfile = path.join(opt.dir, last_pattern = moment().format(pattern));
        logstream = fs.createWriteStream(logfile, {flags: 'a'});
        let cur = path.join(opt.dir, "current");
        try { fs.unlinkSync(cur) } catch (e) { }
        try { fs.symlinkSync(last_pattern, cur) } catch (e) { }
        count = 0;
    }

    function close_file_stream() {
        if (logstream) {
            logstream.end();
            logstream.close();
            logstream = null;
        }
    }

    function emit(obj) {
        if (exiting) {
            return;
        }
        let next_pattern = moment().format(pattern);
        if (++count > count_min && next_pattern !== last_pattern) {
            open_file_stream();
        }
        let output = [moment().format('YYMMDD-HHmmss'),' ',JSON.stringify(obj),'\n'].join('');
        logstream.write(output);
    }

    function exit() {
        exiting = true;
        close_file_stream();
    }

    open_file_stream();

    exits.push(exit);

    return { emit, close: close_file_stream };
}

function processLoad() {
    while (loads.length) {
        try {
            loads.shift()();
        } catch (e) {
            log({on_load_fail: e});
        }
    }
}

function processExit(code) {
    logger.emit({exit: code, registered: exits.length});
    while (exits.length) {
        try {
            exits.shift()(code);
        } catch (e) {
            log({on_exit_fail: e});
        }
    }
    process.exit();
}

/* *********************************************
 * Start it up
 ********************************************* */

// load modules
lastmod("mod") && fs.readdirSync(currentDir + "/mod").forEach(dir => {
    const fullpath = currentDir + "/mod/" + dir;
    if (dir.charAt(0) === '.') return;
    const stats = fs.lstatSync(fullpath);
    if (!(stats.isDirectory() || stats.isSymbolicLink())) return;
    loadModule(fullpath);
});

// create cache dir if missing
lastmod(".cache") || mkdirs([".cache"]);

// precache responses
prepareScripts();

// create web handler chain
let handler = connect().use(setup);

// add path handlers registered by modules
modPaths.forEach(fn => {
    handler = handler.use(fn);
});

// add the rest of the handler chain
handler.use(fullpath({
        "/kiri/index.html" : redir("/kiri/"),
        "/kiri"            : redir("/kiri/"),
        "/kiri/"           : remap("/kiri/index.html"),
        "/meta/index.html" : redir("/meta/"),
        "/meta"            : redir("/meta/"),
        "/meta/"           : remap("/meta/index.html")
    }))
    .use(prepath([
        [ "/space", redir("/meta/")],
        [ "/api/",  api.rateLimit ],
        [ "/data/", handleData ],
        [ "/code/", handleCode ],
        [ "/js/",   handleJS ]
    ]))
    .use(fixedmap("/api/", api))
    .use(rewriteHTML)
    .use(compression)
    .use(handleStatic(currentDir + "/web/"))
    .listen(port)
    .on('upgrade', (request, socket, head) => {
        let handler = wss_roots[request.url];
        if (handler) {
            wss.handleUpgrade(request, socket, head, ws => {
                try {
                    handler(ws, request);
                } catch (err) {
                    log({wss_handler_error: err});
                    ws_delete_root(request.url);
                    socket.destroy();
                }
            });
        } else {
            socket.destroy();
        }
    });

helper.log("------------------------------------------");
helper.log({port, debug, nolocal, version: ver.VERSION});
logger.emit({port, debug, nolocal, version: ver.VERSION});

process.on('beforeExit', processExit);

process.on('exit', processExit);

process.on('SIGINT', function(sig, code) {
    helper.log("caught sigint");
    logger.emit({signal: sig, code});
    processExit(code);
});

process.on('SIGHUP', function(sig, code) {
    helper.log("caught sighup");
    logger.emit({signal: sig, code});
    processExit(code);
});

processLoad();
