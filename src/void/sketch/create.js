/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { api } from '../api.js';
import { enforceSketchConstraintsInPlace } from './constraints.js';
import {
    isCircleCurve,
    isThreePointCircle,
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

        const parseArcCenterRef = ref => {
            if (typeof ref !== 'string') return null;
            if (!ref.startsWith('arc-center:')) return null;
            const arcId = ref.substring('arc-center:'.length);
            return arcId || null;
        };

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
            const arcId = parseArcCenterRef(options.startRefId);
            if (arcId) {
                sketch.constraints.push({
                    id: this.newSketchEntityId('constraint'),
                    type: 'arc_center_coincident',
                    refs: [arcId, pa.id]
                });
            } else {
                addCoincidentConstraintIfMissing.call(this, sketch, pa.id, options.startRefId);
            }
        }
        if (options.endRefId) {
            const arcId = parseArcCenterRef(options.endRefId);
            if (arcId) {
                sketch.constraints.push({
                    id: this.newSketchEntityId('constraint'),
                    type: 'arc_center_coincident',
                    refs: [arcId, pb.id]
                });
            } else {
                addCoincidentConstraintIfMissing.call(this, sketch, pb.id, options.endRefId);
            }
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

function mirrorLocalPointAcrossLine(local, axisA, axisB) {
    const ax = axisA?.x || 0;
    const ay = axisA?.y || 0;
    const bx = axisB?.x || 0;
    const by = axisB?.y || 0;
    const px = local?.x || 0;
    const py = local?.y || 0;
    const dx = bx - ax;
    const dy = by - ay;
    const den = dx * dx + dy * dy;
    if (!Number.isFinite(den) || den < 1e-12) {
        return { x: px, y: py };
    }
    const t = ((px - ax) * dx + (py - ay) * dy) / den;
    const qx = ax + t * dx;
    const qy = ay + t * dy;
    return {
        x: qx * 2 - px,
        y: qy * 2 - py
    };
}

function pointDistanceToLine(local, axisA, axisB) {
    const ax = axisA?.x || 0;
    const ay = axisA?.y || 0;
    const bx = axisB?.x || 0;
    const by = axisB?.y || 0;
    const px = local?.x || 0;
    const py = local?.y || 0;
    const dx = bx - ax;
    const dy = by - ay;
    const den = dx * dx + dy * dy;
    if (!Number.isFinite(den) || den < 1e-12) return Infinity;
    const t = ((px - ax) * dx + (py - ay) * dy) / den;
    const qx = ax + t * dx;
    const qy = ay + t * dy;
    return Math.hypot(px - qx, py - qy);
}

function isLikelyCircleArcEntity(entity, byId) {
    if (!entity || entity.type !== 'arc') return false;
    if (isCircleCurve(entity)) return true;
    const cx = Number(entity?.cx);
    const cy = Number(entity?.cy);
    const radius = Number(entity?.radius);
    if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(radius) || radius <= SKETCH_MIN_LINE_LENGTH) {
        return false;
    }
    const aId = typeof entity?.a === 'string' ? entity.a : (typeof entity?.p1_id === 'string' ? entity.p1_id : null);
    const bId = typeof entity?.b === 'string' ? entity.b : (typeof entity?.p2_id === 'string' ? entity.p2_id : null);
    const a = byId?.get?.(aId);
    const b = byId?.get?.(bId);
    if (!a || !b) {
        return true;
    }
    const da = Math.hypot((a.x || 0) - cx, (a.y || 0) - cy);
    const db = Math.hypot((b.x || 0) - cx, (b.y || 0) - cy);
    const ab = Math.hypot((a.x || 0) - (b.x || 0), (a.y || 0) - (b.y || 0));
    const tol = Math.max(1e-5, radius * 1e-4);
    if (ab <= tol) return true;
    if (Math.abs(da - radius) <= tol && Math.abs(db - radius) <= tol && Math.abs(da - db) <= tol) {
        const sa = Number(entity?.startAngle);
        const ea = Number(entity?.endAngle);
        if (Number.isFinite(sa) && Number.isFinite(ea)) {
            const span = Math.abs(ea - sa);
            const tau = Math.PI * 2;
            if (Math.abs(span - tau) <= 1e-3 || Math.abs((span % tau) - tau) <= 1e-3) {
                return true;
            }
        }
    }
    return false;
}

