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
let space_rotation = new THREE.Matrix4().makeRotationX(Math.PI / 2);

let { client, worker } = moto;
let cache = {};

worker.bind("debug", (data, send) => {
    console.log({cache});
    send.done();
});

worker.bind("model_load", (data, send) => {
    let { vertices, name, id } = data;
    let geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geo.computeVertexNormals();
    cache[id] = { id, name, geo };
    send.done();
});

worker.bind("model_remove", (data, send) => {
    delete cache[data.id];
    send.done();
});

worker.bind("model_sync", (data, send) => {
    let { matrix, id } = data;
    let rec = cache[id];
    let geo = rec.geo.clone();
    let m4 = space_rotation.clone().multiply( new THREE.Matrix4().fromArray(matrix) );
    geo.applyMatrix4(m4);
    // for debugging matrix ops
    send.done(geo.attributes.position.array);
});

})();
