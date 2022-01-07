/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

/** node compatibility **/

if (typeof(self) === 'undefined') {
    var self = this;
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

// register module without a load function
gapp.register = (name, deps) => {
    gapp.load(undefined, name, deps);
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
gapp.finalize = (app, deps) => {
    // app loader may also pass deps
    gapp.check(app, deps);
    // load mods after checking if dependency is present
    for (let mod of mods) {
        let { fn, name, deps } = mod;
        gapp.check(name, deps);
        // mods with no name can't be depended on, but are allowed
        if (name) {
            dbug.debug(`${app} | load | ${name}`);
        }
        // mods with no function are allowed so they can be depended on
        if (fn) {
            mod.fn();
        }
    }
    // produces an error if finalize is called twice
    // or if load is called after finalize
    mods = null;
};

})();
