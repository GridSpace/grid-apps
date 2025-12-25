/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { $ } from '../../moto/webui.js';
import { api } from './api.js';

const WIN = self.window;

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

function downloadBlob(data, filename) {
    let url = WIN.URL.createObjectURL(new Blob([data], {type: "octet/stream"}));
    $('mod-any').innerHTML = `<a id="_dexport_" href="${url}" download="${filename}">x</a>`;
    $('_dexport_').click();
}

export const util = {
    isSecure,
    download: downloadBlob,
    setProgress,
    loadFile
};
