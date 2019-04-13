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
        }
    }

    // english. other language maps will defer to english
    // map for any missing key/value pairs
    LANG.en = {
        version:        "version",
        dev_name:       "name",
        dev_fil:        "filament",
        dev_fil_desc:   "diameter in millimeters",
        dev_nozl:       "nozzle",
        dev_nozl_desc:  "diameter in millimeters",
        dev_bedw:       "bed width",
        dev_bedw_desc:  "millimeters",
        dev_bedd:       "bed depth",
        dev_bedd_desc:  "millimeters",
        dev_bedhm:      "max height",
        dev_bedhm_desc: "max build height\nin millimeters",
        dev_spmax:      "max spindle rpm",
        dev_spmax_desc: "max spindle speed\n0 to disable",
        dev_extab:      "extrude absolute",
        dev_extab_desc: "extrusion moves absolute",
        dev_orgc:       "origin center",
        dev_orgc_desc:  "bed origin center",
        dev_orgt:       "origin top",
        dev_orgt_desc:  "part z origin top"
    };

    LANG.test = {
        bogus:          "not a valid key",
        version:        "_version_",
        dev_name:       "_name_"
    };

    LANG.current = {};

    LANG.set('en');

})();
