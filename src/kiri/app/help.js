/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { $ } from '../../moto/webui.js';
import { api } from './api.js';
import { modal } from './modal.js';
import { version } from '../../moto/license.js';

const WIN = self.window;

/**
 * Show local help dialog.
 */
function showHelp() {
    showHelpFile(`local`,() => {});
}

/**
 * Show help dialog or open external docs.
 * @param {string} local - If truthy, shows local help modal; otherwise opens docs.grid.space
 * @param {function} then - Callback after help shown
 */
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
