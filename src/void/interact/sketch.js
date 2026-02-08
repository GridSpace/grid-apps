/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { space } from '../../moto/space.js';
import { api } from '../api.js';
import { enforceSketchConstraintsInPlace } from '../sketch_constraints.js';
import {
    SKETCH_DRAG_START_PX,
    SKETCH_MIN_LINE_LENGTH,
    SKETCH_POINT_MERGE_EPS,
    SKETCH_VIRTUAL_ORIGIN_ID
} from './sketch_constants.js';
import * as sketchGeom from './sketch_geometry.js';
import * as sketchCreate from './sketch_create.js';
import {
    getEditingSketchFeature,
    isSketchEditing,
    setSketchTool,
    getSketchTool,
    cancelSketchLine,
    cancelSketchArc,
    cancelSketchCircle,
    cancelSketchRect,
    clearSketchSelection,
    handleSketchKeyDown,
    selectSketchConstraint,
    setHoveredSketchConstraint
} from './sketch_tools.js';
import {
    deleteSelectedSketchConstraints,
    deleteSelectedSketchEntities,
    toggleSelectedConstruction,
    applySketchConstraint,
    findArcWithEndpoints,
    convertArcToCircle,
    toggleSketchConstraintInList,
    normalizeConstraintRefs,
    makeSketchConstraintKey
} from './sketch_constraints_actions.js';

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
        // Do not auto-bind center to hovered point; users can add explicit constraints later.
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
    } else {
        if (this.sketchLinePreview !== null) {
            this.sketchLinePreview = null;
            previewChanged = true;
        }
    }
    if (tool === 'arc') {
        const local = event ? this.projectEventToSketchLocal(event, feature) : null;
        let nextArc = null;
        if (this.sketchArcStart && !this.sketchArcEnd && local) {
            nextArc = { mode: 'chord', a: this.sketchArcStart, b: local };
        } else if (this.sketchArcStart && this.sketchArcEnd && local) {
            const geom = this.computeArcGeometry(this.sketchArcStart, this.sketchArcEnd, local);
            if (geom) {
                nextArc = { mode: 'arc', a: this.sketchArcStart, b: this.sketchArcEnd, ...geom };
            }
        }
        const prevArc = this.sketchArcPreview;
        const sameArc = JSON.stringify(prevArc || null) === JSON.stringify(nextArc || null);
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
        const prevArc = this.sketchArcPreview;
        const sameArc = JSON.stringify(prevArc || null) === JSON.stringify(nextArc || null);
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
        const prevRect = this.sketchRectPreview;
        const sameRect = JSON.stringify(prevRect || null) === JSON.stringify(nextRect || null);
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
    if (!feature || this.getSketchTool() !== 'select') {
        return false;
    }
    if (!this.sketchPointerDown) {
        return false;
    }
    if (!(event?.buttons & 1)) {
        return false;
    }
    if (this.sketchDrag) {
        return false;
    }
    const offsetMag = this.pointerDistance(event, this.sketchPointerDown);
    if (offsetMag < SKETCH_DRAG_START_PX) {
        return false;
    }
    const downId = this.sketchPointerDown.hitId || this.hoveredSketchEntityId || null;
    if (downId && downId !== SKETCH_VIRTUAL_ORIGIN_ID) {
        return false;
    }
    if (!this.sketchMarquee) {
        this.startSketchMarquee(feature, this.sketchPointerDown, event);
    } else {
        this.updateSketchMarquee(event);
    }
    this.hoveredSketchEntityId = null;
    this.updateSketchInteractionVisuals();
    return true;
}

