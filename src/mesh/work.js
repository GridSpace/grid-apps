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

moto.worker.bind("model_sync", (data, send) => {
    let { vertices, matrix } = data;
    console.log('model_sync', {vertices, matrix, send});
    let geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geo.setAttribute('normal', undefined);
    geo.computeFaceNormals();
    geo.computeVertexNormals();
    let m4 = space_rotation.clone().multiply( new THREE.Matrix4().fromArray(matrix) );
    geo.applyMatrix4(m4);
    send.done(geo.attributes.position.array);
});

})();
