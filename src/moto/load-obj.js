'use strict';

(function() {

    if (!self.moto) self.moto = {};
    if (self.moto.OBJ) return;

    self.moto.OBJ = {
        parse,
        parseAsync
    };

    /**
     * @param {String} text
     * @returns {Array} vertex face array
     */

    function parseAsync(text) {
        return new Promise((resolve,reject) => {
            resolve(parse(text));
        });
    }

    function parse(text) {

        let lines = text.split('\n').map(l => l.trim());
        let verts = [];
        let faces = [];
        let objs = [ faces ];

        for (let line of lines) {
            let toks = line.split(' ');
            switch (toks.shift()) {
                case 'v':
                    verts.push(toks.map(v => parseFloat(v)));
                    break;
                case 'f':
                    let tok = toks.map(f => parseInt(f.split('/')[0]));
                    // add support for negative indices (offset from last vertex array point)
                    faces.appendAll(verts[tok[0]-1]);
                    faces.appendAll(verts[tok[1]-1]);
                    faces.appendAll(verts[tok[2]-1]);
                    break;
                case 'g':
                    if (faces.length) {
                        objs.push(faces = []);
                    }
                    if (toks[0]) {
                        faces.name = toks[0];
                    }
                    break;
            }
        }

        return objs;
    }

})();
