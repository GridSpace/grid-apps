/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { api } from '../api.js';
import { enforceSketchConstraintsInPlace } from './constraints.js';
import {
    isCircleCurve,
    markArcThreePoint,
    markArcCenterPoint,
    markArcTangent,
    markCircleCenterPoint,
    markCircleThreePoint
} from './curve.js';
import {
    SKETCH_MIN_LINE_LENGTH,
    SKETCH_POINT_MERGE_EPS
} from './constants.js';

function findArcWithEndpoints(feature, p1Id, p2Id) {
    if (!feature || !p1Id || !p2Id || p1Id === p2Id) return null;
    const entities = Array.isArray(feature.entities) ? feature.entities : [];
    for (const entity of entities) {
        if (entity?.type !== 'arc' || !entity.id) continue;
        const a = typeof entity.a === 'string' ? entity.a : null;
        const b = typeof entity.b === 'string' ? entity.b : null;
        if (!a || !b) continue;
        if ((a === p1Id && b === p2Id) || (a === p2Id && b === p1Id)) {
            return entity;
        }
    }
    return null;
}

function convertArcToCircle(feature, arcId, p1Id, p2Id) {
    let changed = false;
    api.features.update(feature.id, sketch => {
        sketch.entities = Array.isArray(sketch.entities) ? sketch.entities : [];
        const byId = new Map(sketch.entities.filter(e => e?.id).map(e => [e.id, e]));
        const arc = byId.get(arcId);
        const p1 = byId.get(p1Id);
        const p2 = byId.get(p2Id);
        if (!arc || arc.type !== 'arc' || !p1 || !p2) {
            return;
        }
        const center = this.getArcCenterLocalFromEntity(arc, byId)
            || (Number.isFinite(arc.cx) && Number.isFinite(arc.cy) ? { x: arc.cx, y: arc.cy } : null);
        if (!center) return;

        if (Math.abs((p2.x || 0) - (p1.x || 0)) > 1e-9 || Math.abs((p2.y || 0) - (p1.y || 0)) > 1e-9) {
            p2.x = p1.x || 0;
            p2.y = p1.y || 0;
            changed = true;
        }

        const radius = Math.hypot((p1.x || 0) - center.x, (p1.y || 0) - center.y);
        if (!Number.isFinite(radius) || radius < SKETCH_MIN_LINE_LENGTH) {
            return;
        }

        changed = markCircleThreePoint(arc) || changed;
        if (Math.abs((arc.cx || 0) - center.x) > 1e-9) {
            arc.cx = center.x;
            changed = true;
        }
        if (Math.abs((arc.cy || 0) - center.y) > 1e-9) {
            arc.cy = center.y;
            changed = true;
        }
        if (Math.abs((arc.radius || 0) - radius) > 1e-9) {
            arc.radius = radius;
            changed = true;
        }
        const angle = Math.atan2((p1.y || 0) - center.y, (p1.x || 0) - center.x);
        const mx = center.x + Math.cos(angle + Math.PI / 2) * radius;
        const my = center.y + Math.sin(angle + Math.PI / 2) * radius;
        if (!Number.isFinite(arc.mx) || Math.abs((arc.mx || 0) - mx) > 1e-9) {
            arc.mx = mx;
            changed = true;
        }
        if (!Number.isFinite(arc.my) || Math.abs((arc.my || 0) - my) > 1e-9) {
            arc.my = my;
            changed = true;
        }
        if (arc.startAngle !== 0) {
            arc.startAngle = 0;
            changed = true;
        }
        if (arc.endAngle !== Math.PI * 2) {
            arc.endAngle = Math.PI * 2;
            changed = true;
        }
        if (arc.ccw !== true) {
            arc.ccw = true;
            changed = true;
        }
    }, {
        opType: 'feature.update',
        payload: { field: 'entities.update', entity: 'arc', id: arcId }
    });
    return changed;
}

function createSketchPoint(feature, local) {
    const existing = this.findPointByCoord(feature, local, SKETCH_POINT_MERGE_EPS);
    if (existing) {
        this.selectedSketchEntities.clear();
        this.selectedSketchArcCenters?.clear?.();
        this.selectedSketchEntities.add(existing.id);
        this.hoveredSketchEntityId = null;
        this.updateSketchInteractionVisuals();
        return;
    }
    const id = this.newSketchEntityId('point');
    api.features.update(feature.id, sketch => {
        sketch.entities = Array.isArray(sketch.entities) ? sketch.entities : [];
        sketch.entities.push({
            id,
            type: 'point',
            x: local.x,
            y: local.y,
            fixed: false
        });
        enforceSketchConstraintsInPlace(sketch);
    }, {
        opType: 'feature.update',
        payload: { field: 'entities.add', entity: 'point' }
    });

    this.selectedSketchEntities.clear();
    this.selectedSketchArcCenters?.clear?.();
    this.selectedSketchEntities.add(id);
    this.hoveredSketchEntityId = null;
    this.updateSketchInteractionVisuals();
}

