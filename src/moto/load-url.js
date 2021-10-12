'use strict';

(function() {
    if (!self.moto) self.moto = {};
    if (self.moto.URL) return;

    const CDH = 'Content-Disposition';

    function load(url, options = {}) {
        return new Promise((resolve, reject) => {
            let xhr = new XMLHttpRequest();
            let file = options.file || options.filename || (((url.split('?')[0]).split('#')[0]).split('/')).pop();
            let ext = file.split('.').pop().toLowerCase();
            let deftype = ext === "obj" || ext === 'svg' ? "text" : "arraybuffer";
            let datatype = options.datatype || deftype;
            let formdata = options.formdata;

            function onloaded(event)  {
                if (event.target.status === 200 || event.target.status === 0)  {
                    if (xhr.getAllResponseHeaders().indexOf(CDH) > 0) {
                        // attempt to extract filename from content disposition
                        let fname = xhr.getResponseHeader(CDH)
                            .split(';').map(v => v.trim()).filter(v => {
                                return v.indexOf('filename=') === 0;
                            }).map(v => {
                                return v.substring(10,v.length-1);
                            })[0];
                        if (fname) {
                            file = fname;
                            ext = file.split('.').pop().toLowerCase();
                        }
                    }
                    let data = event.target.response || event.target.responseText;
                    // return raw data if indicated
                    if (options.parse === false) {
                        return resolve(data, ext);
                    }
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
                } else {
                    reject(event.target.statusText);
                }
            }

            xhr.addEventListener('load', onloaded, false);
            xhr.addEventListener('progress', function (event)  { }, false);
            xhr.addEventListener('error', function () { }, false);

            if (xhr.overrideMimeType) {
                xhr.overrideMimeType('text/plain; charset=x-user-defined');
            }

            xhr.open(formdata ? 'POST' : 'GET', url, true);
            xhr.responseType = datatype;
            xhr.send(formdata);
        });
    };

    self.moto.URL = {
        load
    };

})();