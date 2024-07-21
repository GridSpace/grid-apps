/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// dep: moto.space
gapp.register("mesh.split", [], (root, exports) => {

const { Mesh, MeshPhongMaterial, PlaneGeometry, DoubleSide, Vector3 } = THREE;
const { broker } = gapp;
const { moto } = root;
const { space } = moto;

// toggle edit/split temporary mode (present plane on hover)
let temp_mode;

// split functions
let split = {
    active() {
        return temp_mode ? true : false;
    },

    start() {
        let { api, util } = mesh;
        // highlight button
        let button = event.target;
        button.classList.add('selected');
        // create split plane visual
        let geo, mat, obj = new Mesh(
            geo = new PlaneGeometry(1,1),
            mat = new MeshPhongMaterial({
                side: DoubleSide,
                color: 0x5555aa,
                transparent: false,
                opacity: 0.5
            })
        );
        space.scene.add(obj);
        // hide until first hover
        obj.visible = false;
        // enable temp mode
        let state = split.state = { button, obj };
        let models = state.models = api.selection.models();
        let meshes = models.map(m => m.mesh);
        // for split and lay flat modes
        space.mouse.onHover((int, event, ints) => {
            if (!event) {
                return meshes;
            }
            obj.visible = false;
            let { button, buttons } = event;
            if (buttons) {
                return;
            }
            let { dim, mid } = util.bounds(meshes);
            let { point, face, object } = int;
            let { x, y, z } = point;

            mat.color.set(0x5555aa);
            obj.visible = true;
            if (event.shiftKey) {
                y = split.closestZ(y, object, face).y;
            }
            // y is z in model space for the purposes of a split
            state.plane = { z: y };
            obj.scale.set(dim.x + 2, dim.y + 2, 1);
            obj.position.set(mid.x, y, -mid.y);
        });
        temp_mode = split;
    },

    select() {
        let { log } = mesh.api;
        let { models, plane } = split.state;
        log.emit(`splitting ${models.length} model(s) at ${plane.z.round(3)}`).pin();
        Promise.all(models.map(m => m.split(plane))).then(models => {
            mesh.api.selection.set(models);
            log.emit('split complete').unpin();
            split.end();
        });
    },

    end() {
        let space = moto.space;
        let { button, obj } = split.state;
        button.classList.remove('selected');
        space.scene.remove(obj);
        space.mouse.onHover(undefined);
        temp_mode = split.state = undefined;
        mesh.api.selection.update();
    },

    closestZ(z, object, face) {
        let { position } = object.geometry.attributes;
        let matrix = object.matrixWorld;
        let v0 = new Vector3(position.getX(face.a), position.getY(face.a), position.getZ(face.a)).applyMatrix4(matrix);
        let v1 = new Vector3(position.getX(face.b), position.getY(face.b), position.getZ(face.b)).applyMatrix4(matrix);
        let v2 = new Vector3(position.getX(face.c), position.getY(face.c), position.getZ(face.c)).applyMatrix4(matrix);
        v0._d = Math.abs(v0.y - z);
        v1._d = Math.abs(v1.y - z);
        v2._d = Math.abs(v2.y - z);
        return [ v0, v1, v2 ].sort((a,b) => a._d - b._d)[0];
    }
}

function edit_split(event) {
    if (temp_mode) {
        temp_mode.end();
    } else {
        split.start();
    }
}

exports(split);

// bind functions to topics
broker.listeners({
    edit_split,
});

});
