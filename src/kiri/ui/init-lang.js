/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { api } from './api.js';
import { local as sdb } from '../../data/local.js';

const DOC = self.document;
const { SETUP } = api;
const stats = api.stats;

// update static html elements with language overrides
function lang_rewrite() {
    const LANG = api.language.current;
    // lk attribute causes inner text to be replaced with lang value
    for (let el of [...DOC.querySelectorAll("[lk]")]) {
        let key = el.getAttribute('lk');
        let val = LANG[key];
        if (val) {
            el.innerText = val;
        } else {
            console.log({missing_ln: key});
        }
    }
    // lkt attribute causes a title attribute to be set from lang value
    for (let el of [...DOC.querySelectorAll("[lkt]")]) {
        let key = el.getAttribute('lkt');
        let val = LANG[key];
        if (val) {
            el.setAttribute("title", val);
        } else {
            console.log({missing_ln: key});
        }
    }
}

// init lang must happen before all other init functions
export function init_lang() {
    return new Promise(resolve => {
        // if a language needs to load, the script is injected and loaded
        // first.  once this loads, or doesn't, the initialization begins
        let lang = SETUP.ln ? SETUP.ln[0] : sdb.getItem('kiri-lang') || api.language.get();
        api.event.emit('init.lang', lang);
        // inject language script if not english
        if (lang && lang !== 'en' && lang !== 'en-us') {
            let map = api.language.map(lang);
            let scr = DOC.createElement('script');
            // scr.setAttribute('defer',true);
            scr.setAttribute('src',`/kiri/lang/${map}.js`);
            (DOC.body || DOC.head).appendChild(scr);
            stats.set('ll',lang);
            scr.onload = function() {
                api.language.set(map);
                lang_rewrite();
                resolve();
            };
            scr.onerror = function(err) {
                console.log({language_load_error: err, lang})
                api.language.set();
                lang_rewrite();
                resolve();
            }
        } else {
            // set to browser default which will be overridden
            // by any future script loads (above)
            api.language.set();
            lang_rewrite();
            resolve();
        }
    });
}
