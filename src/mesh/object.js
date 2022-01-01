/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

gapp.register("mesh.object", [
    "add.three",    // dep: add.three
    "moto.license", // dep: moto.license
    "mesh.api",     // dep: mesh.api
]);

let mesh = self.mesh = self.mesh || {};
if (mesh.object) return;

mesh.object = class MeshObject {

    // @returns {THREE.Object3D}
    object() {
        throw "object() requires implementation";
    }

    bounds() {
        return mesh.util.bounds(this.object());
    }

    focus() {
        mesh.api.focus(this.object());
    }

    floor() {
        let b = this.bounds();
        this.move(0, 0, -b.min.z);
        return this;
    }

    center(bounds) {
        let b = bounds || this.bounds();
        this.move(-b.center.x, b.center.y, -b.center.z);
        return this;
    }

    centerXY(bounds) {
        let b = bounds || this.bounds();
        this.move(-b.center.x, -b.center.y, 0);
        return this;
    }

    move(x = 0, y = 0, z = 0) {
        let pos = this.position();
        pos.set(pos.x + x, pos.y + y, pos.z + z);
        this.updateBoundsBox();
        moto.Space.update();
        return this;
    }

    scale() {
        let scale = this.object().scale;
        if (arguments.length === 0) {
            return scale;
        }
        scale.set(...arguments);
        this.updateBoundsBox();
        moto.Space.update();
    }

    rotate(x = 0, y = 0, z = 0) {
        if (x) this.object().rotateOnWorldAxis(new THREE.Vector3(1,0,0), x);
        if (y) this.object().rotateOnWorldAxis(new THREE.Vector3(0,1,0), y);
        if (z) this.object().rotateOnWorldAxis(new THREE.Vector3(0,0,1), z);
        this.updateBoundsBox();
        moto.Space.update();
        return this;
    }

    rotation() {
        let rot = this.object().rotation;
        if (arguments.length === 0) {
            return rot;
        }
        rot.set(...arguments);
        this.updateBoundsBox();
        moto.Space.update();
        return this;
    }

    qrotation(quaternion) {
        this.object().setRotationFromQuaternion(quaternion);
        this.updateBoundsBox();
        moto.Space.update();
        return this;
    }

    position() {
        let pos = this.object().position;
        if (arguments.length === 0) {
            return pos;
        }
        pos.set(...arguments);
        moto.Space.update();
    }

    showBounds(bool) {
        if (bool && bool.toggle) {
            bool = !this._showBounds;
        }
        this._showBounds = bool;
        this.updateBoundsBox();
    }

    updateBoundsBox() {
        let helper = this._boundsBox;
        let world = moto.Space.world;
        if (helper) {
            world.remove(helper);
        }
        if (this._showBounds) {
            let { center, size } = this.bounds();
            let b3 = new THREE.Box3().setFromCenterAndSize(
                new THREE.Vector3(center.x, center.y, center.z),
                new THREE.Vector3(size.x, size.y, size.z)
            );
            let helper = this._boundsBox = new THREE.Box3Helper(b3, 0x1155aa);
            world.add(helper);
        }
    }
};

})();
