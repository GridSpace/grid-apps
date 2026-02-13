/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { api } from '../api.js';
import { properties } from '../properties.js';

const treePlaneHoverState = new WeakMap();

function getPlaneBaseVisible(plane) {
    if (!plane) return true;
    if (typeof plane.getBaseVisible === 'function') {
        return !!plane.getBaseVisible();
    }
    return !!plane.getGroup()?.visible;
}

function isPlaneTreeHovered(plane) {
    return !!treePlaneHoverState.get(plane);
}

function setPlaneTreeHovered(plane, hovered) {
    treePlaneHoverState.set(plane, !!hovered);
}

function applyPlaneTreeVisibility(plane) {
    const baseVisible = getPlaneBaseVisible(plane);
    const hovered = isPlaneTreeHovered(plane);
    const selected = !!api.interact?.selectedPlanes?.has?.(plane);
    const group = plane.getGroup?.();
    if (group) {
        group.visible = baseVisible || hovered || selected;
    }
}

function bindRuntimeChanges() {
    if (this._boundRuntimeChanges) return;
    this._boundRuntimeChanges = true;

    api.datum.onChange(() => this.render());
    for (const plane of api.datum.getPlanes()) {
        plane.onChange(() => this.render());
    }
    api.origin.onChange(() => this.render());
}

function getActiveEditFeatureId() {
    const sketchEditingId = api.sketchRuntime?.editingId || null;
    if (sketchEditingId) return sketchEditingId;
    return properties.currentFeatureId || null;
}

function getActiveEditIndex() {
    const activeId = getActiveEditFeatureId();
    if (!activeId) return -1;
    const features = api.features.list();
    return features.findIndex(feature => feature?.id === activeId);
}

function ensureEditingSketchIsRenderable() {
    const editingId = api.sketchRuntime?.editingId;
    if (!editingId) return;
    const feature = api.features.findById(editingId);
    if (!feature || feature.type !== 'sketch' || feature.suppressed === true || !api.features.isBuilt(editingId)) {
        api.sketchRuntime?.setEditing(null);
        api.interact?.clearSketchSelection?.();
    }
}

function getSolidIdsForFeature(featureId) {
    if (!featureId) return [];
    return (api.solids?.list?.() || [])
        .filter(solid => solid?.source?.feature_id === featureId)
        .map(solid => solid.id)
        .filter(Boolean);
}

function getSketchIdsForSolid(solid) {
    const ids = new Set();
    const add = value => {
        if (value) ids.add(value);
    };
    add(solid?.source?.profile?.sketchId);
    for (const sid of solid?.source?.sketch_ids || []) {
        add(sid);
    }
    add(solid?.provenance?.source?.profile?.sketchId);
    for (const face of solid?.provenance?.faces || []) {
        add(face?.source?.sketchId);
    }
    return ids;
}

function getHoverContext() {
    const hoveredSolidIds = new Set();
    const hoveredSketchIds = new Set();
    const hoveredFeatureIds = new Set();
    const hoveredProfileKey = api.interact?.hoveredSketchProfileKey || null;
    if (hoveredProfileKey) {
        const sketchId = String(hoveredProfileKey).split(':')[0];
        if (sketchId) hoveredSketchIds.add(sketchId);
    }
    const hoveredFaceKey = api.interact?.hoveredSolidFaceKey || null;
    if (hoveredFaceKey) {
        const raw = String(hoveredFaceKey);
        const split = raw.lastIndexOf(':');
        if (split > 0) {
            hoveredSolidIds.add(raw.substring(0, split));
        }
    }
    const hoveredEdgeKey = api.interact?.hoveredSolidEdgeKey || null;
    if (hoveredEdgeKey) {
        const raw = String(hoveredEdgeKey);
        const split = raw.lastIndexOf(':');
        if (split > 0) {
            hoveredSolidIds.add(raw.substring(0, split));
        }
    }
    if (hoveredSolidIds.size) {
        const solids = api.solids?.list?.() || [];
        for (const solidId of hoveredSolidIds) {
            const solid = solids.find(s => s?.id === solidId);
            if (!solid) continue;
            const sourceFeatureId = solid?.source?.feature_id || null;
            if (sourceFeatureId) hoveredFeatureIds.add(sourceFeatureId);
            for (const sketchId of getSketchIdsForSolid(solid)) {
                hoveredSketchIds.add(sketchId);
            }
        }
    }
    return { hoveredSolidIds, hoveredSketchIds, hoveredFeatureIds };
}

