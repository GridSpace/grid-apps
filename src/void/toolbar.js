/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { $, h } from '../moto/webui.js';
import { api } from './api.js';
import { tree } from './tree.js';
import { space } from '../moto/space.js';

const { div, button } = h;

const toolbar = {
    buttons: [],
    cameraToggleBtn: null,

    build() {
        const container = $('top-bar');
        if (!container) return;

        container.innerHTML = '';

        // Logo / title
        h.bind(container, div({
            style: 'font-weight: 600; font-size: 16px; margin-right: 16px; color: #5a9fd4;',
            _: 'Void:Form'
        }), { append: true });

        // Separator
        container.appendChild(this.separator());

        // Main tools
        this.addButton(container, 'New', () => {
            console.log('New document');
            api.document.createAndSelect().then(() => {
                tree.render();
            });
        });

        this.addButton(container, 'Open', () => {
            console.log('Open document');
            // TODO: implement document picker
        });

        this.addButton(container, 'Save', () => {
            console.log('Save document');
            api.document.save();
        });

        container.appendChild(this.separator());

        // Sketch tools
        this.addButton(container, 'Sketch', () => {
            console.log('New sketch');
            // TODO: implement sketch mode
        }, { id: 'btn-sketch' });

        this.addButton(container, 'Extrude', () => {
            console.log('Extrude');
            // TODO: implement extrude
        }, { id: 'btn-extrude', disabled: true });

        container.appendChild(this.separator());

        // View tools
        this.addButton(container, 'Fit', () => {
            console.log('Fit view');
            space.view.fit(null, { tween: true });
        });

        this.addButton(container, 'Top', () => {
            console.log('Top view');
            space.view.top();
        });

        this.addButton(container, 'Front', () => {
            console.log('Front view');
            space.view.front();
        });

        this.addButton(container, 'Right', () => {
            console.log('Right view');
            space.view.right();
        });

        container.appendChild(this.separator());

        this.cameraToggleBtn = this.addButton(container, this.getProjectionLabel(), () => {
            const current = space.view.getProjection();
            const next = current === 'perspective' ? 'orthographic' : 'perspective';
            space.view.setProjection(next);
            // setProjection recreates controls/camera; restore void bindings/hooks.
            space.view.setCtrl('void');
            api.overlay.onProjectionChanged();
            // Persist after projection/control settles to avoid stale scale snapshots.
            if (api.db?.admin) {
                setTimeout(() => {
                    api.db.admin.put('camera', {
                        place: space.view.save(),
                        focus: space.view.getFocus(),
                        projection: space.view.getProjection()
                    });
                }, 120);
            }
            this.updateProjectionLabel();
        }, { id: 'btn-camera-toggle' });

        console.log({ toolbar_built: true });
    },

    getProjectionLabel() {
        const mode = space.view.getProjection();
        return mode === 'perspective' ? 'Ortho' : 'Persp';
    },

    updateProjectionLabel() {
        if (this.cameraToggleBtn) {
            this.cameraToggleBtn.textContent = this.getProjectionLabel();
        }
    },

    addButton(container, label, onclick, options = {}) {
        const btn = document.createElement('button');
        btn.className = 'toolbar-btn';
        btn.textContent = label;
        btn.onclick = onclick;
        if (options.id) {
            btn.id = options.id;
        }
        if (options.disabled) {
            btn.disabled = true;
        }
        container.appendChild(btn);
        this.buttons.push(btn);
        return btn;
    },

    separator() {
        const sep = document.createElement('div');
        sep.className = 'toolbar-separator';
        return sep;
    }
};

export { toolbar };
