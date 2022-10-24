/** Copyright 2014-2019 Stewart Allen -- All Rights Reserved */

"use strict";

// dep: geo.base
// dep: add.manifold
gapp.register("geo.csg", [], (root, exports) => {

const { base } = root;
const debug = true;

const CSG = {

    // accepts 2 or more arguments with threejs vertex position arrays
    union() {
        mesh.log(`manifold.union ${arguments.length} meshes`);
        const args = [...arguments].map(a => new Module.Manifold(a));
        const result = Module.union(...args);
        const output = result.getMesh();
        for (let m of [ ...args, result ]) {
            m.delete();
        }
        return output;
    },

    // accepts 2 or more arguments with threejs vertex position arrays
    // the fist argument is the target mesh. the rest are negatives
    subtract() {
        mesh.log(`manifold.subtract ${arguments.length} meshes`);
        const args = [...arguments].map(a => new Module.Manifold(a));
        const result = Module.difference(...args);
        const output = result.getMesh();
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
        const output = result.getMesh();
        for (let m of [ ...args, result ]) {
            m.delete();
        }
        return output;
    },

    toPositionArray(geom) {
        return add.manifold.mesh2pos(geom);
    },

    fromPositionArray(array) {
        return add.manifold.pos2mesh(array);
    }

};

gapp.overlay(base, {
    CSG
});

});
