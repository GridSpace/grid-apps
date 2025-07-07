/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

'use strict';

(function() {

let load = self.load = self.load || {};
if (load.File) return;

// dep: load.3mf
// dep: load.obj
// dep: load.stl
// dep: load.svg
// dep: load.url
// dep: load.png
// dep: load.gbr
gapp.register('load.file', []);

const types = {
    stl(data, file, resolve, reject, opt = {}) {
        resolve([{
            mesh: new load.STL().parse(data), file
        }]);
    },

    obj(data, file, resolve, reject, opt = {}) {
        resolve(load.OBJ.parse(data).map(m => {
            return { mesh: m.toFloat32(), file: nameOf(file, m.name, 1) }
        }));
    },

    "3mf"(data, file, resolve, reject, opt = {}) {
        let i = 1;
        load.TMF.parseAsync(data).then((meshes) => {
            resolve(meshes.map(m => {
                return { mesh: m.faces.toFloat32(), file: nameOf(file, m.name, i++) }
            }));
        });
    },

    svg(data, file, resolve, reject, opt = {}) {
        let out = load.SVG.parse(data, opt);
        resolve(opt.flat ? out : out.map(m => { return { mesh: m.toFloat32(), file } }));
    },

    png(data, file, resolve, reject, opt = {}) {
        load.PNG.parse(data, {
            ...opt,
            done(data) {
                resolve({ mesh: data, file });
            }
        });
    },

    gbr(data, file, resolve, reject, opt = {}) {
        if (opt.flat) {
            resolve([ load.GBR.parse(data) ])
        } else {
            resolve([{ mesh: load.GBR.toMesh(data).toFloat32(), file }])
        }
    }
};

const as_buffer = [ "stl", "png", "3mf" ];

load.File = {
    types,
    as_buffer,
    load_data,
    load: load_file
};

function nameOf(file, part, i) {
    let lid = file.lastIndexOf('.');
    if (!part && lid > 0) {
        file = file.substring(0,lid);
    }
    return part ? part : `${file}_${i}`;
}

function load_data(data, file, ext, opt = {}) {
    ext = ext || name.toLowerCase().split('.').pop();
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

})();
