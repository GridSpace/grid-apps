/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import '../add/array.js';
import '../add/class.js';
import '../add/three.js';
import '../kiri/core/lang.js';
import '../kiri/core/lang-en.js';

import { run } from '../kiri/core/init.js';

let load = [];

function safeExec(fn) {
    try {
        fn(kiri.api);
    } catch (error) {
        console.log('load error', fn, error);
    }
}

function checkReady() {
    if (document.readyState === 'complete') {
        console.log(`kiri | boot ctrl | ` + (navigator.serviceWorker.controller ? true : false));
        kiri.api = run();
        self.$ = kiri.api.web.$;
        for (let fn of load) {
            safeExec(fn);
        }
        load = undefined;
        kiri.api.event.emit('load-done', stats);
    }
}

self.kiri = {
    load(fn) {
        // console.log('KIRI LOAD', [...arguments]);
        if (load) {
            load.push(fn);
        } else {
            safeExec(fn);
        }
    }
};

self.moto = { };

// when dom + scripts complete
document.onreadystatechange = checkReady;

checkReady();
