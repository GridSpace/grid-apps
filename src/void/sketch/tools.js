/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { api } from '../api.js';
import { SKETCH_VIRTUAL_ORIGIN_ID } from './constants.js';

function getEditingSketchFeature() {
    const sketchId = api.sketchRuntime?.editingId;
    if (!sketchId) return null;
    const feature = api.features.findById(sketchId);
    return feature?.type === 'sketch' ? feature : null;
}

function isSketchEditing() {
    return !!this.getEditingSketchFeature();
}

function setSketchTool(tool = 'select') {
    if (tool === 'arc') tool = 'arc-3pt';
    if (tool === 'circle') tool = 'circle-center';
    const allowed = new Set([
        'select',
        'point',
        'line',
        'arc',
        'arc-3pt',
        'arc-center',
        'arc-tangent',
        'circle',
        'circle-center',
        'circle-3pt',
        'rect',
        'rect-center'
    ]);
    const next = allowed.has(tool) ? tool : 'select';
    if (this.sketchTool === next) {
        if (next === 'circle' || next === 'circle-center' || next === 'circle-3pt') {
            this.cancelSketchCircle();
            this.sketchPointerDown = null;
            this.sketchDrag = null;
            this.updateSketchInteractionVisuals();
        }
        return;
    }
    this.sketchTool = next;
    if (next !== 'select') {
        this.stopSketchMirrorMode?.();
        this.stopSketchCircularPatternMode?.();
        this.stopSketchGridPatternMode?.();
    }
    if (next !== 'line') {
        this.cancelSketchLine();
    }
    if (next !== 'arc' && next !== 'arc-3pt' && next !== 'arc-center' && next !== 'arc-tangent') {
        this.cancelSketchArc();
    }
    if (next !== 'circle' && next !== 'circle-center' && next !== 'circle-3pt') {
        this.cancelSketchCircle();
    }
    if (next !== 'rect' && next !== 'rect-center') {
        this.cancelSketchRect();
    }
    this.sketchRectCenterMode = next === 'rect-center';
    this.updateSketchInteractionVisuals();
    window.dispatchEvent(new CustomEvent('void-state-change'));
}

function getSketchTool() {
    return this.sketchTool || 'select';
}

function cancelSketchLine() {
    this.sketchLineStart = null;
    this.sketchLineStartRefId = null;
    this.sketchLineStartSeq = null;
    this.sketchLinePreview = null;
}

function cancelSketchArc() {
    this.sketchArcStart = null;
    this.sketchArcStartRefId = null;
    this.sketchArcEnd = null;
    this.sketchArcEndRefId = null;
    this.sketchArcPreview = null;
}

function cancelSketchCircle() {
    this.sketchCircleCenter = null;
    this.sketchCircleSecond = null;
    this.sketchCircleCenterRefId = null;
    this.sketchCircleSecondRefId = null;
    this.sketchCircleStartSeq = null;
    this.sketchArcPreview = null;
}

function cancelSketchRect() {
    this.sketchRectStart = null;
    this.sketchRectStartRefId = null;
    this.sketchRectStartSeq = null;
    this.sketchRectPreview = null;
}

function clearSketchSelection() {
    this.selectedSketchEntities.clear();
    this.selectedSketchArcCenters?.clear?.();
    this.selectedSketchConstraints.clear();
    this.selectedSketchProfiles?.clear?.();
    this.hoveredSketchProfileKey = null;
    api.sketchRuntime?.setSelectedProfiles?.([]);
    api.sketchRuntime?.setHoveredProfile?.(null);
    this.hoveredSketchEntityId = null;
    this.hoveredDerivedCandidate = null;
    this.selectedDerivedSelections?.clear?.();
    this.selectedSolidFaceKeys?.clear?.();
    api.solids?.clearFaceSelection?.();
    this.hoveredSketchConstraintId = null;
    this.sketchLinePreview = null;
    this.sketchArcPreview = null;
    this.sketchRectPreview = null;
    this.clearSketchMarquee();
    this.updateSketchInteractionVisuals();
}

function getSelectedSketchMirrorAxis(feature) {
    const entities = Array.isArray(feature?.entities) ? feature.entities : [];
    const selected = this.selectedSketchEntities instanceof Set ? this.selectedSketchEntities : new Set();
    const lines = entities.filter(entity => entity?.type === 'line' && selected.has(entity.id));
    return lines.length === 1 ? lines[0] : null;
}

function startSketchMirrorMode() {
    const feature = this.getEditingSketchFeature();
    if (!feature) return false;
    const axis = this.getSelectedSketchMirrorAxis(feature);
    if (!axis?.id) return false;
    this.sketchMirrorMode = true;
    this.sketchMirrorAxisId = axis.id;
    this.stopSketchCircularPatternMode?.();
    this.setSketchTool('select');
    this.updateSketchInteractionVisuals();
    return true;
}