function createSketchLine(feature, a, b, options = {}) {
    const dx = (b.x || 0) - (a.x || 0);
    const dy = (b.y || 0) - (a.y || 0);
    if (Math.hypot(dx, dy) < SKETCH_MIN_LINE_LENGTH) {
        return null;
    }

    const id = this.newSketchEntityId('line');
    let createdStartPointId = null;
    let createdEndPointId = null;
    api.features.update(feature.id, sketch => {
        sketch.entities = Array.isArray(sketch.entities) ? sketch.entities : [];
        sketch.constraints = Array.isArray(sketch.constraints) ? sketch.constraints : [];

        const pa = {
            id: this.newSketchEntityId('point'),
            type: 'point',
            x: a.x,
            y: a.y,
            fixed: false
        };
        const pb = {
            id: this.newSketchEntityId('point'),
            type: 'point',
            x: b.x,
            y: b.y,
            fixed: false
        };
        createdStartPointId = pa.id;
        createdEndPointId = pb.id;
        sketch.entities.push(pa, pb);

        if (options.startRefId) {
            addCoincidentConstraintIfMissing.call(this, sketch, pa.id, options.startRefId);
        }
        if (options.endRefId) {
            addCoincidentConstraintIfMissing.call(this, sketch, pb.id, options.endRefId);
        }

        sketch.entities.push({
            id,
            type: 'line',
            construction: false,
            a: pa.id,
            b: pb.id
        });
        enforceSketchConstraintsInPlace(sketch);
    }, {
        opType: 'feature.update',
        payload: { field: 'entities.add', entity: 'line' }
    });

    this.selectedSketchEntities.clear();
    this.selectedSketchArcCenters?.clear?.();
    this.selectedSketchEntities.add(id);
    this.hoveredSketchEntityId = null;
    this.sketchLinePreview = null;
    this.updateSketchInteractionVisuals();
    return { lineId: id, startPointId: createdStartPointId, endPointId: createdEndPointId };
}

function createSketchArc(feature, start, end, onArc, options = {}) {
    const geom = this.computeArcGeometry(start, end, onArc);
    if (!geom) {
        return null;
    }
    const id = this.newSketchEntityId('arc');
    let createdStartPointId = null;
    let createdEndPointId = null;
    api.features.update(feature.id, sketch => {
        sketch.entities = Array.isArray(sketch.entities) ? sketch.entities : [];
        sketch.constraints = Array.isArray(sketch.constraints) ? sketch.constraints : [];

        const pa = {
            id: this.newSketchEntityId('point'),
            type: 'point',
            x: start.x,
            y: start.y,
            fixed: false
        };
        const pb = {
            id: this.newSketchEntityId('point'),
            type: 'point',
            x: end.x,
            y: end.y,
            fixed: false
        };
        createdStartPointId = pa.id;
        createdEndPointId = pb.id;
        sketch.entities.push(pa, pb);

        if (options.startRefId) {
            addCoincidentConstraintIfMissing.call(this, sketch, pa.id, options.startRefId);
        }
        if (options.endRefId) {
            addCoincidentConstraintIfMissing.call(this, sketch, pb.id, options.endRefId);
        }

        const arcEntity = {
            id,
            type: 'arc',
            construction: false,
            a: pa.id,
            b: pb.id,
            mx: onArc.x,
            my: onArc.y,
            cx: geom.cx,
            cy: geom.cy,
            radius: geom.radius,
            startAngle: geom.startAngle,
            endAngle: geom.endAngle,
            ccw: geom.ccw
        };
        if (options?.variant === 'arc-center') {
            markArcCenterPoint(arcEntity);
        } else if (options?.variant === 'arc-tangent') {
            markArcTangent(arcEntity);
        } else {
            markArcThreePoint(arcEntity);
        }
        sketch.entities.push(arcEntity);
        enforceSketchConstraintsInPlace(sketch);
    }, {
        opType: 'feature.update',
        payload: { field: 'entities.add', entity: 'arc' }
    });

    this.selectedSketchEntities.clear();
    this.selectedSketchArcCenters?.clear?.();
    this.selectedSketchEntities.add(id);
    this.hoveredSketchEntityId = null;
    this.sketchArcPreview = null;
    this.updateSketchInteractionVisuals();
    return { arcId: id, startPointId: createdStartPointId, endPointId: createdEndPointId };
}

function createSketchArcFromCenter(feature, center, start, endRaw, options = {}) {
    const geom = computeArcGeometryFromCenter(center, start, endRaw);
    if (!geom) {
        return null;
    }
    return createSketchArc.call(this, feature, geom.start, geom.end, geom.onArc, {
        ...options,
        variant: 'arc-center'
    });
}

