/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { api } from '../api.js';
import { enforceSketchConstraintsInPlace } from '../sketch_constraints.js';
import * as sketchCreate from './sketch_create.js';
import { isCircleCurve } from '../sketch_curve.js';
import {
    SKETCH_DRAG_START_PX,
    SKETCH_MIN_LINE_LENGTH,
    SKETCH_VIRTUAL_ORIGIN_ID
} from './sketch_constants.js';

function handleSketchPointerDown(event, intersections) {
    const feature = this.getEditingSketchFeature();
    if (!feature) {
        return false;
    }

    this.sketchPointerSeq = (this.sketchPointerSeq || 0) + 1;
    const seq = this.sketchPointerSeq;
    const local = this.projectEventToSketchLocal(event, feature);
    const hit = this.resolveSketchHit(event, intersections, feature);
    const hitLocal = this.getSketchHitLocalPoint(feature, hit);

    this.sketchPointerDown = {
        seq,
        local,
        hitId: hit?.id || this.hoveredSketchEntityId || null,
        hitType: hit?.type || null,
        clientX: event?.clientX ?? 0,
        clientY: event?.clientY ?? 0
    };

    if (this.getSketchTool() === 'line' && !this.sketchLineStart) {
        const start = hitLocal || local;
        if (!start) {
            return true;
        }
        this.sketchLineStart = start;
        this.sketchLineStartRefId = (hit?.type === 'point' && hit?.id && hit.id !== SKETCH_VIRTUAL_ORIGIN_ID) ? hit.id : null;
        this.sketchLineStartSeq = seq;
        this.sketchLinePreview = { a: start, b: start };
        this.updateSketchInteractionVisuals();
    }
    if ((this.getSketchTool() === 'rect' || this.getSketchTool() === 'rect-center') && !this.sketchRectStart) {
        const start = hitLocal || local;
        if (!start) {
            return true;
        }
        this.sketchRectStart = start;
        this.sketchRectStartRefId = (hit?.type === 'point' && hit?.id && hit.id !== SKETCH_VIRTUAL_ORIGIN_ID) ? hit.id : null;
        this.sketchRectStartSeq = seq;
        this.sketchRectPreview = this.makeSketchRectPreview(start, start, this.getSketchTool() === 'rect-center');
        this.updateSketchInteractionVisuals();
    }
    if (this.getSketchTool() === 'circle' && !this.sketchCircleCenter) {
        const start = hitLocal || local;
        if (!start) {
            return true;
        }
        this.sketchCircleCenter = start;
        this.sketchCircleCenterRefId = null;
        this.sketchCircleStartSeq = seq;
        this.updateSketchInteractionVisuals();
    }
    return true;
}

