/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

// UI FRONT END ANIMATION CODE for 2D

import { api } from '../../app/api.js';
import { space } from '../../../moto/space.js';

const { client } = api;

const asLines = false;
const asPoints = false;

let meshes = {},
    button = {},
    label = {},
    unitScale = 1,
    speedValues = [ 1, 2, 4, 8, 32 ],
    speedPauses = [ 30, 20, 10, 5, 0 ],
    speedNames = [ "1x", "2x", "4x", "8x", "!!" ],
    speedMax = speedValues.length - 1,
    speedIndex = 0,
    speed,
    color = 0,
    material,
    origin,
    posOffset = { x:0, y:0, z:0 };

export function animate_clear(api) {
    let { anim } = api.ui;
    space.platform.showGridBelow(true);
    client.animate_cleanup();
    Object.keys(meshes).forEach(id => deleteMesh(id));
    toggleStock(undefined,true,false);
    api.uc.setVisible(anim.laba, false);
    api.uc.setVisible(anim.vala, false);
}

export function animate(api, delay) {
    let alert = api.alerts.show("building animation");
    let settings = api.conf.get();
    client.animate_setup(settings, data => {
        checkMeshCommands(data);
        if (!(data && data.mesh_add)) {
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
        });

        origin = settings.origin;
        speedIndex = api.local.getInt('cam.anim.speed') || 0;
        updateSpeed();
        setTimeout(step, delay || 0);

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
        space.platform.showGridBelow(false);
        toggleTrans(0,api.local.getBoolean('cam.anim.trans', true));
        toggleModel(0,api.local.getBoolean('cam.anim.model', false));
        toggleStock(0,api.local.getBoolean('cam.anim.stock', false));
    });
}

Object.assign(client, {
    animate(data, ondone) {
        client.send("animate", data, ondone);
    },

    animate_setup(settings, ondone) {
        color = settings.controller.dark ? 0x48607B : 0x607FA4;
        unitScale = settings.controller.units === 'in' ? 1/25.4 : 1;
        let flatShading = true,
            transparent = true,
            opacity = 0.9,
            side = THREE.DoubleSide;
        material = new THREE.MeshPhongMaterial({
            flatShading,
            transparent,
            opacity,
            color,
            side
        });
        add_red_neg_z(material);
        client.send("animate_setup", {settings}, ondone);
    },

    animate_cleanup(data, ondone) {
        client.send("animate_cleanup", data, ondone);
    }
});

function meshAdd(id, ind, pos, sab) {
    const geo = new THREE.BufferGeometry();
    if (sab) {
        // use array buffer shared with worker
        pos = new Float32Array(sab);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    if (ind.length) {
        geo.setIndex(new THREE.BufferAttribute(new Uint32Array(ind), 1));
    }
    let mesh;
    if (asPoints) {
        const mat = new THREE.PointsMaterial({
            transparent: true,
            opacity: 0.75,
            color: 0x888888,
            size: 0.3
        });
        mesh = new THREE.Points(geo, mat);
    } else if (asLines) {
        const mat = new THREE.LineBasicMaterial({
            transparent: true,
            opacity: 0.75,
            color
        });
        mesh = new THREE.LineSegments(geo, mat);
    } else {
        geo.computeVertexNormals();
        mesh = new THREE.Mesh(geo, material);
        mesh.renderOrder = -10;
    }
    space.world.add(mesh);
    meshes[id] = mesh;
}

function meshUpdates(id) {
    const mesh = meshes[id];
    if (!mesh) {
        return; // animate cancelled
    }
    mesh.geometry.attributes.position.needsUpdate = true;
    space.update();
}

function deleteMesh(id) {
    space.world.remove(meshes[id]);
    delete meshes[id];
}

function toggleModel(ev,bool) {
    api.local.toggle('cam.anim.model', bool);
    api.widgets.all().forEach(w => w.toggleVisibility(bool));
}

function toggleStock(ev,bool,set) {
    set !== false && api.local.toggle('cam.anim.stock', bool);
    return api.event.emit('cam.stock.toggle', bool ?? undefined);
}

function toggleTrans(ev,bool) {
    bool = api.local.toggle('cam.anim.trans', bool);
    material.transparent = bool;
    material.needsUpdate = true;
}

function step() {
    updateSpeed();
    client.animate({speed, steps: 1}, handleGridUpdate);
}

function play(opts) {
    const { steps } = opts;
    updateSpeed();
    if (steps !== 1) {
        button.play.style.display = 'none';
        button.pause.style.display = '';
    }
    client.animate({
        speed,
        steps: steps || Infinity,
        pause: speedPauses[speedIndex]
    }, handleGridUpdate);
}

function fast(opts) {
    const { steps } = opts;
    updateSpeed(1);
    button.play.style.display = 'none';
    button.pause.style.display = '';
    client.animate({
        speed,
        steps: steps || Infinity,
        pause: speedPauses[speedIndex]
    }, handleGridUpdate);
}

function pause() {
    button.play.style.display = '';
    button.pause.style.display = 'none';
    client.animate({speed: 0}, handleGridUpdate);
}

function handleGridUpdate(data) {
    checkMeshCommands(data);
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
    animate_clear(api);
    setTimeout(() => {
        animate(api, 50);
    }, 250);
}

function checkMeshCommands(data) {
    if (!data) {
        return;
    }
    if (data.mesh_add) {
        const { id, ind, pos, offset, sab } = data.mesh_add;
        meshAdd(id, ind, pos, sab);
        space.refresh();
        if (offset) {
            posOffset = offset;
        }
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
            space.update();
        }
        label.x.value = (pos.x - origin.x).toFixed(2);
        label.y.value = (pos.y + origin.y).toFixed(2);
        label.z.value = (pos.z - origin.z).toFixed(2);
    }
    if (data.mesh_update) {
        meshUpdates(data.id);
    }
}

// SHADER: tint points below z=0 with red
function add_red_neg_z(material) {
    material.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader.replace(
            `#include <worldpos_vertex>`,
            `
            #include <worldpos_vertex>
            vWorldPosition = vec3(transformed);
            `
        );

        shader.vertexShader = `
            varying vec3 vWorldPosition;
        ` + shader.vertexShader;

        shader.fragmentShader = `
            varying vec3 vWorldPosition;
        ` + shader.fragmentShader;

        shader.fragmentShader = shader.fragmentShader.replace(
            `#include <dithering_fragment>`,
            `
            #include <dithering_fragment>
            if (vWorldPosition.z < 0.0) {
                gl_FragColor.rgb += vec3(0.5, 0.0, 0.0); // Add red tint
            }
            `
        );
    };
    return material;
}
