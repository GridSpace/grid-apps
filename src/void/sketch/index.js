/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { space } from '../../moto/space.js';
import { api } from '../api.js';
import {
    SKETCH_POINT_MERGE_EPS
} from './constants.js';
import * as sketchGeom from './geometry.js';
import * as sketchCreate from './create.js';
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
    getSelectedSketchMirrorAxis,
    startSketchMirrorMode,
    stopSketchMirrorMode,
    getSelectedSketchPatternCenter,
    startSketchCircularPatternMode,
    stopSketchCircularPatternMode,
    getSelectedSketchGridAnchor,
    startSketchGridPatternMode,
    stopSketchGridPatternMode,
    editSketchCircularPatternConstraint,
    editSketchGridPatternConstraint,
    handleSketchKeyDown,
    selectSketchConstraint,
    setHoveredSketchConstraint,
    useHoveredDerivedEdge,
    useHoveredDerivedPoint
} from './tools.js';
import {
    deleteSelectedSketchConstraints,
    deleteSelectedSketchEntities,
    toggleSelectedConstruction,
    applySketchConstraint,
    editSketchDimensionConstraint,
    toggleSketchDimensionMode,
    findArcWithEndpoints,
    convertArcToCircle,
    findSketchConstraintInList,
    toggleSketchConstraintInList,
    normalizeConstraintRefs,
    makeSketchConstraintKey
} from './constraints_actions.js';
import {
    handleSketchPointerDown,
    handleSketchHover,
    handleSketchPointerMove,
    handleSketchMouseUp,
    handleSketchDrag,
    collectDragLockedArcCenters,
    applyDragLockedArcCenters,
    draggedArcsHaveTangent,
    isPointOnSelectedSketchLine
} from './pointer.js';
import {
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
} from './marquee.js';

function createSketchPoint(feature, local) {
    return sketchCreate.createSketchPoint.call(this, feature, local);
}

function createSketchLine(feature, a, b, options = {}) {
    return sketchCreate.createSketchLine.call(this, feature, a, b, options);
}

function createSketchArc(feature, start, end, onArc, options = {}) {
    return sketchCreate.createSketchArc.call(this, feature, start, end, onArc, options);
}

function createSketchArcFromCenter(feature, center, start, endRaw, options = {}) {
    return sketchCreate.createSketchArcFromCenter.call(this, feature, center, start, endRaw, options);
}

function createSketchCircle(feature, center, edge, options = {}) {
    return sketchCreate.createSketchCircle.call(this, feature, center, edge, options);
}