function handleSketchHover(event, intersections) {
    const feature = this.getEditingSketchFeature();
    if (!feature) {
        return false;
    }

    if (this.sketchDrag) {
        return true;
    }

    const tool = this.getSketchTool();
    let previewChanged = false;
    if (tool === 'line' && this.sketchLineStart) {
        const local = event ? this.projectEventToSketchLocal(event, feature) : null;
        const next = local ? { a: this.sketchLineStart, b: local } : null;
        const prev = this.sketchLinePreview;
        const same = !!(prev && next
            && prev.a && next.a
            && prev.b && next.b
            && prev.a.x === next.a.x
            && prev.a.y === next.a.y
            && prev.b.x === next.b.x
            && prev.b.y === next.b.y);
        if (!same) {
            this.sketchLinePreview = next;
            previewChanged = true;
        }
    } else if (this.sketchLinePreview !== null) {
        this.sketchLinePreview = null;
        previewChanged = true;
    }

    if (tool === 'arc') {
        const local = event ? this.projectEventToSketchLocal(event, feature) : null;
        let nextArc = null;
        if (this.sketchArcStart && !this.sketchArcEnd && local) {
            nextArc = { mode: 'chord', a: this.sketchArcStart, b: local };
        } else if (this.sketchArcStart && this.sketchArcEnd && local) {
            const geom = this.computeArcGeometry(this.sketchArcStart, this.sketchArcEnd, local);
            if (geom) nextArc = { mode: 'arc', a: this.sketchArcStart, b: this.sketchArcEnd, ...geom };
        }
        const sameArc = JSON.stringify(this.sketchArcPreview || null) === JSON.stringify(nextArc || null);
        if (!sameArc) {
            this.sketchArcPreview = nextArc;
            previewChanged = true;
        }
    } else if (this.sketchArcPreview !== null) {
        this.sketchArcPreview = null;
        previewChanged = true;
    }

    if (tool === 'circle') {
        const local = event ? this.projectEventToSketchLocal(event, feature) : null;
        let nextArc = null;
        if (this.sketchCircleCenter && local) {
            const radius = Math.hypot((local.x || 0) - (this.sketchCircleCenter.x || 0), (local.y || 0) - (this.sketchCircleCenter.y || 0));
            if (radius > SKETCH_MIN_LINE_LENGTH) {
                nextArc = {
                    mode: 'circle',
                    circle: true,
                    cx: this.sketchCircleCenter.x || 0,
                    cy: this.sketchCircleCenter.y || 0,
                    radius
                };
            }
        }
        const sameArc = JSON.stringify(this.sketchArcPreview || null) === JSON.stringify(nextArc || null);
        if (!sameArc) {
            this.sketchArcPreview = nextArc;
            previewChanged = true;
        }
    }
    if (tool === 'rect' || tool === 'rect-center') {
        const local = event ? this.projectEventToSketchLocal(event, feature) : null;
        let nextRect = null;
        if (this.sketchRectStart && local) {
            nextRect = this.makeSketchRectPreview(this.sketchRectStart, local, tool === 'rect-center');
        }
        const sameRect = JSON.stringify(this.sketchRectPreview || null) === JSON.stringify(nextRect || null);
        if (!sameRect) {
            this.sketchRectPreview = nextRect;
            previewChanged = true;
        }
    } else if (this.sketchRectPreview !== null) {
        this.sketchRectPreview = null;
        previewChanged = true;
    }

    const hit = this.resolveSketchHit(event, intersections, feature);
    const hoveredId = hit && !this.selectedSketchEntities.has(hit.id) ? hit.id : null;
    if (this.hoveredSketchEntityId !== hoveredId || previewChanged) {
        this.hoveredSketchEntityId = hoveredId;
        this.updateSketchInteractionVisuals();
    }
    return true;
}

function handleSketchPointerMove(event) {
    const feature = this.getEditingSketchFeature();
    if (!feature || this.getSketchTool() !== 'select') return false;
    if (!this.sketchPointerDown) return false;
    if (!(event?.buttons & 1)) return false;
    if (this.sketchDrag) return false;
    if (this.pointerDistance(event, this.sketchPointerDown) < SKETCH_DRAG_START_PX) return false;
    const downId = this.sketchPointerDown.hitId || this.hoveredSketchEntityId || null;
    if (downId && downId !== SKETCH_VIRTUAL_ORIGIN_ID) return false;
    if (!this.sketchMarquee) this.startSketchMarquee(feature, this.sketchPointerDown, event);
    else this.updateSketchMarquee(event);
    this.hoveredSketchEntityId = null;
    this.updateSketchInteractionVisuals();
    return true;
}

