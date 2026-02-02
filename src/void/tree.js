/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { broker } from '../moto/broker.js';
import { api } from './api.js';
import { $, h } from '../moto/webui.js';

const tree = {
    container: null,

    init() {
        broker.subscribe('ui.tree.build', this.build.bind(this));
        broker.subscribe('features.updated', this.render.bind(this));
        broker.subscribe('document.loaded', this.render.bind(this));
        broker.subscribe('document.created', this.render.bind(this));
    },

    build() {
        this.container = $('left-panel');
        if (!this.container) return;

        // Add header
        const header = h('div', {
            style: 'font-weight: 600; margin-bottom: 12px; padding: 4px 0; border-bottom: 1px solid #404040;'
        });
        header.textContent = 'Features';
        this.container.appendChild(header);

        // Render initial state
        this.render();

        console.log({ tree_built: true });
    },

    render() {
        if (!this.container) return;

        // Clear except header
        const children = Array.from(this.container.children);
        for (let i = 1; i < children.length; i++) {
            children[i].remove();
        }

        const features = api.features.list();

        if (features.length === 0) {
            const empty = h('div', {
                style: 'color: #808080; font-style: italic; padding: 8px;'
            });
            empty.textContent = 'No features yet';
            this.container.appendChild(empty);
            return;
        }

        // Render features
        for (let feature of features) {
            const item = this.createItem(feature);
            this.container.appendChild(item);
        }
    },

    createItem(feature) {
        const item = h('div', { class: 'tree-item' });

        const icon = h('div', { class: 'icon' });
        icon.textContent = this.getIcon(feature.type);

        const label = h('div', { class: 'label' });
        label.textContent = feature.name || feature.type;

        item.appendChild(icon);
        item.appendChild(label);

        item.onclick = () => {
            // Clear other active items
            const items = this.container.querySelectorAll('.tree-item');
            items.forEach(i => i.classList.remove('active'));

            // Mark this one active
            item.classList.add('active');

            // Publish selection
            broker.publish('feature.selected', feature);
        };

        return item;
    },

    getIcon(type) {
        const icons = {
            'datum': '□',
            'sketch': '✏',
            'extrude': '⬆',
            'revolve': '↻',
            'boolean': '∪'
        };
        return icons[type] || '•';
    }
};

// Auto-initialize
tree.init();

export { tree };
