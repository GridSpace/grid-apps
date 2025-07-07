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

// modules to load
let mods = [];

gapp.overlay = Object.assign;

// extract function arguments grouped by type
function exargs(args) {
    return {
        funcs: args.filter(a => typeof a === 'function'),
        arrays: args.filter(a => Array.isArray(a)),
        strings: args.filter(a => typeof a === 'string'),
        objects: args.filter(a => typeof a === 'object' && !Array.isArray(a))
    };
}

// prevent module load from terminating main/init chain
function safeFN(fn, name) {
    return function() {
        try {
            return fn(...arguments);
        } catch (error) {
            if (error.stack) {
                console.log(`[${name}]`, error.stack);
            } else {
                console.log({ register_fail: name, error });
            }
        }
    };
}

// register module without a load function
gapp.register = function() {
    const args = exargs([...arguments]);
    const objs = args.objects || {};
    const name = objs.name || objs.module || args.strings[0];
    const fn   = objs.exec || args.funcs[0];
    const mod  = { fn, name };
    mods.push(mod);
};

// perform dependency checks and run module load functions
gapp.main = function() {
    const args = exargs([...arguments]);
    const objs = args.objects[0] || {};
    const app  = objs.app  || args.strings[0];
    const post = objs.post || args.funcs[0];
    const pre  = objs.pre  || args.funcs[1];
    const root = self;
    // optional fn to run before loading
    if (pre) {
        pre(root);
    }
    // load mods after checking if dependency is present
    for (let mod of mods) {
        let { fn, name } = mod;
        // mods with no name can't be depended on, but are allowed
        if (name) {
            dbug.debug(`${app} | load | ${name}`);
        }
        // modules without functions allowed so they can be depended on
        if (!fn) {
            dbug.debug(`${app} | ${mod.name} | missing fn()`);
            continue;
        }
        // create namespace path in root and execute module load function
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
        safeFN(fn, name)(root, exports => {
            // map exports into module namespace when called
            if (exports) {
                return path[map] = Object.assign(tmp, exports);
            }
        });
    }
    // force runtime error if gapp.load() called gapp.main()
    mods = null;
    // optional if not called inline with startup
    if (post) {
        post(root);
    }
};

})();
