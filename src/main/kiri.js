/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function () {

    if (!self.kiri) {
        let modfns = self.kirimod = [];

        let kiri = self.kiri = {
            beta: 3301,
            driver: {}, // driver modules
            loader: modfns, // module loading: array of functions
            load(fn) {
                kiri.loader.push(fn);
            },
            load_exec() {
                // complete module loading
                modfns.forEach(modfn => { modfn(kiri.api)} );
                // rewrite load() to be immediate post-finalize
                kiri.load = (modfn) => { modfn(kiri.api) };
            }
        };
    }

})();
