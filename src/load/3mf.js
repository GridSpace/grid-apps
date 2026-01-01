/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

'use strict';

import { THREE } from '../ext/three.js';
import { JSZip } from '../ext/jszip-esm.js';

let { BufferAttribute, Matrix4 } = THREE;

let scaleMap = {
    "inch": (1 / 25.4),
    "foot": (1 / 304.8),
    "micron": (1 / 1000),
    "meter": 1000,
    "millimeter": 1,
    "centimeter": (1 / 10)
};

export function query(node, path, fn) {
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
 * Export vertex array(s) to 3MF format
 * @param {Array} recs - array of {file: string, varr: Float32Array} records
 * @param {Object} options - encoding options
 * @param {String} [options.unit='millimeter'] - unit of measurement
 * @param {String} [options.title='Model'] - model title
 * @returns {Promise<Blob>} 3MF file as a Blob
 */
export async function encode(recs, options = {}) {
    const {
        unit = 'millimeter',
        title = 'Model'
    } = options;

    // Build the 3D model XML
    let objectId = 1;
    let resources = [];
    let buildItems = [];

    for (let rec of recs) {
        let { file, varr } = rec;
        let name = file || `object-${objectId}`;

        // Extract unique vertices and build triangle indices
        let vertices = [];
        let triangles = [];
        let vertexMap = new Map(); // map "x,y,z" -> vertex index
        let vertexIndex = 0;

        // Process triangles (every 9 floats = 3 vertices = 1 triangle)
        for (let i = 0; i < varr.length; i += 9) {
            let triIndices = [];

            // Process 3 vertices per triangle
            for (let j = 0; j < 3; j++) {
                let vi = i + j * 3;
                let x = varr[vi];
                let y = varr[vi + 1];
                let z = varr[vi + 2];

                // Create vertex key for deduplication
                let key = `${x},${y},${z}`;
                let idx = vertexMap.get(key);

                if (idx === undefined) {
                    idx = vertexIndex++;
                    vertexMap.set(key, idx);
                    vertices.push({ x, y, z });
                }

                triIndices.push(idx);
            }

            triangles.push(triIndices);
        }

        // Generate object XML
        let objectXml = [`    <object id="${objectId}" name="${name}" type="model">`];
        objectXml.push('      <mesh>');
        objectXml.push('        <vertices>');

        for (let v of vertices) {
            objectXml.push(`          <vertex x="${v.x}" y="${v.y}" z="${v.z}"/>`);
        }

        objectXml.push('        </vertices>');
        objectXml.push('        <triangles>');

        for (let tri of triangles) {
            objectXml.push(`          <triangle v1="${tri[0]}" v2="${tri[1]}" v3="${tri[2]}"/>`);
        }

        objectXml.push('        </triangles>');
        objectXml.push('      </mesh>');
        objectXml.push('    </object>');

        resources.push(objectXml.join('\n'));
        buildItems.push(`    <item objectid="${objectId}"/>`);

        objectId++;
    }

    // Construct the complete 3D model XML
    let modelXml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        `<model unit="${unit}" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">`,
        '  <resources>',
        resources.join('\n'),
        '  </resources>',
        '  <build>',
        buildItems.join('\n'),
        '  </build>',
        '</model>'
    ].join('\n');

    // Create [Content_Types].xml
    let contentTypes = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
        '  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
        '  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>',
        '</Types>'
    ].join('\n');

    // Create _rels/.rels
    let rels = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
        '  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>',
        '</Relationships>'
    ].join('\n');

    // Create ZIP archive
    let zip = new JSZip();
    zip.file('[Content_Types].xml', contentTypes);
    zip.file('_rels/.rels', rels);
    zip.file('3D/3dmodel.model', modelXml);

    // Generate the 3MF file as a blob
    return await zip.generateAsync({
        type: "uint8array",
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
        streamFiles: true
    });
}

/**
 * @param {Object} data binary file
 * @returns {Array} vertex face array
 */
export function parseAsync(data) {
    return new Promise(async (resolve, reject) => {
        let zip = await new JSZip().loadAsync(data);
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