function handleSketchMouseUp(event, intersections) {
    const feature = this.getEditingSketchFeature();
    if (!feature) return false;
    const tool = this.getSketchTool();
    const allowOutsideViewport = tool === 'circle' && !!this.sketchCircleCenter;
    if (!allowOutsideViewport && !this.isSketchEventInViewport(event)) return false;
    if (this.sketchMarquee) {
        this.finishSketchMarquee(feature);
        return true;
    }

    const pointerDown = this.sketchPointerDown;
    const dist = pointerDown ? this.pointerDistance(event, pointerDown) : 0;
    const wasDrag = !!this.sketchDrag;
    if (wasDrag) return true;

    if (tool === 'select') {
        const upHit = this.resolveSketchHit(event, intersections, feature);
        const hit = upHit || (pointerDown?.hitId ? { id: pointerDown.hitId } : null) || (this.hoveredSketchEntityId ? { id: this.hoveredSketchEntityId } : null);
        if (hit?.id) {
            if (hit.id === SKETCH_VIRTUAL_ORIGIN_ID) {
                this.updateSketchInteractionVisuals();
                return true;
            }
            const isArcCenter = hit.type === 'arc-center';
            if (this.selectedSketchEntities.has(hit.id)) {
                this.selectedSketchEntities.delete(hit.id);
                this.selectedSketchArcCenters?.delete?.(hit.id);
            } else {
                this.selectedSketchEntities.add(hit.id);
                if (isArcCenter) this.selectedSketchArcCenters?.add?.(hit.id);
                else this.selectedSketchArcCenters?.delete?.(hit.id);
            }
        } else {
            this.selectedSketchEntities.clear();
            this.selectedSketchArcCenters?.clear?.();
        }
        this.updateSketchInteractionVisuals();
        return true;
    }

    if (tool === 'point') {
        if (dist > SKETCH_DRAG_START_PX) return true;
        const local = this.projectEventToSketchLocal(event, feature);
        if (!local) return true;
        this.createSketchPoint(feature, local);
        return true;
    }

    if (tool === 'line') {
        const upHit = this.resolveSketchHit(event, intersections, feature);
        const fallbackHovered = this.hoveredSketchEntityId && this.hoveredSketchEntityId !== SKETCH_VIRTUAL_ORIGIN_ID ? { id: this.hoveredSketchEntityId, type: 'point' } : null;
        const resolved = upHit || fallbackHovered;
        const local = this.getSketchHitLocalPoint(feature, resolved) || this.projectEventToSketchLocal(event, feature);
        const endRefId = (resolved?.type === 'point' && resolved?.id && resolved.id !== SKETCH_VIRTUAL_ORIGIN_ID) ? resolved.id : null;
        if (!local || !this.sketchLineStart) return true;
        if (this.sketchLineStartSeq === pointerDown?.seq) {
            if (dist > SKETCH_DRAG_START_PX) {
                this.createSketchLine(feature, this.sketchLineStart, local, { startRefId: this.sketchLineStartRefId || null, endRefId });
                this.cancelSketchLine();
            }
            return true;
        }
        const created = this.createSketchLine(feature, this.sketchLineStart, local, { startRefId: this.sketchLineStartRefId || null, endRefId });
        if (this.getSketchHitLocalPoint(feature, resolved)) {
            this.cancelSketchLine();
            this.setSketchTool('select');
            return true;
        }
        this.sketchLineStart = { x: local.x, y: local.y };
        this.sketchLineStartRefId = created?.endPointId || null;
        this.sketchLineStartSeq = null;
        return true;
    }

    if (tool === 'arc') {
        const upHit = this.resolveSketchHit(event, intersections, feature);
        const fallbackHovered = this.hoveredSketchEntityId && this.hoveredSketchEntityId !== SKETCH_VIRTUAL_ORIGIN_ID ? { id: this.hoveredSketchEntityId, type: 'point' } : null;
        const resolved = upHit || fallbackHovered;
        const local = this.getSketchHitLocalPoint(feature, resolved) || this.projectEventToSketchLocal(event, feature);
        const refId = (resolved?.type === 'point' && resolved?.id && resolved.id !== SKETCH_VIRTUAL_ORIGIN_ID) ? resolved.id : null;
        if (!local) return true;
        if (!this.sketchArcStart) {
            const downLocal = pointerDown?.local;
            const downRefId = (pointerDown?.hitId && pointerDown.hitId !== SKETCH_VIRTUAL_ORIGIN_ID) ? pointerDown.hitId : null;
            if (downLocal && dist > SKETCH_DRAG_START_PX) {
                this.sketchArcStart = { x: downLocal.x, y: downLocal.y };
                this.sketchArcStartRefId = downRefId;
                this.sketchArcEnd = { x: local.x, y: local.y };
                this.sketchArcEndRefId = refId;
                this.sketchArcPreview = null;
                this.updateSketchInteractionVisuals();
                return true;
            }
            this.sketchArcStart = { x: local.x, y: local.y };
            this.sketchArcStartRefId = refId;
            this.sketchArcEnd = null;
            this.sketchArcEndRefId = null;
            this.sketchArcPreview = null;
            this.updateSketchInteractionVisuals();
            return true;
        }
        if (!this.sketchArcEnd) {
            this.sketchArcEnd = { x: local.x, y: local.y };
            this.sketchArcEndRefId = refId;
            this.updateSketchInteractionVisuals();
            return true;
        }
        const created = this.createSketchArc(feature, this.sketchArcStart, this.sketchArcEnd, local, {
            startRefId: this.sketchArcStartRefId || null,
            endRefId: this.sketchArcEndRefId || null
        });
        if (created) {
            this.cancelSketchArc();
            this.setSketchTool('select');
        }
        return true;
    }

    if (tool === 'circle') {
        const upHit = this.resolveSketchHit(event, intersections, feature);
        const fallbackHovered = this.hoveredSketchEntityId && this.hoveredSketchEntityId !== SKETCH_VIRTUAL_ORIGIN_ID ? { id: this.hoveredSketchEntityId, type: 'point' } : null;
        const resolved = upHit || fallbackHovered;
        const unsnappedLocal = this.projectEventToSketchLocal(event, feature);
        const snappedLocal = this.getSketchHitLocalPoint(feature, resolved) || unsnappedLocal;
        if (!this.sketchCircleCenter) return true;
        let end = unsnappedLocal || snappedLocal;
        if (!end && this.sketchArcPreview?.mode === 'circle') {
            end = {
                x: (this.sketchArcPreview.cx || 0) + (this.sketchArcPreview.radius || 0),
                y: this.sketchArcPreview.cy || 0
            };
        }
        if (!end) return true;
        const radial = Math.hypot((end.x || 0) - (this.sketchCircleCenter.x || 0), (end.y || 0) - (this.sketchCircleCenter.y || 0));
        if (!Number.isFinite(radial) || radial <= SKETCH_MIN_LINE_LENGTH) return true;
        const created = this.createSketchCircle(feature, this.sketchCircleCenter, end, {
            centerRefId: this.sketchCircleCenterRefId || null
        });
        if (created) {
            this.cancelSketchCircle();
            this.setSketchTool('select');
        }
        return true;
    }

    if (tool === 'rect' || tool === 'rect-center') {
        const upHit = this.resolveSketchHit(event, intersections, feature);
        const fallbackHovered = this.hoveredSketchEntityId && this.hoveredSketchEntityId !== SKETCH_VIRTUAL_ORIGIN_ID ? { id: this.hoveredSketchEntityId, type: 'point' } : null;
        const resolved = upHit || fallbackHovered;
        const local = this.getSketchHitLocalPoint(feature, resolved) || this.projectEventToSketchLocal(event, feature);
        const endRefId = (resolved?.type === 'point' && resolved?.id && resolved.id !== SKETCH_VIRTUAL_ORIGIN_ID) ? resolved.id : null;
        if (!local || !this.sketchRectStart) return true;
        const centerMode = tool === 'rect-center';
        if (this.sketchRectStartSeq === pointerDown?.seq) {
            if (dist > SKETCH_DRAG_START_PX) {
                this.createSketchRectangle(feature, this.sketchRectStart, local, { centerMode, startRefId: this.sketchRectStartRefId || null, endRefId });
                this.cancelSketchRect();
                this.setSketchTool('select');
            }
            return true;
        }
        const created = this.createSketchRectangle(feature, this.sketchRectStart, local, {
            centerMode,
            startRefId: this.sketchRectStartRefId || null,
            endRefId
        });
        if (created) {
            this.cancelSketchRect();
            this.setSketchTool('select');
        }
        return true;
    }

    return true;
}

