/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { space } from '../moto/space.js';
import { overlay } from './overlay.js';
import { datum } from './datum.js';
import { Plane } from './plane.js';
import { interact } from './interact.js';

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
    'feature.rename'
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
    origin: {
        state: { x: 0, y: 0, z: 0, show: true },
        changeHandlers: new Set(),

        defaultState() {
            return { x: 0, y: 0, z: 0, show: true };
        },

        toJSON() {
            const { x, y, z, show } = this.state;
            return { x, y, z, show };
        },

        applyJSON(data = {}, notify = true) {
            const next = {
                x: data.x ?? 0,
                y: data.y ?? 0,
                z: data.z ?? 0,
                show: data.show !== undefined ? !!data.show : true
            };
            this.state = next;
            this.syncOverlayPoint();
            if (notify) {
                this.notifyChange();
            }
            return this.state;
        },

        isVisible() {
            return !!this.state.show;
        },

        setVisible(visible) {
            const next = !!visible;
            if (this.state.show === next) {
                return this.state;
            }
            this.applyJSON({ ...this.state, show: next }, true);
            return this.state;
        },

        toggleVisible() {
            return this.setVisible(!this.isVisible());
        },

        onChange(handler) {
            if (typeof handler === 'function') {
                this.changeHandlers.add(handler);
            }
            return this;
        },

        offChange(handler) {
            this.changeHandlers.delete(handler);
            return this;
        },

        notifyChange() {
            for (const handler of this.changeHandlers) {
                handler(this.state);
            }
        },

        syncOverlayPoint() {
            const item = api.overlay?.elements?.get('origin-point');
            if (item?.el) {
                item.opts = item.opts || {};
                item.opts.hidden = !this.state.show;
                item.el.style.display = this.state.show ? '' : 'none';
            }
        }
    },

    // Document management
    document: {
        current: null,
        isHydrating: false,
        _runtimeSaveTimer: null,
        _runtimeSavePending: null,
        _datumHandlers: new Map(),
        _datumRootHandler: null,
        _originHandler: null,
        _runtimeFlushBound: false,
        _redoStack: [],

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
                tree: {
                    folders: [
                        { id: 'features', name: 'Features', collapsed: false }
                    ]
                },
                scene: {
                    datum: api.datum.defaultState(),
                    origin: api.origin.defaultState()
                }
            };
            this.current = doc;
            this._redoStack = [];
            return doc;
        },

        normalizeName(name) {
            const clean = String(name || '').trim();
            return clean || 'Untitled';
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
            if (!doc.tree || !Array.isArray(doc.tree.folders)) {
                doc.tree = {
                    folders: [
                        { id: 'features', name: 'Features', collapsed: false }
                    ]
                };
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
            if (!doc.scene.origin) {
                doc.scene.origin = api.origin.defaultState();
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
                datum: api.datum.toJSON(),
                origin: api.origin.toJSON()
            };
        },

        hydrateRuntimeState(doc) {
            if (!doc) return;
            const scene = doc.scene || {};
            const datumState = scene.datum || api.datum.defaultState();
            const originState = scene.origin || api.origin.defaultState();
            this.isHydrating = true;
            try {
                api.origin.applyJSON(originState, false);
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
            if (this._originHandler) {
                api.origin.offChange(this._originHandler);
                this._originHandler = null;
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

            this._originHandler = () => {
                this.scheduleRuntimeSave('origin.update', { scope: 'origin' });
            };
            api.origin.onChange(this._originHandler);

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
                    this.current.name = this.normalizeName(this.current.name);
                    this._redoStack = [];
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
                const undoable = options.undoable !== undefined ? !!options.undoable :
                    (kind === 'major' || UNDOABLE_OP_TYPES.has(opType));
                const next = this.nextRevision(kind);
                const revId = this.revisionKey(this.current.id, next);
                this.current.modified_at = now;
                this.current.name = this.normalizeName(this.current.name);

                if (!undoable) {
                    const currentRev = this.current.head_rev || null;
                    return Promise.all([
                        api.db.documents.put(this.current.id, this.current),
                        api.db.admin.put(ADMIN_CURRENT_DOC_KEY, this.current.id),
                        api.db.admin.put(ADMIN_CURRENT_REV_KEY, currentRev)
                    ]);
                }

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
                this.current.scene = revision.snapshot.scene;
                if (undoable && options.clearRedo !== false) {
                    this._redoStack = [];
                }

                return Promise.all([
                    api.db.versions.put(revId, revision),
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

        list() {
            return api.db.documents.iterate().then(entries => {
                return entries
                    .map(({ value }) => value)
                    .filter(Boolean)
                    .map(doc => {
                        const migrated = this.migrate(doc);
                        migrated.doc.name = this.normalizeName(migrated.doc.name);
                        return migrated.doc;
                    })
                    .sort((a, b) => (b.modified_at || 0) - (a.modified_at || 0));
            });
        },

        select(id) {
            return this.load(id).then(doc => {
                if (!doc) {
                    return null;
                }
                this._redoStack = [];
                return Promise.all([
                    api.db.admin.put(ADMIN_CURRENT_DOC_KEY, this.current.id),
                    api.db.admin.put(ADMIN_CURRENT_REV_KEY, this.current.head_rev || null)
                ]).then(() => this.current);
            });
        },

        open(id) {
            return this.select(id);
        },

        rename(name) {
            if (!this.current) return Promise.resolve(null);
            const nextName = this.normalizeName(name);
            if (nextName === this.current.name) {
                return Promise.resolve(this.current);
            }
            const previous = this.current.name;
            this.current.name = nextName;
            return this.save({
                kind: 'micro',
                opType: 'doc.rename',
                undoable: false,
                payload: {
                    previous,
                    next: nextName
                }
            }).then(() => this.current);
        },

        getRevision(revId) {
            if (!revId) return Promise.resolve(null);
            return api.db.versions.get(revId);
        },

        applyRevision(revision) {
            if (!revision || !revision.snapshot) {
                return Promise.resolve(null);
            }
            const preserved = this.current ? {
                name: this.current.name,
                tree: JSON.parse(JSON.stringify(this.current.tree || { folders: [] }))
            } : null;
            const migrated = this.migrate(JSON.parse(JSON.stringify(revision.snapshot)));
            this.current = migrated.doc;
            if (preserved) {
                this.current.name = this.normalizeName(preserved.name);
                this.current.tree = preserved.tree;
            }
            this.current.version = revision.rev || this.current.version;
            this.current.head_rev = revision.rev_id || this.revisionKey(this.current.id, this.current.version);
            this.current.modified_at = revision.created_at || this.current.modified_at || Date.now();
            this.hydrateRuntimeState(this.current);
            return Promise.all([
                api.db.documents.put(this.current.id, this.current),
                api.db.admin.put(ADMIN_CURRENT_DOC_KEY, this.current.id),
                api.db.admin.put(ADMIN_CURRENT_REV_KEY, this.current.head_rev || null)
            ]).then(() => this.current);
        },

        canRedo() {
            return this._redoStack.length > 0;
        },

        undo() {
            const head = this.current?.head_rev;
            if (!head) return Promise.resolve(false);
            return this.getRevision(head).then(revision => {
                const parent = revision?.parent_rev;
                if (!parent) return false;
                return this.getRevision(parent).then(parentRevision => {
                    if (!parentRevision) return false;
                    this._redoStack.push(head);
                    return this.applyRevision(parentRevision).then(() => true);
                });
            });
        },

        redo() {
            if (!this._redoStack.length) return Promise.resolve(false);
            const nextRev = this._redoStack.pop();
            return this.getRevision(nextRev).then(revision => {
                if (!revision) return false;
                if (revision.parent_rev && revision.parent_rev !== this.current?.head_rev) {
                    this._redoStack = [];
                    return false;
                }
                return this.applyRevision(revision).then(() => true);
            });
        },

        delete(id) {
            if (!id) return Promise.resolve(false);
            const isCurrent = this.current?.id === id;
            const lower = `${id}:`;
            const upper = `${id}:\uffff`;
            return api.db.versions.iterate({ lower, upper }).then(entries => {
                const deletes = entries.map(({ key }) => api.db.versions.remove(key));
                deletes.push(api.db.documents.remove(id));
                return Promise.all(deletes);
            }).then(() => {
                if (!isCurrent) {
                    return true;
                }
                this._redoStack = [];
                return this.list().then(docs => {
                    const next = docs.find(doc => doc.id !== id);
                    if (next) {
                        return this.select(next.id).then(() => true);
                    }
                    return this.createAndSelect().then(() => true);
                });
            });
        },

        restoreOrCreate() {
            return api.db.admin.get(ADMIN_CURRENT_DOC_KEY).then(docId => {
                if (!docId) {
                    return this.createAndSelect();
                }
                return this.select(docId).then(doc => {
                    if (doc) {
                        return this.current;
                    }
                    return this.list().then(docs => {
                        if (docs.length) {
                            return this.select(docs[0].id).then(() => this.current);
                        }
                        return this.createAndSelect();
                    });
                });
            });
        }
    },

    // Feature management
    sketch: {
        createFromTarget(target) {
            const doc = api.document.current;
            if (!doc || !target?.frame) {
                return null;
            }
            const sketchCount = (doc.features || []).filter(f => f?.type === 'sketch').length;
            const feature = {
                id: shortId(),
                type: 'sketch',
                name: `Sketch ${sketchCount + 1}`,
                created_at: Date.now(),
                plane: JSON.parse(JSON.stringify(target.frame)),
                target: {
                    kind: target.kind || 'plane',
                    id: target.id || null,
                    name: target.name || null,
                    label: target.label || null,
                    source: target.source || null
                }
            };
            api.features.add(feature);
            return feature;
        }
    },

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
