/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { space } from '../../moto/space.js';

function createDocumentApi(getApi, cfg) {
    const {
        DOC_SCHEMA_VERSION,
        ADMIN_CURRENT_DOC_KEY,
        ADMIN_CURRENT_REV_KEY,
        UNDOABLE_OP_TYPES,
        idFactory,
        revString
    } = cfg;

    return {
        current: null,
        isHydrating: false,
        _runtimeSaveTimer: null,
        _runtimeSavePending: null,
        _datumHandlers: new Map(),
        _datumRootHandler: null,
        _originHandler: null,
        _runtimeFlushBound: false,
        _redoStack: [],
        _atomicEdit: null,

        create() {
            const api = getApi();
            const doc = {
                id: idFactory(),
                schema_version: DOC_SCHEMA_VERSION,
                name: 'Untitled',
                created_at: Date.now(),
                modified_at: Date.now(),
                version: { major: 0, micro: 0 },
                head_rev: null,
                features: [],
                tree: {
                    folders: [
                        { id: 'features', name: 'Features', collapsed: false }
                    ]
                },
                timeline: {
                    index: null
                },
                generated: {
                    solids: []
                },
                geometry_store: api.geometryStore?.defaultState?.() || null,
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
            const api = getApi();
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
            if (!doc.timeline || typeof doc.timeline !== 'object') {
                doc.timeline = { index: null };
                changed = true;
            }
            if (doc.timeline.index !== null && !Number.isFinite(doc.timeline.index)) {
                doc.timeline.index = null;
                changed = true;
            }
            if (!doc.generated || typeof doc.generated !== 'object') {
                doc.generated = { solids: [] };
                changed = true;
            }
            if (!Array.isArray(doc.generated.solids)) {
                doc.generated.solids = [];
                changed = true;
            }
            if (!doc.geometry_store) {
                doc.geometry_store = api.geometryStore?.defaultState?.() || null;
                changed = true;
            }
            if (api.geometryStore?.normalize) {
                const normalized = api.geometryStore.normalize(doc.geometry_store);
                if (JSON.stringify(normalized) !== JSON.stringify(doc.geometry_store)) {
                    doc.geometry_store = normalized;
                    changed = true;
                }
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
            const api = getApi();
            return {
                datum: api.datum.toJSON(),
                origin: api.origin.toJSON()
            };
        },

        hydrateRuntimeState(doc) {
            const api = getApi();
            if (!doc) return;
            api.geometryStore?.hydrate?.(doc);
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
            api.sketchRuntime?.sync();
            space.update();
        },

        bindRuntimeObservers() {
            const api = getApi();
            if (!api.datum || !api.datum.getPlanes) return;

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
            const api = getApi();
            return api.db.documents.get(id).then(doc => {
                if (doc) {
                    const migrated = this.migrate(doc);
                    this.current = migrated.doc;
                    api.geometryStore?.attachToDocument?.(this.current);
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
            const api = getApi();
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
            const api = getApi();
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
            const api = getApi();
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
            const api = getApi();
            if (!revId) return Promise.resolve(null);
            return api.db.versions.get(revId);
        },

        applyRevision(revision) {
            const api = getApi();
            if (!revision || !revision.snapshot) {
                return Promise.resolve(null);
            }
            const previousAtomicEdit = this._atomicEdit ? { ...this._atomicEdit } : null;
            const previousDocId = this.current?.id || null;
            const preserved = this.current ? {
                name: this.current.name,
                tree: JSON.parse(JSON.stringify(this.current.tree || { folders: [] }))
            } : null;
            const migrated = this.migrate(JSON.parse(JSON.stringify(revision.snapshot)));
            this.current = migrated.doc;
            api.geometryStore?.attachToDocument?.(this.current);
            if (previousAtomicEdit && previousDocId && previousDocId === this.current?.id) {
                const featureId = previousAtomicEdit.feature_id || null;
                const hasFeature = featureId && Array.isArray(this.current?.features)
                    ? this.current.features.some(feature => feature?.id === featureId)
                    : false;
                this._atomicEdit = hasFeature ? previousAtomicEdit : null;
            } else {
                this._atomicEdit = null;
            }
            if (preserved) {
                this.current.name = this.normalizeName(preserved.name);
                this.current.tree = preserved.tree;
            }
            this.current.version = revision.rev || this.current.version;
            this.current.head_rev = revision.rev_id || this.revisionKey(this.current.id, this.current.version);
            this.current.modified_at = revision.created_at || this.current.modified_at || Date.now();
            this.hydrateRuntimeState(this.current);
            api.solids?.scheduleRebuild?.('document.hydrate');
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
            const api = getApi();
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
            const api = getApi();
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
        },

        isAtomicEditActive() {
            return !!this._atomicEdit;
        },

        getAtomicEditFeatureId() {
            return this._atomicEdit?.feature_id || null;
        },

        beginAtomicEdit(meta = {}) {
            this._atomicEdit = {
                feature_id: meta.feature_id || null,
                feature_type: meta.feature_type || null,
                start_rev: this.current?.head_rev || null
            };
        },

        endAtomicEdit(options = {}) {
            const api = getApi();
            const session = this._atomicEdit;
            this._atomicEdit = null;
            if (!session) {
                return Promise.resolve(false);
            }
            if (options.commit !== true) {
                return Promise.resolve(false);
            }
            const startRev = session.start_rev || null;
            const currentHead = this.current?.head_rev || null;
            if (startRev === currentHead) {
                return Promise.resolve(false);
            }
            if (!this.current) return Promise.resolve(false);

            const now = Date.now();
            const next = this.nextRevision('micro');
            const revId = this.revisionKey(this.current.id, next);
            const snapshot = this.toSnapshot();
            const revision = {
                doc_id: this.current.id,
                rev: next,
                rev_id: revId,
                parent_rev: startRev,
                schema_version: DOC_SCHEMA_VERSION,
                op_type: options.opType || 'feature.atomic.edit',
                payload: options.payload || {
                    feature_id: session.feature_id,
                    feature_type: session.feature_type
                },
                snapshot,
                created_at: now
            };

            this.current.version = next;
            this.current.head_rev = revId;
            this.current.scene = snapshot.scene;
            this.current.modified_at = now;
            this._redoStack = [];

            return Promise.all([
                api.db.versions.put(revId, revision),
                api.db.documents.put(this.current.id, this.current),
                api.db.admin.put(ADMIN_CURRENT_DOC_KEY, this.current.id),
                api.db.admin.put(ADMIN_CURRENT_REV_KEY, revId)
            ]).then(() => true);
        },

        getTimelineCount() {
            const features = Array.isArray(this.current?.features) ? this.current.features : [];
            if (!features.length) return 0;
            const rawIndex = this.current?.timeline?.index;
            if (rawIndex === null || rawIndex === undefined) {
                return features.length;
            }
            const index = Math.max(-1, Math.min(features.length - 1, Math.floor(rawIndex)));
            return index + 1;
        },

        setTimelineCount(count) {
            const api = getApi();
            if (!this.current) return Promise.resolve(false);
            const features = Array.isArray(this.current.features) ? this.current.features : [];
            const maxCount = features.length;
            const nextCount = Math.max(0, Math.min(maxCount, Math.floor(Number(count) || 0)));
            const prevCount = this.getTimelineCount();
            if (nextCount === prevCount) {
                return Promise.resolve(false);
            }
            this.current.timeline = this.current.timeline || { index: null };
            this.current.timeline.index = nextCount >= maxCount ? null : (nextCount - 1);
            return this.save({
                kind: 'micro',
                opType: 'timeline.set',
                payload: { previous: prevCount, next: nextCount }
            }).then(() => {
                api.sketchRuntime?.sync();
                api.solids?.scheduleRebuild?.('timeline.set');
                return true;
            });
        }
    };
}

export { createDocumentApi };
