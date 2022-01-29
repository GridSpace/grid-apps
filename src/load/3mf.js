/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

'use strict';

(function() {

let load = self.load = self.load || {};
if (load.TMF) return;

// dep: add.three
// dep: ext.jszip
gapp.register('load.3mf');

load.TMF = {
    parseAsync
};

let { BufferAttribute, Matrix4 } = THREE;

function query(node, path, fn) {
    let collect = false;
    let match = path[0];
    if (match[0] === '+') {
        match = match.slice(1);
        collect = true;
    }
    for (let child of [...node.childNodes]) {
        if (child.tagName === match) {
            if (collect) {
                fn(match, child);
            }
            if (path.length > 1) {
                query(child, path.slice(1), fn);
            }
        }
    }
}

function loadModel(doc) {
    let models = [];
    let byid = {};

    return new Promise((resolve, reject) => {
        let id;
        let model;
        let faces;
        let units;
        let scale = 1;
        let scaleMap = {
            "inch": (1 / 25.4),
            "foot": (1 / 304.8),
            "micron": (1 / 1000),
            "meter": 1000,
            "millimeter": 1,
            "centimeter": (1 / 10)
        };

        function emitModel() {
            if (!(faces && faces.length)) {
                return;
            }
            models.push({name: model, faces});
            if (id) {
                byid[id] = models.peek();
            }
        }

        query(doc, ["+model","resources","+object","+mesh"], (type, node) => {
            switch (type) {
                case "model":
                    units = node.getAttribute("unit");
                    if (units) {
                        scale = scaleMap[units] || 1;
                    }
                    break;
                case "object":
                    // emit previous model
                    emitModel();
                    faces = [];
                    id = node.getAttribute("id") || undefined;
                    model = node.getAttribute("name") || undefined;
                    query(node, ["components","+component"], (type, node) => {
                        let objectid = node.getAttribute('objectid');
                        let mat = node.getAttribute('transform').split(' ').map(v => parseFloat(v));
                        mat = [
                            ...mat.slice(0,3), 0,
                            ...mat.slice(3,6), 0,
                            ...mat.slice(6,9), 0,
                            ...mat.slice(9,12), 1
                        ];
                        let ref = byid[objectid];
                        if (!ref) return;
                        let m4 = new Matrix4().fromArray(mat);
                        let pos = new BufferAttribute(ref.faces.toFloat32(), 3).applyMatrix4(m4);
                        faces.appendAll(pos.array);
                    });
                    break;
                case "mesh":
                    let vertices = [];
                    query(node, ["vertices","+vertex"], (type, vertex) => {
                        vertices.push([
                            parseFloat(vertex.getAttribute("x")) * scale,
                            parseFloat(vertex.getAttribute("y")) * scale,
                            parseFloat(vertex.getAttribute("z")) * scale
                        ]);
                    });
                    query(node, ["triangles","+triangle"], (type, triangle) => {
                        let v1 = parseInt(triangle.getAttribute("v1"));
                        let v2 = parseInt(triangle.getAttribute("v2"));
                        let v3 = parseInt(triangle.getAttribute("v3"));
                        faces.appendAll(vertices[v1]);
                        faces.appendAll(vertices[v2]);
                        faces.appendAll(vertices[v3]);
                    });
                    break;
            }
        });

        emitModel();
        resolve(models);
    });
}

/**
 * @param {Object} data binary file
 * @returns {Array} vertex face array
 */
function parseAsync(data) {
    return new Promise((resolve, reject) => {
        JSZip.loadAsync(data).then(zip => {
            for (let [key,value] of Object.entries(zip.files)) {
                if (key.indexOf(".model") > 0) {
                    value.async("string").then(xml => {
                        resolve(loadModel(new DOMParser().parseFromString(xml, "text/xml")));
                    });
                }
            }
        });
    });
}

})();