function mirrorSelectedSketchGeometry(options = {}) {
    const feature = this.getEditingSketchFeature();
    if (!feature) return false;
    const entities = Array.isArray(feature.entities) ? feature.entities : [];
    const byId = new Map(entities.filter(e => e?.id).map(e => [e.id, e]));
    const selectedIds = new Set(this.selectedSketchEntities || []);
    const sourceIdsOpt = Array.isArray(options?.sourceIds) ? options.sourceIds.filter(id => typeof id === 'string' && id) : null;
    const keepResultSelected = options?.keepResultSelected !== false;
    let axis = null;
    if (typeof options?.axisId === 'string' && options.axisId) {
        const axisEntity = byId.get(options.axisId);
        if (axisEntity?.type === 'line') {
            axis = axisEntity;
        }
    }
    if (!axis) {
        const selectedLines = entities.filter(e => e?.type === 'line' && selectedIds.has(e.id));
        if (selectedLines.length !== 1) {
            return false;
        }
        axis = selectedLines[0];
    }
    const axisAId = typeof axis?.a === 'string' ? axis.a : (typeof axis?.p1_id === 'string' ? axis.p1_id : null);
    const axisBId = typeof axis?.b === 'string' ? axis.b : (typeof axis?.p2_id === 'string' ? axis.p2_id : null);
    const axisA = byId.get(axisAId);
    const axisB = byId.get(axisBId);
    if (!axisA || !axisB) return false;
    if (Math.hypot((axisB.x || 0) - (axisA.x || 0), (axisB.y || 0) - (axisA.y || 0)) < SKETCH_MIN_LINE_LENGTH) {
        return false;
    }

    const selectedPoints = [];
    const selectedCurveIds = [];
    const sourceIds = sourceIdsOpt ? new Set(sourceIdsOpt) : selectedIds;
    for (const ent of entities) {
        if (!sourceIds.has(ent.id)) continue;
        if (ent.id === axis.id) continue;
        if (ent.type === 'point') selectedPoints.push(ent.id);
        if (ent.type === 'line' || ent.type === 'arc') selectedCurveIds.push(ent.id);
    }
    if (!selectedPoints.length && !selectedCurveIds.length) {
        return false;
    }

    const pointIdsToMirror = new Set(selectedPoints);
    for (const cid of selectedCurveIds) {
        const ent = byId.get(cid);
        if (!ent) continue;
        const aId = typeof ent?.a === 'string' ? ent.a : (typeof ent?.p1_id === 'string' ? ent.p1_id : null);
        const bId = typeof ent?.b === 'string' ? ent.b : (typeof ent?.p2_id === 'string' ? ent.p2_id : null);
        if (aId) pointIdsToMirror.add(aId);
        if (bId) pointIdsToMirror.add(bId);
        if (ent.type === 'arc') {
            const tps = Array.isArray(ent?.data?.threePointIds) ? ent.data.threePointIds : [];
            for (const pid of tps) {
                if (typeof pid === 'string') pointIdsToMirror.add(pid);
            }
        }
    }

    const axisIds = new Set([axisAId, axisBId]);
    const pointMap = new Map();
    const createdPointIds = [];
    const createdCurveIds = [];
    const mirrorPointPairs = [];
    const mirrorLinePairs = [];
    const skipMirrorPointPairKeys = new Set();

    api.features.update(feature.id, sketch => {
        sketch.entities = Array.isArray(sketch.entities) ? sketch.entities : [];
        sketch.constraints = Array.isArray(sketch.constraints) ? sketch.constraints : [];
        const mapById = new Map(sketch.entities.filter(e => e?.id).map(e => [e.id, e]));
        const hasMirrorConstraint = (type, refs) => sketch.constraints.some(c => {
            if (c?.type !== type) return false;
            const crefs = Array.isArray(c?.refs) ? c.refs : [];
            return crefs.length === refs.length && refs.every((ref, i) => String(crefs[i] || '') === String(ref || ''));
        });
        const addMirrorConstraint = (type, refs) => {
            if (!refs.every(ref => typeof ref === 'string' && ref)) return;
            if (hasMirrorConstraint(type, refs)) return;
            sketch.constraints.push({
                id: this.newSketchEntityId('cst'),
                type,
                refs: [...refs],
                data: {},
                created_at: Date.now()
            });
        };
        const ensureArcCenterPoint = arcId => {
            if (!arcId) return null;
            for (const c of sketch.constraints) {
                if (c?.type !== 'arc_center_coincident') continue;
                const refs = Array.isArray(c?.refs) ? c.refs : [];
                if (refs[0] !== arcId) continue;
                const pid = refs[1];
                if (typeof pid === 'string' && mapById.get(pid)?.type === 'point') {
                    return pid;
                }
            }
            const arc = mapById.get(arcId);
            if (!arc || arc.type !== 'arc') return null;
            const cx = Number(arc.cx);
            const cy = Number(arc.cy);
            if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
            const pid = this.newSketchEntityId('point');
            const p = { id: pid, type: 'point', x: cx, y: cy, fixed: false };
            sketch.entities.push(p);
            mapById.set(pid, p);
            sketch.constraints.push({
                id: this.newSketchEntityId('cst'),
                type: 'arc_center_coincident',
                refs: [arcId, pid],
                data: {},
                created_at: Date.now()
            });
            return pid;
        };
        const axisLine = mapById.get(axis.id);
        if (!axisLine || axisLine.type !== 'line') return;
        const aAxisId = typeof axisLine?.a === 'string' ? axisLine.a : (typeof axisLine?.p1_id === 'string' ? axisLine.p1_id : null);
        const bAxisId = typeof axisLine?.b === 'string' ? axisLine.b : (typeof axisLine?.p2_id === 'string' ? axisLine.p2_id : null);
        const pAxisA = mapById.get(aAxisId);
        const pAxisB = mapById.get(bAxisId);
        if (!pAxisA || !pAxisB) return;
        const axisALocal = { x: pAxisA.x || 0, y: pAxisA.y || 0 };
        const axisBLocal = { x: pAxisB.x || 0, y: pAxisB.y || 0 };

        for (const pid of pointIdsToMirror) {
            const p = mapById.get(pid);
            if (!p || p.type !== 'point') continue;
            if (axisIds.has(pid)) {
                pointMap.set(pid, pid);
                continue;
            }
            const d = pointDistanceToLine(p, axisALocal, axisBLocal);
            if (Number.isFinite(d) && d <= SKETCH_POINT_MERGE_EPS) {
                pointMap.set(pid, pid);
                continue;
            }
            const mp = mirrorLocalPointAcrossLine(p, axisALocal, axisBLocal);
            const nid = this.newSketchEntityId('point');
            const fixed = p.fixed === true;
            sketch.entities.push({
                id: nid,
                type: 'point',
                x: mp.x,
                y: mp.y,
                fixed
            });
            mapById.set(nid, sketch.entities[sketch.entities.length - 1]);
            pointMap.set(pid, nid);
            createdPointIds.push(nid);
            mirrorPointPairs.push([pid, nid]);
        }

        for (const cid of selectedCurveIds) {
            const src = mapById.get(cid);
            if (!src || (src.type !== 'line' && src.type !== 'arc')) continue;
            const aId = typeof src?.a === 'string' ? src.a : (typeof src?.p1_id === 'string' ? src.p1_id : null);
            const bId = typeof src?.b === 'string' ? src.b : (typeof src?.p2_id === 'string' ? src.p2_id : null);
            const na = pointMap.get(aId) || aId;
            const nb = pointMap.get(bId) || bId;
            if (!na || !nb) continue;

            if (src.type === 'line') {
                const lid = this.newSketchEntityId('line');
                sketch.entities.push({
                    id: lid,
                    type: 'line',
                    construction: src.construction === true,
                    a: na,
                    b: nb
                });
                mapById.set(lid, sketch.entities[sketch.entities.length - 1]);
                createdCurveIds.push(lid);
                mirrorLinePairs.push([src.id, lid]);
                continue;
            }

            const aid = this.newSketchEntityId('arc');
            const arc = {
                id: aid,
                type: 'arc',
                construction: src.construction === true,
                a: na,
                b: nb,
                ccw: src.ccw === undefined ? true : src.ccw
            };
            if (Number.isFinite(src.cx) && Number.isFinite(src.cy)) {
                const mc = mirrorLocalPointAcrossLine({ x: src.cx, y: src.cy }, axisALocal, axisBLocal);
                arc.cx = mc.x;
                arc.cy = mc.y;
            }
            if (Number.isFinite(src.mx) && Number.isFinite(src.my)) {
                const mm = mirrorLocalPointAcrossLine({ x: src.mx, y: src.my }, axisALocal, axisBLocal);
                arc.mx = mm.x;
                arc.my = mm.y;
            }
            if (src.data && typeof src.data === 'object') {
                const data = JSON.parse(JSON.stringify(src.data));
                if (Array.isArray(data.threePointIds)) {
                    data.threePointIds = data.threePointIds.map(pid => pointMap.get(pid) || pid);
                }
                arc.data = data;
            }
            if (src.startAngle !== undefined) arc.startAngle = src.startAngle;
            if (src.endAngle !== undefined) arc.endAngle = src.endAngle;
            if (Number.isFinite(src.radius)) arc.radius = src.radius;
            const srcLooksCircle = isLikelyCircleArcEntity(src, mapById);
            if (srcLooksCircle) {
                // Keep circle orientation canonical; circle is orientation-invariant.
                arc.ccw = true;
                if (Number.isFinite(arc.cx) && Number.isFinite(arc.cy)) {
                    const p1 = mapById.get(na);
                    if (p1) {
                        const r = Math.hypot((p1.x || 0) - arc.cx, (p1.y || 0) - arc.cy);
                        if (Number.isFinite(r) && r > SKETCH_MIN_LINE_LENGTH) {
                            arc.radius = r;
                        }
                    }
                }
                if (isThreePointCircle(src)) {
                    markCircleThreePoint(arc);
                } else {
                    markCircleCenterPoint(arc);
                }
            } else {
                // Reflection flips winding.
                arc.ccw = !(src.ccw === false);
                if (Number.isFinite(arc.cx) && Number.isFinite(arc.cy)) {
                    const pa = mapById.get(na);
                    const pb = mapById.get(nb);
                    if (pa && pb) {
                        arc.startAngle = Math.atan2((pa.y || 0) - arc.cy, (pa.x || 0) - arc.cx);
                        arc.endAngle = Math.atan2((pb.y || 0) - arc.cy, (pb.x || 0) - arc.cx);
                        arc.radius = Math.hypot((pa.x || 0) - arc.cx, (pa.y || 0) - arc.cy);
                    }
                }
            }
            sketch.entities.push(arc);
            mapById.set(aid, arc);
            if (srcLooksCircle) {
                const pna = mapById.get(na);
                const pnb = mapById.get(nb);
                if (pna && pnb) {
                    pnb.x = pna.x || 0;
                    pnb.y = pna.y || 0;
                }
                addCoincidentConstraintIfMissing.call(this, sketch, na, nb);
                const srcAId = typeof src?.a === 'string' ? src.a : (typeof src?.p1_id === 'string' ? src.p1_id : null);
                const srcBId = typeof src?.b === 'string' ? src.b : (typeof src?.p2_id === 'string' ? src.p2_id : null);
                if (srcAId && na) skipMirrorPointPairKeys.add(`${srcAId}|${na}`);
                if (srcBId && nb) skipMirrorPointPairKeys.add(`${srcBId}|${nb}`);
                const srcCenterPointId = ensureArcCenterPoint(src.id);
                const dstCenterPointId = ensureArcCenterPoint(aid);
                if (srcCenterPointId && dstCenterPointId) {
                    mirrorPointPairs.push([srcCenterPointId, dstCenterPointId]);
                }
                addMirrorConstraint('equal', [src.id, aid]);
            }
            createdCurveIds.push(aid);
        }

        for (const [srcPointId, dstPointId] of mirrorPointPairs) {
            if (skipMirrorPointPairKeys.has(`${srcPointId}|${dstPointId}`)) {
                continue;
            }
            addMirrorConstraint('mirror_point', [axis.id, srcPointId, dstPointId]);
        }
        for (const [srcLineId, dstLineId] of mirrorLinePairs) {
            addMirrorConstraint('mirror_line', [axis.id, srcLineId, dstLineId]);
        }
        enforceSketchConstraintsInPlace(sketch);
    }, {
        opType: 'feature.update',
        payload: {
            field: 'entities.add',
            entity: 'mirror',
            axis: axis.id
        }
    });

    if (!createdCurveIds.length && !createdPointIds.length) {
        return false;
    }
    if (keepResultSelected) {
        this.selectedSketchEntities.clear();
        this.selectedSketchArcCenters?.clear?.();
        for (const id of createdCurveIds) this.selectedSketchEntities.add(id);
        for (const id of createdPointIds) this.selectedSketchEntities.add(id);
        this.hoveredSketchEntityId = null;
    }
    this.updateSketchInteractionVisuals();
    return true;
}

