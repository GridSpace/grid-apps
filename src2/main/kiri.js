/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import '../add/array.js';
import '../add/class.js';
import '../add/three.js';
import '../kiri/lang.js';
import '../kiri/lang-en.js';

import { run } from '../kiri/init.js';

console.log('KIRI V2');

const load = [];

function checkReady() {
    if (document.readyState === 'complete') {
        console.trace('READY!');
        let api = run();
        kiri.api = api;
        for (let fn of load) {
            try {
                fn(api);
            } catch (error) {
                console.log('load error', fn, error);
            }
        }
    }
}

self.kiri = {
    load(fn) {
        console.log('KIRI LOAD', [...arguments]);
        load.push(fn);
    }
};

self.moto = {

};

// when dom + scripts complete
document.onreadystatechange = checkReady;

checkReady();