function handleSketchMouseUp(event, intersections) {
    const feature = this.getEditingSketchFeature();
    if (!feature) {
        return false;
    }
    const tool = this.getSketchTool();
    const allowOutsideViewport = tool === 'circle' && !!this.sketchCircleCenter;
    if (!allowOutsideViewport && !this.isSketchEventInViewport(event)) {
        return false;
    }
    if (this.sketchMarquee) {
        this.finishSketchMarquee(feature);
        return true;
    }

    const pointerDown = this.sketchPointerDown;
    const dist = pointerDown ? this.pointerDistance(event, pointerDown) : 0;
    const wasDrag = !!this.sketchDrag;

    if (wasDrag) {
        return true;
    }

    if (tool === 'select') {
        const upHit = this.resolveSketchHit(event, intersections, feature);
        const hit = upHit
            || (pointerDown?.hitId ? { id: pointerDown.hitId } : null)
            || (this.hoveredSketchEntityId ? { id: this.hoveredSketchEntityId } : null);
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
                if (isArcCenter) {
                    this.selectedSketchArcCenters?.add?.(hit.id);
                } else {
                    this.selectedSketchArcCenters?.delete?.(hit.id);
                }
            }
        } else {
            this.selectedSketchEntities.clear();
            this.selectedSketchArcCenters?.clear?.();
        }
        this.updateSketchInteractionVisuals();
        return true;
    }

    if (tool === 'point') {
        if (dist > SKETCH_DRAG_START_PX) {
            return true;
        }
        const local = this.projectEventToSketchLocal(event, feature);
        if (!local) {
            return true;
        }
        this.createSketchPoint(feature, local);
        return true;
    }

    if (tool === 'line') {
        const upHit = this.resolveSketchHit(event, intersections, feature);
        const fallbackHovered = this.hoveredSketchEntityId && this.hoveredSketchEntityId !== SKETCH_VIRTUAL_ORIGIN_ID
            ? { id: this.hoveredSketchEntityId, type: 'point' }
            : null;
        const resolved = upHit || fallbackHovered;
        const local = this.getSketchHitLocalPoint(feature, resolved) || this.projectEventToSketchLocal(event, feature);
        const endRefId = (resolved?.type === 'point' && resolved?.id && resolved.id !== SKETCH_VIRTUAL_ORIGIN_ID) ? resolved.id : null;
        if (!local || !this.sketchLineStart) {
            return true;
        }

        if (this.sketchLineStartSeq === pointerDown?.seq) {
            if (dist > SKETCH_DRAG_START_PX) {
                this.createSketchLine(feature, this.sketchLineStart, local, {
                    startRefId: this.sketchLineStartRefId || null,
                    endRefId
                });
                // Drag gesture creates one segment and exits pending state.
                this.cancelSketchLine();
            }
            return true;
        }

        const created = this.createSketchLine(feature, this.sketchLineStart, local, {
            startRefId: this.sketchLineStartRefId || null,
            endRefId
        });
        if (this.getSketchHitLocalPoint(feature, resolved)) {
            // Common polygon workflow: close/attach on existing point and exit line mode.
            this.cancelSketchLine();
            this.setSketchTool('select');
            return true;
        }
        // Click-chain mode: keep endpoint as next segment start.
        this.sketchLineStart = { x: local.x, y: local.y };
        this.sketchLineStartRefId = created?.endPointId || null;
        this.sketchLineStartSeq = null;
        return true;
    }
    if (tool === 'arc') {
        const upHit = this.resolveSketchHit(event, intersections, feature);
        const fallbackHovered = this.hoveredSketchEntityId && this.hoveredSketchEntityId !== SKETCH_VIRTUAL_ORIGIN_ID
            ? { id: this.hoveredSketchEntityId, type: 'point' }
            : null;
        const resolved = upHit || fallbackHovered;
        const local = this.getSketchHitLocalPoint(feature, resolved) || this.projectEventToSketchLocal(event, feature);
        const refId = (resolved?.type === 'point' && resolved?.id && resolved.id !== SKETCH_VIRTUAL_ORIGIN_ID) ? resolved.id : null;
        if (!local) {
            return true;
        }
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
        const fallbackHovered = this.hoveredSketchEntityId && this.hoveredSketchEntityId !== SKETCH_VIRTUAL_ORIGIN_ID
            ? { id: this.hoveredSketchEntityId, type: 'point' }
            : null;
        const resolved = upHit || fallbackHovered;
        const unsnappedLocal = this.projectEventToSketchLocal(event, feature);
        const snappedLocal = this.getSketchHitLocalPoint(feature, resolved) || unsnappedLocal;
        if (!this.sketchCircleCenter) {
            return true;
        }
        // Circle creation is intentionally simple:
        // first click establishes center, any later mouse-up with non-zero radius creates.
        // Works for click-click and click-drag-release.
        let end = unsnappedLocal || snappedLocal;
        if (!end && this.sketchArcPreview?.mode === 'circle') {
            end = {
                x: (this.sketchArcPreview.cx || 0) + (this.sketchArcPreview.radius || 0),
                y: this.sketchArcPreview.cy || 0
            };
        }
        if (!end) {
            return true;
        }
        const radial = Math.hypot(
            (end.x || 0) - (this.sketchCircleCenter.x || 0),
            (end.y || 0) - (this.sketchCircleCenter.y || 0)
        );
        if (!Number.isFinite(radial) || radial <= SKETCH_MIN_LINE_LENGTH) {
            return true;
        }
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
        const fallbackHovered = this.hoveredSketchEntityId && this.hoveredSketchEntityId !== SKETCH_VIRTUAL_ORIGIN_ID
            ? { id: this.hoveredSketchEntityId, type: 'point' }
            : null;
        const resolved = upHit || fallbackHovered;
        const local = this.getSketchHitLocalPoint(feature, resolved) || this.projectEventToSketchLocal(event, feature);
        const endRefId = (resolved?.type === 'point' && resolved?.id && resolved.id !== SKETCH_VIRTUAL_ORIGIN_ID) ? resolved.id : null;
        if (!local || !this.sketchRectStart) {
            return true;
        }
        const centerMode = tool === 'rect-center';
        if (this.sketchRectStartSeq === pointerDown?.seq) {
            if (dist > SKETCH_DRAG_START_PX) {
                this.createSketchRectangle(feature, this.sketchRectStart, local, {
                    centerMode,
                    startRefId: this.sketchRectStartRefId || null,
                    endRefId
                });
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
    if (!feature) {
        return false;
    }
    const tool = this.getSketchTool();

    if (tool === 'circle') {
        if (!isDone) {
            return true;
        }
        if (!this.sketchCircleCenter) {
            return false;
        }
        const preview = this.sketchArcPreview;
        let end = null;
        if (preview && preview.mode === 'circle' && Number.isFinite(preview.radius) && preview.radius > SKETCH_MIN_LINE_LENGTH) {
            end = {
                x: Number(preview.cx || 0) + Number(preview.radius || 0),
                y: Number(preview.cy || 0)
            };
        } else {
            const local = this.projectEventToSketchLocal(delta?.event, feature);
            if (local) {
                end = local;
            }
        }
        if (!end) {
            return true;
        }
        const created = this.createSketchCircle(feature, this.sketchCircleCenter, end, {
            centerRefId: this.sketchCircleCenterRefId || null
        });
        if (created) {
            this.cancelSketchCircle();
            this.setSketchTool('select');
        }
        return true;
    }

    if (tool !== 'select') {
        return false;
    }

    if (!this.sketchPointerDown) {
        return false;
    }

    if (isDone) {
        if (this.sketchMarquee) {
            this.finishSketchMarquee(feature);
            return true;
        }
        if (!this.sketchDrag) {
            return false;
        }
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
                addCoincidentConstraintIfMissing.call(this, feature, snapMovedPointId, snapPointId);
                enforceSketchConstraintsInPlace(feature);
            }
            if (snapPointType === 'arc-center' && snapArcId && snapMovedPointId) {
                feature.constraints = Array.isArray(feature.constraints) ? feature.constraints : [];
                this.toggleSketchConstraintInList(feature, feature.constraints, 'arc_center_coincident', [snapArcId, snapMovedPointId]);
                enforceSketchConstraintsInPlace(feature);
            }
            // Always run one final full solve at gesture end to settle coupled constraints.
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
    if (!event) {
        return false;
    }

    if (!this.sketchDrag) {
        const offsetMag = Math.hypot(offset?.x || 0, offset?.y || 0);
        if (offsetMag < SKETCH_DRAG_START_PX) {
            return false;
        }
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
        const circleCurveDown = downType === 'arc' && downEntity?.type === 'arc' && downEntity?.circle;
        const dragSelectedLines = this.selectedSketchEntities.has(downId)
            || this.isPointOnSelectedSketchLine(feature, downId);
        const activeIds = centerDrag
            ? new Set([downId])
            : circleCurveDown
            ? new Set([downId])
            : dragSelectedLines
            ? new Set(this.selectedSketchEntities)
            : new Set([downId]);
        const circleCurveDragIds = new Set();
        if (!centerDrag) {
            for (const id of activeIds) {
                const ent = entityById.get(id);
                if (ent?.type === 'arc' && ent?.circle) {
                    circleCurveDragIds.add(id);
                }
            }
            const downEnt = entityById.get(downId);
            if (downType === 'arc' && downEnt?.type === 'arc' && downEnt?.circle) {
                circleCurveDragIds.add(downId);
            }
        }
        const refs = this.collectCoordinateRefsFromIds(feature, activeIds);
        if (!this.sketchPointerDown.local) {
            return false;
        }
        const baseline = new Map();
        if (!centerDrag) {
            for (const ref of refs) {
                baseline.set(ref, { x: ref.x || 0, y: ref.y || 0 });
            }
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
                ? this.collectDragLockedArcCenters(feature, activeIds, refs, {
                    includePointOnArc: true
                })
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
    if (!local) {
        return true;
    }

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
    const snap = (this.sketchDrag.centerDrag || activeCircleDrag)
        ? null
        : this.getSketchDragSnapTarget(event, feature, this.sketchDrag.movedPointIds);
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
        // Keep circle-attached points stable during live radius drags; do one full solve on mouse-up.
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
        if (ref?.id) {
            selected.add(ref.id);
        }
    }
    // Lock centers for constraints that can satisfy by drifting circle center.
    // point_on_arc is opt-in and should be disabled when dragging the circle itself.
    const lockTypes = new Set(['tangent', 'arc_center_coincident']);
    if (options?.includePointOnArc) {
        lockTypes.add('point_on_arc');
    }
    const out = new Map();
    for (const c of constraints) {
        if (!lockTypes.has(c?.type)) continue;
        const crefs = Array.isArray(c.refs) ? c.refs : [];
        if (!crefs.some(id => selected.has(id))) continue;
        const arcId = crefs.find(id => arcById.has(id));
        if (!arcId) continue;
        const arc = arcById.get(arcId);
        if (!arc?.circle) continue;
        const cx = Number(arc.cx);
        const cy = Number(arc.cy);
        if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;
        out.set(arcId, { cx, cy });
    }
    return out;
}

function applyDragLockedArcCenters(feature, centerLocks) {
    if (!(centerLocks instanceof Map) || !centerLocks.size) {
        return;
    }
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
    if (!(draggedArcIds instanceof Set) || !draggedArcIds.size) {
        return false;
    }
    const constraints = Array.isArray(feature?.constraints) ? feature.constraints : [];
    for (const c of constraints) {
        if (c?.type !== 'tangent') continue;
        const refs = Array.isArray(c.refs) ? c.refs : [];
        if (refs.some(id => draggedArcIds.has(id))) {
            return true;
        }
    }
    return false;
}

function isPointOnSelectedSketchLine(feature, pointId) {
    if (!pointId || !this.selectedSketchEntities?.size) {
        return false;
    }
    const entities = Array.isArray(feature?.entities) ? feature.entities : [];
    for (const entity of entities) {
        if ((entity?.type !== 'line' && entity?.type !== 'arc') || !entity.id) continue;
        if (!this.selectedSketchEntities.has(entity.id)) continue;
        const aId = typeof entity?.a === 'string' ? entity.a : (typeof entity?.p1_id === 'string' ? entity.p1_id : null);
        const bId = typeof entity?.b === 'string' ? entity.b : (typeof entity?.p2_id === 'string' ? entity.p2_id : null);
        if (aId === pointId || bId === pointId) {
            return true;
        }
    }
    return false;
}

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
            // Use canonical point entities so drag/solver mutate shared objects.
            const aId = typeof entity?.a === 'string' ? entity.a : (typeof entity?.p1_id === 'string' ? entity.p1_id : null);
            const bId = typeof entity?.b === 'string' ? entity.b : (typeof entity?.p2_id === 'string' ? entity.p2_id : null);
            if (aId && pointById.has(aId)) {
                refs.add(pointById.get(aId));
            }
            if (bId && pointById.has(bId)) {
                refs.add(pointById.get(bId));
            }
        }
        if (entity.type === 'arc') {
            const aId = typeof entity?.a === 'string' ? entity.a : null;
            const bId = typeof entity?.b === 'string' ? entity.b : null;
            if (aId && pointById.has(aId)) {
                refs.add(pointById.get(aId));
            }
            if (bId && pointById.has(bId)) {
                refs.add(pointById.get(bId));
            }
        }
    }
    return Array.from(refs);
}

