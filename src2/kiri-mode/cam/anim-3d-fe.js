/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

// UI FRONT END ANIMATION CODE for 3D (indexed)

import { api } from '../../kiri/api.js';
import { space } from '../../moto/space.js';

const { client } = api;

let meshes = {},
    button = {},
    label = {},
    material,
    speedPauses = [0, 0, 0, 0, 0],
    speedValues = [1, 2, 4, 8, 32],
    speedNames = ["1x", "2x", "4x", "8x", "!!"],
    speedMax = speedValues.length - 1,
    speedIndex = 0,
    speed,
    origin,
    color = 0;

export function animate_clear2(api) {
    let { anim } = api.ui;
    client.animate_cleanup2();
    Object.keys(meshes).forEach(id => deleteMesh(id));
    api.widgets.setAxisIndex(0);
    api.uc.setVisible(anim.laba, true);
    api.uc.setVisible(anim.vala, true);
    anim.vala.value = "0.0";
}

export function animate2(api, delay) {
    let alert = api.alerts.show("building animation");
    let settings = api.conf.get();
    client.animate_setup2(settings, data => {
        handleUpdate(data);
        if (data) {
            return;
        }

        let { anim } = api.ui;
        Object.assign(button, {
            replay: anim.replay,
            play: anim.play,
            step: anim.step,
            pause: anim.pause,
            speed: anim.speed,
            trans: anim.trans,
            model: anim.model,
            shade: anim.shade
        });
        Object.assign(label, {
            progress: anim.progress,
            speed: anim.labspd,
            x: anim.valx,
            y: anim.valy,
            z: anim.valz,
            a: anim.vala
        });

        updateSpeed(0);
        setTimeout(step, delay || 0);
        toggleTrans(undefined, false);
        origin = settings.origin;

        button.replay.onclick = replay;
        button.play.onclick = play;
        button.step.onclick = step;
        button.pause.onclick = pause;
        button.speed.onclick = fast;
        button.trans.onclick = toggleTrans;
        button.model.onclick = toggleModel;
        button.shade.onclick = toggleStock;
        button.play.style.display = '';
        button.pause.style.display = 'none';

        api.event.emit('animate', 'CAM');
        api.alerts.hide(alert);
    });
}

Object.assign(client, {
    animate2(data, ondone) {
        client.send("animate2", data, ondone);
    },

    animate_setup2(settings, ondone) {
        color = settings.controller.dark ? 0x888888 : 0;
        material = new THREE.MeshMatcapMaterial({
            flatShading: true,
            transparent: false,
            opacity: 0.9,
            color: 0x888888,
            side: THREE.DoubleSide
        });
        client.send("animate_setup2", { settings }, ondone);
    },

    animate_cleanup2(data, ondone) {
        client.send("animate_cleanup2", data, ondone);
    }
});

function meshAdd(id, ind, pos, ilen, plen) {
    const geo = new THREE.BufferGeometry();
    const pa = plen ? pos.subarray(0, plen * 3) : pos;
    const ia = ilen ? ind.subarray(0, ilen) : ind;
    geo.setAttribute('position', new THREE.BufferAttribute(pa, 3));
    geo.setIndex(new THREE.BufferAttribute(ia, 1));
    const mesh = new THREE.Mesh(geo, material);
    mesh.pos = pos;
    mesh.ind = ind;
    space.world.add(mesh);
    meshes[id] = mesh;
}

function meshUpdate(id, ind, pos, ilen, plen) {
    const mesh = meshes[id];
    if (!mesh) {
        return; // animate cancelled
    }
    const geo = mesh.geometry;
    mesh.pos = pos || mesh.pos;
    mesh.ind = ind || mesh.ind;
    geo.setAttribute('position', new THREE.BufferAttribute(mesh.pos.subarray(0, plen * 3), 3));
    geo.setIndex(new THREE.BufferAttribute(mesh.ind.subarray(0, ilen), 1));
    geo.attributes.position.needsUpdate = true;
    geo.index.needsUpdate = true;
    space.update();
}

function deleteMesh(id) {
    space.world.remove(meshes[id]);
    delete meshes[id];
}

function toggleModel(ev, bool) {
    api.local.toggle('cam.anim.model', bool);
    api.widgets.all().forEach(w => w.toggleVisibility(bool));
}

function toggleStock(ev, bool, set) {
    set !== false && api.local.toggle('cam.anim.stock', bool);
    return api.event.emit('cam.stock.toggle', bool ?? undefined);
}

function toggleTrans(ev, bool) {
    bool = api.local.toggle('cam.anim.trans', bool);
    material.transparent = bool;
    material.needsUpdate = true;
}

function step() {
    updateSpeed();
    client.animate2({ speed, steps: 1 }, handleUpdate);
}

function play(opts) {
    const { steps } = opts;
    updateSpeed();
    if (steps !== 1) {
        button.play.style.display = 'none';
        button.pause.style.display = '';
    }
    client.animate2({
        speed,
        steps: steps || Infinity,
        pause: speedPauses[speedIndex]
    }, handleUpdate);
}

function fast(opts) {
    const { steps } = opts;
    updateSpeed(1);
    button.play.style.display = 'none';
    button.pause.style.display = '';
    client.animate2({
        speed,
        steps: steps || Infinity,
        pause: speedPauses[speedIndex]
    }, handleUpdate);
}

function pause() {
    button.play.style.display = '';
    button.pause.style.display = 'none';
    client.animate2({ speed: 0 }, handleUpdate);
}

function handleUpdate(data) {
    if (!data) {
        return;
    }
    if (data.mesh_add) {
        const { id, ind, pos, ilen, plen } = data.mesh_add;
        meshAdd(id, ind, pos, ilen, plen);
        space.refresh();
    }
    if (data.mesh_del) {
        deleteMesh(data.mesh_del);
    }
    if (data.mesh_move) {
        const { id, pos } = data.mesh_move;
        const mesh = meshes[id];
        if (mesh) {
            mesh.position.x = pos.x;
            mesh.position.y = pos.y;
            mesh.position.z = pos.z;
            space.refresh();
        }
        label.x.value = (pos.x - origin.x).toFixed(2);
        label.y.value = (pos.y + origin.y).toFixed(2);
        label.z.value = (pos.z - origin.z).toFixed(2);
    }
    if (data.stock_index !== undefined) {
        api.widgets.setAxisIndex(data.stock_index);
        label.a.value = -data.stock_index.toFixed(1);
    }
    if (data.mesh_index) {
        const { id, index } = data.mesh_index;
        const mesh = meshes[id];
        if (mesh) {
            mesh.rotation.x = (Math.PI / 180) * index;
            space.refresh();
        }
    }
    if (data.mesh_update) {
        const { id, ind, pos, ilen, plen } = data.mesh_update;
        meshUpdate(id, ind, pos, ilen, plen);
    }
    if (data && data.progress) {
        label.progress.value = (data.progress * 100).toFixed(1);
    }
}

function updateSpeed(inc = 0) {
    if (inc === Infinity) {
        speedIndex = speedMax;
    } else if (inc > 0) {
        speedIndex = (speedIndex + inc) % speedValues.length;
    }
    api.local.set('cam.anim.speed', speedIndex);
    speed = speedValues[speedIndex];
    label.speed.value = speedNames[speedIndex];
}

function replay() {
    animate_clear2(api);
    setTimeout(() => {
        animate2(api, 50);
    }, 250);
}
