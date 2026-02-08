/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { space } from '../../moto/space.js';
import { api } from '../api.js';

function selectPlane(plane, event) {
    const multiSelect = event && (event.ctrlKey || event.metaKey);

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
        this.hoveredSolidFaceKey = null;
        api.solids?.clearFaceSelection?.();
        api.sketchRuntime?.setSelectedProfiles?.([]);
        api.sketchRuntime?.setHoveredProfile?.(null);

        // Select the new plane
        plane.setSelected(true);
        plane.setHovered(false);
        this.selectedPlanes.add(plane);
    }
    this.updateHandleScreenScales();
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
    this.hoveredSolidFaceKey = null;
    api.solids?.clearFaceSelection?.();
    api.sketchRuntime?.setSelectedProfiles?.([]);
    api.sketchRuntime?.setHoveredProfile?.(null);
    this.clearSketchSelection?.();
    this.cancelSketchLine?.();
    this.setSketchTool?.('select');
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
