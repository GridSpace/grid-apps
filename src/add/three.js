/** Copyright 2014-2019 Stewart Allen -- All Rights Reserved */

"use strict";

// dep: ext.three
gapp.register("add.three", [], (root, exports) => {

const {
    THREE, SVGLoader, BufferGeometryUtils,
    LineMaterial, Line2, LineGeometry, LineSegments2, LineSegmentsGeometry
} = ThreeBundle;

root.THREE = THREE;
THREE.BufferGeometryUtils = BufferGeometryUtils;
THREE.SVGLoader = SVGLoader.SVGLoader;
THREE.LineMaterial = LineMaterial;
THREE.Line2 = Line2;
THREE.LineGeometry = LineGeometry;
THREE.LineSegments2 = LineSegments2;
THREE.LineSegmentsGeometry = LineSegmentsGeometry;

let MP = THREE.Mesh.prototype,
    XP = THREE.Box3.prototype,
    BP = THREE.BufferGeometry.prototype;

THREE.computeFaceNormal = function(vA,vB,vC) {
    const ab = new THREE.Vector3();
    const cb = new THREE.Vector3();
    cb.subVectors( vC, vB );
    ab.subVectors( vA, vB );
    cb.cross( ab );
    cb.normalize();
    return cb;
};

// https://www.npmjs.com/package/three-mesh-bvh
THREE.addBVH = function() {
    const { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } = MeshBVHLib;
    THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
    THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
    THREE.Mesh.prototype.raycast = acceleratedRaycast;
};

THREE.dispose = function(obj) {
    if (!obj) {
        return;
    }
    if (obj.geometry) {
        obj.geometry.dispose();
    }
    if (obj.material && obj.material.map && obj.material.map.dispose) {
        obj.material.map.dispose();
    }
    if (obj.children && obj.children.length) {
        for (let c of obj.children) {
            THREE.dispose(c);
        }
    }
};

// add .dim and .mid getters to Box3
Object.defineProperties(XP, {
    dim: {
        get: function() {
            return this.max.clone().sub(this.min);
        }
    },
    mid: {
        get: function() {
            return this.dim.clone().multiplyScalar(0.5).add(this.min);
        }
    }
});

MP.getBoundingBox = function(update) {
    return this.geometry.getBoundingBox(update);
};

MP.mirrorX = function() {
    return this.mirror(0);
};

MP.mirrorY = function() {
    return this.mirror(1);
};

MP.mirrorZ = function() {
    return this.mirror(2);
};

// fast mirror of vertices given axis array offset
// array elements are repeating [x,y,z,x,y,z,...]
MP.mirror = function(start) {
    let i,
        geo = this.geometry,
        at = geo.attributes,
        pa = at.position.array,
        nm = at.normal.array;
    for (i = start || 0 ; i < pa.length; i += 3) {
        pa[i] = -pa[i];
        nm[i] = -nm[i];
    }
    geo.computeVertexNormals();
    return this;
};

// return cached or refreshed (when update = true) bounding box
BP.getBoundingBox = function(update) {
    if (update || !this.boundingBox) {
        this.boundingBox = null;
        this.computeBoundingBox();
    }
    return this.boundingBox;
};

BP.moveMesh = function(x = 0, y = 0, z = 0) {
    let gap = this.attributes.position,
        pa = gap.array;
    for (let i=0; i < pa.length; i += 3) {
        pa[i    ] += x;
        pa[i + 1] += y;
        pa[i + 2] += z;
    }
    gap.needsUpdate = true;
    return this;
}

BP.shallowClone = function() {
    let geo = new THREE.BufferGeometry();
    for (let [k, v] of Object.entries(this.attributes)) {
        geo.setAttribute(k, new THREE.BufferAttribute(v.array, v.itemSize));
    }
    return geo;
};

THREE.Object3D.prototype.newGroup = function() {
    let group = new THREE.Group();
    this.add(group);
    return group;
};

THREE.Object3D.prototype.removeAll = function() {
    this.children.slice().forEach(function (c) {
        c.parent = undefined;
        c.dispatchEvent( { type: 'removed' } );
    });
    this.children = [];
};

});
