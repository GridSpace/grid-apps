/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { space } from '../moto/space.js';
import { overlay } from './overlay.js';
import { datum } from './datum.js';
import { Plane } from './plane.js';
import { interact } from './interact.js';

const DOC_SCHEMA_VERSION = 1;
const ADMIN_CURRENT_DOC_KEY = 'current_doc_id';
const ADMIN_CURRENT_REV_KEY = 'current_rev';

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

    // Document management
    document: {
        current: null,
        isHydrating: false,
        _runtimeSaveTimer: null,
        _runtimeSavePending: null,
        _datumHandlers: new Map(),
        _datumRootHandler: null,
        _runtimeFlushBound: false,

        create() {
            const doc = {
                id: shortId(),
                schema_version: DOC_SCHEMA_VERSION,
                name: 'Untitled',
                created_at: Date.now(),
                modified_at: Date.now(),
                version: { major: 0, micro: 0 },
                head_rev: null,
                features: [], // current runtime snapshot (full state for now)
                scene: {
                    datum: api.datum.defaultState()
                }
            };
            this.current = doc;
            return doc;
        },

        migrate(doc) {
            if (!doc) return doc;
            let changed = false;
            if (doc.schema_version === undefined) {
                doc.schema_version = DOC_SCHEMA_VERSION;
                changed = true;
            }
            if (!doc.created_at && doc.created) {
                doc.created_at = doc.created;
                changed = true;
            }
            if (!doc.modified_at && doc.modified) {
                doc.modified_at = doc.modified;
                changed = true;
            }
            if (!doc.version) {
                doc.version = { major: 0, micro: 0 };
                changed = true;
            }
            if (doc.head_rev === undefined) {
                doc.head_rev = null;
                changed = true;
            }
            if (!Array.isArray(doc.features)) {
                doc.features = [];
                changed = true;
            }
            if (!doc.scene) {
                doc.scene = {};
                changed = true;
            }
            if (!doc.scene.datum) {
                doc.scene.datum = api.datum.defaultState();
                changed = true;
            }
            return { doc, changed };
        },

        nextRevision(kind = 'micro') {
            const current = this.current?.version || { major: 0, micro: 0 };
            if (kind === 'major') {
                return { major: current.major + 1, micro: 0 };
            }
            return { major: current.major, micro: current.micro + 1 };
        },

        revisionKey(docId, rev) {
            return `${docId}:${revString(rev)}`;
        },

        toSnapshot() {
            if (!this.current) return null;
            this.current.scene = this.captureRuntimeState();
            return JSON.parse(JSON.stringify(this.current));
        },

        captureRuntimeState() {
            return {
                datum: api.datum.toJSON()
            };
        },

        hydrateRuntimeState(doc) {
            if (!doc) return;
            const scene = doc.scene || {};
            const datumState = scene.datum || api.datum.defaultState();
            this.isHydrating = true;
            try {
                api.datum.applyJSON(datumState);
            } finally {
                this.isHydrating = false;
            }
            api.datum.updateLabels(api.overlay);
            space.update();
        },

        bindRuntimeObservers() {
            if (!api.datum || !api.datum.getPlanes) return;

            // Rebind cleanly in case init is called more than once.
            for (const [id, rec] of this._datumHandlers) {
                rec.plane.offChange(rec.handler);
            }
            this._datumHandlers.clear();
            if (this._datumRootHandler) {
                api.datum.offChange(this._datumRootHandler);
                this._datumRootHandler = null;
            }

            for (const plane of api.datum.getPlanes()) {
                const handler = () => {
                    this.scheduleRuntimeSave('datum.update', { plane_id: plane.id });
                };
                this._datumHandlers.set(plane.id, { plane, handler });
                plane.onChange(handler);
            }

            this._datumRootHandler = () => {
                this.scheduleRuntimeSave('datum.root.update', { scope: 'datum' });
            };
            api.datum.onChange(this._datumRootHandler);

            if (!this._runtimeFlushBound) {
                this._runtimeFlushBound = true;
                const flush = () => this.flushRuntimeSave();
                window.addEventListener('pagehide', flush);
                window.addEventListener('beforeunload', flush);
                document.addEventListener('visibilitychange', () => {
                    if (document.visibilityState === 'hidden') {
                        flush();
                    }
                });
            }
        },

        scheduleRuntimeSave(opType = 'runtime.update', payload = null) {
            if (this.isHydrating || !this.current) {
                return;
            }
            this._runtimeSavePending = { opType, payload };
            clearTimeout(this._runtimeSaveTimer);
            this._runtimeSaveTimer = setTimeout(() => {
                this.flushRuntimeSave();
            }, 200);
        },

        flushRuntimeSave() {
            if (this.isHydrating || !this.current || !this._runtimeSavePending) {
                return Promise.resolve();
            }
            clearTimeout(this._runtimeSaveTimer);
            const pending = this._runtimeSavePending;
            this._runtimeSavePending = null;
            return this.save({
                kind: 'micro',
                opType: pending.opType,
                payload: pending.payload
            });
        },

        load(id) {
            return api.db.documents.get(id).then(doc => {
                if (doc) {
                    const migrated = this.migrate(doc);
                    this.current = migrated.doc;
                    this.hydrateRuntimeState(this.current);
                    if (migrated.changed) {
                        return api.db.documents.put(this.current.id, this.current).then(() => this.current);
                    }
                    return this.current;
                }
                return null;
            });
        },

        save(options = {}) {
            if (this.current) {
                const now = Date.now();
                const kind = options.kind || 'micro';
                const opType = options.opType || (kind === 'major' ? 'snapshot' : 'delta');
                const next = this.nextRevision(kind);
                const revId = this.revisionKey(this.current.id, next);

                const revision = {
                    doc_id: this.current.id,
                    rev: next,
                    rev_id: revId,
                    parent_rev: this.current.head_rev || null,
                    schema_version: DOC_SCHEMA_VERSION,
                    op_type: opType,
                    payload: options.payload || null,
                    snapshot: this.toSnapshot(),
                    created_at: now
                };

                this.current.version = next;
                this.current.head_rev = revId;
                this.current.modified_at = now;
                this.current.scene = revision.snapshot.scene;

                return Promise.all([
                    api.db.features.put(revId, revision),
                    api.db.documents.put(this.current.id, this.current),
                    api.db.admin.put(ADMIN_CURRENT_DOC_KEY, this.current.id),
                    api.db.admin.put(ADMIN_CURRENT_REV_KEY, revId)
                ]);
            }
            return Promise.resolve();
        },

        createAndSelect() {
            this.create();
            this.hydrateRuntimeState(this.current);
            return this.save({
                kind: 'major',
                opType: 'snapshot',
                payload: { reason: 'seed' }
            }).then(() => this.current);
        },

        restoreOrCreate() {
            return api.db.admin.get(ADMIN_CURRENT_DOC_KEY).then(docId => {
                if (!docId) {
                    return this.createAndSelect();
                }
                return this.load(docId).then(doc => {
                    if (doc) {
                        return Promise.all([
                            api.db.admin.put(ADMIN_CURRENT_DOC_KEY, this.current.id),
                            api.db.admin.put(ADMIN_CURRENT_REV_KEY, this.current.head_rev || null)
                        ]).then(() => this.current);
                    }
                    return this.createAndSelect();
                });
            });
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
                api.document.save({
                    kind: 'micro',
                    opType: 'feature.add',
                    payload: {
                        type: feature?.type || 'unknown',
                        id: feature?.id || null
                    }
                });
            }
        },

        remove(feature) {
            const doc = api.document.current;
            if (doc) {
                const index = doc.features.indexOf(feature);
                if (index >= 0) {
                    doc.features.splice(index, 1);
                    api.document.save({
                        kind: 'micro',
                        opType: 'feature.remove',
                        payload: {
                            type: feature?.type || 'unknown',
                            id: feature?.id || null
                        }
                    });
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
    }
};

export { api };