function createSketchPoint(feature, local) {
    return sketchCreate.createSketchPoint.call(this, feature, local);
}

function createSketchLine(feature, a, b, options = {}) {
    return sketchCreate.createSketchLine.call(this, feature, a, b, options);
}

function createSketchArc(feature, start, end, onArc, options = {}) {
    return sketchCreate.createSketchArc.call(this, feature, start, end, onArc, options);
}

function createSketchCircle(feature, center, edge, options = {}) {
    return sketchCreate.createSketchCircle.call(this, feature, center, edge, options);
}

function makeSketchRectPreview(start, end, centerMode = false) {
    return sketchCreate.makeSketchRectPreview.call(this, start, end, centerMode);
}

function getRectangleCorners(start, end, centerMode = false) {
    return sketchCreate.getRectangleCorners.call(this, start, end, centerMode);
}

function createSketchRectangle(feature, start, end, options = {}) {
    return sketchCreate.createSketchRectangle.call(this, feature, start, end, options);
}

function createSketchPolygonFromSelectedCircle(mode = 'inscribed') {
    return sketchCreate.createSketchPolygonFromSelectedCircle.call(this, mode);
}

function getSelectedSketchCircle(feature) {
    return sketchCreate.getSelectedSketchCircle.call(this, feature);
}