function createSketchCircle(feature, center, edge, options = {}) {
    const radius = Math.hypot((edge.x || 0) - (center.x || 0), (edge.y || 0) - (center.y || 0));
    if (!Number.isFinite(radius) || radius < SKETCH_MIN_LINE_LENGTH) {
        return null;
    }
    const angle = Math.atan2((edge.y || 0) - (center.y || 0), (edge.x || 0) - (center.x || 0));
    const edgePt = {
        x: center.x + Math.cos(angle) * radius,
        y: center.y + Math.sin(angle) * radius
    };
    const id = this.newSketchEntityId('arc');
    let p1Id = null;
    let p2Id = null;
    api.features.update(feature.id, sketch => {
        sketch.entities = Array.isArray(sketch.entities) ? sketch.entities : [];
        sketch.constraints = Array.isArray(sketch.constraints) ? sketch.constraints : [];
        const p1 = {
            id: this.newSketchEntityId('point'),
            type: 'point',
            x: edgePt.x,
            y: edgePt.y,
            fixed: false
        };
        const p2 = {
            id: this.newSketchEntityId('point'),
            type: 'point',
            x: edgePt.x,
            y: edgePt.y,
            fixed: false
        };
        p1Id = p1.id;
        p2Id = p2.id;
        sketch.entities.push(p1, p2);
        if (options.centerRefId) {
            sketch.constraints.push({
                id: this.newSketchEntityId('cst'),
                type: 'arc_center_coincident',
                refs: [id, options.centerRefId],
                data: {},
                created_at: Date.now()
            });
        }
        const circleEntity = {
            id,
            type: 'arc',
            construction: false,
            a: p1.id,
            b: p2.id,
            cx: center.x,
            cy: center.y,
            radius,
            mx: center.x + Math.cos(angle + Math.PI / 2) * radius,
            my: center.y + Math.sin(angle + Math.PI / 2) * radius,
            startAngle: 0,
            endAngle: Math.PI * 2,
            ccw: true
        };
        if (options?.circleVariant === 'three-point') {
            markCircleThreePoint(circleEntity);
        } else {
            markCircleCenterPoint(circleEntity);
        }
        sketch.entities.push(circleEntity);
        addCoincidentConstraintIfMissing.call(this, sketch, p1.id, p2.id);
        enforceSketchConstraintsInPlace(sketch);
    }, {
        opType: 'feature.update',
        payload: { field: 'entities.add', entity: 'circle' }
    });

    this.selectedSketchEntities.clear();
    this.selectedSketchArcCenters?.clear?.();
    this.selectedSketchEntities.add(id);
    this.hoveredSketchEntityId = null;
    this.sketchArcPreview = null;
    this.updateSketchInteractionVisuals();
    return { circleId: id, pointIds: [p1Id, p2Id] };
}

function createSketchCircle3Point(feature, a, b, c, options = {}) {
    const circle = computeCircleFromThreePoints(a, b, c);
    if (!circle) {
        return null;
    }
    const id = this.newSketchEntityId('arc');
    const pRefIds = [];
    let hiddenAId = null;
    let hiddenBId = null;
    api.features.update(feature.id, sketch => {
        sketch.entities = Array.isArray(sketch.entities) ? sketch.entities : [];
        sketch.constraints = Array.isArray(sketch.constraints) ? sketch.constraints : [];
        const pointById = new Map(sketch.entities.filter(e => e?.type === 'point' && e.id).map(e => [e.id, e]));
        const refIds = Array.isArray(options?.pointRefIds) ? options.pointRefIds : [];
        const resolvePointId = (refId, local) => {
            if (typeof refId === 'string' && pointById.has(refId)) {
                return refId;
            }
            const p = { id: this.newSketchEntityId('point'), type: 'point', x: local.x, y: local.y, fixed: false };
            sketch.entities.push(p);
            pointById.set(p.id, p);
            return p.id;
        };
        const p1Id = resolvePointId(refIds[0], a);
        const p2Id = resolvePointId(refIds[1], b);
        const p3Id = resolvePointId(refIds[2], c);
        const p1 = pointById.get(p1Id);
        const h1 = { id: this.newSketchEntityId('point'), type: 'point', x: p1?.x ?? a.x, y: p1?.y ?? a.y, fixed: false };
        const h2 = { id: this.newSketchEntityId('point'), type: 'point', x: p1?.x ?? a.x, y: p1?.y ?? a.y, fixed: false };
        pRefIds.push(p1Id, p2Id, p3Id);
        hiddenAId = h1.id;
        hiddenBId = h2.id;
        sketch.entities.push(h1, h2);
        const circleEntity = {
            id,
            type: 'arc',
            construction: false,
            a: h1.id,
            b: h2.id,
            cx: circle.cx,
            cy: circle.cy,
            radius: circle.radius,
            mx: circle.cx,
            my: circle.cy + circle.radius,
            startAngle: 0,
            endAngle: Math.PI * 2,
            ccw: true,
            data: {
                ...(options?.data || {}),
                threePointIds: [p1Id, p2Id, p3Id]
            }
        };
        markCircleThreePoint(circleEntity);
        sketch.entities.push(circleEntity);
        addCoincidentConstraintIfMissing.call(this, sketch, h1.id, h2.id);
        enforceSketchConstraintsInPlace(sketch);
    }, {
        opType: 'feature.update',
        payload: { field: 'entities.add', entity: 'circle-3pt' }
    });

    this.selectedSketchEntities.clear();
    this.selectedSketchArcCenters?.clear?.();
    for (const pid of pRefIds) {
        this.selectedSketchEntities.add(pid);
    }
    this.selectedSketchEntities.add(id);
    this.hoveredSketchEntityId = null;
    this.sketchArcPreview = null;
    this.updateSketchInteractionVisuals();
    return { circleId: id, pointIds: pRefIds, hiddenIds: [hiddenAId, hiddenBId] };
}

