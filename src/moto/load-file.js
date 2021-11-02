'use strict';

(function() {
    if (!self.moto) self.moto = {};
    if (self.moto.File) return;

    function load_data(data, file, ext) {
        ext = ext || name.toLowerCase().split('.').pop();
        return new Promise((resolve, reject) => {
            switch (ext) {
                case "stl":
                    resolve([{
                        mesh: new moto.STL().parse(data), file
                    }]);
                    break;
                case "obj":
                    resolve(moto.OBJ.parse(data).map(m => { return {mesh: m.toFloat32(), file} }));
                    break;
                case "3mf":
                    moto.TMF.parseAsync(data).then((meshes) => {
                        resolve(meshes.map(m => {
                            return { mesh: m.faces.toFloat32(), file }
                        }));
                    });
                    break;
                case "svg":
                    resolve(moto.SVG.parse(data).map(m => { return {mesh: m.toFloat32(), file} }));
                    break;
                default:
                    reject(`unknown file type: "${ext}" from ${url}`);
                    break;
            }
        });
    }

    function load(file) {
        return new Promise((resolve, reject) => {
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

    self.moto.File = {
        load_data,
        load
    };

})();
