/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

gapp.main({
    app: "kiri",

    pre(root) {
        let mods = root.kirimod = ( root.kirimod || [] );

        let kiri = root.kiri = {
            beta: 0,
            driver: {
                // attached driver modules
            },
            load(fn) {
                // modules register exec() functions
                mods.push(fn);
            },
            load_exec(api) {
                // process all module exec() functions
                const saferun = (fn) => {
                    try {
                        fn(api || kiri.api);
                    } catch (error) {
                        console.log({ module_error: error });
                    }
                };
                // complete module loading
                mods.forEach(fn => saferun(fn));
                // rewrite load() to run immediately post-finalize
                kiri.load = (fn) => saferun(fn);
            }
        };
    },

    post(root) {
        // complete module loading
        root.kiri.load_exec();
    }
});
