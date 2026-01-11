/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

'use strict';

import { util } from '../geo/base.js';

/**
 * Export vertex array(s) to OBJ format string
 * @param {Array} recs - array of {file: string, varr: Float32Array} records
 * @param {String} header - optional header comment
 * @returns {String} OBJ format text
 */
export function encode(recs, header = '# Generated @ https://grid.space') {
    let p = 1;
    let obj = [header];
    for (let rec of recs) {
        let { file, varr } = rec;
        obj.push(`g ${file || 'unnamed'}`);
        for (let i=0; i<varr.length; p += 3) {
            obj.push(`v ${varr[i++]} ${varr[i++]} ${varr[i++]}`);
            obj.push(`v ${varr[i++]} ${varr[i++]} ${varr[i++]}`);
            obj.push(`v ${varr[i++]} ${varr[i++]} ${varr[i++]}`);
            obj.push(`f ${p} ${p+1} ${p+2}`);
        }
    }
    return obj.join('\n');
}

/**
 * @param {String} text
 * @returns {Array} vertex face array
 */
export function parseAsync(text) {
    return new Promise((resolve,reject) => {
        resolve(parse(text));
    });
}

export function parse(text) {
    let lines = text.replaceAll(/ +/g,' ').split('\n').map(l => l.trim());
    let verts = [];
    let faces = [];
    let objs = [ faces ];

    // Polyfill for appendAll if not present
    if (!Array.prototype.appendAll) {
        Object.defineProperty(Array.prototype, 'appendAll', {
            value: function(arr) {
                for (let v of arr) this.push(v);
            },
            enumerable: false
        });
    }

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
                    const t = util.triangulate(p, [], 3, true);
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
