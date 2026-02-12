/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { space } from '../../moto/space.js';
import { api } from '../api.js';
import { properties } from '../properties.js';

function selectPlane(plane, event) {
    const multiSelect = event && (event.ctrlKey || event.metaKey);
    const currentFeatureId = properties.currentFeatureId || null;
    const currentFeature = currentFeatureId ? api.features.findById(currentFeatureId) : null;
    const editingSketch = currentFeature?.type === 'sketch' && currentFeature?.id === currentFeatureId;

    if (multiSelect) {
        // Toggle selection with Ctrl/Cmd
        if (this.selectedPlanes.has(plane)) {
            // Already selected - deselect it
            plane.setSelected(false);
            this.selectedPlanes.delete(plane);
        } else {
            // Not selected - add to selection
            plane.setSelected(true);
            plane.setHovered(false);
            this.selectedPlanes.add(plane);
        }
    } else {
        // Single select - deselect all others
        for (const selectedPlane of this.selectedPlanes) {
            if (selectedPlane !== plane) {
                selectedPlane.setSelected(false);
            }
        }
        this.selectedPlanes.clear();
        this.clearSelectedPoints();
        this.selectedSketchProfiles?.clear?.();
        this.selectedSolidFaceKeys?.clear?.();
        this.selectedSolidEdgeKeys?.clear?.();
        this.hoveredSolidFaceKey = null;
        this.hoveredSolidEdgeKey = null;
        api.solids?.clearFaceSelection?.();
        api.solids?.clearEdgeSelection?.();
        api.sketchRuntime?.setSelectedProfiles?.([]);
        api.sketchRuntime?.setHoveredProfile?.(null);

        // Select the new plane
        plane.setSelected(true);
        plane.setHovered(false);
        this.selectedPlanes.add(plane);
    }
    this.updateHandleScreenScales();
    if (editingSketch && plane?.getFrame) {
        const updated = api.features.update(currentFeature.id, feature => {
            const offset = Number(feature?.target?.offset || 0);
            feature.target = feature.target || {};
            feature.target.kind = 'plane';
            feature.target.id = plane.id || null;
            feature.target.name = plane.name || plane.label || 'Plane';
            feature.target.label = plane.label || null;
            feature.target.source = { type: 'plane', id: plane.id || null };
            feature.target.offset = offset;
            const frame = plane.getFrame();
            feature.plane = api.solids?.applyOffsetToFrame?.(frame, offset) || frame;
        }, {
            opType: 'feature.update',
            payload: { field: 'target.plane', id: plane?.id || null }
        });
        if (updated) {
            properties.onChanged?.();
        }
    }
    window.dispatchEvent(new CustomEvent('void-state-change'));
}

function isEventInsideViewport(event) {
    if (!event) return true;
    const { container } = space.internals();
    if (!container) return true;
    const target = event.target;
    if (!target) return true;
    return container.contains(target);
}

function deselectAll() {
    for (const plane of this.selectedPlanes) {
        plane.setSelected(false);
    }
    this.selectedPlanes.clear();

    if (this.hoveredPlane) {
        this.hoveredPlane.setHovered(false);
        this.hoveredPlane = null;
    }
    this.setHoveredPoint(null);
    this.clearSelectedPoints();
    this.selectedSketchProfiles?.clear?.();
    this.hoveredSketchProfileKey = null;
    this.selectedSolidFaceKeys?.clear?.();
    this.selectedSolidEdgeKeys?.clear?.();
    this.hoveredSolidFaceKey = null;
    this.hoveredSolidEdgeKey = null;
    api.solids?.clearFaceSelection?.();
    api.solids?.clearEdgeSelection?.();
    api.sketchRuntime?.setSelectedProfiles?.([]);
    api.sketchRuntime?.setHoveredProfile?.(null);
    this.clearSketchSelection?.();
    this.cancelSketchLine?.();
    this.stopSketchMirrorMode?.();
    this.stopSketchCircularPatternMode?.();
    this.stopSketchGridPatternMode?.();
    this.setSketchTool?.('select');
    this.sketchPointerDown = null;
    this.sketchDrag = null;
    if (api?.sketchRuntime) {
        api.sketchRuntime._glyphDrag = null;
    }
    this.updateHandleScreenScales();
    window.dispatchEvent(new CustomEvent('void-clear-selection'));
    window.dispatchEvent(new CustomEvent('void-state-change'));
}

function getSelected() {
    return this.selectedPlanes;
}

function isSelected(plane) {
    return this.selectedPlanes.has(plane);
}

export {
    selectPlane,
    isEventInsideViewport,
    deselectAll,
    getSelected,
    isSelected
};
