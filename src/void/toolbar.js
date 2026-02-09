/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { $ } from '../moto/webui.js';
import { api } from './api.js';
import { tree } from './tree.js';
import { space } from '../moto/space.js';
import { properties } from './properties.js';
import { encode as objEncode } from '../load/obj.js';
import { encode as stlEncode } from '../load/stl.js';
import { encode as tmfEncode } from '../load/3mf.js';
import { meshToSTEPWithFaces } from '../load/step.js';
import { JSZip } from '../ext/jszip-esm.js';

const toolbar = {
    buttons: [],
    cameraToggleBtn: null,
    sketchBtn: null,
    extrudeBtn: null,
    booleanBtn: null,
    sketchToolButtons: null,
    sketchToolMenuItems: null,
    sketchConstraintButtons: null,
    sketchConstraintMenu: null,
    docNameEl: null,
    openDialogEl: null,
    openDialogListEl: null,
    hotkeysDialogEl: null,
    exportDialogEl: null,
    exportDialogInfoEl: null,
    exportFilenameEl: null,
    exportStlZipEl: null,

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
        this.addMenu(container, 'File', [
            { key: 'new', label: 'New', onClick: async () => {
                await api.document.createAndSelect();
                this.updateDocumentTitle();
                tree.render();
            } },
            { key: 'open', label: 'Open', onClick: () => {
                this.showOpenDialog();
            } },
            { key: 'export', label: 'Export…', onClick: () => {
                this.showExportDialog();
            } }
        ]);

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
            tree.selectedFeatureId = sketch.id;
            tree.selectedFeatureIds = new Set([sketch.id]);
            tree.selectedSolidIds = new Set();
            api.solids?.setSelected?.([]);
            properties.showFeature(sketch, {
                onChange: () => tree.render()
            });
            api.interact?.setSketchTool?.('select');
            tree.render();
            window.dispatchEvent(new CustomEvent('void-state-change'));
        }, { id: 'btn-sketch' });
        this.sketchToolButtons = {
            point: this.addButton(container, 'Point', () => {
                const current = api.interact.getSketchTool?.() || 'select';
                api.interact.setSketchTool(current === 'point' ? 'select' : 'point');
            }),
            line: this.addButton(container, 'Line', () => {
                const current = api.interact.getSketchTool?.() || 'select';
                api.interact.setSketchTool(current === 'line' ? 'select' : 'line');
            })
        };
        const arcMenu = this.addMenu(container, 'Arc', [
            { key: 'arc-3pt', label: '3 Point Arc', onClick: () => {
                api.interact.setSketchTool('arc-3pt');
            } },
            { key: 'arc-center', label: 'Center Point Arc', onClick: () => {
                api.interact.setSketchTool('arc-center');
            } },
            { key: 'arc-tangent', label: 'Tangent Arc', onClick: () => {
                api.interact.setSketchTool('arc-tangent');
            } }
        ]);
        const circleMenu = this.addMenu(container, 'Circle', [
            { key: 'circle-center', label: 'Center Point Circle', onClick: () => {
                api.interact.setSketchTool('circle-center');
            } },
            { key: 'circle-3pt', label: '3 Point Circle', onClick: () => {
                api.interact.setSketchTool('circle-3pt');
            } }
        ]);
        const rectMenu = this.addMenu(container, 'Rect', [
            { key: 'rect', label: 'Corner Rect', onClick: () => {
                api.interact.setSketchTool('rect');
            } },
            { key: 'rect-center', label: 'Center Rect', onClick: () => {
                api.interact.setSketchTool('rect-center');
            } }
        ]);
        const polyMenu = this.addMenu(container, 'Polygon', [
            { key: 'inscribed', label: 'Inscribed', onClick: () => {
                api.interact.createSketchPolygonFromSelectedCircle?.('inscribed');
            } },
            { key: 'circumscribed', label: 'Circumscribed', onClick: () => {
                api.interact.createSketchPolygonFromSelectedCircle?.('circumscribed');
            } }
        ]);
        this.sketchToolMenuItems = {
            ...arcMenu.items,
            ...circleMenu.items,
            ...rectMenu.items,
            ...polyMenu.items
        };
        container.appendChild(this.separator());
        this.sketchConstraintMenu = this.addMenu(container, 'Constraints', [
            { key: 'horizontal', label: 'Horizontal', onClick: () => api.interact.applySketchConstraint?.('horizontal') },
            { key: 'vertical', label: 'Vertical', onClick: () => api.interact.applySketchConstraint?.('vertical') },
            { key: 'perpendicular', label: 'Perpendicular', onClick: () => api.interact.applySketchConstraint?.('perpendicular') },
            { key: 'equal', label: 'Equal', onClick: () => api.interact.applySketchConstraint?.('equal') },
            { key: 'collinear', label: 'Collinear', onClick: () => api.interact.applySketchConstraint?.('collinear') },
            { key: 'dimension', label: 'Dimension', onClick: () => api.interact.applySketchConstraint?.('dimension') },
            { key: 'tangent', label: 'Tangent', onClick: () => api.interact.applySketchConstraint?.('tangent') },
            { key: 'midpoint', label: 'Midpoint', onClick: () => api.interact.applySketchConstraint?.('midpoint') },
            { key: 'coincident', label: 'Coincident', onClick: () => api.interact.applySketchConstraint?.('coincident') },
            { key: 'fixed', label: 'Fixed', onClick: () => api.interact.applySketchConstraint?.('fixed') }
        ]);
        this.sketchConstraintButtons = this.sketchConstraintMenu.items;

        this.extrudeBtn = this.addButton(container, 'Extrude', () => {
            this.onExtrudeButton();
        }, { id: 'btn-extrude', disabled: true });
        this.booleanBtn = this.addButton(container, 'Boolean', () => {
            this.onBooleanButton();
        }, { id: 'btn-boolean', disabled: true });

        container.appendChild(this.separator());

        // View tools
        this.addMenu(container, 'View', [
            { key: 'fit', label: 'Fit', onClick: () => space.view.fit(null, { tween: true }) },
            { key: 'top', label: 'Top', onClick: () => space.view.top() },
            { key: 'front', label: 'Front', onClick: () => space.view.front() },
            { key: 'right', label: 'Right', onClick: () => space.view.right() }
        ]);

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
        this.addButton(container, '?', () => {
            this.toggleHotkeysDialog();
        }, { id: 'btn-hotkeys' });

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
        this.buildExportDialog();
        this.buildHotkeysDialog();
        this.updateDocumentTitle();
        this.updateSketchControls();
        window.addEventListener('void-state-change', () => this.updateSketchControls());
        window.addEventListener('keydown', event => {
            const activeTag = document.activeElement?.tagName;
            const editingInput = activeTag === 'INPUT' || activeTag === 'TEXTAREA' || document.activeElement?.isContentEditable;
            if (editingInput) return;
            if (event.code === 'Slash' && event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
                this.toggleHotkeysDialog();
                event.preventDefault();
            } else if (event.code === 'Escape' && !event.ctrlKey && !event.metaKey && !event.altKey) {
                this.hideHotkeysDialog();
            }
        });

        console.log({ toolbar_built: true });
    },

    updateSketchControls() {
        const editing = !!api.sketchRuntime?.editingId;
        const canCreate = !editing && !!api.interact.resolveSketchTargetFromSelection();
        const canExtrude = (this.getSelectedExtrudeTargets().length > 0) || (!editing && !!this.getSelectedSolidSourceExtrudeFeature());
        const canBoolean = !editing && (this.getSelectedBooleanTargets().length >= 2 || !!this.getSelectedSolidSourceBooleanFeature());

        if (this.sketchBtn) {
            this.sketchBtn.disabled = !canCreate;
            this.sketchBtn.classList.toggle('active', canCreate && !editing);
        }
        if (this.extrudeBtn) {
            this.extrudeBtn.disabled = !canExtrude;
        }
        if (this.booleanBtn) {
            this.booleanBtn.disabled = !canBoolean;
        }

        const rawTool = api.interact.getSketchTool ? api.interact.getSketchTool() : 'select';
        const tool = rawTool === 'arc' ? 'arc-3pt' : (rawTool === 'circle' ? 'circle-center' : rawTool);
        if (this.sketchToolButtons) {
            for (const [name, btn] of Object.entries(this.sketchToolButtons)) {
                const enabled = editing;
                btn.disabled = !enabled;
                btn.classList.toggle('active', enabled && name === tool);
            }
        }
        if (this.sketchToolMenuItems) {
            const toolKeys = ['arc-3pt', 'arc-center', 'arc-tangent', 'circle-center', 'circle-3pt', 'rect', 'rect-center', 'inscribed', 'circumscribed'];
            for (const key of toolKeys) {
                const btn = this.sketchToolMenuItems[key];
                if (!btn) continue;
                btn.disabled = !editing;
                btn.classList.toggle('active', editing && key === tool);
                if (key === 'inscribed' || key === 'circumscribed') {
                    btn.classList.remove('active');
                }
            }
        }
        if (this.sketchConstraintButtons) {
            for (const btn of Object.values(this.sketchConstraintButtons)) {
                btn.disabled = !editing;
            }
        }
        if (this.sketchConstraintMenu?.trigger) {
            this.sketchConstraintMenu.trigger.disabled = !editing;
        }
    },

    getSelectedExtrudeTargets() {
        const profiles = Array.from(api.interact?.selectedSketchProfiles || []);
        const out = [];
        for (const key of profiles) {
            const [sketchId, profileId] = String(key || '').split(':');
            if (!sketchId || !profileId) continue;
            const sketch = api.features.findById(sketchId);
            if (!sketch || sketch.type !== 'sketch') continue;
            out.push({ sketchId, profileId });
        }
        return out;
    },

    createExtrudeFeatureFromTargets(targets) {
        if (!targets.length) return null;
        const doc = api.document.current;
        if (!doc) return null;
        const extrudeCount = (doc.features || []).filter(f => f?.type === 'extrude').length;
        const id = (typeof crypto !== 'undefined' && crypto.randomUUID)
            ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
            : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
        const feature = {
            id,
            type: 'extrude',
            name: `Extrude ${extrudeCount + 1}`,
            created_at: Date.now(),
            suppressed: false,
            visible: true,
            input: {
                profiles: targets
            },
            params: {
                depth: 10,
                distance: 10,
                direction: 'normal',
                symmetric: false,
                operation: 'new'
            },
            result: null
        };
        api.features.add(feature);
        tree.selectedFeatureId = feature.id;
        tree.selectedFeatureIds = new Set([feature.id]);
        tree.selectedSolidIds = new Set();
        api.solids?.setSelected?.([]);
        properties.showFeature(feature, {
            onChange: () => tree.render()
        });
        tree.render();
        window.dispatchEvent(new CustomEvent('void-state-change'));
        return feature;
    },

    createExtrudeFeatureFromSelection() {
        return this.createExtrudeFeatureFromTargets(this.getSelectedExtrudeTargets());
    },

    getSelectedSolidSourceExtrudeFeature() {
        const solidIds = Array.from(tree.selectedSolidIds || []);
        if (solidIds.length !== 1) return null;
        const solidId = solidIds[0];
        const solid = (api.solids?.list?.() || []).find(item => item?.id === solidId);
        const sourceFeatureId = solid?.source?.feature_id || null;
        if (!sourceFeatureId) return null;
        const feature = api.features.findById(sourceFeatureId);
        if (!feature || feature.type !== 'extrude') return null;
        return feature;
    },

    getSelectedBooleanTargets() {
        const faceKeys = api.solids?.getSelectedFaceKeys?.() || [];
        const faceSolidIds = new Set();
        for (const key of faceKeys) {
            const raw = String(key || '');
            const split = raw.lastIndexOf(':');
            if (split <= 0) continue;
            const solidId = raw.substring(0, split);
            if (solidId) faceSolidIds.add(solidId);
        }
        const solidIds = faceSolidIds.size ? Array.from(faceSolidIds) : Array.from(tree.selectedSolidIds || []);
        const solids = api.solids?.list?.() || [];
        return solidIds.filter(id => solids.some(solid => solid?.id === id));
    },

    createBooleanFeatureFromSelection() {
        const targets = this.getSelectedBooleanTargets();
        if (targets.length < 2) return null;
        const doc = api.document.current;
        if (!doc) return null;
        const booleanCount = (doc.features || []).filter(f => f?.type === 'boolean').length;
        const id = (typeof crypto !== 'undefined' && crypto.randomUUID)
            ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
            : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
        const feature = {
            id,
            type: 'boolean',
            name: `Boolean ${booleanCount + 1}`,
            created_at: Date.now(),
            suppressed: false,
            visible: true,
            input: {
                targets: targets.slice(),
                tools: []
            },
            params: {
                mode: 'add'
            },
            result: null
        };
        api.features.add(feature);
        tree.selectedFeatureId = feature.id;
        tree.selectedFeatureIds = new Set([feature.id]);
        tree.selectedSolidIds = new Set(targets);
        api.solids?.setSelected?.(targets);
        properties.showFeature(feature, {
            onChange: () => tree.render()
        });
        tree.render();
        window.dispatchEvent(new CustomEvent('void-state-change'));
        return feature;
    },

    getSelectedSolidSourceBooleanFeature() {
        const solidIds = Array.from(tree.selectedSolidIds || []);
        if (solidIds.length !== 1) return null;
        const solidId = solidIds[0];
        const solid = (api.solids?.list?.() || []).find(item => item?.id === solidId);
        const sourceFeatureId = solid?.source?.feature_id || null;
        if (!sourceFeatureId) return null;
        const feature = api.features.findById(sourceFeatureId);
        if (!feature || feature.type !== 'boolean') return null;
        return feature;
    },

    async onExtrudeButton() {
        const sketchEditingId = api.sketchRuntime?.editingId || null;
        const selectedTargets = this.getSelectedExtrudeTargets();
        if (sketchEditingId && selectedTargets.length) {
            if (properties.currentFeatureId) {
                await properties.hide('accept');
            } else {
                api.sketchRuntime?.setEditing(null);
            }
            this.createExtrudeFeatureFromTargets(selectedTargets);
            return;
        }
        const existing = this.getSelectedSolidSourceExtrudeFeature();
        if (existing) {
            tree.selectedSolidIds = new Set();
            tree.selectedFeatureIds = new Set([existing.id]);
            tree.selectedFeatureId = existing.id;
            properties.showFeature(existing, {
                onChange: () => tree.render()
            });
            tree.render();
            window.dispatchEvent(new CustomEvent('void-state-change'));
            return;
        }
        this.createExtrudeFeatureFromSelection();
    },

    onBooleanButton() {
        const existing = this.getSelectedSolidSourceBooleanFeature();
        if (existing) {
            const mode = String(existing?.params?.mode || 'add');
            const targets = Array.isArray(existing?.input?.targets)
                ? existing.input.targets.filter(Boolean)
                : (Array.isArray(existing?.input?.solids) ? existing.input.solids.filter(Boolean) : []);
            const tools = Array.isArray(existing?.input?.tools) ? existing.input.tools.filter(Boolean) : [];
            const selected = mode === 'subtract' ? Array.from(new Set([...targets, ...tools])) : targets;
            tree.selectedSolidIds = new Set(selected);
            tree.selectedFeatureIds = new Set([existing.id]);
            tree.selectedFeatureId = existing.id;
            api.solids?.setSelected?.(selected);
            properties.showFeature(existing, {
                onChange: () => tree.render()
            });
            tree.render();
            window.dispatchEvent(new CustomEvent('void-state-change'));
            return;
        }
        this.createBooleanFeatureFromSelection();
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

    buildExportDialog() {
        if (this.exportDialogEl) return;
        const backdrop = document.createElement('div');
        backdrop.className = 'doc-dialog-backdrop hidden';

        const dialog = document.createElement('div');
        dialog.className = 'doc-dialog';

        const header = document.createElement('div');
        header.className = 'doc-dialog-header';
        header.textContent = 'Export Solids';

        const list = document.createElement('div');
        list.className = 'doc-dialog-list';

        const info = document.createElement('div');
        info.className = 'doc-dialog-meta';
        info.style.padding = '4px 0 10px 0';
        list.appendChild(info);

        const nameRow = document.createElement('div');
        nameRow.className = 'doc-dialog-row';
        const nameInfo = document.createElement('div');
        nameInfo.className = 'doc-dialog-info';
        const nameLabel = document.createElement('div');
        nameLabel.className = 'doc-dialog-name';
        nameLabel.textContent = 'Filename';
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.value = 'void-export';
        nameInput.style.width = '100%';
        nameInput.style.marginTop = '6px';
        nameInfo.appendChild(nameLabel);
        nameInfo.appendChild(nameInput);
        nameRow.appendChild(nameInfo);
        list.appendChild(nameRow);

        const stlOptsRow = document.createElement('div');
        stlOptsRow.className = 'doc-dialog-row';
        const stlOptsInfo = document.createElement('div');
        stlOptsInfo.className = 'doc-dialog-info';
        const stlOptsLabel = document.createElement('div');
        stlOptsLabel.className = 'doc-dialog-name';
        stlOptsLabel.textContent = 'STL Output';
        const stlZipWrap = document.createElement('label');
        stlZipWrap.className = 'doc-dialog-meta';
        stlZipWrap.style.display = 'inline-flex';
        stlZipWrap.style.gap = '8px';
        stlZipWrap.style.alignItems = 'center';
        stlZipWrap.style.marginTop = '6px';
        const stlZip = document.createElement('input');
        stlZip.type = 'checkbox';
        stlZip.checked = false;
        const stlZipText = document.createElement('span');
        stlZipText.textContent = 'Zip per solid';
        stlZipWrap.appendChild(stlZip);
        stlZipWrap.appendChild(stlZipText);
        stlOptsInfo.appendChild(stlOptsLabel);
        stlOptsInfo.appendChild(stlZipWrap);
        stlOptsRow.appendChild(stlOptsInfo);
        list.appendChild(stlOptsRow);

        const actions = document.createElement('div');
        actions.className = 'doc-dialog-actions';

        const mk = (label, fmt) => {
            const btn = this.addButton(actions, label, () => this.exportSolids(fmt));
            btn.classList.add('compact');
            return btn;
        };
        mk('OBJ', 'obj');
        mk('STL', 'stl');
        mk('3MF', '3mf');
        mk('STEP', 'step');
        const closeBtn = this.addButton(actions, 'Close', () => this.hideExportDialog());
        closeBtn.classList.add('compact');

        dialog.appendChild(header);
        dialog.appendChild(list);
        dialog.appendChild(actions);
        backdrop.appendChild(dialog);
        document.body.appendChild(backdrop);

        backdrop.addEventListener('click', event => {
            if (event.target === backdrop) {
                this.hideExportDialog();
            }
        });

        this.exportDialogEl = backdrop;
        this.exportDialogInfoEl = info;
        this.exportFilenameEl = nameInput;
        this.exportStlZipEl = stlZip;
    },

    getExportTargetSolidIds() {
        const selected = Array.from(tree.selectedSolidIds || []);
        if (selected.length) return selected;
        return (api.solids?.list?.() || []).map(s => s?.id).filter(Boolean);
    },

    showExportDialog() {
        if (!this.exportDialogEl) {
            this.buildExportDialog();
        }
        const selected = Array.from(tree.selectedSolidIds || []);
        const ids = this.getExportTargetSolidIds();
        if (this.exportDialogInfoEl) {
            this.exportDialogInfoEl.textContent = selected.length
                ? `Exporting ${ids.length} selected solid(s)`
                : `No solids selected. Exporting all ${ids.length} solid(s)`;
        }
        this.exportDialogEl.classList.remove('hidden');
        this.exportFilenameEl?.focus?.();
        this.exportFilenameEl?.select?.();
    },

    hideExportDialog() {
        if (this.exportDialogEl) {
            this.exportDialogEl.classList.add('hidden');
        }
    },

    sanitizeExportFilename(name, ext) {
        const base = String(name || 'void-export').trim().replace(/[\\/:*?"<>|]+/g, '-');
        const stem = base || 'void-export';
        return stem.toLowerCase().endsWith(`.${ext}`) ? stem : `${stem}.${ext}`;
    },

    sanitizeStem(name) {
        return String(name || 'solid').trim().replace(/[\\/:*?"<>|]+/g, '-') || 'solid';
    },

    downloadExport(data, filename, mime = 'application/octet-stream') {
        const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 0);
    },

    recsToStepTriangles(recs) {
        const out = [];
        for (const rec of recs) {
            const varr = rec?.varr || [];
            for (let i = 0; i + 8 < varr.length; i += 9) {
                out.push({
                    v1: { x: varr[i], y: varr[i + 1], z: varr[i + 2] },
                    v2: { x: varr[i + 3], y: varr[i + 4], z: varr[i + 5] },
                    v3: { x: varr[i + 6], y: varr[i + 7], z: varr[i + 8] }
                });
            }
        }
        return out;
    },

    async exportSolids(format = 'obj') {
        const ids = this.getExportTargetSolidIds();
        const recs = api.solids?.getExportRecords?.(ids) || [];
        if (!recs.length) {
            window.alert('No solids to export');
            return;
        }
        const ext = String(format || 'obj').toLowerCase();
        const base = this.exportFilenameEl?.value || 'void-export';
        const filename = this.sanitizeExportFilename(base, ext);
        if (ext === 'obj') {
            const data = objEncode(recs, '# Generated by Void:Form');
            this.downloadExport(data, filename, 'text/plain;charset=utf-8');
        } else if (ext === 'stl') {
            const zipPerSolid = !!this.exportStlZipEl?.checked;
            if (zipPerSolid) {
                const zip = new JSZip();
                for (const rec of recs) {
                    const one = stlEncode([rec], 'Generated by Void:Form');
                    const stem = this.sanitizeStem(rec.file || rec.id || 'solid');
                    zip.file(`${stem}.stl`, one);
                }
                const zipBlob = await zip.generateAsync({
                    type: 'blob',
                    compression: 'DEFLATE',
                    compressionOptions: { level: 6 }
                });
                const zipName = this.sanitizeExportFilename(base, 'zip');
                this.downloadExport(zipBlob, zipName, 'application/zip');
            } else {
                const data = stlEncode(recs, 'Generated by Void:Form');
                this.downloadExport(data, filename, 'application/sla');
            }
        } else if (ext === '3mf') {
            const blob = await tmfEncode(recs, { title: api.document.current?.name || 'Void Export' });
            this.downloadExport(blob, filename, 'model/3mf');
        } else if (ext === 'step') {
            const tris = this.recsToStepTriangles(recs);
            const data = meshToSTEPWithFaces(tris, { productName: api.document.current?.name || 'void-export' });
            this.downloadExport(data, filename, 'application/step');
        } else {
            window.alert(`Unsupported format: ${format}`);
            return;
        }
        this.hideExportDialog();
    },

    hotkeys() {
        return [
            {
                title: 'General',
                items: [
                    { key: 'Shift+/', desc: 'Toggle this hotkeys dialog' },
                    { key: 'Space', desc: 'Clear selection' },
                    { key: 'N', desc: 'View normal to hovered/selected face or plane' },
                    { key: 'P', desc: 'Toggle datum plane visibility' },
                    { key: 'Ctrl/Cmd+Z', desc: 'Undo' },
                    { key: 'Ctrl/Cmd+Y', desc: 'Redo' },
                    { key: 'Shift+Ctrl/Cmd+Z', desc: 'Redo' }
                ]
            },
            {
                title: 'Viewport',
                items: [
                    { key: 'H', desc: 'Camera home' },
                    { key: 'T', desc: 'Camera top' },
                    { key: 'F', desc: 'Camera front' },
                    { key: 'Shift+F', desc: 'Fit view' }
                ]
            },
            {
                title: 'Sketch Tools',
                items: [
                    { key: 'V', desc: 'Select tool' },
                    { key: 'L', desc: 'Line tool' },
                    { key: 'A', desc: '3 point arc tool' },
                    { key: 'O', desc: 'Center point circle tool' },
                    { key: 'R', desc: 'Corner rectangle tool' },
                    { key: 'Shift+R', desc: 'Center rectangle tool' },
                    { key: 'Q', desc: 'Toggle construction on selected lines/arcs' },
                    { key: 'Esc', desc: 'Cancel line mode / close dialogs' }
                ]
            },
            {
                title: 'Sketch Constraints',
                items: [
                    { key: 'H', desc: 'Horizontal constraint (selected line(s))' },
                    { key: 'I', desc: 'Vertical constraint (selected line(s))' },
                    { key: 'K', desc: 'Perpendicular (exactly 2 selected lines)' },
                    { key: 'E', desc: 'Equal length (selected line pair/group)' },
                    { key: 'G', desc: 'Collinear (exactly 2 selected lines)' },
                    { key: 'D', desc: 'Dimension (1 line or 2 points)' },
                    { key: 'T', desc: 'Tangent (line+arc/circle or arc/circle pair)' },
                    { key: 'C', desc: 'Coincident (exactly 2 selected points)' },
                    { key: 'F', desc: 'Fixed (selected point(s))' }
                ]
            },
            {
                title: 'Sketch Selection',
                items: [
                    { key: 'Delete/Backspace', desc: 'Delete selected sketch entities/constraints' }
                ]
            }
        ];
    },

    buildHotkeysDialog() {
        if (this.hotkeysDialogEl) return;
        const backdrop = document.createElement('div');
        backdrop.className = 'doc-dialog-backdrop hidden';

        const dialog = document.createElement('div');
        dialog.className = 'doc-dialog hotkeys-dialog';

        const header = document.createElement('div');
        header.className = 'doc-dialog-header';
        header.textContent = 'Hotkeys';

        const list = document.createElement('div');
        list.className = 'doc-dialog-list';
        for (const section of this.hotkeys()) {
            const title = document.createElement('div');
            title.className = 'hotkeys-section';
            title.textContent = section.title;
            list.appendChild(title);
            for (const item of section.items) {
                const row = document.createElement('div');
                row.className = 'hotkeys-row';
                const key = document.createElement('div');
                key.className = 'hotkeys-key';
                key.textContent = item.key;
                const desc = document.createElement('div');
                desc.className = 'hotkeys-desc';
                desc.textContent = item.desc;
                row.appendChild(key);
                row.appendChild(desc);
                list.appendChild(row);
            }
        }

        const actions = document.createElement('div');
        actions.className = 'doc-dialog-actions';
        const closeBtn = this.addButton(actions, 'Close', () => {
            this.hideHotkeysDialog();
        });
        closeBtn.classList.add('compact');

        dialog.appendChild(header);
        dialog.appendChild(list);
        dialog.appendChild(actions);
        backdrop.appendChild(dialog);
        document.body.appendChild(backdrop);

        backdrop.addEventListener('click', event => {
            if (event.target === backdrop) {
                this.hideHotkeysDialog();
            }
        });

        this.hotkeysDialogEl = backdrop;
    },

    toggleHotkeysDialog() {
        if (!this.hotkeysDialogEl) {
            this.buildHotkeysDialog();
        }
        this.hotkeysDialogEl.classList.toggle('hidden');
    },

    hideHotkeysDialog() {
        if (this.hotkeysDialogEl) {
            this.hotkeysDialogEl.classList.add('hidden');
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

    addMenu(container, label, entries = []) {
        const menu = document.createElement('div');
        menu.className = 'toolbar-menu';

        const trigger = document.createElement('button');
        trigger.className = 'toolbar-btn toolbar-menu-trigger';
        trigger.type = 'button';
        trigger.textContent = label;
        trigger.title = label;

        const pop = document.createElement('div');
        pop.className = 'toolbar-menu-pop';
        const panel = document.createElement('div');
        panel.className = 'toolbar-menu-panel';
        const items = {};

        for (const entry of entries) {
            const item = document.createElement('button');
            item.className = 'toolbar-menu-item';
            item.type = 'button';
            item.textContent = entry.label;
            if (entry.disabled) {
                item.disabled = true;
            }
            item.onclick = () => {
                if (item.disabled) return;
                entry.onClick?.();
            };
            panel.appendChild(item);
            if (entry.key) {
                items[entry.key] = item;
            }
        }

        pop.appendChild(panel);
        menu.appendChild(trigger);
        menu.appendChild(pop);
        container.appendChild(menu);
        this.buttons.push(trigger);
        return { menu, trigger, pop, panel, items };
    },

    separator() {
        const sep = document.createElement('div');
        sep.className = 'toolbar-separator';
        return sep;
    }
};

export { toolbar };
