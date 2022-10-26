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

    moduleOp(name, op) {
        mesh.log(`${name} ${arguments.length} meshes`);
        const args = [...arguments].slice(2).map(a => new Module.Manifold(a));
        if (args.length < 2) {
            throw "missing one or more meshes";
        }
        const result = Module[op](...args);
        const output = result.getMesh({ normal: () => undefined });
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
        const { vertPos, triVerts, vertex, index } = mesh;
        if (vertex && index) {
            const vertices = new Float32Array(index.length * 3);
            for (let p=0, i=0, l=index.length; i<l; i++) {
                let vi = index[i] * 3;
                vertices[p++] = vertex[vi++];
                vertices[p++] = vertex[vi++];
                vertices[p++] = vertex[vi++];
            }
            return vertices;
        }
        if (vertPos && triVerts) {
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
        }
        throw "mesh missing required fields";
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

    const tests = false;
    const mesh_perf = false;
    const ball_torture = false;

    if (tests) {
        let c = Module.cube([1,1,1], true);
        console.log({
            c,
            cm: c.getMesh(),
            cmd: c.getMesh({ normal: () => undefined }),
            cmdn: c.getMesh({})
        });

        if (mesh_perf) {
            let l = 1000;
            let s = Module.sphere(10, 100);
            let sm = s.getMesh();
            let smd = s.getMesh({});
            console.log({
                s,
                sm,
                smd,
            });

            console.time('getMesh');
            for (let i=0; i<l; i++) s.getMesh();
            console.timeEnd('getMesh');

            console.time(`getMeshDirect`);
            for (let i=0; i<l; i++) s.getMesh({ normal: () => undefined });
            console.timeEnd(`getMeshDirect`);

            console.time(`getMeshDirect`);
            for (let i=0; i<l; i++) s.getMesh({});
            console.timeEnd(`getMeshDirect`);
        }

        if (ball_torture) {
            console.time('ball test');
            let ball = Module.sphere(25, 128);
            let box = Module.cube([500, 500, 100], true);
            let deg2rad = Math.PI / 180;
            let z = 50;
            let rad = 250;
            let iter = 4;
            let last = Date.now();
            for (let i=0; i<360*iter; i++) {
                let x = Math.cos(deg2rad * i) * rad;
                let y = Math.sin(deg2rad * i) * rad;
                let ball2 = ball.translate(x, y, z);
                let box2 = box.subtract(ball2);
                ball2.delete();
                box.delete();
                box = box2;
                // box.getMesh();
                // let { vertex } = box.getMesh({ normal: () => undefined });
                let vertex = [];
                let now = Date.now();
                console.log((i/(iter*360)).toFixed(2), vertex.length, now - last); last = now;
                rad -= 0.05;
                z -= 0.1;
            }
            console.log(box.getMesh());
            ball.delete();
            box.delete();
            console.timeEnd('ball test');
        }
    }
};

gapp.overlay(base, {
    CSG
});

});
