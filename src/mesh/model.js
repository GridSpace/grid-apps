/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

gapp.register("mesh.model", [
    "add.three",    // dep: add.three
    "moto.license", // dep: moto.license
]);

let mesh = self.mesh = self.mesh || {};
if (mesh.model) return;

/** default materials **/
mesh.material = {
    solid: new THREE.MeshPhongMaterial({
        transparent: true,
        shininess: 100,
        specular: 0x181818,
        color: 0xffff00,
        opacity: 1
    })
};

/** 3D model rendered on plaform **/
mesh.model = class MeshModel {
    constructor(data) {
        let { file, mesh } = data;

        if (!mesh) {
            dbug.error(`'${file}' missing mesh data`);
            return;
        }

        this.file = file;
        this.mesh = this.load(mesh);
    }

    load(vertices, indices) {
        let geo = new THREE.BufferGeometry();
        if (indices) geo.setIndex(new THREE.BufferAttribute(indices, 1));
        geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        geo.setAttribute('normal', undefined);
        let meh = new THREE.Mesh(geo, mesh.material.solid);
        geo.computeFaceNormals();
        geo.computeVertexNormals();
        meh.material.side = THREE.DoubleSide;
        meh.receiveShadow = true;
        meh.castShadow = true;
        meh.renderOrder = 1;
        return meh;
    }
};

})();