function getCircleData(feature, circle) {
    return sketchCreate.getCircleData.call(this, feature, circle);
}

function computeArcGeometry(start, end, onArc) {
    return sketchCreate.computeArcGeometry.call(this, start, end, onArc);
}

function addCoincidentConstraintIfMissing(sketch, aId, bId) {
    return sketchCreate.addCoincidentConstraintIfMissing.call(this, sketch, aId, bId);
}

function convertArcToCircleInSketch(sketch, p1Id, p2Id) {
    return sketchCreate.convertArcToCircleInSketch.call(this, sketch, p1Id, p2Id);
}

function updateSketchInteractionVisuals() {
    const feature = this.getEditingSketchFeature();
    if (!feature) {
        return;
    }
    const dragHoverId = this.sketchDrag?.snapPointId || null;
    api.sketchRuntime?.setEntityInteraction(feature.id, {
        hoveredId: this.sketchDrag ? dragHoverId : this.hoveredSketchEntityId,
        selectedIds: Array.from(this.selectedSketchEntities),
        hoveredConstraintId: this.hoveredSketchConstraintId || null,
        selectedConstraintIds: Array.from(this.selectedSketchConstraints || []),
        previewLine: this.sketchLinePreview,
        previewStart: this.sketchLineStart || this.sketchArcStart || this.sketchCircleCenter || this.sketchRectStart,
        previewEnd: this.sketchArcEnd || null,
        previewArc: this.sketchArcPreview,
        previewRect: this.sketchRectPreview
    });
    window.dispatchEvent(new CustomEvent('void-state-change'));
}