function resolvePatternCenterLocalFromRef(ref, byId) {
    if (!ref) return null;
    if (ref === '__sketch-origin__') return { x: 0, y: 0 };
    if (typeof ref === 'string' && ref.startsWith('arc-center:')) {
        const arcId = ref.substring('arc-center:'.length);
        const arc = byId.get(arcId);
        if (!arc || arc.type !== 'arc') return null;
        const cx = Number(arc.cx);
        const cy = Number(arc.cy);
        if (Number.isFinite(cx) && Number.isFinite(cy)) return { x: cx, y: cy };
        const aId = typeof arc?.a === 'string' ? arc.a : (typeof arc?.p1_id === 'string' ? arc.p1_id : null);
        const bId = typeof arc?.b === 'string' ? arc.b : (typeof arc?.p2_id === 'string' ? arc.p2_id : null);
        const a = byId.get(aId);
        const b = byId.get(bId);
        const mx = Number(arc?.mx);
        const my = Number(arc?.my);
        if (!a || !b || !Number.isFinite(mx) || !Number.isFinite(my)) return null;
        const geom = computeArcGeometry.call(this, { x: a.x || 0, y: a.y || 0 }, { x: b.x || 0, y: b.y || 0 }, { x: mx, y: my });
        if (!geom) return null;
        return { x: geom.cx, y: geom.cy };
    }
    const p = byId.get(ref);
    if (p?.type === 'point') return { x: p.x || 0, y: p.y || 0 };
    return null;
}

