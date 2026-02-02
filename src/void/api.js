/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { broker } from '../moto/broker.js';
import { space } from '../moto/space.js';

// Main API object
const api = {
    db: null,

    // UI management
    ui: {
        build() {
            broker.publish('ui.toolbar.build');
            broker.publish('ui.tree.build');
        }
    },

    // Camera controls
    camera: {
        init() {
            const container = space.container;
            const view = space.view;

            let dragging = null;
            let dragStart = { x: 0, y: 0 };
            let focusPoint = null;

            // Mouse down - capture start position and set focus
            container.addEventListener('mousedown', (e) => {
                dragStart.x = e.clientX;
                dragStart.y = e.clientY;

                if (e.button === 1) {
                    // Middle mouse - pan/zoom mode
                    dragging = 'pan';
                    e.preventDefault();
                } else if (e.button === 2) {
                    // Right mouse - rotate mode, set focus point
                    dragging = 'rotate';
                    focusPoint = view.getFocus();
                    e.preventDefault();
                } else if (e.button === 0) {
                    // Left mouse - selection (handled by selection system)
                    dragging = 'select';
                }
            });

            // Mouse move - handle dragging
            container.addEventListener('mousemove', (e) => {
                if (!dragging) return;

                const dx = e.clientX - dragStart.x;
                const dy = e.clientY - dragStart.y;
                dragStart.x = e.clientX;
                dragStart.y = e.clientY;

                if (dragging === 'pan') {
                    // Pan the view
                    view.panZoom(dx, dy, null, null);
                } else if (dragging === 'rotate') {
                    // Rotate around focus point
                    view.panZoom(null, -dx, -dy, null);
                }
            });

            // Mouse up - clear dragging state
            container.addEventListener('mouseup', (e) => {
                dragging = null;
                focusPoint = null;
            });

            // Context menu - prevent on right click
            container.addEventListener('contextmenu', (e) => {
                e.preventDefault();
            });

            // Mouse wheel - zoom
            container.addEventListener('wheel', (e) => {
                const delta = e.deltaY > 0 ? 1.1 : 0.9;
                const zoom = view.getZoom();
                view.setZoom(zoom * delta);
                e.preventDefault();
            });

            console.log({ camera_controls_initialized: true });
        }
    },

    // Document management
    document: {
        current: null,

        create() {
            const doc = {
                id: Date.now(),
                name: 'Untitled',
                created: Date.now(),
                modified: Date.now(),
                features: []
            };
            this.current = doc;
            broker.publish('document.created', doc);
            return doc;
        },

        load(id) {
            return api.db.documents.get(id).then(doc => {
                if (doc) {
                    this.current = doc;
                    broker.publish('document.loaded', doc);
                }
                return doc;
            });
        },

        save() {
            if (this.current) {
                this.current.modified = Date.now();
                return api.db.documents.put(this.current.id, this.current);
            }
            return Promise.resolve();
        }
    },

    // Feature management
    features: {
        list() {
            const doc = api.document.current;
            return doc ? doc.features : [];
        },

        add(feature) {
            const doc = api.document.current;
            if (doc) {
                doc.features.push(feature);
                broker.publish('features.updated', doc.features);
                api.document.save();
            }
        },

        remove(feature) {
            const doc = api.document.current;
            if (doc) {
                const index = doc.features.indexOf(feature);
                if (index >= 0) {
                    doc.features.splice(index, 1);
                    broker.publish('features.updated', doc.features);
                    api.document.save();
                }
            }
        }
    },

    // Selection management
    selection: {
        items: new Set(),

        clear() {
            this.items.clear();
            broker.publish('selection.changed', this.items);
        },

        add(item) {
            this.items.add(item);
            broker.publish('selection.changed', this.items);
        },

        remove(item) {
            this.items.delete(item);
            broker.publish('selection.changed', this.items);
        },

        toggle(item) {
            if (this.items.has(item)) {
                this.remove(item);
            } else {
                this.add(item);
            }
        }
    },

    // Initialize API
    init() {
        console.log({ api_initialized: true });

        // Create default document
        this.document.create();
    }
};

export { api };