function handleSketchDrag(delta, offset, isDone) {
    const feature = this.getEditingSketchFeature();
    if (!feature) return false;
    const tool = this.getSketchTool();

    if (tool === 'line') {
        if (!isDone) {
            const local = this.projectEventToSketchLocal(delta?.event, feature);
            if (this.sketchLineStart && local) {
                this.sketchLinePreview = { a: this.sketchLineStart, b: local };
                this.updateSketchInteractionVisuals();
            }
            return true;
        }
        if (!this.sketchLineStart || this.sketchLineStartSeq !== this.sketchPointerDown?.seq) {
            return true;
        }
        const local = this.sketchLinePreview?.b || null;
        if (!local) return true;
        this.createSketchLine(feature, this.sketchLineStart, local, {
            startRefId: this.sketchLineStartRefId || null,
            endRefId: null
        });
        this.cancelSketchLine();
        this.setSketchTool('select');
        return true;
    }

    if (tool === 'rect' || tool === 'rect-center') {
        const centerMode = tool === 'rect-center';
        if (!isDone) {
            const local = this.projectEventToSketchLocal(delta?.event, feature);
            if (this.sketchRectStart && local) {
                this.sketchRectPreview = this.makeSketchRectPreview(this.sketchRectStart, local, centerMode);
                this.updateSketchInteractionVisuals();
            }
            return true;
        }
        if (!this.sketchRectStart || this.sketchRectStartSeq !== this.sketchPointerDown?.seq) {
            return true;
        }
        const end = this.sketchRectPreview?.corners?.[2]
            ? { x: this.sketchRectPreview.corners[2].x, y: this.sketchRectPreview.corners[2].y }
            : null;
        if (!end) return true;
        const created = this.createSketchRectangle(feature, this.sketchRectStart, end, {
            centerMode,
            startRefId: this.sketchRectStartRefId || null,
            endRefId: null
        });
        if (created) {
            this.cancelSketchRect();
            this.setSketchTool('select');
        }
        return true;
    }

    if (tool === 'circle') {
        if (!isDone) {
            if (!this.sketchCircleCenter) return true;
            const local = this.projectEventToSketchLocal(delta?.event, feature);
            if (!local) return true;
            const radius = Math.hypot(
                (local.x || 0) - (this.sketchCircleCenter.x || 0),
                (local.y || 0) - (this.sketchCircleCenter.y || 0)
            );
            if (Number.isFinite(radius) && radius > SKETCH_MIN_LINE_LENGTH) {
                this.sketchArcPreview = {
                    mode: 'circle',
                    circle: true,
                    cx: this.sketchCircleCenter.x || 0,
                    cy: this.sketchCircleCenter.y || 0,
                    radius
                };
            } else {
                this.sketchArcPreview = null;
            }
            this.updateSketchInteractionVisuals();
            return true;
        }
        if (!this.sketchCircleCenter) return false;
        const preview = this.sketchArcPreview;
        let end = null;
        if (preview && preview.mode === 'circle' && Number.isFinite(preview.radius) && preview.radius > SKETCH_MIN_LINE_LENGTH) {
            end = { x: Number(preview.cx || 0) + Number(preview.radius || 0), y: Number(preview.cy || 0) };
        } else {
            const local = this.projectEventToSketchLocal(delta?.event, feature);
            if (local) end = local;
        }
        if (!end) return true;
        const created = this.createSketchCircle(feature, this.sketchCircleCenter, end, { centerRefId: this.sketchCircleCenterRefId || null });
        if (created) {
            this.cancelSketchCircle();
            this.setSketchTool('select');
        }
        return true;
    }
    if (tool !== 'select') return false;
    if (!this.sketchPointerDown) return false;

    if (isDone) {
        if (this.sketchMarquee) {
            this.finishSketchMarquee(feature);
            return true;
        }
        if (!this.sketchDrag) return false;
        const drag = this.sketchDrag;
        const moved = !!drag.moved;
        const snapPointId = drag.snapPointId || null;
        const snapPointType = drag.snapPointType || null;
        const snapArcId = drag.snapArcId || null;
        const snapMovedPointId = drag.snapMovedPointId || null;
        const movedPointIds = drag.movedPointIds || new Set();
        const draggedArcIds = drag.draggedArcIds || new Set();
        this.sketchDrag = null;
        api.sketchRuntime?.setMutating?.(feature.id, false);
        if (moved) {
            if (snapPointType === 'point' && snapPointId && snapMovedPointId && snapMovedPointId !== snapPointId) {
                sketchCreate.addCoincidentConstraintIfMissing.call(this, feature, snapMovedPointId, snapPointId);
                enforceSketchConstraintsInPlace(feature);
            }
            if (snapPointType === 'arc-center' && snapArcId && snapMovedPointId) {
                feature.constraints = Array.isArray(feature.constraints) ? feature.constraints : [];
                this.toggleSketchConstraintInList(feature, feature.constraints, 'arc_center_coincident', [snapArcId, snapMovedPointId]);
                enforceSketchConstraintsInPlace(feature);
            }
            enforceSketchConstraintsInPlace(feature, {
                useFallback: true,
                iterations: 64,
                draggedPointIds: Array.from(movedPointIds || []),
                draggedArcIds: Array.from(draggedArcIds || []),
                tangentAggressive: true
            });
            api.features.commit(feature.id, {
                opType: 'feature.update',
                payload: {
                    field: snapPointType === 'point' && snapPointId && snapMovedPointId
                        ? 'entities.move+constraints.coincident'
                        : snapPointType === 'arc-center' && snapArcId && snapMovedPointId
                            ? 'entities.move+constraints.arc_center_coincident'
                            : 'entities.move'
                }
            });
        }
        this.hoveredSketchEntityId = null;
        this.updateSketchInteractionVisuals();
        return true;
    }

    const event = delta?.event;
    if (!event) return false;

    if (!this.sketchDrag) {
        if (Math.hypot(offset?.x || 0, offset?.y || 0) < SKETCH_DRAG_START_PX) return false;
        const downId = this.sketchPointerDown.hitId || this.hoveredSketchEntityId || null;
        const downType = this.sketchPointerDown.hitType || null;
        const entities = Array.isArray(feature?.entities) ? feature.entities : [];
        const entityById = new Map(entities.filter(e => e?.id).map(e => [e.id, e]));
        if (!downId || downId === SKETCH_VIRTUAL_ORIGIN_ID) {
            this.startSketchMarquee(feature, this.sketchPointerDown, event);
            this.hoveredSketchEntityId = null;
            this.updateSketchInteractionVisuals();
            return true;
        }
        const centerDrag = downType === 'arc-center';
        const downEntity = entityById.get(downId) || null;
        const circleCurveDown = downType === 'arc' && downEntity?.type === 'arc' && isCircleCurve(downEntity);
        const dragSelectedLines = this.selectedSketchEntities.has(downId) || this.isPointOnSelectedSketchLine(feature, downId);
        const activeIds = centerDrag ? new Set([downId]) : circleCurveDown ? new Set([downId]) : dragSelectedLines ? new Set(this.selectedSketchEntities) : new Set([downId]);
        const circleCurveDragIds = new Set();
        if (!centerDrag) {
            for (const id of activeIds) {
                const ent = entityById.get(id);
                if (ent?.type === 'arc' && isCircleCurve(ent)) circleCurveDragIds.add(id);
            }
            const downEnt = entityById.get(downId);
            if (downType === 'arc' && downEnt?.type === 'arc' && isCircleCurve(downEnt)) circleCurveDragIds.add(downId);
        }
        const refs = this.collectCoordinateRefsFromIds(feature, activeIds);
        if (!this.sketchPointerDown.local) return false;
        const baseline = new Map();
        if (!centerDrag) {
            for (const ref of refs) baseline.set(ref, { x: ref.x || 0, y: ref.y || 0 });
        }
        const arcControlBaseline = [];
        const pointById = new Map(entities.filter(e => e?.type === 'point' && e.id).map(e => [e.id, e]));
        for (const entity of entities) {
            if (entity?.type !== 'arc' || !entity.id) continue;
            if (!activeIds.has(entity.id)) continue;
            if (!Number.isFinite(entity.mx) || !Number.isFinite(entity.my)) continue;
            const pa = pointById.get(entity.a) || null;
            const pb = pointById.get(entity.b) || null;
            arcControlBaseline.push({
                entity,
                mx: entity.mx,
                my: entity.my,
                cx: Number(entity.cx || 0),
                cy: Number(entity.cy || 0),
                radius: Number(entity.radius || 0),
                a: pa ? { x: pa.x || 0, y: pa.y || 0 } : null,
                b: pb ? { x: pb.x || 0, y: pb.y || 0 } : null
            });
        }
        this.sketchDrag = {
            start: { x: this.sketchPointerDown.local.x, y: this.sketchPointerDown.local.y },
            baseline,
            arcControlBaseline,
            activeIds,
            circleCurveDragIds,
            movedPointIds: new Set((centerDrag ? [] : refs).map(ref => ref?.id).filter(Boolean)),
            draggedArcIds: new Set(Array.from(activeIds).filter(id => entityById.get(id)?.type === 'arc')),
            centerLocks: (!centerDrag && !circleCurveDown)
                ? this.collectDragLockedArcCenters(feature, activeIds, refs, { includePointOnArc: true })
                : new Map(),
            centerDrag,
            snapPointId: null,
            snapMovedPointId: null,
            moved: false
        };
        api.sketchRuntime?.setMutating?.(feature.id, true);
        this.hoveredSketchEntityId = null;
        this.updateSketchInteractionVisuals();
    }

    if (this.sketchMarquee) {
        this.updateSketchMarquee(event);
        return true;
    }

    const local = this.projectEventToSketchLocal(event, feature);
    if (!local) return true;

    const dx = local.x - this.sketchDrag.start.x;
    const dy = local.y - this.sketchDrag.start.y;
    for (const [ref, base] of this.sketchDrag.baseline.entries()) {
        ref.x = base.x + dx;
        ref.y = base.y + dy;
    }
    for (const ctrl of this.sketchDrag.arcControlBaseline || []) {
        ctrl.entity.mx = ctrl.mx + dx;
        ctrl.entity.my = ctrl.my + dy;
    }
    this.applyCircleDragKinematics(feature, dx, dy, local);

    const activeCircleDrag = !!(this.sketchDrag.circleCurveDragIds?.size);
    const snap = (this.sketchDrag.centerDrag || activeCircleDrag) ? null : this.getSketchDragSnapTarget(event, feature, this.sketchDrag.movedPointIds);
    const snapId = snap?.targetId || null;
    const snapType = snap?.targetType || null;
    const snapArcId = snap?.targetArcId || null;
    const snapMovedPointId = snap?.movedId || null;
    this.sketchDrag.snapPointId = snapId;
    this.sketchDrag.snapPointType = snapType;
    this.sketchDrag.snapArcId = snapArcId;
    this.sketchDrag.snapMovedPointId = snapMovedPointId;
    this.hoveredSketchEntityId = snap?.hoveredId || snapId;

    if (activeCircleDrag && !this.sketchDrag.centerDrag) {
        this.projectPointOnArcConstraintsForArcs(feature, this.sketchDrag.circleCurveDragIds);
        if (this.draggedArcsHaveTangent(feature, this.sketchDrag.draggedArcIds)) {
            this.applyDragLockedArcCenters(feature, this.sketchDrag.centerLocks);
            enforceSketchConstraintsInPlace(feature, {
                useFallback: true,
                iterations: 24,
                draggedPointIds: Array.from(this.sketchDrag.movedPointIds || []),
                draggedArcIds: Array.from(this.sketchDrag.draggedArcIds || []),
                tangentAggressive: false
            });
            this.applyDragLockedArcCenters(feature, this.sketchDrag.centerLocks);
        }
    } else {
        this.applyDragLockedArcCenters(feature, this.sketchDrag.centerLocks);
        enforceSketchConstraintsInPlace(feature, {
            useFallback: true,
            iterations: 48,
            draggedPointIds: Array.from(this.sketchDrag.movedPointIds || []),
            draggedArcIds: Array.from(this.sketchDrag.draggedArcIds || []),
            tangentAggressive: false
        });
        this.applyDragLockedArcCenters(feature, this.sketchDrag.centerLocks);
    }
    this.sketchDrag.moved = this.sketchDrag.moved || Math.hypot(dx, dy) > 0;
    api.sketchRuntime.sync();
    this.updateSketchInteractionVisuals();
    return true;
}