function getFaceSelectionContext() {
    const faceKeys = api.solids?.getSelectedFaceKeys?.() || [];
    const edgeKeys = api.solids?.getSelectedEdgeKeys?.() || [];
    const selectedSolidIds = new Set();
    const selectedFeatureIds = new Set();
    for (const key of [...faceKeys, ...edgeKeys]) {
        const raw = String(key || '');
        const split = raw.lastIndexOf(':');
        if (split <= 0) continue;
        const solidId = raw.substring(0, split);
        if (!solidId) continue;
        selectedSolidIds.add(solidId);
    }
    if (selectedSolidIds.size) {
        const solids = api.solids?.list?.() || [];
        for (const solidId of selectedSolidIds) {
            const solid = solids.find(s => s?.id === solidId);
            const featureId = solid?.source?.feature_id || null;
            if (featureId) selectedFeatureIds.add(featureId);
        }
    }
    return { selectedSolidIds, selectedFeatureIds };
}

function render() {
    if (!this.container) return;
    this.container.innerHTML = '';
    this.container.appendChild(this.createSearchHeader({
        value: this.searchQuery || '',
        onInput: event => {
            const value = event?.target?.value || '';
            this.searchQuery = String(value);
            this._searchRestorePending = true;
            this._searchCaret = Number.isFinite(event?.target?.selectionStart) ? event.target.selectionStart : this.searchQuery.length;
            this.render();
        },
        onClear: () => {
            this.searchQuery = '';
            this._searchRestorePending = true;
            this._searchCaret = 0;
            this.render();
        },
        onFocus: () => {}
    }));
    this.container.appendChild(this.createDivider());
    this.renderDefaultGeometrySection();
    this.container.appendChild(this.createDivider());
    this.renderFeaturesSection();
    this.container.appendChild(this.createDivider());
    this.renderSolidsSection();
    if (this._searchRestorePending) {
        const input = this.container.querySelector('.tree-search-input');
        if (input) {
            input.focus();
            const caret = Number.isFinite(this._searchCaret) ? this._searchCaret : String(input.value || '').length;
            input.setSelectionRange(caret, caret);
        }
        this._searchRestorePending = false;
    }
}

function onFeatureSelected(feature) {
    if (!this.selectedFeatureIds) {
        this.selectedFeatureIds = new Set();
    }
    const id = feature?.id || null;
    if (!id) return;
    if (this.selectedFeatureIds.has(id)) {
        this.selectedFeatureIds.delete(id);
    } else {
        this.selectedFeatureIds.add(id);
    }
    this.selectedSolidIds?.clear?.();
    api.solids?.setSelected?.([]);
    this.selectedFeatureId = this.selectedFeatureIds.values().next().value || null;
    api.sketchRuntime?.setEditing(null);
    api.interact?.selectedSketchProfiles?.clear?.();
    api.interact.hoveredSketchProfileKey = null;
    api.sketchRuntime?.setSelectedProfiles?.([]);
    api.sketchRuntime?.setHoveredProfile?.(null);
    const selectedSketchIds = Array.from(this.selectedFeatureIds).filter(fid => api.features.findById(fid)?.type === 'sketch');
    api.sketchRuntime?.setSelected(selectedSketchIds);
    api.interact?.clearSketchSelection?.();
    this.render();
    window.dispatchEvent(new CustomEvent('void-state-change'));
}

