(function() {

    let terms = {
        COPYRIGHT: "Copyright (C) Stewart Allen <sa@grid.space> - All Rights Reserved",
        LICENSE: "See the license.md file included with the source distribution",
        VERSION: "3.1.D5"
    };

    if (typeof(module) === 'object') {
        module.exports = terms;
    }
    if (typeof(self) !== 'undefined' && self.kiri) {
        // self.exports = terms;
        self.kiri.license = terms.LICENSE;
        self.kiri.version = terms.VERSION;
        self.kiri.copyright = terms.COPYRIGHT;
        self.module = { exports: terms };
    }

})();