function createSketchCircle3Point(feature, a, b, c, options = {}) {
    return sketchCreate.createSketchCircle3Point.call(this, feature, a, b, c, options);
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

function createDerivedSketchPoint(feature, local, source = {}) {
    return sketchCreate.createDerivedSketchPoint.call(this, feature, local, source);
}

function createDerivedSketchLine(feature, candidate) {
    return sketchCreate.createDerivedSketchLine.call(this, feature, candidate);
}

function deriveSelectionsAtomic(feature, selection) {
    return sketchCreate.deriveSelectionsAtomic.call(this, feature, selection);
}

function refreshDerivedSketchGeometry(feature) {
    return sketchCreate.refreshDerivedSketchGeometry.call(this, feature);
}

function createSketchPolygonFromSelectedCircle(mode = 'inscribed') {
    return sketchCreate.createSketchPolygonFromSelectedCircle.call(this, mode);
}

function mirrorSelectedSketchGeometry(options = {}) {
    return sketchCreate.mirrorSelectedSketchGeometry.call(this, options);
}

function circularPatternSelectedSketchGeometry(options = {}) {
    return sketchCreate.circularPatternSelectedSketchGeometry.call(this, options);
}

function updateCircularPatternConstraintCopies(constraintId, count) {
    return sketchCreate.updateCircularPatternConstraintCopies.call(this, constraintId, count);
}

function gridPatternSelectedSketchGeometry(options = {}) {
    return sketchCreate.gridPatternSelectedSketchGeometry.call(this, options);
}

function updateGridPatternConstraintCopies(constraintId, axis = 'h', count = 3) {
    return sketchCreate.updateGridPatternConstraintCopies.call(this, constraintId, axis, count);
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

function computeArcGeometryFromCenter(center, start, endRaw) {
    return sketchCreate.computeArcGeometryFromCenter.call(this, center, start, endRaw);
}

function computeCircleFromThreePoints(a, b, c) {
    return sketchCreate.computeCircleFromThreePoints.call(this, a, b, c);
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
    const external = this.hoveredDerivedCandidate || null;
    const canShowExternalPreview = !this.sketchDrag
        && !this.sketchLineStart
        && !this.sketchArcStart
        && !this.sketchCircleCenter
        && !this.sketchRectStart;
    const externalPointLocal = canShowExternalPreview ? (external?.hoverPoint?.local || null) : null;
    const showExternalPoint = !!externalPointLocal;
    const showExternalSegments = canShowExternalPreview && Array.isArray(external?.pathLocalSegments) && external.pathLocalSegments.length > 1;
    const showExternalLine = canShowExternalPreview && !showExternalSegments && !!external?.aLocal && !!external?.bLocal;
    const externalLine = showExternalLine
        ? { a: external.aLocal, b: external.bLocal, forceHover: true, projected: true }
        : null;
    const externalStart = showExternalPoint
        ? { ...externalPointLocal, projected: true }
        : null;
    const externalEnd = null;
    const externalPointWorld = showExternalPoint ? (external?.hoverPoint?.world || null) : null;
    const projectedFaceSegments = showExternalSegments
        ? external.pathLocalSegments
        : (!showExternalPoint && !showExternalLine && this.hoveredSolidFaceKey
        ? this.projectFaceBoundaryToSketch(feature, this.hoveredSolidFaceKey)
        : null);
    const sourceFaceWorldSegments = showExternalSegments
        ? (external.pathWorldSegments || null)
        : (!showExternalPoint && !showExternalLine && this.hoveredSolidFaceKey
        ? (() => {
            const loops = api.solids?.getFaceBoundaryLoops?.(this.hoveredSolidFaceKey) || [];
            if (!loops.length) return null;
            const out = [];
            for (const loop of loops) {
                const points = Array.isArray(loop?.points) ? loop.points : [];
                if (points.length < 2) continue;
                for (let i = 0; i + 1 < points.length; i++) {
                    const a = points[i];
                    const b = points[i + 1];
                    if (!a || !b) continue;
                    out.push({
                        a: { x: Number(a.x || 0), y: Number(a.y || 0), z: Number(a.z || 0) },
                        b: { x: Number(b.x || 0), y: Number(b.y || 0), z: Number(b.z || 0) }
                    });
                }
            }
            return out.length ? out : null;
        })()
        : null);
    api.sketchRuntime?.setEntityInteraction(feature.id, {
        hoveredId: this.sketchDrag ? dragHoverId : this.hoveredSketchEntityId,
        selectedIds: Array.from(this.selectedSketchEntities),
        mirrorMode: !!this.sketchMirrorMode,
        mirrorAxisId: this.sketchMirrorAxisId || null,
        circularPatternMode: !!this.sketchCircularPatternMode,
        circularPatternCenterRef: this.sketchCircularPatternCenterRef || null,
        gridPatternMode: !!this.sketchGridPatternMode,
        gridPatternCenterRef: this.sketchGridPatternCenterRef || null,
        hoveredConstraintId: this.hoveredSketchConstraintId || null,
        selectedConstraintIds: Array.from(this.selectedSketchConstraints || []),
        previewLine: this.sketchLinePreview || externalLine,
        previewExternalWorldLine: showExternalLine
            ? {
                a: external?.a || null,
                b: external?.b || null,
                forceHover: true
            }
            : null,
        previewExternalWorldPoint: showExternalPoint
            ? {
                x: externalPointWorld?.x || 0,
                y: externalPointWorld?.y || 0,
                z: externalPointWorld?.z || 0,
                forceHover: true
            }
            : null,
        previewExternalWorldSegments: sourceFaceWorldSegments || null,
        previewFaceSegments: projectedFaceSegments || null,
        previewStart: this.sketchLineStart || this.sketchArcStart || this.sketchCircleCenter || this.sketchRectStart || externalStart,
        previewEnd: this.sketchArcEnd || this.sketchCircleSecond || externalEnd || null,
        previewMid: null,
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

function resolveDerivedEdgeCandidate(event, intersections, feature) {
    return sketchGeom.resolveDerivedEdgeCandidate.call(this, event, intersections, feature);
}

function projectFaceBoundaryToSketch(feature, faceKey) {
    return sketchGeom.projectFaceBoundaryToSketch.call(this, feature, faceKey);
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

function worldToSketchLocal(world, basis) {
    return sketchGeom.worldToSketchLocal.call(this, world, basis);
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
    getSelectedSketchMirrorAxis,
    startSketchMirrorMode,
    stopSketchMirrorMode,
    getSelectedSketchPatternCenter,
    startSketchCircularPatternMode,
    stopSketchCircularPatternMode,
    getSelectedSketchGridAnchor,
    startSketchGridPatternMode,
    stopSketchGridPatternMode,
    editSketchCircularPatternConstraint,
    editSketchGridPatternConstraint,
    selectSketchConstraint,
    setHoveredSketchConstraint,
    useHoveredDerivedEdge,
    useHoveredDerivedPoint,
    handleSketchKeyDown,
    applySketchConstraint,
    editSketchDimensionConstraint,
    toggleSketchDimensionMode,
    findSketchConstraintInList,
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
    resolveDerivedEdgeCandidate,
    projectFaceBoundaryToSketch,
    isSketchEventInViewport,
    getSketchHitLocalPoint,
    getSketchDragSnapTarget,
    distanceToSegmentPx,
    getEventViewportXY,
    getSketchBasis,
    sketchLocalToWorld,
    worldToSketchLocal,
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
    createSketchArcFromCenter,
    createSketchCircle,
    createSketchCircle3Point,
    createSketchRectangle,
    makeSketchRectPreview,
    getRectangleCorners,
    findArcWithEndpoints,
    convertArcToCircle,
    convertArcToCircleInSketch,
    computeArcGeometry,
    computeArcGeometryFromCenter,
    computeCircleFromThreePoints,
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
    createDerivedSketchPoint,
    createDerivedSketchLine,
    deriveSelectionsAtomic,
    refreshDerivedSketchGeometry,
    createSketchPolygonFromSelectedCircle,
    mirrorSelectedSketchGeometry,
    circularPatternSelectedSketchGeometry,
    updateCircularPatternConstraintCopies,
    gridPatternSelectedSketchGeometry,
    updateGridPatternConstraintCopies,
    deleteSelectedSketchEntities,
    deleteSelectedSketchConstraints,
    findPointByCoord,
    ensureSketchPoint,
    getLineEndpoints,
    getSelectedSketchCircle,
    getCircleData
};
