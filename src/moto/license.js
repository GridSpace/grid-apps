(function() {

    let terms = {
        COPYRIGHT: "Copyright (C) Stewart Allen <sa@grid.space> - All Rights Reserved",
        LICENSE: "See the license.md file included with the source distribution",
        VERSION: "3.2.D11"
    };

    if (typeof(module) === 'object') {
        module.exports = terms;
    }

    // allow license to be required() by app without gapp
    if (typeof(self) !== 'undefined' && self.gapp) {
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
