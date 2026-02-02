/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { api } from './api.js';
import { $, h } from '../moto/webui.js';

const { div } = h;

const tree = {
    container: null,

    build() {
        this.container = $('left-panel');
        if (!this.container) return;

        // Add header
        h.bind(this.container, div({
            style: 'font-weight: 600; margin-bottom: 12px; padding: 4px 0; border-bottom: 1px solid #404040;',
            _: 'Features'
        }), { append: true });

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
            h.bind(this.container, div({
                style: 'color: #808080; font-style: italic; padding: 8px;',
                _: 'No features yet'
            }), { append: true });
            return;
        }

        // Render features
        for (let feature of features) {
            const item = this.createItem(feature);
            this.container.appendChild(item);
        }
    },

    createItem(feature) {
        const item = document.createElement('div');
        item.className = 'tree-item';

        const icon = document.createElement('div');
        icon.className = 'icon';
        icon.textContent = this.getIcon(feature.type);

        const label = document.createElement('div');
        label.className = 'label';
        label.textContent = feature.name || feature.type;

        item.appendChild(icon);
        item.appendChild(label);

        item.onclick = () => {
            // Clear other active items
            const items = this.container.querySelectorAll('.tree-item');
            items.forEach(i => i.classList.remove('active'));

            // Mark this one active
            item.classList.add('active');

            // TODO: handle feature selection
            console.log('Feature selected:', feature);
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

export { tree };
