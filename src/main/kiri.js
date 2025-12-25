/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import '../add/array.js';
import '../add/class.js';
import '../add/three.js';
import '../kiri/app/lang.js';
import '../kiri/core/lang-en.js';

import { api } from '../kiri/app/api.js';
import { init_lang } from '../kiri/app/init-lang.js';
import { init_one } from '../kiri/app/init-one.js';
import { init_two } from '../kiri/app/init-two.js';

let traceload = location.search.indexOf('traceload') > 0;
let load = [];

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

async function checkReady() {
    if (document.readyState === 'complete') {
        let bootctrl = navigator.serviceWorker.controller;
        console.log(`kiri | boot ctrl | ` + (bootctrl ? true : false));
        kiri.api = api;
        self.$ = api.web.$;
        {
            api.client.start();
            await init_lang();
            await init_one();
            await init_two();
        }
        for (let fn of load) {
            safeExec(fn);
        }
        load = undefined;
        api.event.emit('load-done', stats);
        if (api.electron) {
            $('install').classList.add('hide');
            $('app-quit').classList.remove('hide');
            $('app-name-text').innerText = "More Info";
            $('top-sep').style.display = 'flex';
        } else if (bootctrl) {
            $('install').classList.add('hide');
            $('uninstall').classList.remove('hide');
            $('uninstall').onclick = () => {
                bootctrl.postMessage({ clear: true, disable: true });
                location.reload();
            }
        } else {
            $('install').onclick = () => {
                location.replace('/boot');
            }
        }
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
