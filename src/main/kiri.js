/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

gapp.main("main.kiri", [], (root) => {

    const { kiri } = root;
    const { api } = kiri;

    // complete module loading
    kiri.load_exec();

}, (root) => {

    const modfns = root.kirimod = ( root.kirimod || [] );

    const kiri = root.kiri = {
        beta: 4017,
        driver: {}, // driver modules
        load(fn) {
            modfns.push(fn);
        },
        load_exec(api) {
            const saferun = (fn) => {
                try {
                    fn(api || kiri.api);
                } catch (error) {
                    console.log({ module_error: error });
                }
            };
            // complete module loading
            modfns.forEach(modfn => saferun(modfn));
            // rewrite load() to be immediate post-finalize
            kiri.load = (modfn) => saferun(modfn);
        }
    };

});