function makeSketchRectPreview(start, end, centerMode = false) {
    const corners = this.getRectangleCorners(start, end, centerMode);
    if (!corners) return null;
    return {
        mode: centerMode ? 'center' : 'corner',
        corners
    };
}

function getRectangleCorners(start, end, centerMode = false) {
    if (!start || !end) return null;
    const sx = Number(start.x || 0);
    const sy = Number(start.y || 0);
    const ex = Number(end.x || 0);
    const ey = Number(end.y || 0);
    let p1, p2, p3, p4;
    if (centerMode) {
        const dx = ex - sx;
        const dy = ey - sy;
        p1 = { x: sx - dx, y: sy - dy };
        p3 = { x: sx + dx, y: sy + dy };
        p2 = { x: p3.x, y: p1.y };
        p4 = { x: p1.x, y: p3.y };
    } else {
        p1 = { x: sx, y: sy };
        p3 = { x: ex, y: ey };
        p2 = { x: p3.x, y: p1.y };
        p4 = { x: p1.x, y: p3.y };
    }
    if (Math.abs(p3.x - p1.x) < SKETCH_MIN_LINE_LENGTH || Math.abs(p3.y - p1.y) < SKETCH_MIN_LINE_LENGTH) {
        return null;
    }
    return [p1, p2, p3, p4];
}

function createSketchRectangle(feature, start, end, options = {}) {
    const corners = this.getRectangleCorners(start, end, !!options.centerMode);
    if (!corners) {
        return null;
    }
    const [c1, c2, c3, c4] = corners;
    const ids = {
        p1: this.newSketchEntityId('point'),
        p2: this.newSketchEntityId('point'),
        p3: this.newSketchEntityId('point'),
        p4: this.newSketchEntityId('point'),
        pc: options.centerMode ? this.newSketchEntityId('point') : null,
        l1: this.newSketchEntityId('line'),
        l2: this.newSketchEntityId('line'),
        l3: this.newSketchEntityId('line'),
        l4: this.newSketchEntityId('line')
    };
    api.features.update(feature.id, sketch => {
        sketch.entities = Array.isArray(sketch.entities) ? sketch.entities : [];
        sketch.constraints = Array.isArray(sketch.constraints) ? sketch.constraints : [];

        const pts = [
            { id: ids.p1, type: 'point', x: c1.x, y: c1.y, fixed: false },
            { id: ids.p2, type: 'point', x: c2.x, y: c2.y, fixed: false },
            { id: ids.p3, type: 'point', x: c3.x, y: c3.y, fixed: false },
            { id: ids.p4, type: 'point', x: c4.x, y: c4.y, fixed: false }
        ];
        if (ids.pc) {
            pts.push({
                id: ids.pc,
                type: 'point',
                x: ((c1.x || 0) + (c3.x || 0)) * 0.5,
                y: ((c1.y || 0) + (c3.y || 0)) * 0.5,
                fixed: false
            });
        }
        sketch.entities.push(...pts);

        if (options.startRefId) {
            addCoincidentConstraintIfMissing.call(this, sketch, ids.p1, options.startRefId);
        }
        if (options.endRefId) {
            addCoincidentConstraintIfMissing.call(this, sketch, ids.p3, options.endRefId);
        }

        sketch.entities.push(
            { id: ids.l1, type: 'line', construction: false, a: ids.p1, b: ids.p2 },
            { id: ids.l2, type: 'line', construction: false, a: ids.p2, b: ids.p3 },
            { id: ids.l3, type: 'line', construction: false, a: ids.p3, b: ids.p4 },
            { id: ids.l4, type: 'line', construction: false, a: ids.p4, b: ids.p1 }
        );

        this.toggleSketchConstraintInList(sketch, sketch.constraints, 'horizontal', [ids.l1]);
        this.toggleSketchConstraintInList(sketch, sketch.constraints, 'horizontal', [ids.l3]);
        this.toggleSketchConstraintInList(sketch, sketch.constraints, 'vertical', [ids.l2]);
        this.toggleSketchConstraintInList(sketch, sketch.constraints, 'vertical', [ids.l4]);
        if (options.centerMode && ids.pc) {
            this.toggleSketchConstraintInList(sketch, sketch.constraints, 'midpoint', [ids.pc, ids.p1, ids.p3]);
        }
        enforceSketchConstraintsInPlace(sketch);
    }, {
        opType: 'feature.update',
        payload: { field: 'entities.add', entity: options.centerMode ? 'rect-center' : 'rect' }
    });

    this.selectedSketchEntities.clear();
    this.selectedSketchArcCenters?.clear?.();
    this.selectedSketchEntities.add(ids.l1);
    this.selectedSketchEntities.add(ids.l2);
    this.selectedSketchEntities.add(ids.l3);
    this.selectedSketchEntities.add(ids.l4);
    this.hoveredSketchEntityId = null;
    this.sketchRectPreview = null;
    this.updateSketchInteractionVisuals();

    return ids;
}

