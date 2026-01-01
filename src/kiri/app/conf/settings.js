/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { $ } from '../../../moto/webui.js';
import { api } from '../api.js';
import { settings as set_ctrl } from './manager.js';

function export_device(exp, name) {
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

function export_objects(format = "stl") {
    // return selection.export();
    api.uc.confirm("Export Filename", {ok:true, cancel: false}, `selected.${format}`).then(name => {
        if (!name) return;
        if (name.toLowerCase().indexOf(`.${format}`) < 0) {
            name = `${name}.${format}`;
        }
        api.util.download(api.selection.export(format), name);
    });
}

function export_profile() {
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

function new_workspace() {
    api.uc.confirm("Clear Workspace?", {ok:true, cancel: false}).then(value => {
        if (value === true) {
            let proc = set_ctrl.proc();
            proc.ops && (proc.ops.length = 0);
            proc.op2 && (proc.op2.length = 0);
            api.platform.clear();
        }
    });
}

function settings_save(ev, name) {
    if (ev) {
        ev.stopPropagation();
        ev.preventDefault();
    }

    api.dialog.hide();
    let mode = api.mode.get(),
        s = api.conf.get(),
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
            api.settings.sync.put();
        };

    if (name) {
        saveAs(name);
    } else {
        api.uc.prompt("Save Settings As", cp ? lp || def : def).then(saveAs);
    }
}

function settings_load() {
    api.conf.show();
}

function update_platform_size() {
    api.conf.update();
    api.platform.update_size();
    api.platform.update_origin();
}

export const settingsOps = {
    export_device,
    export_objects,
    export_profile,
    new_workspace,
    settings_save,
    settings_load,
    update_device: update_platform_size,
};