function onFeatureEdit(feature) {
    this.selectedFeatureId = null;
    if (!this.selectedFeatureIds) {
        this.selectedFeatureIds = new Set();
    }
    this.selectedFeatureIds.clear();
    if (!this.selectedSolidIds) {
        this.selectedSolidIds = new Set();
    } else {
        this.selectedSolidIds.clear();
    }
    api.interact?.deselectAll?.();
    api.solids?.setSelected?.([]);
    api.solids?.clearFaceSelection?.();
    api.interact?.selectedSketchProfiles?.clear?.();
    api.interact.hoveredSketchProfileKey = null;
    api.sketchRuntime?.setSelectedProfiles?.([]);
    api.sketchRuntime?.setHoveredProfile?.(null);
    api.sketchRuntime?.setSelected([]);
    if (feature?.type === 'sketch') {
        api.sketchRuntime?.setEditing(feature.id);
        api.interact?.clearSketchSelection?.();
        api.interact?.setSketchTool?.('select');
    } else if (feature?.type === 'extrude') {
        api.sketchRuntime?.setEditing(null);
        api.interact?.clearSketchSelection?.();
    } else if (feature?.type === 'boolean') {
        api.sketchRuntime?.setEditing(null);
        api.interact?.clearSketchSelection?.();
    } else {
        api.sketchRuntime?.setEditing(null);
        api.interact?.clearSketchSelection?.();
    }
    properties.showFeature(feature, {
        onChange: () => this.render()
    });
    this.render();
    window.dispatchEvent(new CustomEvent('void-state-change'));
}

function renderDefaultGeometrySection() {
    const datum = api.datum;
    const row = this.createRow({
        label: 'Default Geometry',
        depth: 0,
        expanded: this.defaultGeometryExpanded,
        onToggle: () => {
            this.defaultGeometryExpanded = !this.defaultGeometryExpanded;
            this.render();
        }
    });
    this.container.appendChild(row);

    if (!this.defaultGeometryExpanded) {
        return;
    }

    const geometryRows = [
        { type: 'plane', key: 'xy', fallbackLabel: 'Top' },
        { type: 'plane', key: 'yz', fallbackLabel: 'Right' },
        { type: 'plane', key: 'xz', fallbackLabel: 'Front' },
        { type: 'origin', label: 'Origin' }
    ];

    for (const entry of geometryRows) {
        if (entry.type === 'origin') {
            const visible = api.origin.isVisible();
            const selected = !!api.interact?.selectedPoints?.has?.('origin-point');
            this.container.appendChild(this.createRow({
                label: entry.label,
                depth: 1,
                eyeVisible: visible,
                selected,
                onSelect: () => {
                    api.interact.selectPoint('origin-point', { ctrlKey: true, metaKey: false });
                    this.render();
                },
                onEye: () => {
                    api.origin.setVisible(!visible);
                    this.render();
                }
            }));
            continue;
        }

        const plane = datum.getPlane(entry.key);
        if (!plane) continue;
        applyPlaneTreeVisibility(plane);
        const visible = getPlaneBaseVisible(plane);
        const selected = !!api.interact?.selectedPlanes?.has?.(plane);
        this.container.appendChild(this.createRow({
            label: plane.getLabel() || entry.fallbackLabel,
            depth: 1,
            eyeVisible: visible,
            selected,
            onSelect: () => {
                api.interact.selectPlane(plane, { ctrlKey: true, metaKey: false });
                applyPlaneTreeVisibility(plane);
                this.render();
            },
            onHoverEnter: () => {
                setPlaneTreeHovered(plane, true);
                applyPlaneTreeVisibility(plane);
                plane.setHovered(true);
            },
            onHoverLeave: () => {
                plane.setHovered(false);
                setPlaneTreeHovered(plane, false);
                applyPlaneTreeVisibility(plane);
            },
            onEye: () => {
                const next = !visible;
                plane.setVisible(next);
                applyPlaneTreeVisibility(plane);
                this.render();
            }
        }));
    }
}

