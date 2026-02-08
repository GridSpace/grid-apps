/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { api } from '../api.js';

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
    this.hoveredSketchConstraintId = null;
    this.sketchLinePreview = null;
    this.sketchArcPreview = null;
    this.sketchRectPreview = null;
    this.clearSketchMarquee();
    this.updateSketchInteractionVisuals();
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
        return hadLine || hadArc || hadRect || hadMarquee;
    }

    if (event.code === 'KeyV') {
        this.setSketchTool('select');
        return true;
    }
    if (event.code === 'KeyL') {
        this.setSketchTool('line');
        return true;
    }
    if (event.code === 'KeyA') {
        this.setSketchTool('arc-3pt');
        return true;
    }
    if (event.code === 'KeyO') {
        this.setSketchTool('circle-center');
        return true;
    }
    if (event.code === 'KeyR') {
        this.setSketchTool(event.shiftKey ? 'rect-center' : 'rect');
        return true;
    }
    if (event.code === 'KeyQ') {
        return this.toggleSelectedConstruction();
    }
    if (event.code === 'KeyH') {
        return this.applySketchConstraint('horizontal');
    }
    if (event.code === 'KeyI') {
        return this.applySketchConstraint('vertical');
    }
    if (event.code === 'KeyK') {
        return this.applySketchConstraint('perpendicular');
    }
    if (event.code === 'KeyE') {
        return this.applySketchConstraint('equal');
    }
    if (event.code === 'KeyG') {
        return this.applySketchConstraint('collinear');
    }
    if (event.code === 'KeyT') {
        return this.applySketchConstraint('tangent');
    }
    if (event.code === 'KeyC') {
        return this.applySketchConstraint('coincident');
    }
    if (event.code === 'KeyF') {
        return this.applySketchConstraint('fixed');
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
    handleSketchKeyDown,
    selectSketchConstraint,
    setHoveredSketchConstraint
};
