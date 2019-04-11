/** Copyright 2014-2019 Stewart Allen -- All Rights Reserved */

"use strict";

var gs_kiri_lang = exports;

(function() {

    if (!self.kiri) self.kiri = {};
    if (self.kiri.lang) return;

    var KIRI = self.kiri,
        LANG = self.kiri.lang = {};

    LANG.set = (key) => {
        if (LANG[key]) {
            let map = LANG[key];
            // default to EN values when missing
            Object.keys(LANG.en).forEach(key => {
                if (!map[key]) {
                    map[key] = LANG.en[key];
                }
            });
            // update current map from chosen map
            Object.keys(map).forEach(key => {
                LANG.current[key] = map[key];
            });
        }
    }

    // english. other language maps will defer to english
    // map for any missing key/value pairs
    LANG.en = {
        version:        "version",
        dev_name:       "name",
        dev_filament:   "filament",
        dev_fil_desc:   "diameter in millimeters",
        dev_nozzle:     "nozzle",
        dev_noz_desc:   "diameter in millimeters"
    };

    LANG.test = {
        version:        "_version_",
        dev_name:       "_name_"
    };

    LANG.current = {};

    LANG.set('en');

})();
