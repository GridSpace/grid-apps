/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import '../../ext/base64.js';

import { modal } from './modal.js';

import { $ } from '../../moto/webui.js';
import { api } from './api.js';
import { broker } from '../../moto/broker.js';
import { Index } from '../../data/index.js';
import { openFiles } from './files.js';
import { settings } from './config/manager.js';
import { showDevices } from './devices.js';
import { noop, utils } from '../core/utils.js';
import { version } from '../../moto/license.js';
import { showTools } from '../mode/cam/tools.js';

// Import new modules
import { workspace } from './workspace.js';
import { mode as modeModule, process as processModule } from './mode.js';
import { help as helpModule } from './help.js';
import { group as groupModule } from './groups.js';
import { image as imageModule } from './image.js';
import { view as viewModule } from './view-state.js';
import { visuals } from './visuals.js';

let { parseOpt } = utils,
    WIN     = self.window,
    DOC     = self.document,
    LOC     = self.location,
    SETUP   = parseOpt(LOC.search.substring(1)),
    SECURE  = isSecure(LOC.protocol),
    LOCAL   = self.debug && !SETUP.remote,
    EVENT   = broker,
    FILES   = openFiles(new Index(SETUP.d ? SETUP.d[0] : 'kiri'));

// allow widget to straddle client / worker FOR NOW
self.kiri_catalog = FILES;

export const dialog = {
    show: (which) => modal.show(which),
    hide: () => modal.hide(),
    update_process_list: updateProcessList
};

// Re-export help from new module
export const help = helpModule;

export const event = {
    on(t,l) { return EVENT.on(t,l) },
    emit(t,m,o) { return EVENT.publish(t,m,o) },
    bind(t,m,o) { return EVENT.bind(t,m,o) },
    alerts(clr) { api.alerts.update(clr) },
    import: loadFile,
    settings: triggerSettingsEvent
};

// Re-export group from new module
export const group = groupModule;

export const hide = {
    alert(rec, recs) { api.alerts.hide(...arguments) },
    import: noop,
    slider: visuals.hide_slider
};

// Re-export image from new module
export const image = imageModule;

// Re-export modal singleton methods
export { modal };

// Re-export mode and process from new module
export const mode = modeModule;
export const process = processModule;

export const show = {
    alert() { return api.alerts.show(...arguments) },
    controls() { console.trace('deprecated') },
    devices: showDevices,
    import() { api.ui.import.style.display = '' },
    layer: visuals.set_visible_layer,
    local() { console.trace('deprecated') },
    progress: setProgress,
    slices: visuals.show_slices,
    tools: showTools
};

// Re-export space (workspace) from new module
export const space = workspace;

export const util = {
    isSecure,
    download: downloadBlob,
    ui2rec() { api.conf.update_from(...arguments) },
    rec2ui() { api.conf.update_fields(...arguments) },
    b64enc(obj) { return base64js.fromByteArray(new TextEncoder().encode(JSON.stringify(obj))) },
    b64dec(obj) { return JSON.parse(new TextDecoder().decode(base64js.toByteArray(obj))) }
};

// Combine view-state and visuals modules
export const view = {
    ...viewModule,
    ...visuals,
    snapshot: null
};

// add show() to catalog for API
FILES.show = () => modal.show('files');

// patch broker for api backward compatibility
EVENT.on = (topic, listener) => {
    EVENT.subscribe(topic, listener);
    return EVENT;
};

/** ******************************************************************
 * Utility Functions
 ******************************************************************* */

function triggerSettingsEvent() {
    api.event.emit('settings', settings.get());
}

function isSecure(proto) {
        return proto.toLowerCase().indexOf("https") === 0;
}

function setProgress(value = 0, msg) {
    value = (value * 100).round(4);
    api.ui.progress.width = value+'%';
    if (self.debug) {
        // console.log(msg, value.round(2));
        api.ui.prostatus.style.display = 'flex';
        if (msg) {
            api.ui.prostatus.innerHTML = msg;
        } else {
            api.ui.prostatus.innerHTML = '';
        }
    }
}

function loadFile(ev) {
    // use modern Filesystem api when available
    if (false && window.showOpenFilePicker) {
        window.showOpenFilePicker().then(files => {
            return Promise.all(files.map(fh => fh.getFile()))
        }).then(files => {
            if (files.length) {
                api.platform.load_files(files);
            }
        }).catch(e => { /* ignore cancel */ });
        return;
    }
    api.ui.load.click();
}

function editSettings(e) {
    let current = settings.get(),
        mode = getMode(),
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
        mode = getMode(),
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
    delete current.sproc[getMode()][name];
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

function downloadBlob(data, filename) {
    let url = WIN.URL.createObjectURL(new Blob([data], {type: "octet/stream"}));
    $('mod-any').innerHTML = `<a id="_dexport_" href="${url}" download="${filename}">x</a>`;
    $('_dexport_').click();
}

export { FILES as catalog, LOCAL, SETUP, SECURE };

// Import frame.js last to avoid circular dependency issues
// import './frame.js';
