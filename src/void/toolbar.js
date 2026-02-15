/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { $ } from '../moto/webui.js';
import { api } from './api.js';
import { tree } from './tree.js';
import { space } from '../moto/space.js';
import { properties } from './properties.js';
import { encode as objEncode } from '../load/obj.js';
import { encodeASCII as stlEncodeASCII } from '../load/stl.js';
import { encode as tmfEncode } from '../load/3mf.js';
import { meshToSTEPWithFaces } from '../load/step.js';
import { JSZip } from '../ext/jszip-esm.js';

const toolbar = {
    buttons: [],
    cameraToggleBtn: null,
    sketchBtn: null,
    extrudeBtn: null,
    chamferBtn: null,
    booleanBtn: null,
    sketchToolButtons: null,
    sketchToolMenus: null,
    sketchToolMenuItems: null,
    sketchConstraintButtons: null,
    sketchConstraintMenu: null,
    sketchEditGroupEl: null,
    solidOpsGroupEl: null,
    docNameEl: null,
    openDialogEl: null,
    openDialogListEl: null,
    hotkeysDialogEl: null,
    preferencesDialogEl: null,
    preferencesInputs: null,
    preferencesState: null,
    exportDialogEl: null,
    exportDialogInfoEl: null,
    exportFilenameEl: null,
    exportStlZipEl: null,
    preferencesStorageKey: 'void_preferences',
    preferencesAdminKey: 'preferences',

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
        const sketchEditGroup = document.createElement('div');
        sketchEditGroup.className = 'toolbar-mode-group toolbar-mode-group-sketch';
        this.sketchEditGroupEl = sketchEditGroup;
        container.appendChild(sketchEditGroup);

        this.sketchToolButtons = {
            point: this.addButton(sketchEditGroup, 'Point', () => {
                const current = api.interact.getSketchTool?.() || 'select';
                api.interact.setSketchTool(current === 'point' ? 'select' : 'point');
            }),
            line: this.addButton(sketchEditGroup, 'Line', () => {
                const current = api.interact.getSketchTool?.() || 'select';
                api.interact.setSketchTool(current === 'line' ? 'select' : 'line');
            })
        };
        const arcMenu = this.addMenu(sketchEditGroup, 'Arc', [
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
        const circleMenu = this.addMenu(sketchEditGroup, 'Circle', [
            { key: 'circle-center', label: 'Center Point Circle', onClick: () => {
                api.interact.setSketchTool('circle-center');
            } },
            { key: 'circle-3pt', label: '3 Point Circle', onClick: () => {
                api.interact.setSketchTool('circle-3pt');
            } }
        ]);
        const rectMenu = this.addMenu(sketchEditGroup, 'Rect', [
            { key: 'rect', label: 'Corner Rect', onClick: () => {
                api.interact.setSketchTool('rect');
            } },
            { key: 'rect-center', label: 'Center Rect', onClick: () => {
                api.interact.setSketchTool('rect-center');
            } }
        ]);
        const polyMenu = this.addMenu(sketchEditGroup, 'Polygon', [
            { key: 'inscribed', label: 'Inscribed', onClick: () => {
                api.interact.createSketchPolygonFromSelectedCircle?.('inscribed');
            } },
            { key: 'circumscribed', label: 'Circumscribed', onClick: () => {
                api.interact.createSketchPolygonFromSelectedCircle?.('circumscribed');
            } }
        ]);
        const patternMenu = this.addMenu(sketchEditGroup, 'Pattern', [
            { key: 'mirror', label: 'Mirror', onClick: () => api.interact.startSketchMirrorMode?.() },
            { key: 'circular', label: 'Circular', onClick: () => api.interact.startSketchCircularPatternMode?.() },
            { key: 'grid', label: 'Grid', onClick: () => api.interact.startSketchGridPatternMode?.() }
        ]);
        this.sketchToolMenus = {
            arc: arcMenu,
            circle: circleMenu,
            rect: rectMenu,
            polygon: polyMenu,
            pattern: patternMenu
        };
        this.sketchToolMenuItems = {
            ...arcMenu.items,
            ...circleMenu.items,
            ...rectMenu.items,
            ...polyMenu.items,
            ...patternMenu.items
        };
        this.sketchConstraintMenu = this.addMenu(sketchEditGroup, 'Constraints', [
            { key: 'horizontal', label: 'Horizontal', onClick: () => api.interact.applySketchConstraint?.('horizontal') },
            { key: 'vertical', label: 'Vertical', onClick: () => api.interact.applySketchConstraint?.('vertical') },
            { key: 'perpendicular', label: 'Perpendicular', onClick: () => api.interact.applySketchConstraint?.('perpendicular') },
            { key: 'equal', label: 'Equal', onClick: () => api.interact.applySketchConstraint?.('equal') },
            { key: 'collinear', label: 'Collinear', onClick: () => api.interact.applySketchConstraint?.('collinear') },
            { key: 'dimension', label: 'Dimension', onClick: () => api.interact.applySketchConstraint?.('dimension') },
            { key: 'min-distance', label: 'Min Distance', onClick: () => api.interact.applySketchConstraint?.('min_distance') },
            { key: 'max-distance', label: 'Max Distance', onClick: () => api.interact.applySketchConstraint?.('max_distance') },
            { key: 'tangent', label: 'Tangent', onClick: () => api.interact.applySketchConstraint?.('tangent') },
            { key: 'midpoint', label: 'Midpoint', onClick: () => api.interact.applySketchConstraint?.('midpoint') },
            { key: 'coincident', label: 'Coincident', onClick: () => api.interact.applySketchConstraint?.('coincident') },
            { key: 'fixed', label: 'Fixed', onClick: () => api.interact.applySketchConstraint?.('fixed') }
        ]);
        this.sketchConstraintButtons = this.sketchConstraintMenu.items;
        sketchEditGroup.appendChild(this.separator());

        const solidOpsGroup = document.createElement('div');
        solidOpsGroup.className = 'toolbar-mode-group toolbar-mode-group-solid';
        this.solidOpsGroupEl = solidOpsGroup;
        container.appendChild(solidOpsGroup);

        this.extrudeBtn = this.addButton(solidOpsGroup, 'Extrude', () => {
            this.onExtrudeButton();
        }, { id: 'btn-extrude', disabled: true });
        this.chamferBtn = this.addButton(solidOpsGroup, 'Chamfer', () => {
            this.onChamferButton();
        }, { id: 'btn-chamfer', disabled: true });
        this.booleanBtn = this.addButton(solidOpsGroup, 'Boolean', () => {
            this.onBooleanButton();
        }, { id: 'btn-boolean', disabled: true });
        solidOpsGroup.appendChild(this.separator());

        // View tools
        this.addMenu(container, 'View', [
            { key: 'fit', label: 'Fit', onClick: () => space.view.fit(null, { tween: true }) },
            { key: 'top', label: 'Top', onClick: () => space.view.top() },
            { key: 'bottom', label: 'Bottom', onClick: () => space.view.bottom() },
            { key: 'front', label: 'Front', onClick: () => space.view.front() },
            { key: 'back', label: 'Back', onClick: () => space.view.back() },
            { key: 'right', label: 'Right', onClick: () => space.view.right() },
            { key: 'left', label: 'Left', onClick: () => space.view.left() }
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
        this.addButton(container, '⚙', () => {
            this.togglePreferencesDialog();
        }, { id: 'btn-preferences' });
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
        this.buildPreferencesDialog();
        this.buildHotkeysDialog();
        this.updateDocumentTitle();
        this.updateSketchControls();
        this.loadPreferences();
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
                this.hidePreferencesDialog();
            }
        });

        console.log({ toolbar_built: true });
    },

    updateSketchControls() {
        const editing = !!api.sketchRuntime?.editingId;
        const canCreate = !editing && !!api.interact.resolveSketchTargetFromSelection();
        const canExtrude = (this.getSelectedExtrudeTargets().length > 0) || (!editing && !!this.getSelectedSolidSourceExtrudeFeature());
        const canChamfer = !editing && (this.getSelectedChamferEdges().length > 0 || !!this.getSelectedSolidSourceChamferFeature());
        const canBoolean = !editing && (this.getSelectedBooleanTargets().length >= 2 || !!this.getSelectedSolidSourceBooleanFeature());

        if (this.sketchBtn) {
            this.sketchBtn.disabled = !canCreate;
            this.sketchBtn.classList.toggle('active', canCreate && !editing);
        }
        if (this.sketchEditGroupEl) {
            this.sketchEditGroupEl.classList.toggle('hidden', !editing);
        }
        if (this.solidOpsGroupEl) {
            this.solidOpsGroupEl.classList.toggle('hidden', editing);
        }
        if (this.extrudeBtn) {
            this.extrudeBtn.disabled = !canExtrude;
        }
        if (this.chamferBtn) {
            this.chamferBtn.disabled = !canChamfer;
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
        if (this.sketchToolMenus) {
            for (const menu of Object.values(this.sketchToolMenus)) {
                if (!menu?.trigger) continue;
                menu.trigger.disabled = !editing;
            }
        }
        if (this.sketchToolMenuItems) {
            const toolKeys = ['arc-3pt', 'arc-center', 'arc-tangent', 'circle-center', 'circle-3pt', 'rect', 'rect-center', 'inscribed', 'circumscribed', 'mirror', 'circular', 'grid'];
            for (const key of toolKeys) {
                const btn = this.sketchToolMenuItems[key];
                if (!btn) continue;
                btn.disabled = !editing;
                btn.classList.toggle('active', editing && key === tool);
                if (key === 'inscribed' || key === 'circumscribed') {
                    btn.classList.remove('active');
                }
                if (key === 'mirror') {
                    btn.classList.toggle('active', editing && !!api.interact?.sketchMirrorMode);
                }
                if (key === 'circular') {
                    btn.classList.toggle('active', editing && !!api.interact?.sketchCircularPatternMode);
                }
                if (key === 'grid') {
                    btn.classList.toggle('active', editing && !!api.interact?.sketchGridPatternMode);
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
            out.push({
                region_id: `profile:${sketchId}:${profileId}`
            });
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

    getSelectedChamferEdges() {
        const keys = api.solids?.getSelectedEdgeKeys?.() || [];
        const normalized = [];
        const seen = new Set();
        for (const key of keys) {
            const promoted = api.solids?.getPromotedLoopEdgeKeyForSelection?.(key) || key;
            const k = String(promoted || '').trim();
            if (!k || seen.has(k)) continue;
            seen.add(k);
            normalized.push(k);
        }
        return normalized.map(key => {
            const edge = api.solids?.getEdgeByKey?.(key);
            if (!edge) return null;
            const edgeEntity = api.solids?.resolveCanonicalEdgeEntity?.(key) || null;
            const boundarySegmentId = String(edgeEntity?.id || '');
            if (!boundarySegmentId) return null;
            const out = {
                key,
                boundary_segment_id: boundarySegmentId,
                entity: {
                    kind: String(edgeEntity?.kind || 'boundary-segment'),
                    id: boundarySegmentId
                },
                solidId: edge.solidId,
                edgeIndex: edge.index,
                meshEdgeKey: edge.meshEdgeKey || null
            };
            if (Array.isArray(edge?.meshEdgeKeys) && edge.meshEdgeKeys.length) {
                out.meshEdgeKeys = edge.meshEdgeKeys.slice();
            }
            if (Array.isArray(edge?.pathWorld) && edge.pathWorld.length >= 2) {
                out.path = edge.pathWorld.map(p => ({
                    x: Number(p?.x || 0),
                    y: Number(p?.y || 0),
                    z: Number(p?.z || 0)
                }));
            }
            return out;
        }).filter(Boolean);
    },

    createChamferFeatureFromSelection() {
        const edges = this.getSelectedChamferEdges();
        if (!edges.length) return null;
        const doc = api.document.current;
        if (!doc) return null;
        const chamferCount = (doc.features || []).filter(f => f?.type === 'chamfer').length;
        const id = (typeof crypto !== 'undefined' && crypto.randomUUID)
            ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
            : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
        const feature = {
            id,
            type: 'chamfer',
            name: `Chamfer ${chamferCount + 1}`,
            created_at: Date.now(),
            suppressed: false,
            visible: true,
            input: {
                edges
            },
            params: {
                distance: 1,
                showCutters: false
            },
            result: null
        };
        api.features.add(feature);
        tree.selectedFeatureId = feature.id;
        tree.selectedFeatureIds = new Set([feature.id]);
        tree.selectedSolidIds = new Set();
        properties.showFeature(feature, {
            onChange: () => tree.render()
        });
        tree.render();
        window.dispatchEvent(new CustomEvent('void-state-change'));
        return feature;
    },

    getSelectedSolidSourceChamferFeature() {
        const solidIds = Array.from(tree.selectedSolidIds || []);
        if (solidIds.length !== 1) return null;
        const solidId = solidIds[0];
        const solid = (api.solids?.list?.() || []).find(item => item?.id === solidId);
        const sourceFeatureId = solid?.source?.feature_id || null;
        if (!sourceFeatureId) return null;
        const feature = api.features.findById(sourceFeatureId);
        if (!feature || feature.type !== 'chamfer') return null;
        return feature;
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
                : [];
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

    onChamferButton() {
        const existing = this.getSelectedSolidSourceChamferFeature();
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
        this.createChamferFeatureFromSelection();
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
        document.title = `${name} | Void:Form`;
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
        dialog.className = 'doc-dialog export-dialog';

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
        stlZipText.textContent = 'zip with file per solid';
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
                    const one = stlEncodeASCII([rec], rec?.file || rec?.id || 'solid');
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
                const data = stlEncodeASCII(recs, api.document.current?.name || 'void-export');
                this.downloadExport(data, filename, 'text/plain;charset=utf-8');
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
                    { key: 'F', desc: 'Fit visible elements' },
                    { key: 'Ctrl/Cmd+Z', desc: 'Undo' },
                    { key: 'Ctrl/Cmd+Y', desc: 'Redo' },
                    { key: 'Shift+Ctrl/Cmd+Z', desc: 'Redo' }
                ]
            },
            {
                title: 'Sketch Tools',
                items: [
                    { key: 'L', desc: 'Toggle line tool' },
                    { key: 'A', desc: 'Toggle 3 point arc tool' },
                    { key: 'C', desc: 'Toggle center point circle tool' },
                    { key: 'G', desc: 'Toggle corner rectangle tool' },
                    { key: 'R', desc: 'Toggle center rectangle tool' },
                    { key: 'Shift+S', desc: 'Toggle point tool' },
                    { key: 'U', desc: 'Use (project/convert) hovered/selected references' },
                    { key: 'Q', desc: 'Toggle construction on selected lines/arcs' },
                    { key: 'Esc', desc: 'Cancel line mode / close dialogs' }
                ]
            },
            {
                title: 'Sketch Constraints',
                items: [
                    { key: 'H', desc: 'Horizontal constraint (selected line(s))' },
                    { key: 'V', desc: 'Vertical constraint (selected line(s) or points)' },
                    { key: 'Shift+L', desc: 'Perpendicular (exactly 2 selected lines)' },
                    { key: 'E', desc: 'Equal length (selected line pair/group)' },
                    { key: 'D', desc: 'Dimension (1 line or 2 points)' },
                    { key: '(Menu)', desc: 'Min distance (circle/arc to point or line)' },
                    { key: '(Menu)', desc: 'Max distance (circle/arc to point or line)' },
                    { key: 'T', desc: 'Tangent (line+arc/circle or arc/circle pair)' },
                    { key: 'I', desc: 'Coincident (points, point-line, point-arc, center-point)' },
                    { key: 'Shift+M', desc: 'Midpoint' },
                    { key: 'Shift+J', desc: 'Fixed (selected point(s))' },
                    { key: 'M', desc: 'Toggle mirror mode (requires one selected line axis)' },
                    { key: '(Menu)', desc: 'Circular pattern mode (requires one selected center point)' }
                ]
            },
            {
                title: 'Sketch Selection',
                items: [
                    { key: 'Delete/Backspace', desc: 'Delete selected sketch entities/constraints' }
                ]
            },
            {
                title: 'Reserved (Not Yet Implemented)',
                items: [
                    { key: 'Shift+O', desc: 'Concentric' },
                    { key: 'Shift+U', desc: 'Curvature' },
                    { key: 'X', desc: 'Extend' },
                    { key: 'Shift+A', desc: 'Line/arc create-mode toggle' },
                    { key: 'Shift+K', desc: 'Normal constraint' },
                    { key: 'O', desc: 'Offset' },
                    { key: 'B', desc: 'Parallel' },
                    { key: 'Shift+G', desc: 'Pierce' },
                    { key: 'Shift+F', desc: 'Sketch fillet' },
                    { key: '(TBD)', desc: 'Symmetric' },
                    { key: '(TBD)', desc: 'Trim' }
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

    getDefaultPreferences() {
        return {
            edgeLoopPromotionSegments: 10,
            edgeHoverLineWidth: 2.5,
            edgeSelectedLineWidth: 3.25,
            sketchArcSegmentLength: 2.5,
            fitPaddingPerspective: 0.5,
            fitPaddingOrthographic: 0.9
        };
    },

    normalizePreferences(raw = {}) {
        const d = this.getDefaultPreferences();
        return {
            edgeLoopPromotionSegments: Math.max(3, Math.round(Number(raw.edgeLoopPromotionSegments ?? d.edgeLoopPromotionSegments) || d.edgeLoopPromotionSegments)),
            edgeHoverLineWidth: Math.max(0.5, Number(raw.edgeHoverLineWidth ?? d.edgeHoverLineWidth) || d.edgeHoverLineWidth),
            edgeSelectedLineWidth: Math.max(0.5, Number(raw.edgeSelectedLineWidth ?? d.edgeSelectedLineWidth) || d.edgeSelectedLineWidth),
            sketchArcSegmentLength: Math.max(
                0.05,
                Number(raw.sketchArcSegmentLength ?? raw.sketchArcSegments ?? d.sketchArcSegmentLength) || d.sketchArcSegmentLength
            ),
            fitPaddingPerspective: Math.max(0.01, Number(raw.fitPaddingPerspective ?? d.fitPaddingPerspective) || d.fitPaddingPerspective),
            fitPaddingOrthographic: Math.max(0.01, Number(raw.fitPaddingOrthographic ?? d.fitPaddingOrthographic) || d.fitPaddingOrthographic)
        };
    },

    async loadPreferences() {
        const fallback = this.getDefaultPreferences();
        let next = null;
        try {
            const raw = localStorage.getItem(this.preferencesStorageKey);
            if (raw) {
                next = JSON.parse(raw);
            }
        } catch {}
        try {
            const fromDb = await api.db?.admin?.get?.(this.preferencesAdminKey);
            if (fromDb && typeof fromDb === 'object') {
                next = { ...(next || {}), ...fromDb };
            }
        } catch {}
        this.applyPreferences(next || fallback, { persist: false, updateFields: true });
    },

    async savePreferences(next = {}) {
        const prefs = this.normalizePreferences(next);
        try {
            localStorage.setItem(this.preferencesStorageKey, JSON.stringify(prefs));
        } catch {}
        try {
            await api.db?.admin?.put?.(this.preferencesAdminKey, prefs);
        } catch {}
    },

    applyPreferences(next = {}, options = {}) {
        const prefs = this.normalizePreferences(next);
        this.preferencesState = prefs;
        api.solids?.setRenderPreferences?.({
            edgeLoopPromotionSegments: prefs.edgeLoopPromotionSegments,
            edgeHoverLineWidth: prefs.edgeHoverLineWidth,
            edgeSelectedLineWidth: prefs.edgeSelectedLineWidth
        });
        api.sketchRuntime?.setRenderPreferences?.({
            arcSegmentLength: prefs.sketchArcSegmentLength
        });
        space.view.setFitPadding({
            perspective: prefs.fitPaddingPerspective,
            orthographic: prefs.fitPaddingOrthographic
        });
        if (options.updateFields !== false) {
            this.syncPreferencesFields();
        }
        if (options.persist !== false) {
            this.savePreferences(prefs);
        }
    },

    syncPreferencesFields() {
        const prefs = this.preferencesState || this.getDefaultPreferences();
        const inputs = this.preferencesInputs || {};
        if (inputs.edgeLoopPromotionSegments) inputs.edgeLoopPromotionSegments.value = String(prefs.edgeLoopPromotionSegments);
        if (inputs.edgeHoverLineWidth) inputs.edgeHoverLineWidth.value = String(prefs.edgeHoverLineWidth);
        if (inputs.edgeSelectedLineWidth) inputs.edgeSelectedLineWidth.value = String(prefs.edgeSelectedLineWidth);
        if (inputs.sketchArcSegmentLength) inputs.sketchArcSegmentLength.value = String(prefs.sketchArcSegmentLength);
        if (inputs.fitPaddingPerspective) inputs.fitPaddingPerspective.value = String(prefs.fitPaddingPerspective);
        if (inputs.fitPaddingOrthographic) inputs.fitPaddingOrthographic.value = String(prefs.fitPaddingOrthographic);
    },

    buildPreferencesDialog() {
        if (this.preferencesDialogEl) return;
        const backdrop = document.createElement('div');
        backdrop.className = 'doc-dialog-backdrop hidden';

        const dialog = document.createElement('div');
        dialog.className = 'doc-dialog preferences-dialog';

        const header = document.createElement('div');
        header.className = 'doc-dialog-header';
        header.textContent = 'Preferences';

        const list = document.createElement('div');
        list.className = 'doc-dialog-list';

        const makeNumberRow = (label, key, step = '1', help = '') => {
            const row = document.createElement('div');
            row.className = 'doc-dialog-row prefs-row';
            const name = document.createElement('div');
            name.className = 'doc-dialog-name';
            name.textContent = label;
            if (help) {
                name.title = help;
                row.title = help;
            }
            const input = document.createElement('input');
            input.type = 'number';
            input.step = String(step);
            input.className = 'prefs-input';
            if (help) {
                input.title = help;
            }
            row.appendChild(name);
            row.appendChild(input);
            list.appendChild(row);
            this.preferencesInputs = this.preferencesInputs || {};
            this.preferencesInputs[key] = input;
        };

        makeNumberRow(
            'Edge Loop Promotion Segments',
            'edgeLoopPromotionSegments',
            '1',
            'Controls when a face boundary should be treated as one continuous edge loop instead of individual edge segments. Higher values reduce accidental full-loop picks on simple polygon faces.'
        );
        makeNumberRow(
            'Edge Hover Line Width',
            'edgeHoverLineWidth',
            '0.1',
            'Screen-space thickness (pixels) for hovered solid edges. Increase for easier visibility while inspecting dense geometry.'
        );
        makeNumberRow(
            'Edge Selected Line Width',
            'edgeSelectedLineWidth',
            '0.1',
            'Screen-space thickness (pixels) for selected solid edges. Typically slightly larger than hover for stronger feedback.'
        );
        makeNumberRow(
            'Sketch Arc Segment Length',
            'sketchArcSegmentLength',
            '0.05',
            'Target segment length (in sketch units) used to tessellate arcs/circles. Lower values increase smoothness at higher cost.'
        );
        makeNumberRow(
            'Fit Padding (Perspective)',
            'fitPaddingPerspective',
            '0.01',
            'Extra margin used by Fit view in perspective mode. Lower values fit tighter; higher values leave more border.'
        );
        makeNumberRow(
            'Fit Padding (Orthographic)',
            'fitPaddingOrthographic',
            '0.01',
            'Extra margin used by Fit view in orthographic mode. Tune this separately from perspective for CAD-like framing.'
        );
        const actions = document.createElement('div');
        actions.className = 'doc-dialog-actions';
        const defaultsBtn = this.addButton(actions, 'Defaults', () => {
            this.applyPreferences(this.getDefaultPreferences(), { persist: true, updateFields: true });
        });
        defaultsBtn.classList.add('compact');
        const applyBtn = this.addButton(actions, 'Apply', () => {
            this.applyPreferences({
                edgeLoopPromotionSegments: Number(this.preferencesInputs?.edgeLoopPromotionSegments?.value),
                edgeHoverLineWidth: Number(this.preferencesInputs?.edgeHoverLineWidth?.value),
                edgeSelectedLineWidth: Number(this.preferencesInputs?.edgeSelectedLineWidth?.value),
                sketchArcSegmentLength: Number(this.preferencesInputs?.sketchArcSegmentLength?.value),
                fitPaddingPerspective: Number(this.preferencesInputs?.fitPaddingPerspective?.value),
                fitPaddingOrthographic: Number(this.preferencesInputs?.fitPaddingOrthographic?.value)
            }, { persist: true, updateFields: true });
        });
        applyBtn.classList.add('compact');
        const closeBtn = this.addButton(actions, 'Close', () => {
            this.hidePreferencesDialog();
        });
        closeBtn.classList.add('compact');

        dialog.appendChild(header);
        dialog.appendChild(list);
        dialog.appendChild(actions);
        backdrop.appendChild(dialog);
        document.body.appendChild(backdrop);

        backdrop.addEventListener('click', event => {
            if (event.target === backdrop) {
                this.hidePreferencesDialog();
            }
        });

        this.preferencesDialogEl = backdrop;
        this.preferencesState = this.getDefaultPreferences();
        this.syncPreferencesFields();
    },

    togglePreferencesDialog() {
        if (!this.preferencesDialogEl) {
            this.buildPreferencesDialog();
        }
        this.preferencesDialogEl.classList.toggle('hidden');
        if (!this.preferencesDialogEl.classList.contains('hidden')) {
            this.syncPreferencesFields();
        }
    },

    hidePreferencesDialog() {
        if (this.preferencesDialogEl) {
            this.preferencesDialogEl.classList.add('hidden');
        }
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
                // Prevent :focus-within from pinning the hover menu open after click.
                item.blur();
                trigger.blur();
            };
            panel.appendChild(item);
            if (entry.key) {
                items[entry.key] = item;
            }
        }

        menu.addEventListener('mouseleave', () => {
            // Ensure hover menus dismiss when pointer exits after click selection.
            trigger.blur();
            if (document.activeElement && panel.contains(document.activeElement)) {
                document.activeElement.blur();
            }
        });

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