function renderFeaturesSection() {
    const hover = getHoverContext();
    const faceSelection = getFaceSelectionContext();
    const row = this.createRow({
        label: 'Features',
        depth: 0,
        expanded: this.featuresExpanded,
        onToggle: () => {
            this.featuresExpanded = !this.featuresExpanded;
            this.render();
        }
    });
    this.container.appendChild(row);

    if (!this.featuresExpanded) {
        return;
    }

    const doc = api.document.current;
    const folders = this.getFolders(doc);
    const allFeatures = api.features.list();
    const needle = String(this.searchQuery || '').trim().toLowerCase();
    const filtering = needle.length > 0;
    const features = filtering
        ? allFeatures.filter(feature => String(feature?.name || feature?.type || 'feature').toLowerCase().includes(needle))
        : allFeatures;
    const featureIds = new Set(allFeatures.map(f => f?.id).filter(Boolean));
    for (const id of Array.from(this.selectedFeatureIds || [])) {
        if (!featureIds.has(id)) {
            this.selectedFeatureIds.delete(id);
        }
    }
    const hasOnlyDefaultFolder = folders.length === 1 && folders[0]?.id === 'features';
    const timelineCount = api.document.getTimelineCount();
    const activeEditIndex = getActiveEditIndex();
    const markerCount = this.timelinePointerDrag ? this.timelineDragTargetCount : timelineCount;
    const setTimeline = async next => {
        const changed = await api.document.setTimelineCount(next);
        if (!changed) return;
        ensureEditingSketchIsRenderable();
        this.render();
        window.dispatchEvent(new CustomEvent('void-state-change'));
    };
    const timelineCountFromPointer = event => {
        const featuresAll = api.features.list();
        if (!featuresAll.length) return 0;
        const el = document.elementFromPoint(event.clientX, event.clientY);
        const row = el?.closest?.('.tree-item-row');
        if (row?.dataset?.featureIndex !== undefined) {
            const index = Number(row.dataset.featureIndex);
            if (Number.isFinite(index)) {
                const rect = row.getBoundingClientRect();
                const before = event.clientY < (rect.top + rect.height / 2);
                return before ? index : index + 1;
            }
        }
        const rows = Array.from(this.container.querySelectorAll('.tree-item-row[data-feature-index]'));
        if (!rows.length) return 0;
        const firstRect = rows[0].getBoundingClientRect();
        const lastRect = rows[rows.length - 1].getBoundingClientRect();
        if (event.clientY < firstRect.top) return 0;
        if (event.clientY > lastRect.bottom) return featuresAll.length;
        return this.timelineDragTargetCount ?? timelineCount;
    };
    const beginTimelinePointerDrag = event => {
        this.timelinePointerDrag = true;
        this.timelineDragTargetCount = timelineCountFromPointer(event);
        const onMove = moveEvent => {
            if (!this.timelinePointerDrag) return;
            const next = timelineCountFromPointer(moveEvent);
            if (next !== this.timelineDragTargetCount) {
                this.timelineDragTargetCount = next;
                this.render();
            }
        };
        const onUp = async upEvent => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            const finalCount = timelineCountFromPointer(upEvent);
            this.timelinePointerDrag = false;
            this.timelineDragTargetCount = null;
            await setTimeline(finalCount);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    };
    const dropMove = (targetFeature, before = true) => {
        const dragId = this.dragFeatureId || null;
        const targetId = targetFeature?.id || null;
        if (!dragId || !targetId || dragId === targetId) return;
        const list = api.features.list();
        const fromIndex = list.findIndex(f => f?.id === dragId);
        const targetIndex = list.findIndex(f => f?.id === targetId);
        if (fromIndex < 0 || targetIndex < 0) return;
        let toIndex = targetIndex + (before ? 0 : 1);
        if (fromIndex < toIndex) {
            toIndex -= 1;
        }
        if (api.features.move(dragId, toIndex)) {
            this.render();
            window.dispatchEvent(new CustomEvent('void-state-change'));
        }
    };

    if (hasOnlyDefaultFolder) {
        if (!features.length) {
            this.container.appendChild(this.createEmptyRow(filtering ? 'No matching features' : 'No features yet', 1));
            return;
        }
        for (let displayIndex = 0; displayIndex < features.length; displayIndex++) {
            const feature = features[displayIndex];
            const index = allFeatures.indexOf(feature);
            if (!filtering && markerCount === index) {
                this.container.appendChild(this.createTimelineMarkerRow({
                    active: true,
                    onSelect: () => setTimeline(index),
                    onPointerStart: beginTimelinePointerDrag
                }));
            }
            const label = feature?.name || feature?.type || 'Feature';
            const isSketch = feature?.type === 'sketch';
            const isExtrude = feature?.type === 'extrude';
            const isChamfer = feature?.type === 'chamfer';
            const isBoolean = feature?.type === 'boolean';
            const visible = feature?.visible !== false;
            const suppressed = feature?.suppressed === true;
            const beyondTimeline = !api.features.isIndexBuilt(index);
            const blockedByEditing = activeEditIndex >= 0 && index > activeEditIndex;
            this.container.appendChild(this.createItemRow(label, feature, 1, {
                featureIndex: index,
                selected: this.selectedFeatureIds?.has?.(feature?.id) || faceSelection.selectedFeatureIds.has(feature?.id),
                hovered: !!(hover.hoveredFeatureIds.has(feature?.id) || (isSketch && hover.hoveredSketchIds.has(feature?.id))),
                eyeVisible: visible,
                suppressed,
                beyondTimeline,
                disabled: blockedByEditing,
                onEye: isSketch ? f => {
                    api.features.setVisible(f.id, f.visible === false);
                    this.render();
                } : null,
                actions: [
                    {
                        label: suppressed ? '▶' : '⏸',
                        title: suppressed ? 'Unsuppress feature' : 'Suppress feature',
                        className: suppressed ? 'is-suppressed' : '',
                        onClick: f => {
                            api.features.setSuppressed(f.id, f.suppressed !== true);
                            ensureEditingSketchIsRenderable();
                            this.render();
                            window.dispatchEvent(new CustomEvent('void-state-change'));
                        }
                    }
                ],
                draggable: true,
                isTimelineDragging: () => false,
                onDragStart: f => {
                    this.dragFeatureId = f?.id || null;
                },
                onDragOver: (_f, event) => {
                    event.preventDefault();
                },
                onDrop: (f, event, info) => {
                    event.preventDefault();
                    dropMove(f, info?.before !== false);
                    this.dragFeatureId = null;
                },
                onDragEnd: () => {
                    this.dragFeatureId = null;
                },
                onSelect: f => this.onFeatureSelected(f),
                onEdit: f => this.onFeatureEdit(f),
                onHoverEnter: f => {
                    if (isSketch) api.sketchRuntime?.setHovered(f.id);
                    if (isExtrude || isChamfer || isBoolean) api.solids?.setHovered?.(getSolidIdsForFeature(f?.id));
                },
                onHoverLeave: () => {
                    if (isSketch) api.sketchRuntime?.setHovered(null);
                    if (isExtrude || isChamfer || isBoolean) api.solids?.setHovered?.([]);
                }
            }));
        }
        if (!filtering && markerCount === allFeatures.length) {
            this.container.appendChild(this.createTimelineMarkerRow({
                active: true,
                onSelect: () => setTimeline(allFeatures.length),
                onPointerStart: beginTimelinePointerDrag
            }));
        }
        return;
    }

    for (let i = 0; i < folders.length; i++) {
        const folder = folders[i];
        this.container.appendChild(this.createRow({
            label: folder.name || 'Folder',
            depth: 1,
            expanded: !folder.collapsed,
            onToggle: () => {
                folder.collapsed = !folder.collapsed;
                api.document.save({
                    kind: 'micro',
                    opType: 'tree.folder.toggle',
                    undoable: false,
                    payload: { folder_id: folder.id, collapsed: !!folder.collapsed }
                });
                this.render();
            }
        }));

        if (folder.collapsed) {
            continue;
        }

        const items = i === 0 ? features : [];
        if (!items.length && i === 0) {
            this.container.appendChild(this.createEmptyRow(filtering ? 'No matching features' : 'No features yet', 2));
        }

        for (let localIndex = 0; localIndex < items.length; localIndex++) {
            const feature = items[localIndex];
            const index = allFeatures.indexOf(feature);
            if (!filtering && i === 0 && markerCount === index) {
                this.container.appendChild(this.createTimelineMarkerRow({
                    active: true,
                    onSelect: () => setTimeline(index),
                    onPointerStart: beginTimelinePointerDrag
                }));
            }
            const label = feature?.name || feature?.type || 'Feature';
            const isSketch = feature?.type === 'sketch';
            const isExtrude = feature?.type === 'extrude';
            const isChamfer = feature?.type === 'chamfer';
            const isBoolean = feature?.type === 'boolean';
            const visible = feature?.visible !== false;
                const suppressed = feature?.suppressed === true;
                const beyondTimeline = !api.features.isIndexBuilt(index);
                const blockedByEditing = activeEditIndex >= 0 && index > activeEditIndex;
                this.container.appendChild(this.createItemRow(label, feature, 2, {
                    featureIndex: index,
                    selected: this.selectedFeatureIds?.has?.(feature?.id) || faceSelection.selectedFeatureIds.has(feature?.id),
                    hovered: !!(hover.hoveredFeatureIds.has(feature?.id) || (isSketch && hover.hoveredSketchIds.has(feature?.id))),
                    eyeVisible: visible,
                    suppressed,
                    beyondTimeline,
                    disabled: blockedByEditing,
                    onEye: isSketch ? f => {
                        api.features.setVisible(f.id, f.visible === false);
                        this.render();
                    } : null,
                actions: [
                    {
                        label: suppressed ? '▶' : '⏸',
                        title: suppressed ? 'Unsuppress feature' : 'Suppress feature',
                        className: suppressed ? 'is-suppressed' : '',
                        onClick: f => {
                            api.features.setSuppressed(f.id, f.suppressed !== true);
                            ensureEditingSketchIsRenderable();
                            this.render();
                            window.dispatchEvent(new CustomEvent('void-state-change'));
                        }
                    }
                ],
                draggable: true,
                isTimelineDragging: () => false,
                onDragStart: f => {
                    this.dragFeatureId = f?.id || null;
                },
                onDragOver: (_f, event) => {
                    event.preventDefault();
                },
                onDrop: (f, event, info) => {
                    event.preventDefault();
                    dropMove(f, info?.before !== false);
                    this.dragFeatureId = null;
                },
                onDragEnd: () => {
                    this.dragFeatureId = null;
                },
                onSelect: f => this.onFeatureSelected(f),
                onEdit: f => this.onFeatureEdit(f),
                onHoverEnter: f => {
                    if (isSketch) api.sketchRuntime?.setHovered(f.id);
                    if (isExtrude || isChamfer || isBoolean) api.solids?.setHovered?.(getSolidIdsForFeature(f?.id));
                },
                onHoverLeave: () => {
                    if (isSketch) api.sketchRuntime?.setHovered(null);
                    if (isExtrude || isChamfer || isBoolean) api.solids?.setHovered?.([]);
                }
            }));
        }
        if (!filtering && i === 0 && items.length && markerCount === allFeatures.length) {
            this.container.appendChild(this.createTimelineMarkerRow({
                active: true,
                onSelect: () => setTimeline(allFeatures.length),
                onPointerStart: beginTimelinePointerDrag
            }));
        }
    }
}