function createSketchPolygonFromSelectedCircle(mode = 'inscribed') {
    const feature = this.getEditingSketchFeature();
    if (!feature) return false;
    const circle = this.getSelectedSketchCircle(feature);
    if (!circle) return false;

    const raw = window.prompt('Number of sides', '6');
    if (raw === null) return false;
    const sides = Math.max(3, Math.min(64, Math.round(Number(raw))));
    if (!Number.isFinite(sides) || sides < 3) return false;

    const data = this.getCircleData(feature, circle);
    if (!data) return false;
    const { cx, cy, radius, startAngle } = data;
    const isCircumscribed = mode === 'circumscribed';
    const step = (Math.PI * 2) / sides;
    const base = isCircumscribed ? startAngle + (Math.PI / sides) : startAngle;
    const polyRadius = isCircumscribed ? (radius / Math.cos(Math.PI / sides)) : radius;
    if (!Number.isFinite(polyRadius) || polyRadius <= SKETCH_MIN_LINE_LENGTH) return false;

    const pointIds = [];
    const lineIds = [];
    api.features.update(feature.id, sketch => {
        sketch.entities = Array.isArray(sketch.entities) ? sketch.entities : [];
        sketch.constraints = Array.isArray(sketch.constraints) ? sketch.constraints : [];

        for (let i = 0; i < sides; i++) {
            const ang = base + i * step;
            const pid = this.newSketchEntityId('point');
            pointIds.push(pid);
            sketch.entities.push({
                id: pid,
                type: 'point',
                x: cx + Math.cos(ang) * polyRadius,
                y: cy + Math.sin(ang) * polyRadius,
                fixed: false
            });
        }
        for (let i = 0; i < sides; i++) {
            const lid = this.newSketchEntityId('line');
            lineIds.push(lid);
            sketch.entities.push({
                id: lid,
                type: 'line',
                construction: false,
                a: pointIds[i],
                b: pointIds[(i + 1) % sides]
            });
        }

        sketch.constraints.push({
            id: this.newSketchEntityId('cst'),
            type: 'polygon_pattern',
            refs: [circle.id, ...pointIds, ...lineIds],
            data: {
                mode: isCircumscribed ? 'circumscribed' : 'inscribed',
                sides,
                circleId: circle.id,
                pointIds: [...pointIds],
                lineIds: [...lineIds]
            },
            created_at: Date.now()
        });
        enforceSketchConstraintsInPlace(sketch, {
            useFallback: true,
            iterations: 96
        });
    }, {
        opType: 'feature.update',
        payload: { field: 'entities.add', entity: isCircumscribed ? 'polygon-circumscribed' : 'polygon-inscribed' }
    });

    this.selectedSketchEntities.clear();
    this.selectedSketchArcCenters?.clear?.();
    for (const id of lineIds) this.selectedSketchEntities.add(id);
    this.hoveredSketchEntityId = null;
    this.updateSketchInteractionVisuals();
    return true;
}

function getSelectedSketchCircle(feature) {
    const entities = Array.isArray(feature?.entities) ? feature.entities : [];
    const selected = entities.filter(entity => this.selectedSketchEntities.has(entity.id));
    const circles = selected.filter(entity => entity?.type === 'arc' && isCircleCurve(entity));
    if (circles.length !== 1) return null;
    return circles[0];
}

function getCircleData(feature, circle) {
    if (!circle || circle.type !== 'arc' || !isCircleCurve(circle)) return null;
    const entities = Array.isArray(feature?.entities) ? feature.entities : [];
    const byId = new Map(entities.filter(e => e?.id).map(e => [e.id, e]));
    const [a] = this.getArcEndpoints(circle, byId);
    const cx = Number(circle.cx);
    const cy = Number(circle.cy);
    const radius = Number(circle.radius);
    if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(radius) || radius <= SKETCH_MIN_LINE_LENGTH) {
        return null;
    }
    const startAngle = a
        ? Math.atan2((a.y || 0) - cy, (a.x || 0) - cx)
        : 0;
    return { cx, cy, radius, startAngle };
}