function newSketchEntityId(prefix = 'e') {
    const tail = Math.random().toString(36).slice(2, 7);
    return `${prefix}-${Date.now().toString(36)}-${tail}`;
}

function pointerDistance(event, pointerDown) {
    return sketchGeom.pointerDistance.call(this, event, pointerDown);
}

function hitTestSketchEntity(event, feature) {
    return sketchGeom.hitTestSketchEntity.call(this, event, feature);
}

function getArcCenterLocalFromEntity(arc, pointById) {
    return sketchGeom.getArcCenterLocalFromEntity.call(this, arc, pointById);
}

function getSketchEntityHitFromIntersections(intersections, feature) {
    return sketchGeom.getSketchEntityHitFromIntersections.call(this, intersections, feature);
}

function resolveSketchHit(event, intersections, feature) {
    return sketchGeom.resolveSketchHit.call(this, event, intersections, feature);
}

function isSketchEventInViewport(event) {
    return sketchGeom.isSketchEventInViewport.call(this, event);
}

function getSketchHitLocalPoint(feature, hit) {
    return sketchGeom.getSketchHitLocalPoint.call(this, feature, hit);
}

function getSketchDragSnapTarget(event, feature, movedPointIds) {
    return sketchGeom.getSketchDragSnapTarget.call(this, event, feature, movedPointIds);
}