function rotateLocalAroundCenter(local, center, angle) {
    const dx = (local?.x || 0) - (center?.x || 0);
    const dy = (local?.y || 0) - (center?.y || 0);
    const ca = Math.cos(angle);
    const sa = Math.sin(angle);
    return {
        x: (center?.x || 0) + dx * ca - dy * sa,
        y: (center?.y || 0) + dx * sa + dy * ca
    };
}

function rebuildCircularPatternConstraintInSketch(sketch, constraint, countIn = null) {
    if (!constraint || constraint.type !== 'circular_pattern') return false;
    sketch.entities = Array.isArray(sketch.entities) ? sketch.entities : [];
    sketch.constraints = Array.isArray(sketch.constraints) ? sketch.constraints : [];
    constraint.data = constraint.data || {};
    const data = constraint.data;
    const sourceIds = Array.isArray(data.sourceIds) ? data.sourceIds.filter(id => typeof id === 'string' && id) : [];
    const centerRef = typeof data.centerRef === 'string' ? data.centerRef : (Array.isArray(constraint.refs) ? constraint.refs[0] : null);
    const count = Math.max(2, Math.min(256, Number(countIn ?? data.count) || 0));
    if (!sourceIds.length || !centerRef) return false;
    const entitiesById = new Map(sketch.entities.filter(e => e?.id).map(e => [e.id, e]));
    const center = resolvePatternCenterLocalFromRef.call(this, centerRef, entitiesById);
    if (!center) return false;

    const removeIds = new Set();
    for (const refs of data.pointMaps || []) {
        for (const pair of refs || []) {
            if (Array.isArray(pair) && typeof pair[1] === 'string') removeIds.add(pair[1]);
        }
    }
    for (const refs of data.copies || []) {
        for (const id of refs || []) {
            if (typeof id === 'string') removeIds.add(id);
        }
    }
    if (removeIds.size) {
        sketch.entities = sketch.entities.filter(entity => !removeIds.has(entity?.id));
        sketch.constraints = sketch.constraints.filter(c => {
            if (!c || c === constraint) return true;
            const refs = Array.isArray(c?.refs) ? c.refs : [];
            return !refs.some(ref => removeIds.has(ref));
        });
    }

    const refreshedById = new Map(sketch.entities.filter(e => e?.id).map(e => [e.id, e]));
    const sourceEntities = sourceIds.map(id => refreshedById.get(id)).filter(Boolean);
    if (!sourceEntities.length) return false;
    const sourcePointIds = new Set();
    for (const entity of sourceEntities) {
        if (entity.type === 'point') {
            sourcePointIds.add(entity.id);
            continue;
        }
        const aId = typeof entity?.a === 'string' ? entity.a : (typeof entity?.p1_id === 'string' ? entity.p1_id : null);
        const bId = typeof entity?.b === 'string' ? entity.b : (typeof entity?.p2_id === 'string' ? entity.p2_id : null);
        if (aId) sourcePointIds.add(aId);
        if (bId) sourcePointIds.add(bId);
        if (entity.type === 'arc') {
            for (const pid of (entity?.data?.threePointIds || [])) {
                if (typeof pid === 'string') sourcePointIds.add(pid);
            }
        }
    }

    const stepAngle = (Math.PI * 2) / count;
    const copyRefs = [];
    const pointMapRefs = [];
    for (let step = 1; step < count; step++) {
        const angle = step * stepAngle;
        const pointMap = new Map();
        const pointPairs = [];
        for (const srcPointId of sourcePointIds) {
            const srcPoint = refreshedById.get(srcPointId);
            if (!srcPoint || srcPoint.type !== 'point') continue;
            const pos = rotateLocalAroundCenter({ x: srcPoint.x || 0, y: srcPoint.y || 0 }, center, angle);
            const id = this.newSketchEntityId('point');
            const point = {
                id,
                type: 'point',
                x: pos.x,
                y: pos.y,
                fixed: srcPoint.fixed === true
            };
            sketch.entities.push(point);
            refreshedById.set(id, point);
            pointMap.set(srcPointId, id);
            pointPairs.push([srcPointId, id]);
        }
        const stepCopyIds = [];
        for (const src of sourceEntities) {
            if (!src?.id) continue;
            if (src.type === 'point') {
                const id = pointMap.get(src.id);
                if (id) stepCopyIds.push(id);
                continue;
            }
            if (src.type === 'line') {
                const aId = pointMap.get(src.a);
                const bId = pointMap.get(src.b);
                if (!aId || !bId) continue;
                const id = this.newSketchEntityId('line');
                const line = {
                    id,
                    type: 'line',
                    construction: src.construction === true,
                    a: aId,
                    b: bId
                };
                sketch.entities.push(line);
                refreshedById.set(id, line);
                stepCopyIds.push(id);
                continue;
            }
            if (src.type === 'arc') {
                const aId = pointMap.get(src.a);
                const bId = pointMap.get(src.b);
                if (!aId || !bId) continue;
                const id = this.newSketchEntityId('arc');
                const arc = {
                    id,
                    type: 'arc',
                    construction: src.construction === true,
                    a: aId,
                    b: bId,
                    ccw: src.ccw === undefined ? true : src.ccw
                };
                if (Number.isFinite(src.cx) && Number.isFinite(src.cy)) {
                    const c = rotateLocalAroundCenter({ x: src.cx, y: src.cy }, center, angle);
                    arc.cx = c.x;
                    arc.cy = c.y;
                }
                if (Number.isFinite(src.mx) && Number.isFinite(src.my)) {
                    const m = rotateLocalAroundCenter({ x: src.mx, y: src.my }, center, angle);
                    arc.mx = m.x;
                    arc.my = m.y;
                }
                if (src.data && typeof src.data === 'object') {
                    arc.data = JSON.parse(JSON.stringify(src.data));
                    if (Array.isArray(arc.data?.threePointIds)) {
                        arc.data.threePointIds = arc.data.threePointIds.map(pid => pointMap.get(pid) || pid);
                    }
                }
                if (src.startAngle !== undefined) arc.startAngle = src.startAngle + angle;
                if (src.endAngle !== undefined) arc.endAngle = src.endAngle + angle;
                if (Number.isFinite(src.radius)) arc.radius = src.radius;
                if (src.curveType) arc.curveType = src.curveType;
                if (src.curveDef) arc.curveDef = src.curveDef;
                if (src.circle !== undefined) arc.circle = src.circle;
                sketch.entities.push(arc);
                refreshedById.set(id, arc);
                stepCopyIds.push(id);
            }
        }
        pointMapRefs.push(pointPairs);
        copyRefs.push(stepCopyIds);
    }

    constraint.refs = [centerRef, ...sourceIds];
    data.centerRef = centerRef;
    data.count = count;
    data.sourceIds = sourceIds;
    data.pointMaps = pointMapRefs;
    data.copies = copyRefs;
    return true;
}

