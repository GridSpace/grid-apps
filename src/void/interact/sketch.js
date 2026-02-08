/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { space } from '../../moto/space.js';
import { api } from '../api.js';
import {
    SKETCH_POINT_MERGE_EPS
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
} from './sketch_pointer.js';
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
} from './sketch_marquee.js';

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
