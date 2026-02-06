/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { api } from './api.js';
import { $ } from '../moto/webui.js';

const tree = {
    container: null,
    defaultGeometryExpanded: true,
    featuresExpanded: true,
    _boundRuntimeChanges: false,

    build() {
        this.container = $('left-panel');
        if (!this.container) return;

        this.bindRuntimeChanges();
        this.render();

        console.log({ tree_built: true });
    },

    bindRuntimeChanges() {
        if (this._boundRuntimeChanges) return;
        this._boundRuntimeChanges = true;

        api.datum.onChange(() => this.render());
        for (const plane of api.datum.getPlanes()) {
            plane.onChange(() => this.render());
        }
        api.origin.onChange(() => this.render());
    },

    render() {
        if (!this.container) return;
        this.container.innerHTML = '';

        this.container.appendChild(this.createHeader('Model'));

        this.renderDefaultGeometrySection();

        this.container.appendChild(this.createDivider());

        this.renderFeaturesSection();
    },

    renderDefaultGeometrySection() {
        const datum = api.datum;
        const row = this.createRow({
            label: 'Default Geometry',
            depth: 0,
            expanded: this.defaultGeometryExpanded,
            onToggle: () => {
                this.defaultGeometryExpanded = !this.defaultGeometryExpanded;
                this.render();
            }
        });
        this.container.appendChild(row);

        if (!this.defaultGeometryExpanded) {
            return;
        }

        const geometryRows = [
            { type: 'plane', key: 'xy', fallbackLabel: 'Top' },
            { type: 'plane', key: 'yz', fallbackLabel: 'Right' },
            { type: 'plane', key: 'xz', fallbackLabel: 'Front' },
            { type: 'origin', label: 'Origin' }
        ];

        for (const entry of geometryRows) {
            if (entry.type === 'origin') {
                const visible = api.origin.isVisible();
                this.container.appendChild(this.createRow({
                    label: entry.label,
                    depth: 1,
                    eyeVisible: visible,
                    onEye: () => {
                        api.origin.setVisible(!visible);
                        this.render();
                    }
                }));
                continue;
            }

            const plane = datum.getPlane(entry.key);
            if (!plane) continue;
            const visible = !!plane.getGroup()?.visible;
            this.container.appendChild(this.createRow({
                label: plane.getLabel() || entry.fallbackLabel,
                depth: 1,
                eyeVisible: visible,
                onEye: () => {
                    plane.setVisible(!visible);
                    this.render();
                }
            }));
        }
    },

    renderFeaturesSection() {
        const row = this.createRow({
            label: 'Features',
            depth: 0,
            expanded: this.featuresExpanded,
            onToggle: () => {
                this.featuresExpanded = !this.featuresExpanded;
                this.render();
            }
        });
        this.container.appendChild(row);

        if (!this.featuresExpanded) {
            return;
        }

        const doc = api.document.current;
        const folders = this.getFolders(doc);
        const features = api.features.list();
        const hasOnlyDefaultFolder = folders.length === 1 && folders[0]?.id === 'features';

        if (hasOnlyDefaultFolder) {
            if (!features.length) {
                this.container.appendChild(this.createEmptyRow('No features yet', 1));
                return;
            }
            for (const feature of features) {
                const label = feature?.name || feature?.type || 'Feature';
                this.container.appendChild(this.createItemRow(label, feature, 1));
            }
            return;
        }

        for (let i = 0; i < folders.length; i++) {
            const folder = folders[i];
            this.container.appendChild(this.createRow({
                label: folder.name || 'Folder',
                depth: 1,
                expanded: !folder.collapsed,
                onToggle: () => {
                    folder.collapsed = !folder.collapsed;
                    api.document.save({
                        kind: 'micro',
                        opType: 'tree.folder.toggle',
                        undoable: false,
                        payload: { folder_id: folder.id, collapsed: !!folder.collapsed }
                    });
                    this.render();
                }
            }));

            if (folder.collapsed) {
                continue;
            }

            const items = i === 0 ? features : [];
            if (!items.length && i === 0) {
                this.container.appendChild(this.createEmptyRow('No features yet', 2));
            }

            for (const feature of items) {
                const label = feature?.name || feature?.type || 'Feature';
                this.container.appendChild(this.createItemRow(label, feature, 2));
            }
        }
    },

    getFolders(doc) {
        if (!doc) {
            return [{ id: 'features', name: 'Features', collapsed: false }];
        }
        if (!doc.tree || !Array.isArray(doc.tree.folders) || doc.tree.folders.length === 0) {
            doc.tree = {
                folders: [{ id: 'features', name: 'Features', collapsed: false }]
            };
        }
        return doc.tree.folders;
    },

    createHeader(text) {
        const el = document.createElement('div');
        el.className = 'tree-header';
        el.textContent = text;
        return el;
    },

    createDivider() {
        const el = document.createElement('div');
        el.className = 'tree-divider';
        return el;
    },

    createRow({ label, depth = 0, expanded, onToggle, eyeVisible, onEye }) {
        const row = document.createElement('div');
        row.className = 'tree-row';
        if (onEye && eyeVisible === false) {
            row.classList.add('is-off');
        }
        row.style.paddingLeft = `${8 + depth * 16}px`;

        const left = document.createElement('div');
        left.className = 'tree-row-left';

        if (onToggle) {
            const twisty = document.createElement('button');
            twisty.className = 'tree-twisty';
            twisty.textContent = expanded ? '▾' : '▸';
            twisty.onclick = event => {
                event.stopPropagation();
                onToggle();
            };
            left.appendChild(twisty);
        } else {
            const spacer = document.createElement('span');
            spacer.className = 'tree-twisty-spacer';
            spacer.textContent = '';
            left.appendChild(spacer);
        }

        const text = document.createElement('div');
        text.className = 'tree-row-label';
        text.textContent = label;
        left.appendChild(text);

        row.appendChild(left);

        if (onEye) {
            const eye = document.createElement('button');
            eye.className = `tree-eye ${eyeVisible ? 'visible' : 'off'}`;
            eye.textContent = '👁';
            eye.title = eyeVisible ? 'Hide' : 'Show';
            eye.onclick = event => {
                event.stopPropagation();
                onEye();
            };
            row.appendChild(eye);
        }

        return row;
    },

    createItemRow(label, feature, depth = 0) {
        const row = document.createElement('div');
        row.className = 'tree-item-row';
        row.style.paddingLeft = `${8 + depth * 16}px`;

        const icon = document.createElement('span');
        icon.className = 'tree-item-icon';
        icon.textContent = this.getIcon(feature?.type);

        const text = document.createElement('div');
        text.className = 'tree-row-label';
        text.textContent = label;

        row.appendChild(icon);
        row.appendChild(text);

        row.onclick = () => {
            console.log('Feature selected:', feature);
        };

        return row;
    },

    createEmptyRow(label, depth = 0) {
        const row = document.createElement('div');
        row.className = 'tree-empty-row';
        row.style.paddingLeft = `${8 + depth * 16}px`;
        row.textContent = label;
        return row;
    },

    getIcon(type) {
        const icons = {
            datum: '□',
            sketch: '✏',
            extrude: '⬆',
            revolve: '↻',
            boolean: '∪'
        };
        return icons[type] || '•';
    }
};

export { tree };
