/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { overlay } from './overlay.js';
import { datum } from './datum.js';
import { Plane } from './plane.js';
import { interact } from './interact.js';
import { createOriginApi } from './api/origin.js';
import { createFeaturesApi } from './api/features.js';
import { createSketchApi } from './sketch/api.js';
import { createSketchRuntimeApi } from './sketch/runtime.js';
import { createDocumentApi } from './api/document.js';
import { createSolidsApi } from './api/solids.js';
import { createGeometryStoreApi } from './api/geometry_store.js';

const DOC_SCHEMA_VERSION = 1;
const ADMIN_CURRENT_DOC_KEY = 'current_doc_id';
const ADMIN_CURRENT_REV_KEY = 'current_rev';
const UNDOABLE_OP_TYPES = new Set([
    'snapshot',
    'datum.update',
    'datum.root.update',
    'origin.update',
    'feature.add',
    'feature.remove',
    'feature.move',
    'feature.rename',
    'feature.update',
    'feature.suppress',
    'feature.atomic.edit',
    'timeline.set'
]);

function shortId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    }
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function revString(rev) {
    const major = String(rev?.major ?? 0).padStart(6, '0');
    const micro = String(rev?.micro ?? 0).padStart(6, '0');
    return `${major}.${micro}`;
}

// Main API object
const api = {
    db: null,
    overlay,
    datum,
    Plane,
    interact,
    origin: null,

    // Document management
    document: null,

    // Feature management
    sketch: null,
    sketchRuntime: null,
    features: null,
    solids: null,
    geometryStore: null,

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
    }
};

api.origin = createOriginApi(() => api);
api.features = createFeaturesApi(() => api);
api.sketch = createSketchApi(() => api, shortId);
api.sketchRuntime = createSketchRuntimeApi(() => api);
api.document = createDocumentApi(() => api, {
    DOC_SCHEMA_VERSION,
    ADMIN_CURRENT_DOC_KEY,
    ADMIN_CURRENT_REV_KEY,
    UNDOABLE_OP_TYPES,
    idFactory: shortId,
    revString
});
api.solids = createSolidsApi(() => api);
api.geometryStore = createGeometryStoreApi(() => api);

export { api };
