/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { space } from '../../moto/space.js';
import { api } from '../api.js';

function startSketchMarquee(feature, pointerDown, event) {
    const start = this.viewportPointFromClient(pointerDown?.clientX, pointerDown?.clientY);
    const end = this.getEventViewportXY(event);
    if (!start || !end) {
        return;
    }
    this.sketchMarquee = {
        featureId: feature?.id || null,
        startX: start.x,
        startY: start.y,
        endX: end.x,
        endY: end.y,
        mode: end.x >= start.x ? 'window' : 'cross'
    };
    this.updateSketchMarqueeVisual();
}

function updateSketchMarquee(event) {
    if (!this.sketchMarquee) {
        return;
    }
    const end = this.getEventViewportXY(event);
    if (!end) {
        return;
    }
    this.sketchMarquee.endX = end.x;
    this.sketchMarquee.endY = end.y;
    this.sketchMarquee.mode = end.x >= this.sketchMarquee.startX ? 'window' : 'cross';
    this.updateSketchMarqueeVisual();
}

function finishSketchMarquee(feature) {
    if (!this.sketchMarquee) {
        return;
    }
    const marquee = this.sketchMarquee;
    this.clearSketchMarquee();
    const selectIds = this.selectSketchEntitiesInMarquee(feature, marquee);
    this.selectedSketchEntities = new Set(selectIds);
    this.selectedSketchArcCenters?.clear?.();
    this.hoveredSketchEntityId = null;
    this.updateSketchInteractionVisuals();
}

function clearSketchMarquee() {
    this.sketchMarquee = null;
    if (this.sketchMarqueeEl?.parentElement) {
        this.sketchMarqueeEl.parentElement.removeChild(this.sketchMarqueeEl);
    }
    this.sketchMarqueeEl = null;
}

function updateSketchMarqueeVisual() {
    const marquee = this.sketchMarquee;
    if (!marquee) {
        this.clearSketchMarquee();
        return;
    }
    const { container } = space.internals();
    if (!container) {
        return;
    }
    if (!this.sketchMarqueeEl) {
        const el = document.createElement('div');
        el.className = 'sketch-marquee sketch-marquee-window';
        container.appendChild(el);
        this.sketchMarqueeEl = el;
    }
    const left = Math.min(marquee.startX, marquee.endX);
    const top = Math.min(marquee.startY, marquee.endY);
    const width = Math.abs(marquee.endX - marquee.startX);
    const height = Math.abs(marquee.endY - marquee.startY);
    this.sketchMarqueeEl.className = `sketch-marquee ${marquee.mode === 'cross' ? 'sketch-marquee-cross' : 'sketch-marquee-window'}`;
    this.sketchMarqueeEl.style.left = `${left}px`;
    this.sketchMarqueeEl.style.top = `${top}px`;
    this.sketchMarqueeEl.style.width = `${width}px`;
    this.sketchMarqueeEl.style.height = `${height}px`;
}

function viewportPointFromClient(clientX, clientY) {
    const { container } = space.internals();
    if (!container) {
        return null;
    }
    const rect = container.getBoundingClientRect();
    return {
        x: (clientX || 0) - rect.left,
        y: (clientY || 0) - rect.top
    };
}

function selectSketchEntitiesInMarquee(feature, marquee) {
    const entities = Array.isArray(feature?.entities) ? feature.entities : [];
    const basis = this.getSketchBasis(feature);
    if (!basis) {
        return [];
    }
    const minX = Math.min(marquee.startX, marquee.endX);
    const maxX = Math.max(marquee.startX, marquee.endX);
    const minY = Math.min(marquee.startY, marquee.endY);
    const maxY = Math.max(marquee.startY, marquee.endY);
    const rect = { minX, maxX, minY, maxY };
    const isWindow = marquee.mode !== 'cross';

    const out = [];
    const pointById = new Map();
    for (const entity of entities) {
        if (entity?.type === 'point' && entity.id) {
            pointById.set(entity.id, entity);
        }
    }
    for (const entity of entities) {
        if (!entity?.id) continue;
        if (entity.type === 'point') {
            const p = this.projectSketchLocalToScreen({ x: entity.x || 0, y: entity.y || 0 }, basis);
            if (!p) continue;
            if (this.isPointInRect(p.x, p.y, rect)) {
                out.push(entity.id);
            }
            continue;
        }
        if (entity.type === 'line') {
            const [a, b] = this.getLineEndpoints(entity, pointById);
            if (!a || !b) continue;
            const pa = this.projectSketchLocalToScreen({ x: a.x || 0, y: a.y || 0 }, basis);
            const pb = this.projectSketchLocalToScreen({ x: b.x || 0, y: b.y || 0 }, basis);
            if (!pa || !pb) continue;
            const hit = isWindow
                ? (this.isPointInRect(pa.x, pa.y, rect) && this.isPointInRect(pb.x, pb.y, rect))
                : this.segmentTouchesRect(pa, pb, rect);
            if (hit) {
                out.push(entity.id);
            }
            continue;
        }
        if (entity.type === 'arc') {
            const [a, b] = this.getArcEndpoints(entity, pointById);
            if (!a || !b) continue;
            const sample = this.sampleArcPolyline(entity, a, b, 28);
            if (!sample.length) continue;
            const screen = sample
                .map(local => this.projectSketchLocalToScreen(local, basis))
                .filter(Boolean);
            if (screen.length < 2) continue;
            let hit = false;
            if (isWindow) {
                hit = screen.every(p => this.isPointInRect(p.x, p.y, rect));
            } else {
                for (let i = 0; i < screen.length - 1 && !hit; i++) {
                    if (this.segmentTouchesRect(screen[i], screen[i + 1], rect)) {
                        hit = true;
                    }
                }
            }
            if (hit) {
                out.push(entity.id);
            }
        }
    }
    return out;
}

