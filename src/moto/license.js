(function() {

    const is_self = typeof(self) !== 'undefined';

    let terms = {
        COPYRIGHT: "Copyright (C) Stewart Allen <sa@grid.space> - All Rights Reserved",
        LICENSE: "See the license.md file included with the source distribution",
        VERSION: (is_self ? self : this).debug_version || "4.1.5"
    };

    if (typeof(module) === 'object') {
        module.exports = terms;
    }

    // allow license to be required() by app without gapp
    if (is_self && self.gapp) {
        let app = self.gapp;
        app.license = terms.LICENSE;
        app.version = terms.VERSION;
        app.copyright = terms.COPYRIGHT;
        // satisfy resolver
        gapp.register('moto.license');
        // for earcut and other modules
        (self.module = self.module || {}).exports = terms;
    }

})();
