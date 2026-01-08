/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { api } from '../../app/api.js';
import { colorSchemeRegistry } from '../../app/color/schemes.js';
import { env, isDark } from './init-ui.js';
import { addbox, delbox, clearboxes } from '../../app/boxes.js';
import { traceDone } from './cl-trace.js';
import { space as SPACE } from '../../../moto/space.js';

let showTab, lastTab, tab, iw, ic;

export function mirrorTabs(widget) {
    let tabs = api.widgets.annotate(widget.id).tab || [];
    tabs.forEach(rec => {
        let { id, pos, rot } = rec;
        let tab = widget.tabs[id];
        let e = new THREE.Euler().setFromQuaternion(rot);
        e._z = Math.PI - e._z;
        let { _x, _y, _z, _w } = rec.rot;
        let or = new THREE.Quaternion(_x, _y, _z, _w);
        let nr = new THREE.Quaternion().setFromEuler(e);
        let ra = or.angleTo(nr);
        // console.log({or, nr, ra});
        rec.rot = nr;
        // let m4 = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0,0,e._z));
        // tab.box.geometry.applyMatrix4(m4);
        tab.box.position.x = pos.x = -pos.x;
    });
    SPACE.update();
}

export function rotateTabs(widget, x, y, z) {
    let tabs = api.widgets.annotate(widget.id).tab || [];
    tabs.forEach(rec => {
        let { id, pos, rot } = rec;
        if (!Array.isArray(rot)) {
            rot = rot.toArray();
        }
        let coff = widget.track.center;
        let tab = widget.tabs[id];
        let m4 = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(x || 0, y || 0, z || 0));
        // update position vector
        let vc = new THREE.Vector3(pos.x, pos.y, pos.z).applyMatrix4(m4);
        // update rotation quaternion
        let [rx, ry, rz, rw] = rot;
        rec.rot = new THREE.Quaternion().multiplyQuaternions(
            new THREE.Quaternion(rx, ry, rz, rw),
            new THREE.Quaternion().setFromRotationMatrix(m4)
        ).toArray();
        tab.box.geometry.applyMatrix4(m4);
        tab.box.position.x = pos.x = vc.x - coff.dx;
        tab.box.position.y = pos.y = vc.y - coff.dy;
        tab.box.position.z = pos.z = vc.z;
    });
    SPACE.update();
}

export function createTabBox(iw, ic, n) {
    const { track } = iw;
    const { stock, bounds, process } = api.conf.get();
    const { camTabsWidth, camTabsHeight, camTabsDepth, camTabsMidline } = process;
    const { camZBottom, camStockIndexed } = process;
    const sz = stock.z || bounds.max.z;
    const zto = sz - iw.track.top;
    const zp = (camZBottom || camStockIndexed ? camZBottom : sz - track.box.d - zto) + (camTabsMidline ? 0 : camTabsHeight / 2);
    ic.x += n.x * camTabsDepth / 2; // offset from part
    ic.z -= n.y * camTabsDepth / 2; // offset swap z,y
    ic.y = zp; // offset swap in world space y,z
    const rot = new THREE.Quaternion().setFromAxisAngle(env.zaxis, Math.atan2(n.y, n.x));
    const pos = { x: ic.x, y: ic.y, z: ic.z };
    const dim = { x: camTabsDepth, y: camTabsWidth, z: camTabsHeight };
    const tab = addbox(pos, boxColor(), 'tabb', dim, { rotate: rot, opacity: boxOpacity() });
    return { pos, dim, rot, tab, width: camTabsWidth, height: camTabsHeight, stock };
}

export function addWidgetTab(widget, rec) {
    const { pos, dim, rot, id } = rec;
    const tabs = widget.tabs = (widget.tabs || {});
    // prevent duplicate restore from repeated settings load calls
    if (!tabs[id]) {
        pos.box = addbox(
            pos, boxColor(), id,
            dim, { group: widget.mesh, rotate: rot, opacity: boxOpacity() }
        );
        pos.box.tab = Object.assign({ widget, id }, pos);
        widget.adds.push(pos.box);
        tabs[id] = pos;
    }
}

export function recreateTabs() {
    let widgets = api.widgets.all();
    for (let w of widgets) clearTabs(w, true);
    restoreTabs(widgets);
}

