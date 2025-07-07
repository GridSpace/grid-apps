/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

'use strict';

import { STL } from './stl.js';
import * as OBJ from './obj.js';
import * as TMF from './3mf.js';
import * as SVG from './svg.js';
import * as GBR from './gbr.js';
import { load as pngLoad } from './png.js';

const types = {
    stl(data, file, resolve, reject, opt = {}) {
        resolve([{
            mesh: new STL().parse(data), file
        }]);
    },

    obj(data, file, resolve, reject, opt = {}) {
        resolve(OBJ.parse(data).map(m => {
            return { mesh: m.toFloat32(), file: nameOf(file, m.name, 1) }
        }));
    },

    "3mf"(data, file, resolve, reject, opt = {}) {
        let i = 1;
        TMF.parseAsync(data).then((meshes) => {
            resolve(meshes.map(m => {
                return { mesh: m.faces.toFloat32(), file: nameOf(file, m.name, i++) }
            }));
        });
    },

    svg(data, file, resolve, reject, opt = {}) {
        let out = SVG.parse(data, opt);
        resolve(opt.flat ? out : out.map(m => { return { mesh: m.toFloat32(), file } }));
    },

    png(data, file, resolve, reject, opt = {}) {
        pngLoad.PNG.parse(data, {
            ...opt,
            done(vertices) { resolve({ mesh: vertices, file }) },
            error(err) { reject(err) }
        });
    },

    gbr(data, file, resolve, reject, opt = {}) {
        if (opt.flat) {
            resolve([ GBR.parse(data) ])
        } else {
            resolve([{ mesh: GBR.toMesh(data).toFloat32(), file }])
        }
    }
};

const as_buffer = [ "stl", "png", "3mf" ];

function nameOf(file, part, i) {
    let lid = file.lastIndexOf('.');
    if (!part && lid > 0) {
        file = file.substring(0,lid);
    }
    return part ? part : `${file}_${i}`;
}

function load_data(data, file, ext, opt = {}) {
    ext = ext || file.name.toLowerCase().split('.').pop();
    return new Promise((resolve, reject) => {
        let fn = types[ext];
        if (fn) {
            fn(data, file, resolve, reject, opt);
        } else {
            reject(`unknown file type: "${ext}" from ${file}`);
        }
    });
}

function load_file(file, opt) {
    if (Array.isArray(file)) {
        return Promise.all(file.map(file => load_file(file, opt)));
    }
    return new Promise((resolve, reject) => {
        if (!file) {
            return reject('invalid or missing file');
        }
        let reader = new FileReader();
        let name = file.name;
        let ext = name.toLowerCase().split('.').pop();
        reader.file = file;
        reader.onloadend = function (event) {
            load_data(event.target.result, name, ext, opt)
                .then(data => resolve(data))
                .catch(e => reject(e));
        };
        if (as_buffer.indexOf(ext) >= 0) {
            reader.readAsArrayBuffer(reader.file);
        } else {
            reader.readAsBinaryString(reader.file);
        }
    });
}

export { types, as_buffer, load_data, load_file, load_file as load };