function stopSketchMirrorMode() {
    if (!this.sketchMirrorMode && !this.sketchMirrorAxisId) return false;
    this.sketchMirrorMode = false;
    this.sketchMirrorAxisId = null;
    this.updateSketchInteractionVisuals();
    return true;
}

function getSelectedSketchPatternCenter(feature) {
    const entities = Array.isArray(feature?.entities) ? feature.entities : [];
    const byId = new Map(entities.filter(entity => entity?.id).map(entity => [entity.id, entity]));
    const refs = [];
    for (const id of this.selectedSketchEntities || []) {
        if (id === SKETCH_VIRTUAL_ORIGIN_ID) {
            refs.push(SKETCH_VIRTUAL_ORIGIN_ID);
            continue;
        }
        const ent = byId.get(id);
        if (ent?.type === 'point') refs.push(id);
    }
    for (const arcId of this.selectedSketchArcCenters || []) {
        if (typeof arcId === 'string' && arcId) {
            refs.push(`arc-center:${arcId}`);
        }
    }
    const unique = [...new Set(refs)];
    return unique.length === 1 ? unique[0] : null;
}

function startSketchCircularPatternMode() {
    const feature = this.getEditingSketchFeature();
    if (!feature) return false;
    const centerRef = this.getSelectedSketchPatternCenter(feature);
    if (!centerRef) return false;
    this.sketchCircularPatternMode = true;
    this.sketchCircularPatternCenterRef = centerRef;
    this.stopSketchMirrorMode?.();
    this.setSketchTool('select');
    this.updateSketchInteractionVisuals();
    return true;
}

function stopSketchCircularPatternMode() {
    if (!this.sketchCircularPatternMode && !this.sketchCircularPatternCenterRef) return false;
    this.sketchCircularPatternMode = false;
    this.sketchCircularPatternCenterRef = null;
    this.updateSketchInteractionVisuals();
    return true;
}

function getSelectedSketchGridAnchor(feature) {
    const entities = Array.isArray(feature?.entities) ? feature.entities : [];
    const byId = new Map(entities.filter(entity => entity?.id).map(entity => [entity.id, entity]));
    const pointIds = [];
    for (const id of this.selectedSketchEntities || []) {
        const ent = byId.get(id);
        if (ent?.type === 'point') pointIds.push(id);
    }
    const unique = [...new Set(pointIds)];
    return unique.length === 1 ? unique[0] : null;
}

function startSketchGridPatternMode() {
    const feature = this.getEditingSketchFeature();
    if (!feature) return false;
    const centerPointId = this.getSelectedSketchGridAnchor(feature);
    if (!centerPointId) return false;
    this.sketchGridPatternMode = true;
    this.sketchGridPatternCenterRef = centerPointId;
    this.stopSketchMirrorMode?.();
    this.stopSketchCircularPatternMode?.();
    this.setSketchTool('select');
    this.updateSketchInteractionVisuals();
    return true;
}

function stopSketchGridPatternMode() {
    if (!this.sketchGridPatternMode && !this.sketchGridPatternCenterRef) return false;
    this.sketchGridPatternMode = false;
    this.sketchGridPatternCenterRef = null;
    this.updateSketchInteractionVisuals();
    return true;
}

function editSketchCircularPatternConstraint(constraintId) {
    const feature = this.getEditingSketchFeature();
    if (!feature || !constraintId) return false;
    const constraints = Array.isArray(feature.constraints) ? feature.constraints : [];
    const found = constraints.find(c => c?.id === constraintId && c?.type === 'circular_pattern');
    if (!found) return false;
    const current = Math.max(2, Number(found?.data?.count || 0) || 3);
    const input = window.prompt('Pattern copies', String(current));
    if (input === null) return false;
    const value = Math.floor(Number(input));
    if (!Number.isFinite(value) || value < 2 || value > 256) return false;
    return !!this.updateCircularPatternConstraintCopies?.(constraintId, value);
}

function editSketchGridPatternConstraint(constraintId, axis = 'h') {
    const feature = this.getEditingSketchFeature();
    if (!feature || !constraintId) return false;
    const constraints = Array.isArray(feature.constraints) ? feature.constraints : [];
    const found = constraints.find(c => c?.id === constraintId && c?.type === 'grid_pattern');
    if (!found) return false;
    const key = axis === 'v' ? 'countV' : 'countH';
    const current = Math.max(1, Number(found?.data?.[key] || 0) || 3);
    const input = window.prompt(`${axis === 'v' ? 'Vertical' : 'Horizontal'} copies`, String(current));
    if (input === null) return false;
    const value = Math.floor(Number(input));
    if (!Number.isFinite(value) || value < 1 || value > 256) return false;
    return !!this.updateGridPatternConstraintCopies?.(constraintId, axis, value);
}