export function restoreTabs(widgets) {
    widgets.forEach(widget => {
        const tabs = api.widgets.annotate(widget.id).tab || [];
        tabs.forEach(rec => {
            let [x, y, z, w] = rec.rot;
            rec = Object.clone(rec);
            rec.rot = new THREE.Quaternion(x, y, z, w);
            addWidgetTab(widget, rec);
        });
    });
}

export function clearTabs(widget, skiprec) {
    Object.values(widget.tabs || {}).forEach(rec => {
        widget.adds.remove(rec.box);
        widget.mesh.remove(rec.box);
    });
    widget.tabs = {};
    if (!skiprec) {
        delete api.widgets.annotate(widget.id).tab;
    }
    clearboxes();
}

export function updateTabs() {
    // update tab color and opacity
    api.widgets.all().forEach(widget => {
        Object.values(widget.tabs || {}).forEach(rec => {
            for (let rec of widget.adds || []) {
                rec.material.color = new THREE.Color(boxColor());
                rec.material.opacity = boxOpacity();
            }
        });
    });
}

export function tabHover(data) {
    delbox('tabb');
    const { int, type, point } = data;
    const object = int ? int.object : null;
    const tab = int ? object.tab : null;
    if (lastTab) {
        lastTab.box.material.color.r = 0;
        lastTab = null;
    }
    if (tab) {
        tab.box.material.color.r = 0.5;
        lastTab = tab;
        return;
    }
    if (type !== 'widget') {
        iw = null;
        return;
    }
    let n = int.face.normal;
    iw = int.object.widget;
    ic = int.point;
    // only near vertical faces
    // if (Math.abs(n.z) > 0.3) {
    //     return;
    // }
    showTab = createTabBox(iw, ic, n);
}

export function tabHoverUp(int) {
    delbox('tabb');
    if (lastTab) {
        const { widget, box, id } = lastTab;
        widget.adds.remove(box);
        widget.mesh.remove(box);
        delete widget.tabs[id];
        let ta = api.widgets.annotate(widget.id).tab;
        let ix = 0;
        ta.forEach((rec, i) => {
            if (rec.id === id) {
                ix = i;
            }
        });
        ta.splice(ix, 1);
        api.conf.save();
        widget.saveState();
        return;
    }
    if (!iw) return;
    let ip = iw.track.pos;
    let wa = api.widgets.annotate(iw.id);
    let wt = (wa.tab = wa.tab || []);
    let pos = {
        x: showTab.pos.x - ip.x,
        y: -showTab.pos.z - ip.y,
        z: showTab.stock.z ?
            showTab.pos.y + ip.z + (env.isIndexed ? 0 : iw.track.tzoff) :
            showTab.dim.z / 2,
    }
    let id = Date.now();
    let { dim, rot } = showTab;
    let rec = { pos, dim, rot, id };
    wt.push(Object.clone(rec));
    addWidgetTab(iw, rec);
    api.conf.save();
    iw.saveState();
}

export function tabAdd() {
    traceDone();
    alert = api.show.alert("[esc] cancels tab editing");
    api.feature.hover = true;
    env.hover = tabHover;
    env.hoverUp = tabHoverUp;
}

export function tabDone() {
    delbox('tabb');
    clearboxes();
    api.hide.alert(alert);
    api.feature.hover = false;
    if (lastTab) {
        lastTab.box.material.color.r = 0;
        lastTab = null;
    }
}

export function tabClear() {
    tabDone();
    api.widgets.all().forEach(widget => {
        clearTabs(widget);
        widget.saveState();
    });
    api.conf.save();
}

function boxColor() {
    const mode = 3; // CAM mode ID
    const theme = isDark() ? 'dark' : 'light';
    const scheme = colorSchemeRegistry.getScheme(mode, theme);
    return scheme.operations?.tabs?.color ?? (isDark() ? 0x00ddff : 0x0000dd);
}

function boxOpacity() {
    const mode = 3; // CAM mode ID
    const theme = isDark() ? 'dark' : 'light';
    const scheme = colorSchemeRegistry.getScheme(mode, theme);
    return scheme.operations?.tabs?.opacity ?? (isDark() ? 0.75 : 0.6);
}
