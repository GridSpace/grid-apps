/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { $ } from '../moto/webui.js';
import { api } from './api.js';
import { tree } from './tree.js';
import { space } from '../moto/space.js';

const toolbar = {
    buttons: [],
    cameraToggleBtn: null,
    sketchBtn: null,
    sketchToolButtons: null,
    docNameEl: null,
    openDialogEl: null,
    openDialogListEl: null,

    build() {
        const container = $('top-bar');
        if (!container) return;

        container.innerHTML = '';
        this.buttons = [];

        // Logo / title
        const title = document.createElement('div');
        title.className = 'toolbar-title';
        title.textContent = 'Void:Form';
        container.appendChild(title);

        // Separator
        container.appendChild(this.separator());

        // Main tools
        this.addButton(container, 'New', async () => {
            await api.document.createAndSelect();
            this.updateDocumentTitle();
            tree.render();
        });

        this.addButton(container, 'Open', () => {
            this.showOpenDialog();
        });

        container.appendChild(this.separator());

        this.addButton(container, 'Undo', async () => {
            const ok = await api.document.undo();
            if (ok) {
                this.updateDocumentTitle();
                tree.render();
            }
        });

        this.addButton(container, 'Redo', async () => {
            const ok = await api.document.redo();
            if (ok) {
                this.updateDocumentTitle();
                tree.render();
            }
        });

        container.appendChild(this.separator());

        // Sketch tools
        this.sketchBtn = this.addButton(container, 'Sketch', () => {
            const target = api.interact.resolveSketchTargetFromSelection();
            if (!target) {
                return;
            }
            const sketch = api.sketch.createFromTarget(target);
            if (!sketch) {
                return;
            }
            api.sketchRuntime?.setEditing(sketch.id);
            api.interact?.clearSketchSelection?.();
            tree.selectedFeatureId = sketch.id;
            tree.render();
            window.dispatchEvent(new CustomEvent('void-state-change'));
        }, { id: 'btn-sketch' });
        this.sketchToolButtons = {
            point: this.addButton(container, 'Point', () => api.interact.setSketchTool('point')),
            line: this.addButton(container, 'Line', () => api.interact.setSketchTool('line'))
        };

        this.addButton(container, 'Extrude', () => {
            console.log('Extrude');
            // TODO: implement extrude
        }, { id: 'btn-extrude', disabled: true });

        container.appendChild(this.separator());

        // View tools
        this.addButton(container, 'Fit', () => {
            space.view.fit(null, { tween: true });
        });

        this.addButton(container, 'Top', () => {
            space.view.top();
        });

        this.addButton(container, 'Front', () => {
            space.view.front();
        });

        this.addButton(container, 'Right', () => {
            space.view.right();
        });

        container.appendChild(this.separator());

        this.cameraToggleBtn = this.addButton(container, this.getProjectionLabel(), () => {
            const current = space.view.getProjection();
            const next = current === 'perspective' ? 'orthographic' : 'perspective';
            space.view.setProjection(next);
            // setProjection recreates controls/camera; restore void bindings/hooks.
            space.view.setCtrl('void');
            api.overlay.onProjectionChanged();
            // Persist after projection/control settles to avoid stale scale snapshots.
            if (api.db?.admin) {
                setTimeout(() => {
                    api.db.admin.put('camera', {
                        place: space.view.save(),
                        focus: space.view.getFocus(),
                        projection: space.view.getProjection()
                    });
                }, 120);
            }
            this.updateProjectionLabel();
        }, { id: 'btn-camera-toggle' });

        const spacer = document.createElement('div');
        spacer.className = 'toolbar-spacer';
        container.appendChild(spacer);

        this.docNameEl = document.createElement('div');
        this.docNameEl.className = 'toolbar-doc-name';
        this.docNameEl.onclick = async () => {
            const current = api.document.current;
            if (!current) return;
            const next = window.prompt('Rename document', current.name || 'Untitled');
            if (next === null) return;
            await api.document.rename(next);
            this.updateDocumentTitle();
        };
        container.appendChild(this.docNameEl);

        this.buildOpenDialog();
        this.updateDocumentTitle();
        this.updateSketchControls();
        window.addEventListener('void-state-change', () => this.updateSketchControls());

        console.log({ toolbar_built: true });
    },

    updateSketchControls() {
        const editing = !!api.sketchRuntime?.editingId;
        const canCreate = !editing && !!api.interact.resolveSketchTargetFromSelection();

        if (this.sketchBtn) {
            this.sketchBtn.disabled = !canCreate;
        }

        const tool = api.interact.getSketchTool ? api.interact.getSketchTool() : 'select';
        if (this.sketchToolButtons) {
            for (const [name, btn] of Object.entries(this.sketchToolButtons)) {
                const enabled = editing;
                btn.disabled = !enabled;
                btn.classList.toggle('active', enabled && name === tool);
            }
        }
    },

    getProjectionLabel() {
        const mode = space.view.getProjection();
        return mode === 'perspective' ? 'Ortho' : 'Persp';
    },

    updateProjectionLabel() {
        if (this.cameraToggleBtn) {
            this.cameraToggleBtn.textContent = this.getProjectionLabel();
        }
    },

    updateDocumentTitle() {
        const name = api.document.current?.name || 'Untitled';
        if (this.docNameEl) {
            this.docNameEl.textContent = name;
            this.docNameEl.title = name;
        }
        document.title = `${name} - Void:Form`;
    },

    buildOpenDialog() {
        if (this.openDialogEl) return;
        const backdrop = document.createElement('div');
        backdrop.className = 'doc-dialog-backdrop hidden';

        const dialog = document.createElement('div');
        dialog.className = 'doc-dialog';

        const header = document.createElement('div');
        header.className = 'doc-dialog-header';
        header.textContent = 'Documents';

        const list = document.createElement('div');
        list.className = 'doc-dialog-list';

        const actions = document.createElement('div');
        actions.className = 'doc-dialog-actions';

        const newBtn = this.addButton(actions, 'New', async () => {
            await api.document.createAndSelect();
            this.updateDocumentTitle();
            tree.render();
            this.hideOpenDialog();
        });
        newBtn.classList.add('compact');

        const closeBtn = this.addButton(actions, 'Close', () => {
            this.hideOpenDialog();
        });
        closeBtn.classList.add('compact');

        dialog.appendChild(header);
        dialog.appendChild(list);
        dialog.appendChild(actions);
        backdrop.appendChild(dialog);
        document.body.appendChild(backdrop);

        backdrop.addEventListener('click', event => {
            if (event.target === backdrop) {
                this.hideOpenDialog();
            }
        });

        this.openDialogEl = backdrop;
        this.openDialogListEl = list;
    },

    async showOpenDialog() {
        if (!this.openDialogEl) {
            this.buildOpenDialog();
        }
        const docs = await api.document.list();
        this.renderOpenDialogList(docs);
        this.openDialogEl.classList.remove('hidden');
    },

    hideOpenDialog() {
        if (this.openDialogEl) {
            this.openDialogEl.classList.add('hidden');
        }
    },

    renderOpenDialogList(docs) {
        if (!this.openDialogListEl) return;
        this.openDialogListEl.innerHTML = '';

        if (!docs.length) {
            const empty = document.createElement('div');
            empty.className = 'doc-dialog-empty';
            empty.textContent = 'No documents';
            this.openDialogListEl.appendChild(empty);
            return;
        }

        for (const doc of docs) {
            const row = document.createElement('div');
            row.className = 'doc-dialog-row';

            if (doc.id === api.document.current?.id) {
                row.classList.add('active');
            }

            const info = document.createElement('div');
            info.className = 'doc-dialog-info';
            const name = document.createElement('div');
            name.className = 'doc-dialog-name';
            name.textContent = doc.name || 'Untitled';
            const meta = document.createElement('div');
            meta.className = 'doc-dialog-meta';
            meta.textContent = `Updated ${this.formatTime(doc.modified_at)}`;
            info.appendChild(name);
            info.appendChild(meta);

            const actions = document.createElement('div');
            actions.className = 'doc-dialog-row-actions';
            const openBtn = this.addButton(actions, 'Open', async () => {
                await api.document.open(doc.id);
                this.updateDocumentTitle();
                tree.render();
                this.hideOpenDialog();
            });
            openBtn.classList.add('compact');
            const delBtn = this.addButton(actions, 'Delete', async () => {
                const ok = window.confirm(`Delete "${doc.name || 'Untitled'}"?`);
                if (!ok) return;
                await api.document.delete(doc.id);
                this.updateDocumentTitle();
                tree.render();
                const nextDocs = await api.document.list();
                this.renderOpenDialogList(nextDocs);
            });
            delBtn.classList.add('compact', 'danger');

            row.appendChild(info);
            row.appendChild(actions);
            this.openDialogListEl.appendChild(row);
        }
    },

    formatTime(ts) {
        if (!ts) return 'unknown';
        try {
            return new Date(ts).toLocaleString();
        } catch (e) {
            return 'unknown';
        }
    },

    addButton(container, label, onclick, options = {}) {
        const btn = document.createElement('button');
        btn.className = 'toolbar-btn';
        btn.textContent = label;
        btn.onclick = onclick;
        if (options.id) {
            btn.id = options.id;
        }
        if (options.disabled) {
            btn.disabled = true;
        }
        container.appendChild(btn);
        this.buttons.push(btn);
        return btn;
    },

    separator() {
        const sep = document.createElement('div');
        sep.className = 'toolbar-separator';
        return sep;
    }
};

export { toolbar };