function collectDragLockedArcCenters(feature, activeIds, refs = [], options = {}) {
    const entities = Array.isArray(feature?.entities) ? feature.entities : [];
    const constraints = Array.isArray(feature?.constraints) ? feature.constraints : [];
    const arcById = new Map(entities.filter(e => e?.type === 'arc' && e?.id).map(e => [e.id, e]));
    const selected = new Set([...(activeIds || [])]);
    for (const ref of refs || []) {
        if (ref?.id) selected.add(ref.id);
    }
    const lockTypes = new Set(['tangent', 'arc_center_coincident']);
    if (options?.includePointOnArc) lockTypes.add('point_on_arc');
    const out = new Map();
    for (const c of constraints) {
        if (!lockTypes.has(c?.type)) continue;
        const crefs = Array.isArray(c.refs) ? c.refs : [];
        if (!crefs.some(id => selected.has(id))) continue;
        const arcId = crefs.find(id => arcById.has(id));
        if (!arcId) continue;
        const arc = arcById.get(arcId);
        if (!isCircleCurve(arc)) continue;
        const cx = Number(arc.cx);
        const cy = Number(arc.cy);
        if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;
        out.set(arcId, { cx, cy });
    }
    return out;
}

function applyDragLockedArcCenters(feature, centerLocks) {
    if (!(centerLocks instanceof Map) || !centerLocks.size) return;
    const entities = Array.isArray(feature?.entities) ? feature.entities : [];
    const arcById = new Map(entities.filter(e => e?.type === 'arc' && e?.id).map(e => [e.id, e]));
    for (const [arcId, lock] of centerLocks.entries()) {
        const arc = arcById.get(arcId);
        if (!arc) continue;
        arc.cx = lock.cx;
        arc.cy = lock.cy;
    }
}

