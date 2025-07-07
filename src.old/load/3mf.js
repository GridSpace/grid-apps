/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

'use strict';

// dep: add.three
// dep: ext.jszip
gapp.register('load.3mf', [], (root, exports) => {

let load = self.load = self.load || {};

if (load.TMF) return;

load.TMF = {
    parseAsync
};

load.XML = {
    query
};

let { BufferAttribute, Matrix4 } = THREE;

let scaleMap = {
    "inch": (1 / 25.4),
    "foot": (1 / 304.8),
    "micron": (1 / 1000),
    "meter": 1000,
    "millimeter": 1,
    "centimeter": (1 / 10)
};

// simple query api for xml structures
function query(node, path, fn) {
    let collect = {};
    let match = path[0].split('|').map(key => {
        if (key[0] === '+') {
            key = key.slice(1);
            collect[key] = true;
        }
        return key;
    });
    for (let child of [...node.childNodes]) {
        let { tagName } = child;
        if (match.indexOf(tagName) >= 0) {
            if (collect[tagName]) {
                fn(tagName, child);
            }
            if (path.length > 1) {
                query(child, path.slice(1), fn);
            }
        }
    }
}

function transform(def, mesh) {
    let pos = new BufferAttribute(mesh.toFloat32(), 3);
    let mat = def.split(' ').map(v => parseFloat(v));
    mat = [
        ...mat.slice(0,3), 0,
        ...mat.slice(3,6), 0,
        ...mat.slice(6,9), 0,
        ...mat.slice(9,12), 1
    ];
    pos.applyMatrix4(new Matrix4().fromArray(mat));
    return pos.array;
}

/** find matching attribute regardless of namespace */
function getLocalAttribute(node, name) {
    for (let attr of node.attributes) {
        if (attr.localName === name) {
            return attr.value;
        }
    }
    return undefined;
}

function loadModel(doc) {
    let items = [];
    let objects = {};

    return new Promise((resolve, reject) => {
        let scale = 1;
        query(doc, ["+model","resources","+object"], (type, node) => {
            switch (type) {
                case "model":
                    let units = node.getAttribute("unit");
                    if (units) {
                        scale = scaleMap[units] || 1;
                    }
                    query(node, ["build","+item"], (type, node) => {
                        items.push({
                            oid: node.getAttribute('objectid'),
                            xform: node.getAttribute('transform')
                        });
                    });
                    break;
                case "object":
                    let object = {
                        name: node.getAttribute("name")
                    };
                    objects[node.getAttribute("id")] = object;
                    // object are allowed one mest or one or more components
                    query(node, ["+mesh"], (type, node) => {
                        let vertices = [];
                        query(node, ["vertices","+vertex"], (type, vertex) => {
                            vertices.push([
                                parseFloat(vertex.getAttribute("x")) * scale,
                                parseFloat(vertex.getAttribute("y")) * scale,
                                parseFloat(vertex.getAttribute("z")) * scale
                            ]);
                        });
                        let mesh = object.mesh = [];
                        query(node, ["triangles","+triangle"], (type, triangle) => {
                            let v1 = parseInt(triangle.getAttribute("v1"));
                            let v2 = parseInt(triangle.getAttribute("v2"));
                            let v3 = parseInt(triangle.getAttribute("v3"));
                            mesh.appendAll(vertices[v1]);
                            mesh.appendAll(vertices[v2]);
                            mesh.appendAll(vertices[v3]);
                        });
                    });
                    if (object.mesh) {
                        return;
                    } else {
                        object.components = [];
                    }
                    query(node, ["components","+component"], (type, node) => {
                        object.components.push({
                            oid: node.getAttribute('objectid'),
                            path: getLocalAttribute(node, "path"),
                            xform: node.getAttribute('transform'),
                        });
                    });
                    break;
            }
        });

        return resolve({ objects, items });

        // create object mesh from components
        for (let object of Object.values(objects)) {
            let { mesh, components } = object;
            if (mesh) {
                continue;
            }
            mesh = object.mesh = [];
            for (let component of components) {
                let { oid, xform } = component;
                let ref = objects[oid];
                if (!ref) {
                    console.log({ missing_ref: oid, objects, components, doc });
                } else if (xform) {
                    mesh.appendAll(transform(xform, ref.mesh));
                } else {
                    mesh.appendAll(ref.mesh);
                }
            }
        }

        // create export items from object references
        for (let item of items) {
            let { oid, xform } = item;
            let { name, mesh } = objects[oid];
            item.name = name;
            if (xform) {
                item.faces = transform(xform, mesh);
            } else {
                item.faces = mesh;
            }
        }

        // return array: [{ name, faces }, { name, faces }]
        resolve(items);
    });
}

function extractItems(records) {
    let outItems = [];
    let models = Object.values(records);

    // create object mesh from components
    for (let model of models) {
        let { objects } = model;
        for (let object of Object.values(objects)) {
            let { mesh, components } = object;
            if (mesh) {
                continue;
            }
            mesh = object.mesh = [];
            for (let component of components) {
                let { oid, path, xform } = component;
                let omap = objects;
                if (path) {
                    omap = records[path.substring(1)].objects;
                    // console.log({ component_from_ob_path: path, using: omap });
                }
                let ref = omap[oid];
                if (!ref) {
                    console.log({ missing_ref: oid, objects, components });
                } else if (xform) {
                    mesh.appendAll(transform(xform, ref.mesh));
                } else {
                    mesh.appendAll(ref.mesh);
                }
            }
        }
    }

    // create export items from object references
    for (let model of models) {
        let { items, objects } = model;
        for (let item of items || []) {
            let { oid, xform } = item;
            let { name, mesh } = objects[oid];
            item.name = name;
            if (xform) {
                item.faces = transform(xform, mesh);
            } else {
                item.faces = mesh;
            }
        }
        outItems.push(...items);
    }

    return outItems;
}

/**
 * @param {Object} data binary file
 * @returns {Array} vertex face array
 */
function parseAsync(data) {
    return new Promise(async (resolve, reject) => {
        let zip = await JSZip.loadAsync(data);
        let models = {};
        for (let [key, value] of Object.entries(zip.files)) {
            if (key.endsWith(".model")) {
                let xml = await value.async("string");
                let { objects, items } = await loadModel(new DOMParser().parseFromString(xml, "text/xml"));
                models[key] = { objects, items };
            }
        }
        resolve(extractItems(models));
    });
}

});