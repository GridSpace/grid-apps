/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { broker } from '../moto/broker.js';
import { $, h } from '../moto/webui.js';

const toolbar = {
    buttons: [],

    init() {
        broker.subscribe('ui.toolbar.build', this.build.bind(this));
    },

    build() {
        const container = $('top-bar');
        if (!container) return;

        container.innerHTML = '';

        // Logo / title
        const title = h('div', {
            style: 'font-weight: 600; font-size: 16px; margin-right: 16px; color: #5a9fd4;'
        });
        title.textContent = 'void:form';
        container.appendChild(title);

        // Separator
        container.appendChild(this.separator());

        // Main tools
        this.addButton(container, 'New', () => {
            console.log('New document');
            broker.publish('document.new');
        });

        this.addButton(container, 'Open', () => {
            console.log('Open document');
            broker.publish('document.open');
        });

        this.addButton(container, 'Save', () => {
            console.log('Save document');
            broker.publish('document.save');
        });

        container.appendChild(this.separator());

        // Sketch tools
        this.addButton(container, 'Sketch', () => {
            console.log('New sketch');
            broker.publish('sketch.new');
        }, { id: 'btn-sketch' });

        this.addButton(container, 'Extrude', () => {
            console.log('Extrude');
            broker.publish('extrude.new');
        }, { id: 'btn-extrude', disabled: true });

        container.appendChild(this.separator());

        // View tools
        this.addButton(container, 'Fit', () => {
            console.log('Fit view');
            broker.publish('view.fit');
        });

        this.addButton(container, 'Top', () => {
            console.log('Top view');
            broker.publish('view.top');
        });

        this.addButton(container, 'Front', () => {
            console.log('Front view');
            broker.publish('view.front');
        });

        this.addButton(container, 'Right', () => {
            console.log('Right view');
            broker.publish('view.right');
        });

        console.log({ toolbar_built: true });
    },

    addButton(container, label, onclick, options = {}) {
        const btn = h('button', {
            class: 'toolbar-btn',
            id: options.id
        });
        btn.textContent = label;
        btn.onclick = onclick;

        if (options.disabled) {
            btn.disabled = true;
        }

        container.appendChild(btn);
        this.buttons.push(btn);
        return btn;
    },

    separator() {
        return h('div', { class: 'toolbar-separator' });
    }
};

// Auto-initialize
toolbar.init();

export { toolbar };
