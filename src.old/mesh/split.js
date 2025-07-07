/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

/**
 * toggle edit/split on Z tool
 * presents a Z plane on hover
 * click to split the selected mesh(es)
 */

"use strict";

// dep: moto.space
// dep: moto.broker
gapp.register("mesh.split", [], (root, exports) => {

const { broker } = gapp;
const { Mesh, MeshPhongMaterial, PlaneGeometry, DoubleSide, Vector3 } = THREE;
const { mesh, moto } = root;
const { space } = moto;

let isActive;

const key_once = broker.bind('key_once');
const key_cancel = broker.bind('key_once_cancel');

// split functions
let split = {
    active() {
        return isActive ? true : false;
    },

    start() {
        if (isActive) {
            return;
        }
        let { api, util } = mesh;
        let { log } = api;
        if (api.selection.models().length === 0) {
            log.emit('no models selected for splitting');
            return;
        }
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
        let state = split.state = { obj };
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
            // set appearance of split plane
            mat.color.set(api.prefs.map.space.dark ? 0x0059bb : 0x0079ff);
            obj.visible = true;
            if (event.shiftKey) {
                y = split.closestZ(y, object, face).y;
            }
            // y is z in model space for the purposes of a split
            state.plane = { z: y };
            // ensure split plane exceeds bounds of split target
            obj.scale.set(dim.x + 2, dim.y + 2, 1);
            obj.position.set(mid.x, y, -mid.y);
        });
        isActive = true;
        key_once({ code: 'KeyS', fn(evt) {
            split.select();
        }});
        key_once({ code: 'KeyV', fn(evt) {
            evt.preventDefault();
            let state = split.state;
            split.end();
            function doit(z) {
                state.plane = { z };
                split.select(state);
            }
            api.modal.dialog({
                title: "split object Z",
                body: [ h.div({ class: "additem" }, [
                    h.label('Z value'),
                    h.input({ value: 0, size: 5, id: "_value" }),
                    h.button({ _: "split", onclick() {
                        const { _value } = api.modal.bound;
                        doit(parseFloat(_value.value));
                        api.modal.hide();
                    } })
                ]) ]
            });
            api.modal.bound._value.focus();
        } });
    },

    select(state) {
        let { log } = mesh.api;
        let { models, plane } = split.state || state;
        if (!(models && plane)) {
            return split.end();
        }
        log.emit(`splitting ${models.length} model(s) at ${plane.z.round(3)}`).pin();
        Promise.all(models.map(m => m.split(plane))).then(models => {
            mesh.api.selection.set(models.filter(m => m));
            log.emit('split complete').unpin();
            split.end();
        });
    },

    end() {
        if (!isActive) {
            return;
        }
        key_cancel('KeyS');
        key_cancel('KeyV');
        let space = moto.space;
        let { obj } = split.state;
        space.scene.remove(obj);
        space.mouse.onHover(undefined);
        isActive = split.state = undefined;
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

exports(split);

});
