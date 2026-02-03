/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { space } from '../moto/space.js';
import { overlay } from './overlay.js';
import { datum } from './datum.js';

// Main API object
const api = {
    db: null,
    overlay,
    datum,

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
            return doc;
        },

        load(id) {
            return api.db.documents.get(id).then(doc => {
                if (doc) {
                    this.current = doc;
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
                api.document.save();
            }
        },

        remove(feature) {
            const doc = api.document.current;
            if (doc) {
                const index = doc.features.indexOf(feature);
                if (index >= 0) {
                    doc.features.splice(index, 1);
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
        },

        add(item) {
            this.items.add(item);
        },

        remove(item) {
            this.items.delete(item);
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