function circularPatternSelectedSketchGeometry(options = {}) {
    const feature = this.getEditingSketchFeature();
    if (!feature) return false;
    const entities = Array.isArray(feature.entities) ? feature.entities : [];
    const byId = new Map(entities.filter(e => e?.id).map(e => [e.id, e]));
    const selectedIds = new Set(this.selectedSketchEntities || []);
    const centerRef = typeof options?.centerRef === 'string' ? options.centerRef : null;
    const count = Math.max(2, Math.min(256, Number(options?.count) || 3));
    const keepResultSelected = options?.keepResultSelected !== false;
    if (!centerRef || !resolvePatternCenterLocalFromRef.call(this, centerRef, byId)) {
        return false;
    }
    const sourceIdsOpt = Array.isArray(options?.sourceIds) ? options.sourceIds.filter(id => typeof id === 'string' && id) : null;
    const sourceIds = (sourceIdsOpt || Array.from(selectedIds))
        .filter(id => typeof id === 'string' && id !== centerRef && !id.startsWith('arc-center:'));
    const sourceEntities = sourceIds.map(id => byId.get(id)).filter(entity => entity && (entity.type === 'point' || entity.type === 'line' || entity.type === 'arc'));
    if (!sourceEntities.length) return false;
    const normalizedSourceIds = sourceEntities.map(entity => entity.id);
    let changed = false;
    let constraintId = null;
    api.features.update(feature.id, sketch => {
        sketch.constraints = Array.isArray(sketch.constraints) ? sketch.constraints : [];
        const constraint = {
            id: this.newSketchEntityId('cst'),
            type: 'circular_pattern',
            refs: [centerRef, ...normalizedSourceIds],
            data: {
                centerRef,
                count,
                sourceIds: normalizedSourceIds,
                pointMaps: [],
                copies: []
            },
            ui: { offset_px: { x: 0, y: -30 } },
            created_at: Date.now()
        };
        const ok = rebuildCircularPatternConstraintInSketch.call(this, sketch, constraint, count);
        if (!ok) return;
        sketch.constraints.push(constraint);
        constraintId = constraint.id;
        changed = true;
        enforceSketchConstraintsInPlace(sketch);
    }, {
        opType: 'feature.update',
        payload: {
            field: 'entities.add',
            entity: 'circular-pattern',
            count
        }
    });
    if (!changed) return false;
    if (!keepResultSelected) {
        this.selectedSketchEntities.clear();
        this.selectedSketchArcCenters?.clear?.();
    } else if (constraintId) {
        this.selectedSketchConstraints?.clear?.();
        this.selectedSketchConstraints?.add?.(constraintId);
    }
    this.hoveredSketchEntityId = null;
    this.updateSketchInteractionVisuals();
    return true;
}

function updateCircularPatternConstraintCopies(constraintId, count) {
    const feature = this.getEditingSketchFeature();
    if (!feature || !constraintId) return false;
    const nextCount = Math.max(2, Math.min(256, Math.floor(Number(count) || 0)));
    if (!Number.isFinite(nextCount) || nextCount < 2) return false;
    let updated = false;
    api.features.update(feature.id, sketch => {
        sketch.constraints = Array.isArray(sketch.constraints) ? sketch.constraints : [];
        const c = sketch.constraints.find(k => k?.id === constraintId && k?.type === 'circular_pattern');
        if (!c) return;
        const ok = rebuildCircularPatternConstraintInSketch.call(this, sketch, c, nextCount);
        if (!ok) return;
        updated = true;
        enforceSketchConstraintsInPlace(sketch);
    }, {
        opType: 'feature.update',
        payload: { field: 'constraints.circular_pattern.rebuild', id: constraintId, count: nextCount }
    });
    if (!updated) return false;
    this.updateSketchInteractionVisuals();
    return true;
}

function getPatternLineDirection(sketch, centerPointId, lineId, fallback) {
    const entities = Array.isArray(sketch?.entities) ? sketch.entities : [];
    const byId = new Map(entities.filter(e => e?.id).map(e => [e.id, e]));
    const line = byId.get(lineId);
    const center = byId.get(centerPointId);
    if (!line || line.type !== 'line' || !center || center.type !== 'point') return fallback;
    const a = byId.get(line.a);
    const b = byId.get(line.b);
    if (!a || !b) return fallback;
    const other = line.a === centerPointId ? b : line.b === centerPointId ? a : b;
    const dx = (other.x || 0) - (center.x || 0);
    const dy = (other.y || 0) - (center.y || 0);
    if (Math.hypot(dx, dy) < SKETCH_MIN_LINE_LENGTH) return fallback;
    return { x: dx, y: dy };
}