function computeArcGeometry(start, end, onArc) {
    if (!start || !end || !onArc) {
        return null;
    }
    const x1 = start.x || 0;
    const y1 = start.y || 0;
    const x2 = end.x || 0;
    const y2 = end.y || 0;
    const x3 = onArc.x || 0;
    const y3 = onArc.y || 0;
    const d = 2 * (x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2));
    if (Math.abs(d) < 1e-8) {
        return null;
    }
    const x1sq = x1 * x1 + y1 * y1;
    const x2sq = x2 * x2 + y2 * y2;
    const x3sq = x3 * x3 + y3 * y3;
    const cx = (x1sq * (y2 - y3) + x2sq * (y3 - y1) + x3sq * (y1 - y2)) / d;
    const cy = (x1sq * (x3 - x2) + x2sq * (x1 - x3) + x3sq * (x2 - x1)) / d;
    const radius = Math.hypot(x1 - cx, y1 - cy);
    if (!Number.isFinite(radius) || radius < SKETCH_MIN_LINE_LENGTH) {
        return null;
    }
    const startAngle = Math.atan2(y1 - cy, x1 - cx);
    const endAngle = Math.atan2(y2 - cy, x2 - cx);
    const midAngle = Math.atan2(y3 - cy, x3 - cx);
    const normalize = a => {
        let out = a % (Math.PI * 2);
        if (out < 0) out += Math.PI * 2;
        return out;
    };
    const sa = normalize(startAngle);
    const ea = normalize(endAngle);
    const ma = normalize(midAngle);
    const ccwSpan = (ea - sa + Math.PI * 2) % (Math.PI * 2);
    const ccwMid = (ma - sa + Math.PI * 2) % (Math.PI * 2);
    const ccw = ccwMid <= ccwSpan;
    return { cx, cy, radius, startAngle, endAngle, ccw };
}

function computeCircleFromThreePoints(a, b, c) {
    if (!a || !b || !c) return null;
    const x1 = a.x || 0;
    const y1 = a.y || 0;
    const x2 = b.x || 0;
    const y2 = b.y || 0;
    const x3 = c.x || 0;
    const y3 = c.y || 0;
    const d = 2 * (x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2));
    if (Math.abs(d) < 1e-8) {
        return null;
    }
    const x1sq = x1 * x1 + y1 * y1;
    const x2sq = x2 * x2 + y2 * y2;
    const x3sq = x3 * x3 + y3 * y3;
    const cx = (x1sq * (y2 - y3) + x2sq * (y3 - y1) + x3sq * (y1 - y2)) / d;
    const cy = (x1sq * (x3 - x2) + x2sq * (x1 - x3) + x3sq * (x2 - x1)) / d;
    const radius = Math.hypot(x1 - cx, y1 - cy);
    if (!Number.isFinite(radius) || radius < SKETCH_MIN_LINE_LENGTH) {
        return null;
    }
    return { cx, cy, radius };
}

function computeArcGeometryFromCenter(center, start, endRaw) {
    if (!center || !start || !endRaw) return null;
    const cx = center.x || 0;
    const cy = center.y || 0;
    const sx = start.x || 0;
    const sy = start.y || 0;
    const radius = Math.hypot(sx - cx, sy - cy);
    if (!Number.isFinite(radius) || radius < SKETCH_MIN_LINE_LENGTH) {
        return null;
    }
    const exv = (endRaw.x || 0) - cx;
    const eyv = (endRaw.y || 0) - cy;
    const evl = Math.hypot(exv, eyv);
    if (!Number.isFinite(evl) || evl < 1e-9) {
        return null;
    }
    const end = {
        x: cx + (exv / evl) * radius,
        y: cy + (eyv / evl) * radius
    };
    const startAngle = Math.atan2(sy - cy, sx - cx);
    const endAngle = Math.atan2(end.y - cy, end.x - cx);
    const cross = (sx - cx) * (end.y - cy) - (sy - cy) * (end.x - cx);
    const ccw = cross >= 0;
    const tau = Math.PI * 2;
    const norm = a => {
        let out = a % tau;
        if (out < 0) out += tau;
        return out;
    };
    const sa = norm(startAngle);
    const ea = norm(endAngle);
    let mid;
    if (ccw) {
        const sweep = (ea - sa + tau) % tau;
        mid = sa + sweep * 0.5;
    } else {
        const sweep = (sa - ea + tau) % tau;
        mid = sa - sweep * 0.5;
    }
    const onArc = {
        x: cx + Math.cos(mid) * radius,
        y: cy + Math.sin(mid) * radius
    };
    return {
        start: { x: sx, y: sy },
        end,
        onArc
    };
}

