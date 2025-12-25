/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { api } from '../api.js';
import { modal } from '../modal.js';
import { settings } from './manager.js';
import { version } from '../../../moto/license.js';

const DOC = self.document;

function triggerSettingsEvent() {
    api.event.emit('settings', settings.get());
}

function editSettings(e) {
    let current = settings.get(),
        mode = settings.mode(),
        name = e.target.getAttribute("name"),
        load = current.sproc[mode][name],
        loadstr = JSON.stringify(load,null,4).split('\n');
    api.uc.prompt(`settings for "${name}"`, loadstr).then(edit => {
        if (edit) {
            try {
                current.sproc[mode][name] = JSON.parse(edit);
                if (name === settings.proc().processName) {
                    api.conf.load(null, name);
                }
                api.conf.save();
                api.settings.sync.put();
            } catch (e) {
                console.log({ malformed_settings: e });
                api.uc.alert('malformed settings object');
            }
        }
    });
}

function exportSettings(e) {
    let current = settings.get(),
        mode = settings.mode(),
        name = e.target.getAttribute("name"),
        data = api.util.b64enc({
            process: current.sproc[mode][name],
            version,
            moto: moto.id,
            time: Date.now(),
            mode,
            name
        });
    api.uc.prompt("Export Process Filename", name).then(name => {
        if (name) {
            api.util.download(data, `${name}.km`);
        }
    });
}

function deleteSettings(e) {
    let current = settings.get();
    let name = e.target.getAttribute("del");
    delete current.sproc[settings.mode()][name];
    api.settings.sync.put();
    updateProcessList();
    api.conf.save();
    triggerSettingsEvent();
}

function updateProcessList() {
    let current = settings.get();
    let list = [], s = current, sp = s.sproc[settings.mode()] || {}, table = api.ui.settingsList;
    table.innerHTML = '';
    for (let k in sp) {
        if (sp.hasOwnProperty(k)) list.push(k);
    }
    list.filter(n => n !=='default').sort().forEach(function(sk) {
        let row = DOC.createElement('div'),
            load = DOC.createElement('button'),
            edit = DOC.createElement('button'),
            xprt = DOC.createElement('button'),
            del = DOC.createElement('button'),
            name = sk;

        load.setAttribute('load', sk);
        load.onclick = (ev) => {
            api.conf.load(undefined, sk);
            updateProcessList();
            modal.hide();
        }
        load.appendChild(DOC.createTextNode(sk));
        if (sk == settings.proc().processName) {
            load.setAttribute('class', 'selected')
        }
        api.ui.settingsName.value = settings.proc().processName;

        del.setAttribute('del', sk);
        del.setAttribute('title', "remove '"+sk+"'");
        del.innerHTML = '<i class="far fa-trash-alt"></i>';
        del.onclick = deleteSettings;

        edit.setAttribute('name', sk);
        edit.setAttribute('title', 'edit');
        edit.innerHTML = '<i class="far fa-edit"></i>';
        edit.onclick = editSettings;

        xprt.setAttribute('name', sk);
        xprt.setAttribute('title', 'export');
        xprt.innerHTML = '<i class="fas fa-download"></i>';
        xprt.onclick = exportSettings;

        row.setAttribute("class", "flow-row");
        row.appendChild(edit);
        row.appendChild(load);
        row.appendChild(xprt);
        row.appendChild(del);
        table.appendChild(row);
    });
}

export const settingsUI = {
    edit: editSettings,
    export: exportSettings,
    delete: deleteSettings,
    update_list: updateProcessList,
    trigger_event: triggerSettingsEvent
};
