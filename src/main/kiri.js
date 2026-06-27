/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import '../add/array.js';
import '../add/class.js';
import '../add/three.js';
import '../kiri/app/language.js';
import '../kiri/app/lang-en.js';

import { api } from '../kiri/app/api.js';
import { init_lang } from '../kiri/app/init/lang.js';
import { init_input } from '../kiri/app/init/input.js';
import { init_sync } from '../kiri/app/init/sync.js';
import { surfaces } from '../kiri/app/init/build.js';

let traceload = location.search.indexOf('traceload') > 0;
let load = [];

function safeExec(fn, name) {
    try {
        if (traceload) {
            console.log('kiri | exec |', name, fn);
        } else if (name) {
            console.log('kiri | load mods |', name);
        }
        fn(kiri.api);
    } catch (error) {
        console.log('load error', fn, error);
    }
}

async function checkReady() {
    if (document.readyState === 'complete') {
        let bootctrl = navigator.serviceWorker?.controller;
        console.log(`kiri | boot ctrl | ` + (bootctrl ? true : false));
        kiri.api = api;
        self.$ = api.web.$;
        {
            api.client.start();
            await init_lang();
            surfaces.build();
            await init_input();
            await init_sync();
        }
        for (let [fn, name] of load) {
            safeExec(fn, name);
        }
        load = undefined;
        api.event.emit('load-done', stats);
        api.event.emit('resize');
        if (api.electron) {
            $('install').classList.add('hide');
            $('app-quit').classList.remove('hide');
            [...document.getElementsByClassName('el-app-hide')].forEach(el => el.classList.add('hide'));
        } else if (bootctrl) {
            $('install').classList.add('hide');
            $('uninstall').classList.remove('hide');
            $('uninstall').onclick = () => {
                bootctrl.postMessage({ clear: true, disable: true });
                location.reload();
            }
        } else {
            [...document.getElementsByClassName('app-hide')].forEach(el => el.classList.add('hide'));
            $('install').onclick = () => {
                location.replace('/boot');
            }
        }
    }
}

self.kiri = {
    load(fn, name) {
        // console.log('KIRI LOAD', [...arguments]);
        if (load) {
            load.push([fn, name]);
        } else {
            safeExec(fn, name);
        }
    }
};

self.moto = { };

// when dom + scripts complete
document.onreadystatechange = checkReady;

checkReady();
