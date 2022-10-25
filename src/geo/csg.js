/** Copyright 2014-2019 Stewart Allen -- All Rights Reserved */

"use strict";

// dep: geo.base
// dep: ext.manifold
gapp.register("geo.csg", [], (root, exports) => {

const { base } = root;
const debug = true;

const CSG = {

    // accepts 2 or more arguments with threejs vertex position arrays
    union() {
        mesh.log(`manifold.union ${arguments.length} meshes`);
        const args = [...arguments].map(a => new Module.Manifold(a));
        const result = Module.union(...args);
        const output = result.getMesh({ mode: 2 });
        const errors = [ ...args, result ].map(m => m.status().value);
        for (let m of [ ...args, result ]) {
            m.delete();
        }
        if (errors.reduce((a,b) => a+b)) {
            throw `${errors}`;
        }
        return output;
    },

    // accepts 2 or more arguments with threejs vertex position arrays
    // the fist argument is the target mesh. the rest are negatives
    subtract() {
        mesh.log(`manifold.subtract ${arguments.length} meshes`);
        const args = [...arguments].map(a => new Module.Manifold(a));
        const result = Module.difference(...args);
        const output = result.getMesh({ mode: 2 });
        for (let m of [ ...args, result ]) {
            m.delete();
        }
        return output;
    },

    // accepts 2 or more arguments with threejs vertex position arrays
    intersect() {
        mesh.log(`manifold.intersect ${arguments.length} meshes`);
        const args = [...arguments].map(a => new Module.Manifold(a));
        const result = Module.intersection(...args);
        const output = result.getMesh({ mode: 2 });
        for (let m of [ ...args, result ]) {
            m.delete();
        }
        return output;
    },

    toPositionArray(mesh) {
        const { vertPos, triVerts, vertex, index } = mesh;
        if (vertex) {
            return vertex;
        }
        const vertices = new Float32Array(triVerts.length * 9);
        for (let i = 0, t = 0, l = triVerts.length; t < l; t++) {
            let tri = triVerts[t];
            let vert = vertPos[tri[0]]; // X
            vertices[i++] = vert[0];
            vertices[i++] = vert[1];
            vertices[i++] = vert[2];
            vert = vertPos[tri[1]]; // Y
            vertices[i++] = vert[0];
            vertices[i++] = vert[1];
            vertices[i++] = vert[2];
            vert = vertPos[tri[2]]; // Z
            vertices[i++] = vert[0];
            vertices[i++] = vert[1];
            vertices[i++] = vert[2];
        }
        return vertices;
    },

    fromPositionArray(pos) {
        const { index, vertices } = indexVertices(pos);
        const mesh = {
            vertPos: new Module.Vector_vec3(),
            triVerts: new Module.Vector_ivec3(),
            vertNormal: new Module.Vector_vec3(),
            halfedgeTangent: new Module.Vector_vec4()
        };
        for (let i = 0, l = vertices.length; i < l; ) {
            mesh.vertPos.push_back({
                x: vertices[i++],
                y: vertices[i++],
                z: vertices[i++]
            });
        }
        for (let i = 0, l = index.length; i < l; ) {
            mesh.triVerts.push_back([ index[i++], index[i++], index[i++] ]);
        }
        return mesh;
    }

};

function indexVertices(pos) {
    mesh.log(`indexing ${pos.length/3} vertices`);
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

function pos2mesh(pos) {

}

Module.onRuntimeInitialized = () => {
    Module.setup();

    if (false) {
        let c = Module.cube([1,1,1], true);
        console.log({
            c,
            cm: c.getMesh(),
            cm0: c.getMesh({ normal: false, mode: 0 }),
            cm1: c.getMesh({ normal: false, mode: 1 }),
            cm2: c.getMesh({ normal: false, mode: 2 }),
            cmn0: c.getMesh({ normal: true, mode: 0 }),
            cmn1: c.getMesh({ normal: true, mode: 1 }),
            cmn2: c.getMesh({ normal: true, mode: 2 })
        });

        let l = 5000;
        let s = Module.sphere(10, 100);
        let sm = s.getMesh();
        console.log({
            s,
            sm,
            md0: s.getMesh({ mode: 0 }),
            md1: s.getMesh({ mode: 1 }),
            md2: s.getMesh({ mode: 2 }),
        });

        console.time('getMesh');
        for (let i=0; i<l; i++) s.getMesh();
        console.timeEnd('getMesh');

        console.time(`getMeshDirect`);
        for (let i=0; i<l; i++) s.getMesh({ mode: 0 });
        console.timeEnd(`getMeshDirect`);

        console.time(`getMeshDirect`);
        for (let i=0; i<l; i++) s.getMesh({ mode: 1 });
        console.timeEnd(`getMeshDirect`);

        console.time(`getMeshDirect`);
        for (let i=0; i<l; i++) s.getMesh({ mode: 2 });
        console.timeEnd(`getMeshDirect`);
    }
};

gapp.overlay(base, {
    CSG
});

});
