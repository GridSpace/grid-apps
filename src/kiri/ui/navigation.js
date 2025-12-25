/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { $ } from '../../moto/webui.js';
import { api } from './api.js';
import { space } from '../../moto/space.js';
import { settingsOps } from './settings-ops.js';

const { selection } = api;

function setupNavigation(ui, WIN, LANG) {
    // bind interface action elements
    $('export-support-a').onclick = (ev) => { ev.stopPropagation(); api.modal.show('don8') };
    $('mode-device').onclick = api.show.devices;
    $('mode-profile').onclick = settingsOps.settingsLoad;
    $('mode-fdm').onclick = () => api.mode.set('FDM');
    $('mode-cam').onclick = () => api.mode.set('CAM');
    $('mode-sla').onclick = () => api.mode.set('SLA');
    $('mode-laser').onclick = () => api.mode.set('LASER');
    $('mode-drag').onclick = () => api.mode.set('DRAG');
    $('mode-wjet').onclick = () => api.mode.set('WJET');
    $('mode-wedm').onclick = () => api.mode.set('WEDM');
    $('set-device').onclick = (ev) => { ev.stopPropagation(); api.show.devices() };
    $('set-profs').onclick = (ev) => { ev.stopPropagation(); api.conf.show() };
    $('set-tools').onclick = (ev) => { ev.stopPropagation(); api.show.tools() };
    $('set-prefs').onclick = (ev) => { ev.stopPropagation(); api.modal.show('prefs') };
    ui.acct.help.onclick = (ev) => { ev.stopPropagation(); api.help.show() };
    ui.acct.don8.onclick = (ev) => { ev.stopPropagation(); api.modal.show('don8') };
    ui.acct.mesh.onclick = (ev) => { ev.stopPropagation(); WIN.location = "/mesh" };
    ui.acct.export.onclick = (ev) => { ev.stopPropagation(); settingsOps.profileExport() };
    ui.acct.export.title = LANG.acct_xpo;
    $('file-new').onclick = (ev) => { ev.stopPropagation(); settingsOps.workspaceNew() };
    $('file-recent').onclick = () => { api.modal.show('files') };
    $('file-import').onclick = (ev) => { api.event.import(ev); };
    ui.func.slice.onclick = (ev) => { ev.stopPropagation(); api.function.slice() };
    ui.func.preview.onclick = (ev) => { ev.stopPropagation(); api.function.print() };
    ui.func.animate.onclick = (ev) => { ev.stopPropagation(); api.function.animate() };
    ui.func.export.onclick = (ev) => { ev.stopPropagation(); api.function.export() };
    $('view-arrange').onclick = api.platform.layout;
    $('view-top').onclick = space.view.top;
    $('view-home').onclick = space.view.home;
    $('view-front').onclick = space.view.front;
    $('view-back').onclick = space.view.back;
    $('view-left').onclick = space.view.left;
    $('view-right').onclick = space.view.right;
    $('unrotate').onclick = () => {
        api.widgets.for(w => w.unrotate());
        selection.update_info();
    };
    // attach button handlers to support targets
    for (let btn of ["don8pt","don8gh","don8pp"]) {
        $(btn).onclick = (ev) => {
            window.open(ev.target.children[0].href);
        }
    }
    // rotation buttons
    let d = (Math.PI / 180);
    $('rot_x_lt').onclick = () => { selection.rotate(-d * $('rot_x').value,0,0) };
    $('rot_x_gt').onclick = () => { selection.rotate( d * $('rot_x').value,0,0) };
    $('rot_y_lt').onclick = () => { selection.rotate(0,-d * $('rot_y').value,0) };
    $('rot_y_gt').onclick = () => { selection.rotate(0, d * $('rot_y').value,0) };
    $('rot_z_lt').onclick = () => { selection.rotate(0,0, d * $('rot_z').value) };
    $('rot_z_gt').onclick = () => { selection.rotate(0,0,-d * $('rot_z').value) };
    // rendering options
    $('render-edges').onclick = () => { api.view.edges({ toggle: true }); api.conf.save() };
    $('render-ghost').onclick = () => { api.view.wireframe(false, 0, api.view.is_arrange() ? 0.4 : 0.25); };
    $('render-wire').onclick = () => { api.view.wireframe(true, 0, api.space.is_dark() ? 0.25 : 0.5); };
    $('render-solid').onclick = () => { api.view.wireframe(false, 0, 1); };
    $('mesh-export-stl').onclick = () => { settingsOps.objectsExport('stl') };
    $('mesh-export-obj').onclick = () => { settingsOps.objectsExport('obj') };
    $('mesh-merge').onclick = selection.merge;
    $('mesh-split').onclick = selection.isolateBodies;
    $('context-duplicate').onclick = selection.duplicate;
    $('context-mirror').onclick = selection.mirror;
    $('context-layflat').onclick = () => { api.event.emit("tool.mesh.lay-flat") };
    $('context-lefty').onclick = () => { api.event.emit("tool.mesh.lefty") };
    $('context-setfocus').onclick = () => {
        api.event.emit(
            "tool.camera.focus",
            ev => api.space.set_focus(undefined, ev.object.point)
        );
    };
    $('context-contents').onclick = () => { api.SPACE.view.fit() };
    $('view-fit').onclick = () => { api.SPACE.view.fit() };
    $('wassup').onmouseover = () => { $('suppopp').classList.remove('hide') };
}

export const navigation = {
    setupNavigation
};