function rebuildGridPatternConstraintInSketch(sketch, constraint, axis = null, axisCount = null) {
    if (!constraint || constraint.type !== 'grid_pattern') return false;
    sketch.entities = Array.isArray(sketch.entities) ? sketch.entities : [];
    sketch.constraints = Array.isArray(sketch.constraints) ? sketch.constraints : [];
    constraint.data = constraint.data || {};
    const data = constraint.data;
    const centerPointId = typeof data.centerPointId === 'string' ? data.centerPointId : null;
    const sourceIds = Array.isArray(data.sourceIds) ? data.sourceIds.filter(id => typeof id === 'string' && id) : [];
    const countH = Math.max(1, Math.min(256, Number((axis === 'h' ? axisCount : data.countH) || 0) || 3));
    const countV = Math.max(1, Math.min(256, Number((axis === 'v' ? axisCount : data.countV) || 0) || 3));
    if (!centerPointId || !sourceIds.length) return false;

    const removeIds = new Set();
    for (const rec of (data.pointMaps || [])) {
        for (const pair of (rec?.pairs || [])) {
            if (Array.isArray(pair) && typeof pair[1] === 'string') removeIds.add(pair[1]);
        }
    }
    for (const rec of (data.copies || [])) {
        for (const id of (rec?.ids || [])) {
            if (typeof id === 'string') removeIds.add(id);
        }
    }
    if (removeIds.size) {
        sketch.entities = sketch.entities.filter(entity => !removeIds.has(entity?.id));
        sketch.constraints = sketch.constraints.filter(c => {
            if (!c || c === constraint) return true;
            const refs = Array.isArray(c?.refs) ? c.refs : [];
            return !refs.some(ref => removeIds.has(ref));
        });
    }

    const byId = new Map(sketch.entities.filter(e => e?.id).map(e => [e.id, e]));
    const center = byId.get(centerPointId);
    if (!center || center.type !== 'point') return false;
    const sourceEntities = sourceIds.map(id => byId.get(id)).filter(Boolean);
    if (!sourceEntities.length) return false;
    const sourcePointIds = new Set();
    for (const entity of sourceEntities) {
        if (entity.type === 'point') sourcePointIds.add(entity.id);
        if (entity.type === 'line' || entity.type === 'arc') {
            if (typeof entity.a === 'string') sourcePointIds.add(entity.a);
            if (typeof entity.b === 'string') sourcePointIds.add(entity.b);
            for (const pid of (entity?.data?.threePointIds || [])) {
                if (typeof pid === 'string') sourcePointIds.add(pid);
            }
        }
    }

    const u = getPatternLineDirection(sketch, centerPointId, data.uLineId, { x: 20, y: 0 });
    const v = getPatternLineDirection(sketch, centerPointId, data.vLineId, { x: 0, y: 20 });
    const pointMaps = [];
    const copies = [];
    for (let i = 0; i < countH; i++) {
        for (let j = 0; j < countV; j++) {
            if (i === 0 && j === 0) continue;
            const ox = i * (u.x || 0) + j * (v.x || 0);
            const oy = i * (u.y || 0) + j * (v.y || 0);
            const pointMap = new Map();
            const pairs = [];
            for (const srcPointId of sourcePointIds) {
                const srcPoint = byId.get(srcPointId);
                if (!srcPoint || srcPoint.type !== 'point') continue;
                const id = this.newSketchEntityId('point');
                const point = {
                    id,
                    type: 'point',
                    x: (srcPoint.x || 0) + ox,
                    y: (srcPoint.y || 0) + oy,
                    fixed: srcPoint.fixed === true
                };
                sketch.entities.push(point);
                byId.set(id, point);
                pointMap.set(srcPointId, id);
                pairs.push([srcPointId, id]);
            }
            const ids = [];
            for (const src of sourceEntities) {
                if (!src?.id) continue;
                if (src.type === 'point') {
                    const id = pointMap.get(src.id);
                    if (id) ids.push(id);
                    continue;
                }
                if (src.type === 'line') {
                    const aId = pointMap.get(src.a);
                    const bId = pointMap.get(src.b);
                    if (!aId || !bId) continue;
                    const id = this.newSketchEntityId('line');
                    const line = { id, type: 'line', construction: src.construction === true, a: aId, b: bId };
                    sketch.entities.push(line);
                    byId.set(id, line);
                    ids.push(id);
                    continue;
                }
                if (src.type === 'arc') {
                    const aId = pointMap.get(src.a);
                    const bId = pointMap.get(src.b);
                    if (!aId || !bId) continue;
                    const id = this.newSketchEntityId('arc');
                    const arc = {
                        id,
                        type: 'arc',
                        construction: src.construction === true,
                        a: aId,
                        b: bId,
                        ccw: src.ccw === undefined ? true : src.ccw
                    };
                    if (Number.isFinite(src.cx) && Number.isFinite(src.cy)) {
                        arc.cx = (src.cx || 0) + ox;
                        arc.cy = (src.cy || 0) + oy;
                    }
                    if (Number.isFinite(src.mx) && Number.isFinite(src.my)) {
                        arc.mx = (src.mx || 0) + ox;
                        arc.my = (src.my || 0) + oy;
                    }
                    if (src.data && typeof src.data === 'object') {
                        arc.data = JSON.parse(JSON.stringify(src.data));
                        if (Array.isArray(arc.data?.threePointIds)) {
                            arc.data.threePointIds = arc.data.threePointIds.map(pid => pointMap.get(pid) || pid);
                        }
                    }
                    if (src.startAngle !== undefined) arc.startAngle = src.startAngle;
                    if (src.endAngle !== undefined) arc.endAngle = src.endAngle;
                    if (Number.isFinite(src.radius)) arc.radius = src.radius;
                    if (src.curveType) arc.curveType = src.curveType;
                    if (src.curveDef) arc.curveDef = src.curveDef;
                    if (src.circle !== undefined) arc.circle = src.circle;
                    sketch.entities.push(arc);
                    byId.set(id, arc);
                    ids.push(id);
                }
            }
            pointMaps.push({ i, j, pairs });
            copies.push({ i, j, ids });
        }
    }

    data.countH = countH;
    data.countV = countV;
    data.pointMaps = pointMaps;
    data.copies = copies;
    constraint.refs = [centerPointId, data.uLineId, data.vLineId, ...sourceIds];
    return true;
}

