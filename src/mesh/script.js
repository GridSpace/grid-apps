/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { api } from '../mesh/api.js';
import { $, h, estop } from '../moto/webui.js';

export const script = {
    running: false,
    visible: false,
    changed() {
        localStorage.script = $('script-editor').value;
    },
    error(e) {
        api.modal.dialog({
            title: "script error",
            body: [ h.div({ id: "script-error", _: e.message || e.toString() }) ]
        });
    },
    hide() {
        $('script').classList.add('hide');
        api.prefs.save(api.prefs.map.space.script = script.visible = false);
    },
    show() {
        $('script').classList.remove('hide');
        $('script-editor').value = localStorage.script ?? '';
        api.prefs.save(api.prefs.map.space.script = script.visible = true);
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
            if (script.running) {
                return script.error('script running');
            }
            cmd = [
                '(async () => {',
                cmd,
                '})()',
                '.catch(error => {',
                'api.script.error(error)',
                '})',
                '.finally(() => {',
                'api.script.running = false;',
                '});'
            ].join('\n');
            try {
                eval(`{ \n ${cmd} \n }`);
            } catch (e) {
                script.error(e);
            }
        }
    }
};
