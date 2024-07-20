/** Copyright 2014-2019 Stewart Allen -- All Rights Reserved */

"use strict";

// dep: geo.base
// mod: ext.manifold
gapp.register("geo.csg", [], (root, exports) => {

const { base, ext } = root;
const debug = true;
const precision = 0.001;
const factor = 1/precision;

function log() {
    if (root?.mesh?.log) {
        root.mesh.log(...arguments)
    } else if (root.debug === true) {
        console.log(...arguments);
    }
}

const CSG = {
    // accepts 2 or more arguments with threejs vertex position arrays
    union() {
        return CSG.moduleOp('manifold.union', 'union', ...arguments);
    },

    // accepts 2 or more arguments with threejs vertex position arrays
    // the fist argument is the target mesh. the rest are negatives
    subtract() {
        return CSG.moduleOp('manifold.subtract', 'difference', ...arguments);
    },

    // accepts 2 or more arguments with threejs vertex position arrays
    intersect() {
        return CSG.moduleOp('manifold.intersect', 'intersection', ...arguments);
    },

    // accepts 2 or more arguments with threejs vertex position arrays
    difference() {
        return CSG.moduleOp('manifold.difference', 'difference', ...arguments);
    },

    moduleOp(name, op) {
        log(`${name} ${arguments.length} meshes`);
        const args = [...arguments].slice(2).map(a => new Instance.Manifold(a));
        if (args.length < 2) {
            throw "missing one or more meshes";
        }
        const result = Instance.Manifold[op](...args);
        const output = result.getMesh();
        const errors = [ ...args, result ].map(m => m.status().value);
        for (let m of [ ...args, result ]) {
            m.delete();
        }
        if (errors.reduce((a,b) => a+b)) {
            throw `${errors}`;
        }
        return output;
    },

    toPositionArray(mesh) {
        let { vertProperties, triVerts } = mesh;
        let vertPos = vertProperties;
        if (vertPos && triVerts) {
            const vertices = new Float32Array(triVerts.length * 3);
            for (let p=0, i=0, l=triVerts.length; i<l; i++) {
                let vi = triVerts[i] * 3;
                vertices[p++] = vertPos[vi++];
                vertices[p++] = vertPos[vi++];
                vertices[p++] = vertPos[vi++];
            }
            return vertices.map(v => v/factor);
        }
        throw "mesh missing required fields";
    },

    fromPositionArray(pos) {
        const { index, vertices } = indexVertices(pos);
        let mesh = new Instance.Mesh({
            vertProperties: vertices.map(v => (v*factor)|0).toFloat32(),
            triVerts: index.toUint32()
        });
        return mesh;
    },

    toBox3(mesh) {
        const { min, max } = mesh._boundingBox();
        const vmin = new THREE.Vector3(min.x, min.y, min.z);
        const vmax = new THREE.Vector3(max.x, max.y, max.z);
        return new THREE.Box3(vmin, vmax);
    },

    indexVertices
};

function indexVertices(pos) {
    log(`indexing ${pos.length/3} vertices`);
    let ipos = 0;
    const index = [];
    const vertices = [];
    const cache = {};
    const temp = { x: 0, y: 0, z: 0 };
    for (let i=0, length = pos.length; i<length; ) {
        temp.x = pos[i++];
        temp.y = pos[i++];
        temp.z = pos[i++];
        let key = [
            ((temp.x * 100000) | 0),
            ((temp.y * 100000) | 0),
            ((temp.z * 100000) | 0)
        ].join('');
        let ip = cache[key];
        if (ip >= 0) {
            index.push(ip);
        } else {
            index.push(ipos);
            cache[key] = (ipos++);
            vertices.push(temp.x, temp.y, temp.z);
        }
    }
    return { index, vertices };
}

let Instance;

ext.manifold.then(mod => {
    mod.default({
        locateFile() { return "/wasm/manifold.wasm" }
    }).then(inst => {
        inst.setup();
        Instance = inst;
        CSG.Instance = () => { return Instance };
    });
});

gapp.overlay(base, {
    CSG
});

});
