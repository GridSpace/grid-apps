/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { space } from '../../moto/space.js';
import { overlay } from '../overlay.js';
import { api } from '../api.js';

function getPointHitFromEvent(event) {
    if (!event || !overlay?.elements) {
        return null;
    }

    const { container } = space.internals();
    if (!container) {
        return null;
    }

    const rect = container.getBoundingClientRect();
    const ex = event.clientX - rect.left;
    const ey = event.clientY - rect.top;

    let best = null;
    for (const id of this.pointIds) {
        const item = overlay.elements.get(id);
        if (!item || item.type !== 'point' || !item.pos3d || item.opts?.hidden) {
            continue;
        }
        const proj = overlay.project3Dto2D(item.pos3d);
        if (!proj || !proj.visible) {
            continue;
        }
        const dx = ex - proj.x;
        const dy = ey - proj.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > this.pointHitRadiusPx) {
            continue;
        }
        if (!best || dist < best.dist) {
            best = { id, item, dist };
        }
    }

    return best;
}

function setHoveredPoint(id) {
    if (this.hoveredPoint === id) {
        return;
    }
    const prev = this.hoveredPoint;
    this.hoveredPoint = id;
    if (prev) {
        this.applyPointAppearance(prev);
    }
    if (id) {
        this.applyPointAppearance(id);
    }
}

function clearSelectedPoints() {
    if (!this.selectedPoints.size) {
        return;
    }
    const ids = Array.from(this.selectedPoints);
    this.selectedPoints.clear();
    for (const id of ids) {
        this.applyPointAppearance(id);
    }
}

function selectPoint(id, event) {
    const multiSelect = event && (event.ctrlKey || event.metaKey);

    if (!multiSelect) {
        // Points are selected like planes: single-select clears prior selection.
        for (const plane of this.selectedPlanes) {
            plane.setSelected(false);
        }
        this.selectedPlanes.clear();
        this.selectedSolidFaceKeys?.clear?.();
        this.selectedSolidEdgeKeys?.clear?.();
        this.hoveredSolidFaceKey = null;
        this.hoveredSolidEdgeKey = null;
        this.selectedSketchProfiles?.clear?.();
        this.hoveredSketchProfileKey = null;
        this.clearSketchSelection?.();
        this.cancelSketchLine?.();
        this.setSketchTool?.('select');
        api.solids?.clearFaceSelection?.();
        api.solids?.clearEdgeSelection?.();
        this.clearSelectedPoints();
        this.selectedPoints.add(id);
    } else {
        if (this.selectedPoints.has(id)) {
            this.selectedPoints.delete(id);
        } else {
            this.selectedPoints.add(id);
        }
    }
    this.applyPointAppearance(id);
    this.updateHandleScreenScales();
    window.dispatchEvent(new CustomEvent('void-state-change'));
}

function applyPointAppearance(id) {
    const item = overlay?.elements?.get(id);
    if (!item?.el) {
        return;
    }

    if (item.opts?.hidden) {
        item.el.style.display = 'none';
        return;
    }

    const isSelected = this.selectedPoints.has(id);
    const isHovered = this.hoveredPoint === id;

    const defaultFill = 'rgba(140, 140, 140, 0.45)';
    const defaultStroke = '#5a9fd4';
    const hoverStroke = '#ff9933';

    const fill = isSelected ? 'rgba(160, 160, 160, 0.6)' : defaultFill;
    const stroke = (isSelected || isHovered) ? hoverStroke : defaultStroke;
    const strokeWidth = isSelected ? 2.5 : (isHovered ? 2.2 : 2);

    item.el.setAttribute('fill', fill);
    item.el.setAttribute('stroke', stroke);
    item.el.setAttribute('stroke-width', String(strokeWidth));
}

export {
    getPointHitFromEvent,
    setHoveredPoint,
    clearSelectedPoints,
    selectPoint,
    applyPointAppearance
};