function handleSketchKeyDown(event) {
    if (!this.isSketchEditing()) {
        return false;
    }

    const activeTag = document.activeElement?.tagName;
    const editingInput = activeTag === 'INPUT' || activeTag === 'TEXTAREA' || document.activeElement?.isContentEditable;
    if (editingInput) {
        return false;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) {
        return false;
    }

    if (event.code === 'Escape') {
        this.sketchPointerDown = null;
        this.sketchDrag = null;
        if (api?.sketchRuntime) {
            api.sketchRuntime._glyphDrag = null;
        }
        const hadMarquee = !!this.sketchMarquee;
        if (hadMarquee) {
            this.clearSketchMarquee();
        }
        const hadLine = !!this.sketchLineStart;
        const hadArc = !!this.sketchArcStart || !!this.sketchArcEnd;
        const hadRect = !!this.sketchRectStart;
        if (hadLine) {
            this.cancelSketchLine();
        }
        if (hadArc) {
            this.cancelSketchArc();
        }
        if (hadRect) {
            this.cancelSketchRect();
        }
        if (this.getSketchTool() !== 'select') {
            this.setSketchTool('select');
            return true;
        }
        if (this.stopSketchMirrorMode?.()) {
            return true;
        }
        if (this.stopSketchCircularPatternMode?.()) {
            return true;
        }
        if (this.stopSketchGridPatternMode?.()) {
            return true;
        }
        return hadLine || hadArc || hadRect || hadMarquee;
    }

    const toggleTool = tool => {
        const curr = this.getSketchTool();
        this.setSketchTool(curr === tool ? 'select' : tool);
        return true;
    };

    if (event.code === 'KeyL' && !event.shiftKey) {
        return toggleTool('line');
    }
    if (event.code === 'KeyA' && !event.shiftKey) {
        return toggleTool('arc-3pt');
    }
    if (event.code === 'KeyC' && !event.shiftKey) {
        return toggleTool('circle-center');
    }
    if (event.code === 'KeyR' && !event.shiftKey) {
        return toggleTool('rect-center');
    }
    if (event.code === 'KeyG' && !event.shiftKey) {
        return toggleTool('rect');
    }
    if (event.code === 'KeyS' && event.shiftKey) {
        return toggleTool('point');
    }
    if (event.code === 'KeyQ' && !event.shiftKey) {
        return this.toggleSelectedConstruction();
    }
    if (event.code === 'KeyU' && !event.shiftKey) {
        return this.useHoveredDerivedEdge();
    }
    if (event.code === 'KeyH' && !event.shiftKey) {
        this.applySketchConstraint('horizontal');
        return true;
    }
    if (event.code === 'KeyV' && !event.shiftKey) {
        this.applySketchConstraint('vertical');
        return true;
    }
    if (event.code === 'KeyL' && event.shiftKey) {
        this.applySketchConstraint('perpendicular');
        return true;
    }
    if (event.code === 'KeyE' && !event.shiftKey) {
        this.applySketchConstraint('equal');
        return true;
    }
    if (event.code === 'KeyD' && !event.shiftKey) {
        this.applySketchConstraint('dimension');
        return true;
    }
    if (event.code === 'KeyT' && !event.shiftKey) {
        this.applySketchConstraint('tangent');
        return true;
    }
    if (event.code === 'KeyI' && !event.shiftKey) {
        this.applySketchConstraint('coincident');
        return true;
    }
    if (event.code === 'KeyM' && event.shiftKey) {
        this.applySketchConstraint('midpoint');
        return true;
    }
    if (event.code === 'KeyJ' && event.shiftKey) {
        this.applySketchConstraint('fixed');
        return true;
    }
    if (event.code === 'KeyM' && !event.shiftKey) {
        if (this.sketchMirrorMode) {
            return this.stopSketchMirrorMode?.();
        }
        return this.startSketchMirrorMode?.();
    }
    if (event.code === 'Delete' || event.code === 'Backspace') {
        if (this.selectedSketchConstraints?.size) {
            return this.deleteSelectedSketchConstraints();
        }
        return this.deleteSelectedSketchEntities();
    }
    return false;
}

function selectSketchConstraint(constraintId, event = {}) {
    if (!constraintId) {
        return false;
    }
    const multi = !!(event.ctrlKey || event.metaKey || event.shiftKey);
    if (!multi) {
        if (this.selectedSketchConstraints.size === 1 && this.selectedSketchConstraints.has(constraintId)) {
            return false;
        }
        this.selectedSketchConstraints.clear();
        this.selectedSketchConstraints.add(constraintId);
    } else {
        if (this.selectedSketchConstraints.has(constraintId)) {
            this.selectedSketchConstraints.delete(constraintId);
        } else {
            this.selectedSketchConstraints.add(constraintId);
        }
    }
    this.hoveredSketchConstraintId = constraintId;
    this.updateSketchInteractionVisuals();
    return true;
}