function addCoincidentConstraintIfMissing(sketch, aId, bId) {
    if (!aId || !bId || aId === bId) return;
    sketch.constraints = Array.isArray(sketch.constraints) ? sketch.constraints : [];
    const refs = [aId, bId].sort();
    const key = `coincident:${refs.join(',')}`;
    for (const c of sketch.constraints) {
        if (this.makeSketchConstraintKey(c?.type, c?.refs || []) === key) {
            return;
        }
    }
    sketch.constraints.push({
        id: this.newSketchEntityId('cst'),
        type: 'coincident',
        refs,
        data: {},
        created_at: Date.now()
    });
    this.convertArcToCircleInSketch?.(sketch, aId, bId);
}

function convertArcToCircleInSketch(sketch, p1Id, p2Id) {
    if (!sketch || !p1Id || !p2Id || p1Id === p2Id) {
        return false;
    }
    sketch.entities = Array.isArray(sketch.entities) ? sketch.entities : [];
    const byId = new Map(sketch.entities.filter(e => e?.id).map(e => [e.id, e]));
    const p1 = byId.get(p1Id);
    const p2 = byId.get(p2Id);
    if (!p1 || !p2) return false;
    let changed = false;
    for (const arc of sketch.entities) {
        if (arc?.type !== 'arc' || !arc.id) continue;
        const a = typeof arc.a === 'string' ? arc.a : null;
        const b = typeof arc.b === 'string' ? arc.b : null;
        if (!a || !b) continue;
        const match = (a === p1Id && b === p2Id) || (a === p2Id && b === p1Id);
        if (!match) continue;

        const center = this.getArcCenterLocalFromEntity(arc, byId)
            || (Number.isFinite(arc.cx) && Number.isFinite(arc.cy) ? { x: arc.cx, y: arc.cy } : null);
        if (!center) continue;
        const rx = (p1.x || 0) - center.x;
        const ry = (p1.y || 0) - center.y;
        const radius = Math.hypot(rx, ry);
        if (!Number.isFinite(radius) || radius < SKETCH_MIN_LINE_LENGTH) {
            continue;
        }
        if (Math.abs((p2.x || 0) - (p1.x || 0)) > 1e-9 || Math.abs((p2.y || 0) - (p1.y || 0)) > 1e-9) {
            p2.x = p1.x || 0;
            p2.y = p1.y || 0;
            changed = true;
        }
        const angle = Math.atan2(ry, rx);
        markCircleThreePoint(arc);
        arc.cx = center.x;
        arc.cy = center.y;
        arc.radius = radius;
        arc.mx = center.x + Math.cos(angle + Math.PI / 2) * radius;
        arc.my = center.y + Math.sin(angle + Math.PI / 2) * radius;
        arc.startAngle = 0;
        arc.endAngle = Math.PI * 2;
        arc.ccw = true;
        changed = true;
    }
    return changed;
}

function createDerivedSketchPoint(feature, local, source = {}) {
    if (!feature || !local) return null;
    let createdId = null;
    api.features.update(feature.id, sketch => {
        sketch.entities = Array.isArray(sketch.entities) ? sketch.entities : [];
        const existing = this.findPointByCoord(sketch, local, SKETCH_POINT_MERGE_EPS);
        if (existing) {
            createdId = existing.id;
            existing.derived = true;
            existing.fixed = true;
            existing.source = source || null;
            return;
        }
        const point = {
            id: this.newSketchEntityId('point'),
            type: 'point',
            x: local.x,
            y: local.y,
            fixed: true,
            derived: true,
            source: source || null
        };
        sketch.entities.push(point);
        createdId = point.id;
    }, {
        opType: 'feature.update',
        payload: { field: 'entities.add', entity: 'derived-point' }
    });
    if (!createdId) return null;
    this.selectedSketchEntities.clear();
    this.selectedSketchArcCenters?.clear?.();
    this.selectedSketchEntities.add(createdId);
    return createdId;
}

