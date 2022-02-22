/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

/** node compatibility **/

if (typeof(self) === 'undefined') {
    this.self = this;
}

(function () {

/** satisfy earcut, tween, etc **/

if (!self.module) self.module = { exports: {} };

/** debug and logging **/

let mark = Date.now();

let since = () => {
    return ((Date.now() - mark) / 1000).toFixed(2).padStart(9,0);
};

let dbug = self.dbug = self.dbug || {
    level: 1, // 0=debug, 1=normal, 2=warn, 3=error

    set: (level) => {
        if (level >= 0) dbug.level = Math.min(level, 3);
    },

    debug: function() {
        if (dbug.level <= 0) return console.log(since(),'[DBG]', ...arguments);
    },

    log: function() {
        if (dbug.level <= 1) return console.log(since(),'|',...arguments);
    },

    warn: function() {
        if (dbug.level <= 2) return console.log(since(),'[WRN]', ...arguments);
    },

    error: function() {
        if (dbug.level <= 3) return console.trace(since(),'[ERR]', ...arguments);
    },

    since
};

/** empty function. countless possible uses **/

self.noop = () => {};

/** grid app container **/

let gapp = self.gapp = self.gapp || {};

if (gapp.load) return;

// modules to load
let mods = [];
let modn = {};

gapp.overlay = Object.assign;

// register module without a load function
gapp.register = (name, deps, fn) => {
    gapp.load(fn, name, deps);
};

// register module with a load function
gapp.load = (fn, name, deps) => {
    let mod = {fn, name, deps};
    mods.push(mod);
    if (name) {
        modn[name] = mod;
    }
};

// check dependency list and warn if one is missing
gapp.check = (name, deps = []) => {
    // warn if dependencies are not present
    for (let dep of deps) {
        if (!modn[dep]) {
            dbug.warn(`'${name || 'module'}' missing dependency '${dep}'`);
        }
    }
};

// perform dependency checks and run module load functions
gapp.main = (app, deps, post, pre) => {
    const root = self;
    // optional fn to run before loading
    if (pre) pre(root);
    // app loader may also pass deps
    gapp.check(app, deps);
    // load mods after checking if dependency is present
    for (let mod of mods) {
        let { fn, name, deps } = mod;
        if (deps && deps.length) {
            dbug.warn({app, mod, deps});
            gapp.check(name, deps);
        }
        // mods with no name can't be depended on, but are allowed
        if (name) {
            dbug.debug(`${app} | load | ${name}`);
        }
        // mods with no function are allowed so they can be depended on
        if (fn) {
            let toks = name.split('.');
            let map = toks.pop();
            let path = root;
            for (let tok of toks) {
                if (!path[tok]) {
                    dbug.debug({creating_root: tok, for: name});
                    path = path[tok] = {};
                } else {
                    path = path[tok];
                }
            }
            let tmp = path[map] || {};
            fn(root, exports => {
                if (exports) {
                    return path[map] = Object.assign(tmp, exports);
                }
            });
        }
    }
    // force runtime error if gapp.load() called gapp.main()
    mods = null;
    // optional if not called inline with startup
    if (post) post(root);
};

})();
