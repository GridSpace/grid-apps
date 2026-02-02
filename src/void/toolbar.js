/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { $, h } from '../moto/webui.js';
import { api } from './api.js';

const { div, button } = h;

const toolbar = {
    buttons: [],

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
            api.document.create();
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
            // TODO: implement fit view
        });

        this.addButton(container, 'Top', () => {
            console.log('Top view');
            // TODO: implement top view
        });

        this.addButton(container, 'Front', () => {
            console.log('Front view');
            // TODO: implement front view
        });

        this.addButton(container, 'Right', () => {
            console.log('Right view');
            // TODO: implement right view
        });

        console.log({ toolbar_built: true });
    },

    addButton(container, label, onclick, options = {}) {
        const attr = {
            class: 'toolbar-btn',
            _: label,
            click: onclick
        };
        if (options.id) {
            attr.id = options.id;
        }
        if (options.disabled) {
            attr._disabled = true;
        }

        const map = h.bind(container, button(attr), { append: true });
        const btn = map[Object.keys(map)[0]];
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
