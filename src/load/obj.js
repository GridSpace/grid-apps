/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

'use strict';

(function() {

let load = self.load = self.load || {};
if (load.OBJ) return;

gapp.register('load.obj');

load.OBJ = {
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
                let v = toks.map(v => parseFloat(v)).slice(0,3);
                if (v.length < 3) {
                    console.log('??',toks,line);
                }
                verts.push(v);
                break;
            case 'f':
                let tok = toks.map(f => parseInt(f.split('/')[0]));
                if (tok.length > 3) {
                    const p = tok.map(t => verts[t-1]).flat();
                    const t = base.util.triangulate(p, [], 3, true);
                    const r = t.map(i => tok[i]);
                    for (let v of r) {
                        faces.appendAll(verts[v - 1]);
                    }
                } else {
                    // add support for negative indices (offset from last vertex array point)
                    faces.appendAll(verts[tok[0]-1]);
                    faces.appendAll(verts[tok[1]-1]);
                    faces.appendAll(verts[tok[2]-1]);
                }
                break;
            case 'g':
                if (faces.length) {
                    objs.push(faces = []);
                }
                if (toks[0]) {
                    faces.name = toks.join(' ');
                }
                break;
        }
    }
    return objs;
}

})();
