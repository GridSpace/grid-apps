/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

// start worker pool (disabled for now with *0)
moto.client.start(`/code/mesh_pool?${gapp.version}`, moto.client.max() * 0);

// dep: ext.three
// dep: ext.three-bgu
gapp.finalize("mesh.work", [
    "moto.license", // dep: moto.license
    "moto.client",  // dep: moto.client
    "moto.worker",  // dep: moto.worker
    "mesh.tool",    // dep: mesh.tool
    "add.three",    // dep: add.three
]);

// compensation for space/world/platform rotation
let core_matrix = new THREE.Matrix4().makeRotationX(Math.PI / 2);

let { client, worker } = moto;
let cache = {};

function cacheUpdate(id, data) {
    Object.assign(cache[id], data);
}

let model = {
    load(data) {
        let { vertices, indices, name, id } = data;
        let geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        if (indices) geo.setIndex(new THREE.BufferAttribute(indices, 1));
        cacheUpdate(id, { name, geo, matrix: core_matrix.clone() });
    },

    debug(data) {
        let { matrix, id } = data;
        let rec = cache[id];
        let geo = rec.geo.clone();
        let m4 = core_matrix.clone().multiply( new THREE.Matrix4().fromArray(matrix) );
        geo.applyMatrix4(m4);
        // for debugging state / matrix ops
        return geo.attributes.position.array;
    },

    heal(id) {
        dbug.log({healing: id});
        let geo = cache[id].geo;
        let tool = new mesh.tool({
            vertices: geo.attributes.position.array,
            faces: geo.index ? geo.index.array : undefined,
            debug: false
        });
        dbug.log('...imported data');
        tool.heal();
        dbug.log('...healed');
        dbug.log(tool);
        return true || tool.newFaces ? {
            vertices: tool.unrolled(),
            // v: tool.vertices,
            // f: tool.faces.map(f => f/3)
        } : 0;
    }
};

let group = {
    add(data) {
        let { id, model } = data;
    },

    remove(data) {
        let { id, model } = data;
    }
};

let object = {
    create(data) {
        let { id, type } = data;
        cache[id] = { id, type };
    },

    destroy(data) {
        delete cache[data.id];
    },

    move(data) {
        let { id, x, y, z } = data;
    },

    position(data) {
        let { id, x, y, z } = data;
    },

    rotate(data) {
        let { id, x, y, z } = data;
    },

    rotation(data) {
        let { id, x, y, z } = data;
    },

    qrotation(data) {
        let { id, w, x, y, z } = data;
    }
};

worker.bind("debug", (data, send) => {
    console.log({work_cache: cache});
});

worker.bindObject({
    model,
    group,
    object
});

worker.ready();

})();