function gridPatternSelectedSketchGeometry(options = {}) {
    const feature = this.getEditingSketchFeature();
    if (!feature) return false;
    const entities = Array.isArray(feature.entities) ? feature.entities : [];
    const byId = new Map(entities.filter(e => e?.id).map(e => [e.id, e]));
    const selectedIds = new Set(this.selectedSketchEntities || []);
    const centerRef = typeof options?.centerRef === 'string' ? options.centerRef : null;
    if (!centerRef || !byId.get(centerRef) || byId.get(centerRef)?.type !== 'point') return false;
    const sourceIdsOpt = Array.isArray(options?.sourceIds) ? options.sourceIds.filter(id => typeof id === 'string' && id) : null;
    const sourceIds = (sourceIdsOpt || Array.from(selectedIds))
        .filter(id => typeof id === 'string' && id !== centerRef && !id.startsWith('arc-center:'));
    const sourceEntities = sourceIds.map(id => byId.get(id)).filter(entity => entity && (entity.type === 'point' || entity.type === 'line' || entity.type === 'arc'));
    if (!sourceEntities.length) return false;
    const normalizedSourceIds = sourceEntities.map(entity => entity.id);
    const center = byId.get(centerRef);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const entity of sourceEntities) {
        if (entity.type === 'point') {
            minX = Math.min(minX, entity.x || 0); maxX = Math.max(maxX, entity.x || 0);
            minY = Math.min(minY, entity.y || 0); maxY = Math.max(maxY, entity.y || 0);
            continue;
        }
        for (const pid of [entity.a, entity.b]) {
            const p = byId.get(pid);
            if (!p) continue;
            minX = Math.min(minX, p.x || 0); maxX = Math.max(maxX, p.x || 0);
            minY = Math.min(minY, p.y || 0); maxY = Math.max(maxY, p.y || 0);
        }
    }
    const stepX = Math.max(10, Number.isFinite(maxX - minX) ? (maxX - minX) : 20);
    const stepY = Math.max(10, Number.isFinite(maxY - minY) ? (maxY - minY) : 20);

    let changed = false;
    let constraintId = null;
    api.features.update(feature.id, sketch => {
        sketch.entities = Array.isArray(sketch.entities) ? sketch.entities : [];
        sketch.constraints = Array.isArray(sketch.constraints) ? sketch.constraints : [];
        const hu = this.newSketchEntityId('point');
        const hv = this.newSketchEntityId('point');
        const lu = this.newSketchEntityId('line');
        const lv = this.newSketchEntityId('line');
        sketch.entities.push({ id: hu, type: 'point', x: (center.x || 0) + stepX, y: center.y || 0, fixed: false });
        sketch.entities.push({ id: hv, type: 'point', x: center.x || 0, y: (center.y || 0) + stepY, fixed: false });
        sketch.entities.push({ id: lu, type: 'line', construction: true, a: centerRef, b: hu });
        sketch.entities.push({ id: lv, type: 'line', construction: true, a: centerRef, b: hv });
        const constraint = {
            id: this.newSketchEntityId('cst'),
            type: 'grid_pattern',
            refs: [centerRef, lu, lv, ...normalizedSourceIds],
            data: {
                centerPointId: centerRef,
                sourceIds: normalizedSourceIds,
                countH: 3,
                countV: 3,
                uLineId: lu,
                vLineId: lv,
                pointMaps: [],
                copies: []
            },
            ui: { offset_px: { x: 0, y: -24 } },
            created_at: Date.now()
        };
        this.toggleSketchConstraintInList(sketch, sketch.constraints, 'horizontal', [lu]);
        this.toggleSketchConstraintInList(sketch, sketch.constraints, 'vertical', [lv]);
        const ok = rebuildGridPatternConstraintInSketch.call(this, sketch, constraint);
        if (!ok) return;
        sketch.constraints.push(constraint);
        constraintId = constraint.id;
        changed = true;
        enforceSketchConstraintsInPlace(sketch);
    }, {
        opType: 'feature.update',
        payload: {
            field: 'entities.add',
            entity: 'grid-pattern'
        }
    });
    if (!changed) return false;
    this.selectedSketchConstraints?.clear?.();
    if (constraintId) this.selectedSketchConstraints?.add?.(constraintId);
    this.updateSketchInteractionVisuals();
    return true;
}

