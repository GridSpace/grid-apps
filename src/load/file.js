/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

'use strict';

(function() {

let load = self.load = self.load || {};
if (load.File) return;

gapp.register('load.file', [
    'load.3mf', // dep: load.3mf
    'load.obj', // dep: load.obj
    'load.stl', // dep: load.stl
    'load.svg', // dep: load.svg
    'load.url', // dep: load.url
]);

load.File = {
    load_data, load_data,
    load: load_file
};

function load_data(data, file, ext) {
    ext = ext || name.toLowerCase().split('.').pop();
    return new Promise((resolve, reject) => {
        switch (ext) {
            case "stl":
                resolve([{
                    mesh: new load.STL().parse(data), file
                }]);
                break;
            case "obj":
                resolve(load.OBJ.parse(data).map(m => { return {mesh: m.toFloat32(), file} }));
                break;
            case "3mf":
                load.TMF.parseAsync(data).then((meshes) => {
                    resolve(meshes.map(m => {
                        return { mesh: m.faces.toFloat32(), file }
                    }));
                });
                break;
            case "svg":
                resolve(load.SVG.parse(data).map(m => { return {mesh: m.toFloat32(), file} }));
                break;
            default:
                reject(`unknown file type: "${ext}" from ${file}`);
                break;
        }
    });
}

function load_file(file) {
    if (Array.isArray(file)) {
        return Promise.all(file.map(file => load_file(file)));
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
            load_data(event.target.result, name, ext)
                .then(data => resolve(data))
                .catch(e => reject(e));
        };
        if (ext === 'stl') {
            reader.readAsArrayBuffer(reader.file);
        } else {
            reader.readAsBinaryString(reader.file);
        }
    });
}

})();