function draggedArcsHaveTangent(feature, draggedArcIds) {
    if (!(draggedArcIds instanceof Set) || !draggedArcIds.size) return false;
    const constraints = Array.isArray(feature?.constraints) ? feature.constraints : [];
    for (const c of constraints) {
        if (c?.type !== 'tangent') continue;
        const refs = Array.isArray(c.refs) ? c.refs : [];
        if (refs.some(id => draggedArcIds.has(id))) return true;
    }
    return false;
}

function isPointOnSelectedSketchLine(feature, pointId) {
    if (!pointId || !this.selectedSketchEntities?.size) return false;
    const entities = Array.isArray(feature?.entities) ? feature.entities : [];
    for (const entity of entities) {
        if ((entity?.type !== 'line' && entity?.type !== 'arc') || !entity.id) continue;
        if (!this.selectedSketchEntities.has(entity.id)) continue;
        const aId = typeof entity?.a === 'string' ? entity.a : (typeof entity?.p1_id === 'string' ? entity.p1_id : null);
        const bId = typeof entity?.b === 'string' ? entity.b : (typeof entity?.p2_id === 'string' ? entity.p2_id : null);
        if (aId === pointId || bId === pointId) return true;
    }
    return false;
}

export {
    handleSketchPointerDown,
    handleSketchHover,
    handleSketchPointerMove,
    handleSketchMouseUp,
    handleSketchDrag,
    collectDragLockedArcCenters,
    applyDragLockedArcCenters,
    draggedArcsHaveTangent,
    isPointOnSelectedSketchLine
};
