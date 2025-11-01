/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import '../add/array.js';
import '../add/class.js';
import '../add/three.js';
import '../kiri/core/lang.js';
import '../kiri/core/lang-en.js';

import { broker } from '../moto/broker.js';
import { run } from '../kiri/core/init.js';

let traceload = location.search.indexOf('traceload') > 0;
let load = [];

if (traceload) {
    broker.subscribe([
        "init.one",
        "init.two",
        "init.lang",
        "init-done",
        "load-done",
    ], (msg, topic) => {
        console.log(topic, '->', msg);
    })
}

function safeExec(fn) {
    try {
        if (traceload) {
            console.log('kiri | exec |', fn);
        }
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