function findPointByCoord(feature, local, eps = SKETCH_POINT_MERGE_EPS) {
    return sketchGeom.findPointByCoord.call(this, feature, local, eps);
}

function ensureSketchPoint(sketch, local) {
    return sketchGeom.ensureSketchPoint.call(this, sketch, local);
}

function getLineEndpoints(line, pointById) {
    return sketchGeom.getLineEndpoints.call(this, line, pointById);
}

function getArcEndpoints(arc, pointById) {
    return sketchGeom.getArcEndpoints.call(this, arc, pointById);
}

function applyCircleDragKinematics(feature, dx = 0, dy = 0, local = null) {
    return sketchGeom.applyCircleDragKinematics.call(this, feature, dx, dy, local);
}

function projectPointOnArcConstraintsForArcs(feature, arcIds) {
    return sketchGeom.projectPointOnArcConstraintsForArcs.call(this, feature, arcIds);
}

function rebaseSketchDragState(feature, local) {
    return sketchGeom.rebaseSketchDragState.call(this, feature, local);
}

function sampleArcPolyline(arc, a, b, segments = 24) {
    return sketchGeom.sampleArcPolyline.call(this, arc, a, b, segments);
}

function distanceToSegmentPx(px, py, ax, ay, bx, by) {
    return sketchGeom.distanceToSegmentPx.call(this, px, py, ax, ay, bx, by);
}

function getEventViewportXY(event) {
    return sketchGeom.getEventViewportXY.call(this, event);
}

function getSketchBasis(feature) {
    return sketchGeom.getSketchBasis.call(this, feature);
}

function sketchLocalToWorld(local, basis) {
    return sketchGeom.sketchLocalToWorld.call(this, local, basis);
}

function projectEventToSketchLocal(event, feature) {
    return sketchGeom.projectEventToSketchLocal.call(this, event, feature);
}

export {
    getEditingSketchFeature,
    isSketchEditing,
    setSketchTool,
    getSketchTool,
    cancelSketchLine,
    cancelSketchArc,
    cancelSketchCircle,
    cancelSketchRect,
    clearSketchSelection,
    selectSketchConstraint,
    setHoveredSketchConstraint,
    handleSketchKeyDown,
    applySketchConstraint,
    toggleSketchConstraintInList,
    normalizeConstraintRefs,
    makeSketchConstraintKey,
    handleSketchPointerDown,
    handleSketchHover,
    handleSketchPointerMove,
    handleSketchMouseUp,
    handleSketchDrag,
    toggleSelectedConstruction,
    updateSketchInteractionVisuals,
    newSketchEntityId,
    pointerDistance,
    hitTestSketchEntity,
    getSketchEntityHitFromIntersections,
    resolveSketchHit,
    isSketchEventInViewport,
    getSketchHitLocalPoint,
    getSketchDragSnapTarget,
    distanceToSegmentPx,
    getEventViewportXY,
    getSketchBasis,
    sketchLocalToWorld,
    projectEventToSketchLocal,
    viewportPointFromClient,
    startSketchMarquee,
    updateSketchMarquee,
    finishSketchMarquee,
    clearSketchMarquee,
    updateSketchMarqueeVisual,
    selectSketchEntitiesInMarquee,
    projectSketchLocalToScreen,
    isPointInRect,
    segmentTouchesRect,
    segmentsIntersect,
    collectSelectedCoordinateRefs,
    collectCoordinateRefsFromIds,
    isPointOnSelectedSketchLine,
    createSketchArc,
    createSketchCircle,
    createSketchRectangle,
    makeSketchRectPreview,
    getRectangleCorners,
    findArcWithEndpoints,
    convertArcToCircle,
    convertArcToCircleInSketch,
    computeArcGeometry,
    getArcEndpoints,
    applyCircleDragKinematics,
    projectPointOnArcConstraintsForArcs,
    collectDragLockedArcCenters,
    applyDragLockedArcCenters,
    draggedArcsHaveTangent,
    rebaseSketchDragState,
    getArcCenterLocalFromEntity,
    sampleArcPolyline,
    createSketchPoint,
    createSketchLine,
    createSketchPolygonFromSelectedCircle,
    deleteSelectedSketchEntities,
    deleteSelectedSketchConstraints,
    findPointByCoord,
    ensureSketchPoint,
    getLineEndpoints,
    getSelectedSketchCircle,
    getCircleData
};
