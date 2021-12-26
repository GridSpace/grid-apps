(function() {

    let terms = {
        COPYRIGHT: "Copyright (C) Stewart Allen <sa@grid.space> - All Rights Reserved",
        LICENSE: "See the license.md file included with the source distribution",
        VERSION: "3.1.D10"
    };

    if (typeof(module) === 'object') {
        module.exports = terms;
    }

    if (typeof(self) !== 'undefined' && self.gapp) {
        let app = self.gapp;
        app.license = terms.LICENSE;
        app.version = terms.VERSION;
        app.copyright = terms.COPYRIGHT;
        // for earcut and other modules
        self.module = { exports: terms };
    }

})();
