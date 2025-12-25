/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { $ } from '../../moto/webui.js';
import { api } from './api.js';
import { settings as set_ctrl } from './config/manager.js';

function settings() {
    return api.conf.get();
}

function deviceExport(exp, name) {
    name = (name || "device")
        .toLowerCase()
        .replace(/ /g,'_')
        .replace(/\./g,'_');
    api.uc.prompt("Export Device Filename", name).then(name => {
        if (name) {
            api.util.download(exp, `${name}.km`);
        }
    });
}

function objectsExport(format = "stl") {
    // return selection.export();
    api.uc.confirm("Export Filename", {ok:true, cancel: false}, `selected.${format}`).then(name => {
        if (!name) return;
        if (name.toLowerCase().indexOf(`.${format}`) < 0) {
            name = `${name}.${format}`;
        }
        api.util.download(api.selection.export(format), name);
    });
}

function workspaceNew() {
    api.uc.confirm("Clear Workspace?", {ok:true, cancel: false}).then(value => {
        if (value === true) {
            let proc = set_ctrl.proc();
            proc.ops && (proc.ops.length = 0);
            proc.op2 && (proc.op2.length = 0);
            api.platform.clear();
        }
    });
}

function profileExport() {
    const opt = {pre: [
        "<div class='f-col a-center gap5 mlr10'>",
        "  <h3>Workspace Export</h3>",
        "  <label>This will create a backup of your</label>",
        "  <label>workspace, devices, and settings</label>",
        "  <span class='mt10'><input id='excwork' type='checkbox'>&nbsp;Exclude meshes</span>",
        "</div>"
    ]};
    let suggestion = "workspace";
    let file = api.widgets.all()[0]?.meta.file || '';
    if (file) {
        suggestion = `${suggestion}_${file.split('.')[0]}`.replaceAll(' ','_');
    };
    api.uc.confirm("Filename", {ok:true, cancel: false}, suggestion, opt).then(name => {
        if (!name) return;

        let work = !$('excwork').checked;
        let json = api.conf.export({work, clear:true});

        api.client.zip([
            {name:"workspace.json", data:JSON.stringify(json)}
        ], progress => {
            api.show.progress(progress.percent/100, "compressing workspace");
        }, output => {
            api.show.progress(0);
            api.util.download(output, `${name}.kmz`);
        });
    });
}

function settingsSave(ev, name) {
    if (ev) {
        ev.stopPropagation();
        ev.preventDefault();
    }

    api.dialog.hide();
    let mode = api.mode.get(),
        s = settings(),
        def = "default",
        cp = s.process,
        pl = s.sproc[mode],
        lp = s.cproc[mode],
        saveAs = (name) => {
            if (!name) {
                return;
            }
            let np = pl[name] = {};
            cp.processName = name;
            pl[name] = Object.clone(cp);
            for (let k in cp) {
                if (!cp.hasOwnProperty(k)) continue;
                np[k] = cp[k];
            }
            s.cproc[mode] = name;
            s.devproc[s.device.deviceName] = name;
            api.conf.save();
            api.conf.update();
            api.event.settings();
            sync_put();
        };

    if (name) {
        saveAs(name);
    } else {
        api.uc.prompt("Save Settings As", cp ? lp || def : def).then(saveAs);
    }
}

function settingsLoad() {
    api.conf.show();
}

function updateDeviceSize() {
    api.conf.update();
    api.platform.update_size();
    api.platform.update_origin();
}

async function sync_put() {
    await set_ctrl.sync.put();
}

export const settingsOps = {
    deviceExport,
    objectsExport,
    workspaceNew,
    profileExport,
    settingsSave,
    settingsLoad,
    updateDeviceSize,
    sync_put
};
