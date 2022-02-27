/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

gapp.main("main.kiri", [], (root) => {

    const { kiri } = root;
    const { api } = kiri;

    // complete module loading
    kiri.load_exec();

}, (root) => {

    const modfns = root.kirimod = [];

    const kiri = root.kiri = {
        beta: 3308,
        driver: {}, // driver modules
        load(fn) {
            modfns.push(fn);
        },
        load_exec(api) {
            // complete module loading
            modfns.forEach(modfn => { modfn(api || kiri.api)} );
            // rewrite load() to be immediate post-finalize
            kiri.load = (modfn) => { modfn(api || kiri.api) };
        }
    };

});
