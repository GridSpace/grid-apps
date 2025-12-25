/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { $ } from '../../moto/webui.js';
import { api } from './api.js';
import { modal } from './modal.js';
import { version } from '../../moto/license.js';

const WIN = self.window;

function showHelp() {
    showHelpFile(`local`,() => {});
}

function showHelpFile(local,then) {
    if (!local) {
        WIN.open("//docs.grid.space/", "_help");
        return;
    }
    const LANG = api.language.current;
    $('kiri-version').innerHTML = `${LANG.version} ${version}`;
    modal.show('help');
    api.event.emit('help.show', local);
}

export const help = {
    show: showHelp,
    file: showHelpFile
};
