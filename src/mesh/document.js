/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

function uid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    }
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function clone(data) {
    if (data === undefined || data === null) return data;
    if (typeof structuredClone === 'function') {
        return structuredClone(data);
    }
    return JSON.parse(JSON.stringify(data));
}

function title(name = '') {
    const clean = String(name || '').trim();
    return clean || 'Untitled';
}

function revKey(docId, revId) {
    return `${docId}:${revId}`;
}

export function createDocumentManager({ admin, documents, versions, maxRevisions = 200 }) {
    const state = {
        admin,
        documents,
        versions,
        maxRevisions,
        doc: null,
        space: {},
        meta: {},
        pauseDepth: 0,
        commitTimer: null,
        commitDelay: 350
    };

    function paused() {
        return state.pauseDepth > 0;
    }

    async function saveDoc() {
        if (!state.doc) return;
        await state.documents.put(state.doc.id, clone(state.doc));
        await state.admin.put('current_document_id', state.doc.id);
    }

    async function loadSnapshot(doc, revId = null) {
        if (!doc) {
            state.space = {};
            state.meta = {};
            return null;
        }
        const rid = revId || doc.cursor_rev || doc.head_rev || null;
        if (!rid) {
            state.space = {};
            state.meta = {};
            return null;
        }
        const rec = await state.versions.get(revKey(doc.id, rid));
        const snap = rec?.snapshot || {};
        state.space = clone(snap.space || {});
        state.meta = clone(snap.meta || {});
        return rec || null;
    }

    async function maybePruneRevisions() {
        const order = Array.isArray(state.doc?.rev_order) ? state.doc.rev_order : [];
        const over = order.length - state.maxRevisions;
        if (over <= 0) return;
        const purge = order.splice(0, over);
        for (const rid of purge) {
            await state.versions.remove(revKey(state.doc.id, rid));
        }
        if (state.doc.cursor_rev && !order.includes(state.doc.cursor_rev)) {
            state.doc.cursor_rev = order[0] || null;
        }
        if (state.doc.head_rev && !order.includes(state.doc.head_rev)) {
            state.doc.head_rev = order[order.length - 1] || null;
        }
    }

    async function commit(op_type = 'autosave', label = 'autosave') {
        if (!state.doc || paused()) return null;
        const order = Array.isArray(state.doc.rev_order) ? state.doc.rev_order.slice() : [];
        const cursor = state.doc.cursor_rev || null;
        const cursorIndex = cursor ? order.indexOf(cursor) : -1;
        if (cursorIndex >= 0 && cursorIndex < order.length - 1) {
            const remove = order.slice(cursorIndex + 1);
            for (const rid of remove) {
                await state.versions.remove(revKey(state.doc.id, rid));
            }
            order.length = cursorIndex + 1;
        }
        const parent = order.length ? order[order.length - 1] : null;
        const rid = uid();
        await state.versions.put(revKey(state.doc.id, rid), {
            doc_id: state.doc.id,
            rev_id: rid,
            parent_rev: parent,
            created_at: Date.now(),
            op_type,
            label,
            snapshot: {
                space: clone(state.space),
                meta: clone(state.meta)
            }
        });
        order.push(rid);
        state.doc.rev_order = order;
        state.doc.head_rev = rid;
        state.doc.cursor_rev = rid;
        state.doc.updated_at = Date.now();
        await maybePruneRevisions();
        await saveDoc();
        return rid;
    }

    function scheduleCommit(op_type = 'autosave', label = 'autosave') {
        if (!state.doc || paused()) return;
        clearTimeout(state.commitTimer);
        state.commitTimer = setTimeout(() => {
            state.commitTimer = null;
            commit(op_type, label).catch(error => console.trace(error));
        }, state.commitDelay);
    }

    async function createDoc(name = 'Untitled') {
        const id = uid();
        const now = Date.now();
        state.doc = {
            id,
            name: title(name),
            created_at: now,
            updated_at: now,
            head_rev: null,
            cursor_rev: null,
            rev_order: []
        };
        state.space = {};
        state.meta = {};
        await commit('document.create', 'document.create');
        return clone(state.doc);
    }

    async function restoreOrCreate() {
        let docId = await state.admin.get('current_document_id');
        let doc = docId ? await state.documents.get(docId) : null;
        if (!doc) {
            const listed = await state.documents.iterate({ map: true }) || {};
            const docs = Object.values(listed);
            if (docs.length) {
                docs.sort((a, b) => Number(b.updated_at || 0) - Number(a.updated_at || 0));
                doc = docs[0];
            }
        }
        if (!doc) {
            return createDoc('Untitled');
        }
        state.doc = clone(doc);
        await loadSnapshot(state.doc);
        await saveDoc();
        return clone(state.doc);
    }

    async function open(docId, { autosave = true } = {}) {
        if (autosave) {
            await flush();
            await commit('document.autosave', 'document.autosave');
        }
        const next = await state.documents.get(docId);
        if (!next) throw new Error(`document ${docId} missing`);
        state.doc = clone(next);
        await loadSnapshot(state.doc);
        await saveDoc();
        return clone(state.doc);
    }

    async function rename(docId, name) {
        const doc = await state.documents.get(docId);
        if (!doc) return null;
        doc.name = title(name);
        doc.updated_at = Date.now();
        await state.documents.put(doc.id, doc);
        if (state.doc?.id === doc.id) {
            state.doc = clone(doc);
            await state.admin.put('current_document_id', doc.id);
        }
        return clone(doc);
    }

    async function list() {
        const map = await state.documents.iterate({ map: true }) || {};
        return Object.values(map)
            .sort((a, b) => Number(b.updated_at || 0) - Number(a.updated_at || 0));
    }

    async function remove(docId) {
        const id = String(docId || '');
        if (!id) return { deleted: false, switched: false, current: clone(state.doc) };
        await flush();
        const doc = await state.documents.get(id);
        if (!doc) return { deleted: false, switched: false, current: clone(state.doc) };
        const revs = Array.isArray(doc.rev_order) ? doc.rev_order : [];
        for (const rid of revs) {
            await state.versions.remove(revKey(id, rid));
        }
        await state.documents.remove(id);
        if (state.doc?.id !== id) {
            return { deleted: true, switched: false, current: clone(state.doc) };
        }
        const map = await state.documents.iterate({ map: true }) || {};
        const docs = Object.values(map).sort((a, b) => Number(b.updated_at || 0) - Number(a.updated_at || 0));
        if (!docs.length) {
            await createDoc('Untitled');
            return { deleted: true, switched: true, current: clone(state.doc) };
        }
        state.doc = clone(docs[0]);
        await loadSnapshot(state.doc);
        await saveDoc();
        return { deleted: true, switched: true, current: clone(state.doc) };
    }

    async function undo() {
        await flush();
        if (!state.doc) return false;
        const order = Array.isArray(state.doc.rev_order) ? state.doc.rev_order : [];
        if (order.length < 2) return false;
        const idx = order.indexOf(state.doc.cursor_rev);
        if (idx <= 0) return false;
        state.doc.cursor_rev = order[idx - 1];
        state.doc.updated_at = Date.now();
        await loadSnapshot(state.doc, state.doc.cursor_rev);
        await saveDoc();
        return true;
    }

    async function redo() {
        await flush();
        if (!state.doc) return false;
        const order = Array.isArray(state.doc.rev_order) ? state.doc.rev_order : [];
        const idx = order.indexOf(state.doc.cursor_rev);
        if (idx < 0 || idx >= order.length - 1) return false;
        state.doc.cursor_rev = order[idx + 1];
        state.doc.updated_at = Date.now();
        await loadSnapshot(state.doc, state.doc.cursor_rev);
        await saveDoc();
        return true;
    }

    async function flush() {
        if (state.commitTimer) {
            clearTimeout(state.commitTimer);
            state.commitTimer = null;
            await commit('autosave.flush', 'autosave.flush');
        }
    }

    const spaceStore = {
        async put(key, value) {
            state.space[String(key)] = clone(value);
            scheduleCommit('space.put', `space.put:${key}`);
            return value;
        },
        async remove(key) {
            delete state.space[String(key)];
            scheduleCommit('space.remove', `space.remove:${key}`);
            return true;
        },
        async get(key) {
            return clone(state.space[String(key)]);
        },
        async iterate(opt = {}) {
            if (opt?.map) {
                return clone(state.space);
            }
            return Object.entries(state.space || {});
        }
    };

    return {
        spaceStore,
        pause() {
            state.pauseDepth++;
        },
        resume() {
            state.pauseDepth = Math.max(0, state.pauseDepth - 1);
        },
        setMeta(meta = {}) {
            state.meta = clone(meta || {});
            scheduleCommit('meta.set', 'meta.set');
        },
        getMeta() {
            return clone(state.meta || {});
        },
        getSpace() {
            return clone(state.space || {});
        },
        get current() {
            return clone(state.doc);
        },
        restoreOrCreate,
        create: createDoc,
        open,
        rename,
        delete: remove,
        list,
        commit,
        flush,
        undo,
        redo
    };
}