function updateGridPatternConstraintCopies(constraintId, axis = 'h', count = 3) {
    const feature = this.getEditingSketchFeature();
    if (!feature || !constraintId) return false;
    const nextCount = Math.max(1, Math.min(256, Math.floor(Number(count) || 0)));
    if (!Number.isFinite(nextCount) || nextCount < 1) return false;
    let updated = false;
    api.features.update(feature.id, sketch => {
        sketch.constraints = Array.isArray(sketch.constraints) ? sketch.constraints : [];
        const c = sketch.constraints.find(k => k?.id === constraintId && k?.type === 'grid_pattern');
        if (!c) return;
        const ok = rebuildGridPatternConstraintInSketch.call(this, sketch, c, axis, nextCount);
        if (!ok) return;
        updated = true;
        enforceSketchConstraintsInPlace(sketch);
    }, {
        opType: 'feature.update',
        payload: { field: 'constraints.grid_pattern.rebuild', id: constraintId, axis, count: nextCount }
    });
    if (!updated) return false;
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
            source: null
        };
        const p2 = {
            id: this.newSketchEntityId('point'),
            type: 'point',
            x: candidate.bLocal.x || 0,
            y: candidate.bLocal.y || 0,
            fixed: true,
            derived: true,
            source: null
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

function deriveSelectionsAtomic(feature, selection = {}) {
    if (!feature || feature.type !== 'sketch') return false;
    const edges = Array.isArray(selection?.edges) ? selection.edges : [];
    const points = Array.isArray(selection?.points) ? selection.points : [];
    const faces = Array.isArray(selection?.faces) ? selection.faces : [];
    const basis = this.getSketchBasis(feature);
    if (!basis) return false;
    let added = 0;
    const createdIds = [];
    api.features.update(feature.id, sketch => {
        sketch.entities = Array.isArray(sketch.entities) ? sketch.entities : [];
        const entities = sketch.entities;
        const pointById = new Map(entities.filter(e => e?.id).map(e => [e.id, e]));
        const ensurePoint = (local, source = null) => {
            const existing = this.findPointByCoord(sketch, local, SKETCH_POINT_MERGE_EPS);
            if (existing) {
                existing.derived = true;
                existing.fixed = true;
                if (source) existing.source = source;
                return existing;
            }
            const point = {
                id: this.newSketchEntityId('point'),
                type: 'point',
                x: local.x || 0,
                y: local.y || 0,
                fixed: true,
                derived: true,
                source: source || null
            };
            entities.push(point);
            pointById.set(point.id, point);
            added++;
            createdIds.push(point.id);
            return point;
        };
        const hasDerivedLine = (source = null) => {
            if (!source?.a || !source?.b) return null;
            for (const line of entities) {
                if (line?.type !== 'line' || !line?.derived || line?.source?.type !== 'solid-edge') continue;
                const ls = line.source || {};
                if (String(ls.solid_id || '') !== String(source.solid_id || '')) continue;
                if (String(ls.solid_feature_id || '') !== String(source.solid_feature_id || '')) continue;
                if (!ls?.a || !ls?.b) continue;
                const sameA = Math.hypot((ls.a.x || 0) - (source.a.x || 0), (ls.a.y || 0) - (source.a.y || 0), (ls.a.z || 0) - (source.a.z || 0)) < 1e-6;
                const sameB = Math.hypot((ls.b.x || 0) - (source.b.x || 0), (ls.b.y || 0) - (source.b.y || 0), (ls.b.z || 0) - (source.b.z || 0)) < 1e-6;
                const swapA = Math.hypot((ls.a.x || 0) - (source.b.x || 0), (ls.a.y || 0) - (source.b.y || 0), (ls.a.z || 0) - (source.b.z || 0)) < 1e-6;
                const swapB = Math.hypot((ls.b.x || 0) - (source.a.x || 0), (ls.b.y || 0) - (source.a.y || 0), (ls.b.z || 0) - (source.a.z || 0)) < 1e-6;
                if ((sameA && sameB) || (swapA && swapB)) return line;
            }
            return null;
        };
        const ensureLine = (aLocal, bLocal, source = null) => {
            if (!aLocal || !bLocal) return null;
            if (source) {
                const existing = hasDerivedLine(source);
                if (existing) return existing;
            }
            // Endpoint points are often shared by multiple derived edges.
            // Keep them unsourced so refresh uses line sources only.
            const p1 = ensurePoint(aLocal, null);
            const p2 = ensurePoint(bLocal, null);
            if (!p1 || !p2 || p1.id === p2.id) return null;
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
            entities.push(line);
            added++;
            createdIds.push(line.id);
            return line;
        };

        for (const p of points) {
            const local = p?.local || null;
            if (!local) continue;
            ensurePoint(local, p?.source || null);
        }
        for (const e of edges) {
            ensureLine(e?.aLocal || null, e?.bLocal || null, e?.source || null);
        }
        for (const faceKey of faces) {
            const segs = api.solids?.getFaceBoundarySegments?.(faceKey) || [];
            const solidId = String(faceKey || '').split(':').slice(0, -1).join(':');
            const faceIdRaw = String(faceKey || '').split(':').slice(-1)[0];
            const faceId = Number(faceIdRaw);
            const faceTarget = api.solids?.getSketchTargetForFaceKey?.(faceKey) || null;
            const faceFrame = faceTarget?.frame || null;
            const faceBasis = (() => {
                if (!faceFrame?.origin || !faceFrame?.normal || !faceFrame?.x_axis) return null;
                const origin = {
                    x: Number(faceFrame.origin.x || 0),
                    y: Number(faceFrame.origin.y || 0),
                    z: Number(faceFrame.origin.z || 0)
                };
                const normal = {
                    x: Number(faceFrame.normal.x || 0),
                    y: Number(faceFrame.normal.y || 0),
                    z: Number(faceFrame.normal.z || 1)
                };
                const xAxis = {
                    x: Number(faceFrame.x_axis.x || 1),
                    y: Number(faceFrame.x_axis.y || 0),
                    z: Number(faceFrame.x_axis.z || 0)
                };
                const nx = normal.x, ny = normal.y, nz = normal.z;
                const nlen = Math.hypot(nx, ny, nz) || 1;
                const n = { x: nx / nlen, y: ny / nlen, z: nz / nlen };
                let xx = xAxis.x, xy = xAxis.y, xz = xAxis.z;
                const xdotn = xx * n.x + xy * n.y + xz * n.z;
                xx -= n.x * xdotn; xy -= n.y * xdotn; xz -= n.z * xdotn;
                const xlen = Math.hypot(xx, xy, xz) || 1;
                const x = { x: xx / xlen, y: xy / xlen, z: xz / xlen };
                const y = {
                    x: n.y * x.z - n.z * x.y,
                    y: n.z * x.x - n.x * x.z,
                    z: n.x * x.y - n.y * x.x
                };
                return { origin, x, y };
            })();
            const worldToFaceLocal = world => {
                if (!faceBasis || !world) return null;
                const rx = (world.x || 0) - faceBasis.origin.x;
                const ry = (world.y || 0) - faceBasis.origin.y;
                const rz = (world.z || 0) - faceBasis.origin.z;
                return {
                    x: rx * faceBasis.x.x + ry * faceBasis.x.y + rz * faceBasis.x.z,
                    y: rx * faceBasis.y.x + ry * faceBasis.y.y + rz * faceBasis.y.z
                };
            };
            for (let segIndex = 0; segIndex < segs.length; segIndex++) {
                const seg = segs[segIndex];
                if (!seg?.a || !seg?.b) continue;
                const aLocal = this.worldToSketchLocal(seg.a, basis);
                const bLocal = this.worldToSketchLocal(seg.b, basis);
                if (!aLocal || !bLocal) continue;
                ensureLine(aLocal, bLocal, {
                    type: 'solid-edge',
                    entity: {
                        kind: 'boundary-segment',
                        id: `segment:faceedge:${faceKey}:${segIndex}`
                    },
                    solid_id: solidId,
                    solid_feature_id: faceTarget?.source?.solid_feature_id || null,
                    face_id: Number.isFinite(faceId) ? faceId : null,
                    face_frame: faceFrame || null,
                    face_key: faceKey,
                    boundary_segment_id: `faceedge:${faceKey}:${segIndex}`,
                    local_a: worldToFaceLocal(seg.a) || null,
                    local_b: worldToFaceLocal(seg.b) || null,
                    edge_index: segIndex,
                    a: { x: seg.a.x, y: seg.a.y, z: seg.a.z },
                    b: { x: seg.b.x, y: seg.b.y, z: seg.b.z }
                });
            }
        }
    }, {
        opType: 'feature.update',
        payload: {
            field: 'entities.add',
            entity: 'derived-batch',
            counts: { edges: edges.length, points: points.length, faces: faces.length }
        }
    });
    if (!added) return false;
    this.selectedSketchEntities.clear();
    this.selectedSketchArcCenters?.clear?.();
    for (const id of createdIds) this.selectedSketchEntities.add(id);
    return true;
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
        const world = api.solids?.resolvePointFromSource?.(source) || null;
        if (!world) return;
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
    mirrorSelectedSketchGeometry,
    getSelectedSketchCircle,
    getCircleData,
    computeArcGeometry,
    computeArcGeometryFromCenter,
    computeCircleFromThreePoints,
    addCoincidentConstraintIfMissing,
    convertArcToCircleInSketch,
    createDerivedSketchPoint,
    createDerivedSketchLine,
    deriveSelectionsAtomic,
    refreshDerivedSketchGeometry,
    circularPatternSelectedSketchGeometry,
    updateCircularPatternConstraintCopies,
    gridPatternSelectedSketchGeometry,
    updateGridPatternConstraintCopies
};
