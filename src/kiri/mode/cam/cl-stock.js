/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { api } from '../../app/api.js';
import { env, isDark } from './init-ui.js';
import { space as SPACE } from '../../../moto/space.js';

const { ui: UI } = api;

let meshZTop, meshZBottom;

{
    let geo = new THREE.PlaneGeometry(1, 1);
    let mat = new THREE.MeshBasicMaterial({
        color: 0x779977,
        opacity: 0.55,
        transparent: true,
        side: THREE.DoubleSide
    });
    meshZTop = new THREE.Mesh(geo, mat);
    meshZTop.renderOrder = 1;
}

{
    let geo = new THREE.PlaneGeometry(1, 1);
    let mat = new THREE.MeshBasicMaterial({
        color: 0x997777,
        opacity: 0.55,
        transparent: true,
        side: THREE.DoubleSide
    });
    meshZBottom = new THREE.Mesh(geo, mat);
    meshZBottom.renderOrder = 1;
}

export function getBounds() {
    const settings = api.conf.get();
    const { stock } = settings;
    const { x, y, z, center } = stock;
    const widgets = api.widgets.all();
    let max = { x, y, z };
    for (let w of widgets) {
        max.x = Math.max(max.x, w.track.box.w);
        max.y = Math.max(max.y, w.track.box.h);
        max.z = Math.max(max.z, w.track.box.d);
    }
    return widgets.length ? { max, center } : {};
}

export function showZTop(zval) {
    SPACE.world.remove(meshZTop);
    let { max, center } = getBounds();
    if (zval && max && center) {
        meshZTop.position.x = center.x;
        meshZTop.position.y = center.y;
        meshZTop.position.z = zval;
        meshZTop.scale.x = max.x;
        meshZTop.scale.y = max.y;
        SPACE.world.add(meshZTop);
    }
}

export function showZBottom(zval) {
    SPACE.world.remove(meshZBottom);
    let { max, center } = getBounds();
    if (zval && max && center) {
        meshZBottom.position.x = center.x;
        meshZBottom.position.y = center.y;
        meshZBottom.position.z = zval;
        meshZBottom.scale.x = max.x;
        meshZBottom.scale.y = max.y;
        SPACE.world.add(meshZBottom);
    }
}

export function updateStock() {
    if (env.isAnimate) {
        if (env.isIndexed) {
            SPACE.world.remove(env.camStock);
            env.camStock = undefined;
        }
        return;
    }

    if (!env.isCamMode) {
        SPACE.world.remove(meshZTop);
        SPACE.world.remove(meshZBottom);
        SPACE.world.remove(env.camStock);
        env.camStock = null;
        return;
    }

    api.platform.update_bounds();

    const settings = api.conf.get();
    const { stock, process } = settings;
    const { x, y, z, center } = stock;

    UI.func.animate.classList.add('disabled');
    if (env.camStock) {
        SPACE.world.remove(env.camStock);
        env.camStock = null;
    }
    if (x && y && z) {
        UI.func.animate.classList.remove('disabled');
        {
            let geo = new THREE.BoxGeometry(1, 1, 1);
            let mat = new THREE.MeshBasicMaterial({
                color: 0x777777,
                opacity: 0.05,
                transparent: true,
                side: THREE.DoubleSide
            });
            env.camStock = new THREE.Mesh(geo, mat);
            env.camStock.renderOrder = 2;
            let lo = 0.5;
            let lidat = [
                lo, lo, lo, lo, lo, -lo,
                lo, lo, lo, lo, -lo, lo,
                lo, lo, lo, -lo, lo, lo,
                -lo, -lo, -lo, -lo, -lo, lo,
                -lo, -lo, -lo, -lo, lo, -lo,
                -lo, -lo, -lo, lo, -lo, -lo,
                lo, lo, -lo, -lo, lo, -lo,
                lo, lo, -lo, lo, -lo, -lo,
                lo, -lo, -lo, lo, -lo, lo,
                lo, -lo, lo, -lo, -lo, lo,
                -lo, -lo, lo, -lo, lo, lo,
                -lo, lo, lo, -lo, lo, -lo
            ];
            let ligeo = new THREE.BufferGeometry();
            ligeo.setAttribute('position', new THREE.BufferAttribute(lidat.toFloat32(), 3));
            let limat = new THREE.LineBasicMaterial({ color: 0xaaaaaa });
            let lines = new THREE.LineSegments(ligeo, limat);
            env.camStock.lines = lines;
            env.camStock.add(lines);
            SPACE.world.add(env.camStock);
        }
        // fight z fighting in threejs
        const { scale, position, lines } = env.camStock;
        scale.x = x + 0.005;
        scale.y = y + 0.005;
        scale.z = z + 0.005;
        position.x = center.x;
        position.y = center.y;
        position.z = center.z;
        lines.material.color = new THREE.Color(isDark() ? 0x555555 : 0xaaaaaa);
    }

    showZTop(process.camZTop);
    showZBottom(process.camZBottom);

    SPACE.update();
}
