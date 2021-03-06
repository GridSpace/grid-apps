/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

    if (self.kiri.lang) return;

    const KIRI = self.kiri, LANG = self.kiri.lang = { current: {} };
    const KDFL = 'en-us';

    let lset = navigator.language.toLocaleLowerCase();

    LANG.map = function(key) {
        if (!key) {
            return KDFL;
        }
        let tok = key.split('-');
        switch (tok[0]) {
            case 'da': return 'da-dk';
            case 'de': return 'de-de';
            case 'en': return 'en-us';
            case 'fr': return 'fr-fr';
            case 'pl': return 'pl-pl';
        }
        return KDFL;
    };

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
                    let val = map[key];
                    // turn arrays into newline separated strings
                    if (Array.isArray(val)) {
                        val = val.join('\n');
                    }
                    LANG.current[key] = val;
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
