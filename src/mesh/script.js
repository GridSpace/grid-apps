/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { api } from '../mesh/api.js';
import { $, h, estop } from '../moto/webui.js';

export const script = {
    visible: false,
    changed() {
        localStorage.script = $('script-editor').value;
    },
    hide() {
        $('script').classList.add('hide');
        script.visible = false;
    },
    show() {
        $('script').classList.remove('hide');
        $('script-editor').value = localStorage.script ?? '';
        script.visible = true;
    },
    toggle() {
        if (script.visible) {
            script.hide();
        } else {
            script.show();
        }
    },
    execute() {
        let cmd = localStorage.script || `console.log('no script')`;
        if (cmd) {
            cmd = [
                '(async () => {',
                cmd,
                '})();'
            ].join('\n');
            eval(`{ \n ${cmd} \n }`);
        }
    }
};
