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

function ensureEditingSketchIsRenderable() {
    const editingId = api.sketchRuntime?.editingId;
    if (!editingId) return;
    const feature = api.features.findById(editingId);
    if (!feature || feature.type !== 'sketch' || feature.suppressed === true || !api.features.isBuilt(editingId)) {
        api.sketchRuntime?.setEditing(null);
        api.interact?.clearSketchSelection?.();
    }
}

function render() {
    if (!this.container) return;
    this.container.innerHTML = '';

    this.container.appendChild(this.createHeader('Model'));
    this.renderDefaultGeometrySection();
    this.container.appendChild(this.createDivider());
    this.renderFeaturesSection();
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
    this.selectedFeatureId = feature?.id || null;
    if (!this.selectedFeatureIds) {
        this.selectedFeatureIds = new Set();
    }
    this.selectedFeatureIds.clear();
    if (feature?.id) {
        this.selectedFeatureIds.add(feature.id);
    }
    const selectedSketchIds = feature?.type === 'sketch' ? [feature.id] : [];
    api.interact?.selectedSketchProfiles?.clear?.();
    api.interact.hoveredSketchProfileKey = null;
    api.sketchRuntime?.setSelectedProfiles?.([]);
    api.sketchRuntime?.setHoveredProfile?.(null);
    api.sketchRuntime?.setSelected(selectedSketchIds);
    if (feature?.type === 'sketch') {
        api.sketchRuntime?.setEditing(feature.id);
        api.interact?.clearSketchSelection?.();
        api.interact?.setSketchTool?.('select');
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
    const features = api.features.list();
    const featureIds = new Set(features.map(f => f?.id).filter(Boolean));
    for (const id of Array.from(this.selectedFeatureIds || [])) {
        if (!featureIds.has(id)) {
            this.selectedFeatureIds.delete(id);
        }
    }
    const hasOnlyDefaultFolder = folders.length === 1 && folders[0]?.id === 'features';
    const timelineCount = api.document.getTimelineCount();
    const setTimeline = async next => {
        const changed = await api.document.setTimelineCount(next);
        if (!changed) return;
        ensureEditingSketchIsRenderable();
        this.render();
        window.dispatchEvent(new CustomEvent('void-state-change'));
    };

    if (hasOnlyDefaultFolder) {
        if (!features.length) {
            this.container.appendChild(this.createEmptyRow('No features yet', 1));
            return;
        }
        for (let index = 0; index < features.length; index++) {
            const feature = features[index];
            this.container.appendChild(this.createTimelineMarkerRow({
                active: timelineCount === index,
                onSelect: () => setTimeline(index)
            }));
            const label = feature?.name || feature?.type || 'Feature';
            const isSketch = feature?.type === 'sketch';
            const visible = feature?.visible !== false;
            const suppressed = feature?.suppressed === true;
            const beyondTimeline = !api.features.isIndexBuilt(index);
            this.container.appendChild(this.createItemRow(label, feature, 1, {
                selected: this.selectedFeatureIds?.has?.(feature?.id),
                eyeVisible: visible,
                suppressed,
                beyondTimeline,
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
                    },
                    {
                        label: '↑',
                        title: 'Move feature earlier',
                        disabled: index <= 0,
                        onClick: f => {
                            if (api.features.move(f.id, index - 1)) {
                                this.render();
                                window.dispatchEvent(new CustomEvent('void-state-change'));
                            }
                        }
                    },
                    {
                        label: '↓',
                        title: 'Move feature later',
                        disabled: index >= features.length - 1,
                        onClick: f => {
                            if (api.features.move(f.id, index + 1)) {
                                this.render();
                                window.dispatchEvent(new CustomEvent('void-state-change'));
                            }
                        }
                    }
                ],
                onSelect: f => this.onFeatureSelected(f),
                onEdit: f => this.onFeatureEdit(f),
                onHoverEnter: isSketch ? f => api.sketchRuntime?.setHovered(f.id) : null,
                onHoverLeave: isSketch ? () => api.sketchRuntime?.setHovered(null) : null
            }));
        }
        this.container.appendChild(this.createTimelineMarkerRow({
            active: timelineCount === features.length,
            onSelect: () => setTimeline(features.length)
        }));
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
            this.container.appendChild(this.createEmptyRow('No features yet', 2));
        }

        for (let localIndex = 0; localIndex < items.length; localIndex++) {
            const feature = items[localIndex];
            const index = features.indexOf(feature);
            if (i === 0) {
                this.container.appendChild(this.createTimelineMarkerRow({
                    active: timelineCount === index,
                    onSelect: () => setTimeline(index)
                }));
            }
            const label = feature?.name || feature?.type || 'Feature';
            const isSketch = feature?.type === 'sketch';
            const visible = feature?.visible !== false;
            const suppressed = feature?.suppressed === true;
            const beyondTimeline = !api.features.isIndexBuilt(index);
            this.container.appendChild(this.createItemRow(label, feature, 2, {
                selected: this.selectedFeatureIds?.has?.(feature?.id),
                eyeVisible: visible,
                suppressed,
                beyondTimeline,
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
                    },
                    {
                        label: '↑',
                        title: 'Move feature earlier',
                        disabled: index <= 0,
                        onClick: f => {
                            if (api.features.move(f.id, index - 1)) {
                                this.render();
                                window.dispatchEvent(new CustomEvent('void-state-change'));
                            }
                        }
                    },
                    {
                        label: '↓',
                        title: 'Move feature later',
                        disabled: index >= features.length - 1,
                        onClick: f => {
                            if (api.features.move(f.id, index + 1)) {
                                this.render();
                                window.dispatchEvent(new CustomEvent('void-state-change'));
                            }
                        }
                    }
                ],
                onSelect: f => this.onFeatureSelected(f),
                onEdit: f => this.onFeatureEdit(f),
                onHoverEnter: isSketch ? f => api.sketchRuntime?.setHovered(f.id) : null,
                onHoverLeave: isSketch ? () => api.sketchRuntime?.setHovered(null) : null
            }));
        }
        if (i === 0 && items.length) {
            this.container.appendChild(this.createTimelineMarkerRow({
                active: timelineCount === features.length,
                onSelect: () => setTimeline(features.length)
            }));
        }
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
    getFolders,
    onFeatureSelected,
    onFeatureEdit
};
