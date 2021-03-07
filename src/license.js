(function() {

    let terms = {
        COPYRIGHT: "Copyright (C) Stewart Allen <sa@grid.space> - All Rights Reserved",
        LICENSE: "See the license.md file included with the source distribution",
        VERSION: "2.8.D0"
    };

    if (typeof(module) === 'object') {
        module.exports = terms;
    } else if (self.kiri) {
        // self.exports = terms;
        self.kiri.license = terms.LICENSE;
        self.kiri.version = terms.VERSION;
        self.kiri.copyright = terms.COPYRIGHT;
        self.module = { exports: terms };
    }

})();
