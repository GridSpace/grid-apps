/** Copyright 2014-2019 Stewart Allen -- All Rights Reserved */

"use strict";

(function() {

    var MP = THREE.Mesh.prototype,
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

    MP.getBoundingBox = function(update) {
        return this.geometry.getBoundingBox(update);
    };

    MP.center = function() {
        this.geometry.center();
        return this;
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
        var i,
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

    // center geometry on x,y,z coordinates (defaults to 0,0,0)
    BP.center = function(x,y,z) {
        var box = this.getBoundingBox(),
            mid = box.dim.clone().multiplyScalar(0.5),
            dif = mid.clone().add(box.min),
            pos = this.attributes.position,
            arr = pos.array,
            maxx = Math.max(mid.x, mid.y, mid.z),
            i = 0;
        if (x) dif.x -= (maxx - mid.x) * x;
        if (y) dif.y -= (maxx - mid.y) * y;
        if (z) dif.z -= (maxx - mid.z) * z;
        while (i < arr.length) {
            arr[i++] -= dif.x;
            arr[i++] -= dif.y;
            arr[i++] -= dif.z;
        }
        pos.needsUpdate = true;
        // force update of (obsolete) bounding box
        this.getBoundingBox(true);
        return this;
    };

    // return cached or refreshed (when update = true) bounding box
    BP.getBoundingBox = function(update) {
        if (update || !this.boundingBox) {
            this.boundingBox = null;
            this.computeBoundingBox();
        }
        this.boundingBox.dim = this.boundingBox.max.clone().sub(this.boundingBox.min);
        return this.boundingBox;
    };

    // uniformly scale any mesh to a max x/y/z dim of 'unit' (defaults to 1)
    BP.unitScale = function(unit) {
        var bbox = this.getBoundingBox().clone(),
            scale = (unit || 1) / Math.max(
                bbox.max.x - bbox.min.x,
                bbox.max.y - bbox.min.y,
                bbox.max.z - bbox.min.z
            );
        this.applyMatrix4(new THREE.Matrix4().makeScale(scale,scale,scale));
        // force update of (obsolete) bounding box
        this.getBoundingBox(true);
        return this;
    };

    BP.fixNormals = function() {
        this.computeVertexNormals();
        return this;
    };

    // may be faster than the equivalent matrix transform. to be tested
//     BP.translate = function(x,y,z) {
//         let off = [x,y,z],
//             arr = this.attributes.position.array,
//             len = arr.length;
//         for (let i=0; i<len; i++) {
//             arr[i] += off[i%3];
//         }
//         return this;
//     }

    THREE.Object3D.prototype.newGroup = function() {
        var group = new THREE.Group();
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

})();