function renderSolidsSection() {
    const hover = getHoverContext();
    const faceSelection = getFaceSelectionContext();
    const row = this.createRow({
        label: 'Solids',
        depth: 0,
        expanded: this.solidsExpanded,
        onToggle: () => {
            this.solidsExpanded = !this.solidsExpanded;
            this.render();
        }
    });
    this.container.appendChild(row);

    if (!this.solidsExpanded) {
        return;
    }

    const needle = String(this.searchQuery || '').trim().toLowerCase();
    const filtering = needle.length > 0;
    const solidsAll = api.solids?.list?.() || [];
    const solids = filtering
        ? solidsAll.filter(solid => String(solid?.name || 'solid').toLowerCase().includes(needle))
        : solidsAll;
    const activeEditIndex = getActiveEditIndex();

    if (!solids.length) {
        this.container.appendChild(this.createEmptyRow(filtering ? 'No matching solids' : 'No solids yet', 1));
        return;
    }

    for (const solid of solids) {
        const label = solid?.name || 'Solid';
        const visible = solid?.visible !== false;
        const sourceFeatureId = solid?.source?.feature_id || null;
        const featureIndex = sourceFeatureId
            ? api.features.list().findIndex(feature => feature?.id === sourceFeatureId)
            : -1;
        const blockedByEditing = activeEditIndex >= 0 && featureIndex > activeEditIndex;
        this.container.appendChild(this.createItemRow(label, solid, 1, {
            selected: this.selectedSolidIds?.has?.(solid?.id) || faceSelection.selectedSolidIds.has(solid?.id),
            hovered: hover.hoveredSolidIds.has(solid?.id),
            eyeVisible: visible,
            disabled: blockedByEditing,
            onEye: item => {
                const doc = api.document.current;
                if (!doc?.generated?.solids) return;
                const target = doc.generated.solids.find(s => s?.id === item?.id);
                if (!target) return;
                target.visible = target.visible === false;
                api.document.save({
                    kind: 'micro',
                    opType: 'solid.update',
                    undoable: false,
                    payload: { id: target.id, field: 'visible', value: !!target.visible }
                });
                api.solids?.syncRuntime?.();
                this.render();
                window.dispatchEvent(new CustomEvent('void-state-change'));
            },
            onSelect: (item, event) => {
                const id = item?.id || null;
                if (!id) return;
                if (!this.selectedSolidIds) this.selectedSolidIds = new Set();
                const currentFeature = properties.currentFeatureId ? api.features.findById(properties.currentFeatureId) : null;
                const editingBoolean = currentFeature?.type === 'boolean' && currentFeature?.id === properties.currentFeatureId;
                const editingExtrude = currentFeature?.type === 'extrude' && currentFeature?.id === properties.currentFeatureId;
                const extrudeOperation = String(currentFeature?.params?.operation || 'new');
                const editingExtrudeTargets = editingExtrude && (extrudeOperation === 'add' || extrudeOperation === 'subtract');
                const multi = editingBoolean || editingExtrudeTargets || !!(event?.ctrlKey || event?.metaKey);
                if (!multi) {
                    if (this.selectedSolidIds.size === 1 && this.selectedSolidIds.has(id)) {
                        this.selectedSolidIds.clear();
                    } else {
                        this.selectedSolidIds.clear();
                        this.selectedSolidIds.add(id);
                    }
                } else if (this.selectedSolidIds.has(id)) {
                    this.selectedSolidIds.delete(id);
                } else {
                    this.selectedSolidIds.add(id);
                }
                if (!editingBoolean && !editingExtrudeTargets) {
                    this.selectedFeatureIds?.clear?.();
                    this.selectedFeatureId = null;
                } else {
                    if (editingBoolean) {
                        const mode = String(currentFeature?.params?.mode || 'add');
                        const role = properties.getBooleanPickRole?.() || 'targets';
                        const input = currentFeature?.input || {};
                        const targets = Array.isArray(input.targets) ? input.targets.filter(Boolean) : [];
                        const tools = Array.isArray(input.tools) ? input.tools.filter(Boolean) : [];
                        let nextTargets = targets.slice();
                        let nextTools = tools.slice();
                        if (mode === 'subtract') {
                            if (role === 'tools') {
                                nextTargets = nextTargets.filter(sid => sid !== id);
                                if (this.selectedSolidIds.has(id)) {
                                    if (!nextTools.includes(id)) nextTools.push(id);
                                } else {
                                    nextTools = nextTools.filter(sid => sid !== id);
                                }
                            } else {
                                nextTools = nextTools.filter(sid => sid !== id);
                                if (this.selectedSolidIds.has(id)) {
                                    if (!nextTargets.includes(id)) nextTargets.push(id);
                                } else {
                                    nextTargets = nextTargets.filter(sid => sid !== id);
                                }
                            }
                        } else {
                            nextTargets = Array.from(this.selectedSolidIds);
                            nextTools = [];
                        }
                        const next = mode === 'subtract'
                            ? Array.from(new Set([...nextTargets, ...nextTools]))
                            : nextTargets.slice();
                        api.features.update(currentFeature.id, feature => {
                            feature.input = feature.input || {};
                            feature.input.targets = nextTargets;
                            feature.input.tools = nextTools;
                        }, {
                            opType: 'feature.update',
                            payload: { field: 'boolean.inputs', targets: nextTargets, tools: nextTools }
                        });
                        this.selectedSolidIds = new Set(next);
                    } else if (editingExtrudeTargets) {
                        const nextTargets = Array.from(this.selectedSolidIds);
                        api.features.update(currentFeature.id, feature => {
                            feature.input = feature.input || {};
                            feature.input.targets = nextTargets;
                        }, {
                            opType: 'feature.update',
                            payload: { field: 'targets', value: nextTargets }
                        });
                        this.selectedSolidIds = new Set(nextTargets);
                    }
                    properties.onChanged?.();
                }
                api.solids?.setSelected?.(Array.from(this.selectedSolidIds));
                this.render();
                window.dispatchEvent(new CustomEvent('void-state-change'));
            },
            onEdit: item => {
                const id = item?.id || null;
                if (!id) return;
                const doc = api.document.current;
                if (!doc?.generated?.solids) return;
                const target = doc.generated.solids.find(s => s?.id === id);
                if (!target) return;
                const next = window.prompt('Rename solid', target.name || 'Solid');
                if (next === null) return;
                const name = String(next || '').trim();
                if (!name || name === target.name) return;
                target.name = name;
                api.document.save({
                    kind: 'micro',
                    opType: 'solid.update',
                    undoable: false,
                    payload: { id: target.id, field: 'name', value: name }
                });
                this.render();
                window.dispatchEvent(new CustomEvent('void-state-change'));
            },
            onHoverEnter: item => {
                const id = item?.id || null;
                if (!id) return;
                api.solids?.setHovered?.([id]);
            },
            onHoverLeave: () => {
                api.solids?.setHovered?.([]);
            }
        }));
    }
}

function getFolders(doc) {
    if (!doc) {
        return [{ id: 'features', name: 'Features', collapsed: false }];
    }
    if (!doc.tree || !Array.isArray(doc.tree.folders) || doc.tree.folders.length === 0) {
        doc.tree = {
            folders: [{ id: 'features', name: 'Features', collapsed: false }]
        };
    }
    return doc.tree.folders;
}

export {
    bindRuntimeChanges,
    render,
    renderDefaultGeometrySection,
    renderFeaturesSection,
    renderSolidsSection,
    getFolders,
    onFeatureSelected,
    onFeatureEdit
};
