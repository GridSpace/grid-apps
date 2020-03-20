/** Copyright 2014-2019 Stewart Allen -- All Rights Reserved */

"use strict";

let gs_kiri_lang = exports;

(function() {

    if (!self.kiri) self.kiri = {};
    if (self.kiri.lang) return;

    let KIRI = self.kiri,
        LANG = self.kiri.lang = { current: {} },
        lset = navigator.language.toLocaleLowerCase();

    LANG.get = function() {
        return lset;
    };

    LANG.set = function() {
        let map, key, keys = [...arguments];
        // provide default if none given
        if (keys.length === 0) {
            keys = [lset, lset.split('-')[0], 'en'];
        }
        for (let i=0; i<keys.length; i++)
        {
            key = keys[i]
            if (!(map = LANG[key])) {
                continue;
            }
            lset = key;
            let missing = [];
            let invalid = [];
            // default to EN values when missing
            Object.keys(LANG.en).forEach(key => {
                if (!map[key]) {
                    map[key] = LANG.en[key];
                    missing.push(key);
                }
            });
            // update current map from chosen map
            Object.keys(map).forEach(key => {
                if (LANG.en[key]) {
                    LANG.current[key] = map[key];
                } else {
                    invalid.push(key);
                }
            });
            if (missing.length) {
                console.log(`language map "${key}" missing keys [${missing.length}]: ${missing.join(', ')}`);
            }
            if (invalid.length) {
                console.log(`language map "${key}" invalid keys [${invalid.length}]: ${invalid.join(', ')}`);
            }
            return key;
        }
        return undefined;
    }

})();