function projectSketchLocalToScreen(local, basis) {
    const world = this.sketchLocalToWorld(local, basis);
    const proj = api.overlay.project3Dto2D(world);
    if (!proj?.visible) {
        return null;
    }
    return { x: proj.x, y: proj.y };
}

function isPointInRect(x, y, rect) {
    return x >= rect.minX && x <= rect.maxX && y >= rect.minY && y <= rect.maxY;
}

function segmentTouchesRect(a, b, rect) {
    if (this.isPointInRect(a.x, a.y, rect) || this.isPointInRect(b.x, b.y, rect)) {
        return true;
    }
    const edges = [
        [{ x: rect.minX, y: rect.minY }, { x: rect.maxX, y: rect.minY }],
        [{ x: rect.maxX, y: rect.minY }, { x: rect.maxX, y: rect.maxY }],
        [{ x: rect.maxX, y: rect.maxY }, { x: rect.minX, y: rect.maxY }],
        [{ x: rect.minX, y: rect.maxY }, { x: rect.minX, y: rect.minY }]
    ];
    for (const [c, d] of edges) {
        if (this.segmentsIntersect(a, b, c, d)) {
            return true;
        }
    }
    return false;
}

function segmentsIntersect(a, b, c, d) {
    const orient = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    const onSeg = (p, q, r) =>
        Math.min(p.x, r.x) <= q.x && q.x <= Math.max(p.x, r.x) &&
        Math.min(p.y, r.y) <= q.y && q.y <= Math.max(p.y, r.y);

    const o1 = orient(a, b, c);
    const o2 = orient(a, b, d);
    const o3 = orient(c, d, a);
    const o4 = orient(c, d, b);

    if ((o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0)) {
        return true;
    }
    if (Math.abs(o1) < 1e-9 && onSeg(a, c, b)) return true;
    if (Math.abs(o2) < 1e-9 && onSeg(a, d, b)) return true;
    if (Math.abs(o3) < 1e-9 && onSeg(c, a, d)) return true;
    if (Math.abs(o4) < 1e-9 && onSeg(c, b, d)) return true;
    return false;
}

function collectSelectedCoordinateRefs(feature) {
    return this.collectCoordinateRefsFromIds(feature, this.selectedSketchEntities);
}

function collectCoordinateRefsFromIds(feature, selectedIds) {
    const refs = new Set();
    const entities = Array.isArray(feature.entities) ? feature.entities : [];
    const pointById = new Map();
    for (const entity of entities) {
        if (entity?.type === 'point' && entity.id) {
            pointById.set(entity.id, entity);
        }
    }
    for (const entity of entities) {
        if (!selectedIds?.has(entity.id)) {
            continue;
        }
        if (entity.type === 'point') {
            refs.add(entity);
            continue;
        }
        if (entity.type === 'line') {
            const aId = typeof entity?.a === 'string' ? entity.a : (typeof entity?.p1_id === 'string' ? entity.p1_id : null);
            const bId = typeof entity?.b === 'string' ? entity.b : (typeof entity?.p2_id === 'string' ? entity.p2_id : null);
            if (aId && pointById.has(aId)) refs.add(pointById.get(aId));
            if (bId && pointById.has(bId)) refs.add(pointById.get(bId));
        }
        if (entity.type === 'arc') {
            const aId = typeof entity?.a === 'string' ? entity.a : null;
            const bId = typeof entity?.b === 'string' ? entity.b : null;
            if (aId && pointById.has(aId)) refs.add(pointById.get(aId));
            if (bId && pointById.has(bId)) refs.add(pointById.get(bId));
            const threePointIds = Array.isArray(entity?.data?.threePointIds) ? entity.data.threePointIds : [];
            for (const pid of threePointIds) {
                if (pid && pointById.has(pid)) refs.add(pointById.get(pid));
            }
        }
    }
    return Array.from(refs);
}

export {
    startSketchMarquee,
    updateSketchMarquee,
    finishSketchMarquee,
    clearSketchMarquee,
    updateSketchMarqueeVisual,
    viewportPointFromClient,
    selectSketchEntitiesInMarquee,
    projectSketchLocalToScreen,
    isPointInRect,
    segmentTouchesRect,
    segmentsIntersect,
    collectSelectedCoordinateRefs,
    collectCoordinateRefsFromIds
};
