'use strict';

(function() {

    if (!self.moto) self.moto = {};
    if (self.moto.OBJ) return;

    self.moto.OBJ = {
        parse : parse
    };

    /**
     * @param {String} text
     * @returns {Array} vertex face array
     */
    function parse(text) {

        let lines = text.split('\n').map(l => l.trim());
        let verts = [];
        let faces = [];

        for (let line of lines) {
            let toks = line.split(' ');
            switch (toks.shift()) {
                case 'v':
                    verts.push(toks.map(v => parseFloat(v)));
                    break;
                case 'f':
                    let tok = toks.map(f => parseInt(f.split('/')[0]));
                    faces.appendAll(verts[tok[0]-1]);
                    faces.appendAll(verts[tok[1]-1]);
                    faces.appendAll(verts[tok[2]-1]);
                    break;
                case 'g':
                case 'o':
                    break;
            }
        }

        return [ faces ];
    }

})();
