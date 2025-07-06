/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { api } from '../../kiri/api.js';
import { env } from './client.js';
import { space as SPACE } from '../../moto/space.js';

const { ui: UI } = api;

export function updateStock() {
    if (env.isAnimate) {
        if (env.isIndexed) {
            SPACE.world.remove(env.camStock);
            env.camStock = undefined;
        }
        return;
    }

    if (!env.isCamMode) {
        SPACE.world.remove(env.camZTop);
        SPACE.world.remove(env.camZBottom);
        SPACE.world.remove(env.camStock);
        env.camStock = null;
        env.camZTop = null;
        env.camZBottom = null;
        return;
    }

    api.platform.update_bounds();

    const settings = api.conf.get();
    const widgets = api.widgets.all();

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
        lines.material.color = new THREE.Color(env.isDark() ? 0x555555 : 0xaaaaaa);
    }

    SPACE.world.remove(env.camZTop);
    if (process.camZTop && widgets.length) {
        let max = { x, y, z };
        for (let w of widgets) {
            max.x = Math.max(max.x, w.track.box.w);
            max.y = Math.max(max.y, w.track.box.h);
            max.z = Math.max(max.z, w.track.box.d);
        }
        let geo = new THREE.PlaneGeometry(max.x, max.y);
        let mat = new THREE.MeshBasicMaterial({
            color: 0x777777,
            opacity: 0.55,
            transparent: true,
            side: THREE.DoubleSide
        });
        const camZTop = env.camZTop = new THREE.Mesh(geo, mat);
        camZTop._max = max;
        camZTop.renderOrder = 1;
        camZTop.position.x = center.x;
        camZTop.position.y = center.y;
        camZTop.position.z = process.camZTop;
        SPACE.world.add(camZTop);
    } else {
        env.camZTop = undefined;
    }

    SPACE.world.remove(env.camZBottom);
    if (process.camZBottom && widgets.length) {
        let max = { x, y, z };
        for (let w of widgets) {
            max.x = Math.max(max.x, w.track.box.w);
            max.y = Math.max(max.y, w.track.box.h);
            max.z = Math.max(max.z, w.track.box.d);
        }
        let geo = new THREE.PlaneGeometry(max.x, max.y);
        let mat = new THREE.MeshBasicMaterial({
            color: 0x777777,
            opacity: 0.55,
            transparent: true,
            side: THREE.DoubleSide
        });
        const camZBottom = env.camZBottom = new THREE.Mesh(geo, mat);
        camZBottom._max = max;
        camZBottom.renderOrder = 1;
        camZBottom.position.x = center.x;
        camZBottom.position.y = center.y;
        camZBottom.position.z = process.camZBottom;
        SPACE.world.add(camZBottom);
    } else {
        env.camZBottom = undefined;
    }

    SPACE.update();
}