function createDerivedSketchLine(feature, candidate) {
    if (!feature || !candidate?.aLocal || !candidate?.bLocal) return null;
    const source = candidate.source || {};
    let created = null;
    api.features.update(feature.id, sketch => {
        sketch.entities = Array.isArray(sketch.entities) ? sketch.entities : [];
        const entities = sketch.entities;
        for (const line of entities) {
            if (line?.type !== 'line' || !line?.derived || line?.source?.type !== 'solid-edge') continue;
            const ls = line.source || {};
            if (String(ls.solid_id || '') === String(source.solid_id || '')
                && String(ls.solid_feature_id || '') === String(source.solid_feature_id || '')
                && ls?.a && ls?.b && source?.a && source?.b) {
                const sameA = Math.hypot((ls.a.x || 0) - (source.a.x || 0), (ls.a.y || 0) - (source.a.y || 0), (ls.a.z || 0) - (source.a.z || 0)) < 1e-6;
                const sameB = Math.hypot((ls.b.x || 0) - (source.b.x || 0), (ls.b.y || 0) - (source.b.y || 0), (ls.b.z || 0) - (source.b.z || 0)) < 1e-6;
                const swapA = Math.hypot((ls.a.x || 0) - (source.b.x || 0), (ls.a.y || 0) - (source.b.y || 0), (ls.a.z || 0) - (source.b.z || 0)) < 1e-6;
                const swapB = Math.hypot((ls.b.x || 0) - (source.a.x || 0), (ls.b.y || 0) - (source.a.y || 0), (ls.b.z || 0) - (source.a.z || 0)) < 1e-6;
                if ((sameA && sameB) || (swapA && swapB)) {
                    created = { lineId: line.id };
                    return;
                }
            }
        }
        const p1 = {
            id: this.newSketchEntityId('point'),
            type: 'point',
            x: candidate.aLocal.x || 0,
            y: candidate.aLocal.y || 0,
            fixed: true,
            derived: true,
            source: { ...(source || {}), point_kind: 'a' }
        };
        const p2 = {
            id: this.newSketchEntityId('point'),
            type: 'point',
            x: candidate.bLocal.x || 0,
            y: candidate.bLocal.y || 0,
            fixed: true,
            derived: true,
            source: { ...(source || {}), point_kind: 'b' }
        };
        const line = {
            id: this.newSketchEntityId('line'),
            type: 'line',
            a: p1.id,
            b: p2.id,
            construction: false,
            fixed: true,
            derived: true,
            source: source || null
        };
        sketch.entities.push(p1, p2, line);
        created = { lineId: line.id, p1: p1.id, p2: p2.id };
    }, {
        opType: 'feature.update',
        payload: { field: 'entities.add', entity: 'derived-line' }
    });
    if (!created?.lineId) return null;
    this.selectedSketchEntities.clear();
    this.selectedSketchArcCenters?.clear?.();
    this.selectedSketchEntities.add(created.lineId);
    return created;
}

function refreshDerivedSketchGeometry(feature) {
    if (!feature || feature.type !== 'sketch') return false;
    const entities = Array.isArray(feature.entities) ? feature.entities : [];
    const derivedLines = entities.filter(e => e?.type === 'line' && e?.derived && e?.source?.type === 'solid-edge');
    const derivedPoints = entities.filter(e => e?.type === 'point' && e?.derived && e?.source?.type === 'solid-edge');
    if (!derivedLines.length && !derivedPoints.length) return false;
    const basis = this.getSketchBasis(feature);
    if (!basis) return false;
    const byId = new Map(entities.filter(e => e?.id).map(e => [e.id, e]));
    let changed = false;

    const updatePointFromSource = (point, source) => {
        const seg = api.solids?.resolveEdgeFromSource?.(source);
        if (!seg) return;
        const kind = source?.point_kind || 'mid';
        const world = kind === 'a' ? seg.aWorld : kind === 'b' ? seg.bWorld : seg.midWorld;
        const local = this.worldToSketchLocal(world, basis);
        if (!local) return;
        if (Math.abs((point.x || 0) - local.x) > 1e-6 || Math.abs((point.y || 0) - local.y) > 1e-6) {
            point.x = local.x;
            point.y = local.y;
            changed = true;
        }
    };

    for (const point of derivedPoints) {
        updatePointFromSource(point, point.source || null);
    }
    for (const line of derivedLines) {
        const seg = api.solids?.resolveEdgeFromSource?.(line.source || null);
        if (!seg) continue;
        const p1 = byId.get(line.a);
        const p2 = byId.get(line.b);
        if (!p1 || !p2) continue;
        const aLocal = this.worldToSketchLocal(seg.aWorld, basis);
        const bLocal = this.worldToSketchLocal(seg.bWorld, basis);
        if (!aLocal || !bLocal) continue;
        if (Math.abs((p1.x || 0) - aLocal.x) > 1e-6 || Math.abs((p1.y || 0) - aLocal.y) > 1e-6) {
            p1.x = aLocal.x;
            p1.y = aLocal.y;
            changed = true;
        }
        if (Math.abs((p2.x || 0) - bLocal.x) > 1e-6 || Math.abs((p2.y || 0) - bLocal.y) > 1e-6) {
            p2.x = bLocal.x;
            p2.y = bLocal.y;
            changed = true;
        }
    }
    return changed;
}

export {
    findArcWithEndpoints,
    convertArcToCircle,
    createSketchPoint,
    createSketchLine,
    createSketchArc,
    createSketchArcFromCenter,
    createSketchCircle,
    createSketchCircle3Point,
    makeSketchRectPreview,
    getRectangleCorners,
    createSketchRectangle,
    createSketchPolygonFromSelectedCircle,
    getSelectedSketchCircle,
    getCircleData,
    computeArcGeometry,
    computeArcGeometryFromCenter,
    computeCircleFromThreePoints,
    addCoincidentConstraintIfMissing,
    convertArcToCircleInSketch,
    createDerivedSketchPoint,
    createDerivedSketchLine,
    refreshDerivedSketchGeometry
};