function setHoveredSketchConstraint(constraintId) {
    const next = constraintId || null;
    if (this.hoveredSketchConstraintId === next) {
        return false;
    }
    this.hoveredSketchConstraintId = next;
    this.updateSketchInteractionVisuals();
    return true;
}

function useHoveredDerivedEdge() {
    const feature = this.getEditingSketchFeature();
    if (!feature) return false;
    const selectionMap = this.selectedDerivedSelections instanceof Map
        ? this.selectedDerivedSelections
        : new Map();
    const selectedEdges = [];
    const selectedPoints = [];
    for (const sel of selectionMap.values()) {
        if (sel?.type === 'edge') selectedEdges.push(sel);
        if (sel?.type === 'point') selectedPoints.push(sel);
    }
    const selectedFaces = Array.from(this.selectedSolidFaceKeys || []);
    const hovered = this.hoveredDerivedCandidate || null;
    if (!selectedEdges.length && !selectedPoints.length && !selectedFaces.length) {
        // `u` should prioritize the actively hovered derived edge candidate.
        if (hovered?.aLocal && hovered?.bLocal) {
            if (Array.isArray(hovered?.pathLocalSegments) && hovered.pathLocalSegments.length > 1) {
                const worldSegs = Array.isArray(hovered?.pathWorldSegments) ? hovered.pathWorldSegments : [];
                const segKeys = Array.isArray(hovered?.pathSegmentKeys) ? hovered.pathSegmentKeys : [];
                const segEntityIds = Array.isArray(hovered?.pathSegmentEntityIds) ? hovered.pathSegmentEntityIds : [];
                for (let i = 0; i < hovered.pathLocalSegments.length; i++) {
                    const seg = hovered.pathLocalSegments[i];
                    const wseg = worldSegs[i] || null;
                    const segKey = String(segKeys[i] || '');
                    const segEntityId = String(segEntityIds[i] || '');
                    const segKeyParts = segKey ? segKey.split(':') : [];
                    const segIndex = segKeyParts.length >= 4 ? Number(segKeyParts[segKeyParts.length - 1]) : NaN;
                    if (!seg?.a || !seg?.b) continue;
                    selectedEdges.push({
                        type: 'edge',
                        aLocal: seg.a,
                        bLocal: seg.b,
                        source: {
                            ...(hovered.source || {}),
                            entity: segEntityId
                                ? { kind: 'boundary-segment', id: segEntityId }
                                : (hovered?.source?.entity || null),
                            boundary_segment_id: segEntityId || String(hovered?.source?.boundary_segment_id || ''),
                            edge_key: segKey || String(hovered?.source?.edge_key || ''),
                            edge_index: Number.isFinite(segIndex)
                                ? segIndex
                                : Number(hovered?.source?.edge_index ?? i),
                            a: wseg?.a || hovered?.source?.a || null,
                            b: wseg?.b || hovered?.source?.b || null,
                            local_a: seg.a,
                            local_b: seg.b
                        }
                    });
                }
            } else {
                selectedEdges.push({
                    type: 'edge',
                    aLocal: hovered.aLocal,
                    bLocal: hovered.bLocal,
                    source: hovered.source || null
                });
            }
        } else if (this.hoveredSolidFaceKey) {
            // Face derive is fallback only when no discrete edge is hovered.
            selectedFaces.push(this.hoveredSolidFaceKey);
        }
    }
    const payload = {
        edges: selectedEdges,
        points: selectedPoints,
        faces: selectedFaces
    };
    const created = this.deriveSelectionsAtomic(feature, payload);
    if (!created) return false;
    // Prevent immediate face-boundary re-highlight after `u` when cursor is still nearby.
    this.hoveredSolidFaceKey = null;
    api.solids?.setHoveredFace?.(null);
    this.clearSketchSelection?.();
    return true;
}

function useHoveredDerivedPoint() {
    const feature = this.getEditingSketchFeature();
    const candidate = this.hoveredDerivedCandidate || null;
    if (!feature || !candidate) {
        return false;
    }
    const local = candidate?.hoverPoint?.local || candidate?.midLocal || null;
    if (!local) return false;
    const created = this.createDerivedSketchPoint(feature, local, {
        ...(candidate.source || {}),
        local_point: null,
        point_kind: candidate?.hoverPoint?.kind || 'mid'
    });
    if (!created) return false;
    this.clearSketchSelection?.();
    return true;
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
    handleSketchKeyDown,
    selectSketchConstraint,
    setHoveredSketchConstraint,
    useHoveredDerivedEdge,
    useHoveredDerivedPoint
};
