/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { THREE } from '../ext/three.js';
import { space } from '../moto/space.js';
import { datum } from './datum.js';
import * as targetOps from './interact/targets.js';
import * as pointOps from './interact/points.js';
import * as selectionOps from './interact/selection.js';
import * as planeOps from './interact/planes.js';
import * as sketchOps from './interact/sketch.js';

/**
 * Interaction manager for void:form primitives
 * Handles selection, hover, and dragging behaviors
 */
const interact = {
    selectedPlanes: new Set(),
    hoveredPlane: null,
    selectedPoints: new Set(),
    hoveredPoint: null,
    draggedHandle: null,
    draggedPlane: null,
    dragHandleName: null,
    dragAnchorPos: null,
    dragStartSizes: new Map(),
    dragStartCenters: new Map(),
    planes: [],
    upSelectCalled: false,
    wasHandleDrag: false,
    hoverIntersection: null,
    handleScreenRadiusPx: 7,
    handleBaseRadius: 4,
    pointHitRadiusPx: 10,
    pointIds: ['origin-point'],
    _tmpWorldPos: new THREE.Vector3(),
    sketchTool: 'select',
    selectedSketchEntities: new Set(),
    selectedSketchArcCenters: new Set(),
    selectedSketchConstraints: new Set(),
    hoveredSketchEntityId: null,
    hoveredSketchConstraintId: null,
    sketchPointerDown: null,
    sketchDrag: null,
    sketchLineStart: null,
    sketchLineStartRefId: null,
    sketchLineStartSeq: null,
    sketchArcStart: null,
    sketchArcStartRefId: null,
    sketchArcEnd: null,
    sketchArcEndRefId: null,
    sketchArcPreview: null,
    sketchCircleCenter: null,
    sketchCircleCenterRefId: null,
    sketchPointerSeq: 0,
    sketchMarquee: null,
    sketchMarqueeEl: null,
    _lastSketchDownStamp: null,
    _lastSketchUpStamp: null,
    _skipNextWindowSketchDown: false,
    _skipNextWindowSketchUp: false,

    init() {
        this.planes = datum.getPlanes();

        window.addEventListener('keydown', event => {
            if (space.isFocused()) {
                return false;
            }
            let handled = false;
            switch (event.code) {
                case 'Space':
                    this.deselectAll();
                    handled = true;
                    break;
                case 'KeyN':
                    handled = this.viewNormalToHover();
                    break;
                case 'KeyP':
                    handled = this.toggleDatumPlanesVisibility();
                    break;
                default:
                    handled = this.handleSketchKeyDown(event);
                    break;
            }
            if (handled) {
                event.preventDefault();
            }
        });
        window.addEventListener('mousemove', event => {
            if (this.isSketchEditing()) {
                this.handleSketchPointerMove?.(event);
                this.handleSketchHover(event);
            }
        });

        space.mouse.downSelect((int, event, ints) => {
            if (event && event.button !== 0) {
                return;
            }
            if (this.isSketchEditing()) {
                if (!int && int !== null) {
                    return this.getInteractiveObjects();
                }
                this._lastSketchDownStamp = event?.timeStamp ?? null;
                this._skipNextWindowSketchDown = true;
                this.handleSketchPointerDown(event, ints);
                return;
            }
            if (!int && int !== null) {
                return this.getInteractiveObjects();
            }

            let targetInt = int;
            if (ints && ints.length > 0) {
                const handleInt = ints.find(hit => {
                    const handleType = hit?.object?.userData?.handleType;
                    const plane = hit?.object?.userData?.plane;
                    return handleType === 'plane-resize' && plane && this.selectedPlanes.has(plane);
                });
                if (handleInt) {
                    targetInt = handleInt;
                }
            }

            const obj = targetInt?.object;
            const handleType = obj?.userData?.handleType;
            if (handleType === 'plane-resize') {
                this.startHandleDrag(obj, targetInt, event);
            }
        });

        space.mouse.upSelect((int, event, ints) => {
            if (event && event.button !== 0) {
                return;
            }
            if (this.isSketchEditing()) {
                // Query phase from space.js: return selectable objects only.
                if (!event && int === undefined) {
                    return this.getInteractiveObjects();
                }
                this.upSelectCalled = true;
                this._skipNextWindowSketchUp = true;
                this.handleSketchMouseUp(event, ints);
                this._lastSketchUpStamp = event?.timeStamp ?? null;
                this.sketchPointerDown = null;
                this.wasHandleDrag = false;
                return;
            }
            if (!int && int !== null) {
                this.wasHandleDrag = false;
                return this.getInteractiveObjects();
            }
            this.upSelectCalled = true;
            if (!this.wasHandleDrag) {
                this.handleMouseUp(int, event, ints);
            }
            this.wasHandleDrag = false;
        });

        space.mouse.up((event, ints) => {
            if (event && event.button !== 0) {
                return;
            }
            if (this.isSketchEditing()) {
                // sketch completion is handled by mouseUpSelect (preferred)
                // or window mouseup fallback when mouseUpSelect is skipped.
                return;
            }
            if (!this.upSelectCalled && !this.draggedHandle && !this.wasHandleDrag && ints && ints.length > 0) {
                this.handleMouseUp(ints[0], event, ints);
            }
            this.upSelectCalled = false;
        });
        window.addEventListener('mouseup', event => {
            if (event && event.button !== 0) {
                return;
            }
            if (!this.isSketchEditing()) {
                return;
            }
            if (this._skipNextWindowSketchUp) {
                this._skipNextWindowSketchUp = false;
                this.upSelectCalled = false;
                return;
            }
            if (event?.timeStamp && this._lastSketchUpStamp === event.timeStamp) {
                this.upSelectCalled = false;
                return;
            }
            // When space.js doesn't emit up/upSelect (empty selection array),
            // complete the sketch interaction here.
            if (!this.upSelectCalled && this.sketchPointerDown) {
                this.handleSketchMouseUp(event);
                this._lastSketchUpStamp = event?.timeStamp ?? null;
                this.sketchPointerDown = null;
            }
            this.upSelectCalled = false;
        });
        window.addEventListener('mousedown', event => {
            if (event && event.button !== 0) {
                return;
            }
            if (!this.isSketchEditing()) {
                return;
            }
            if (this._skipNextWindowSketchDown) {
                this._skipNextWindowSketchDown = false;
                return;
            }
            if (this._lastSketchDownStamp !== null && event.timeStamp === this._lastSketchDownStamp) {
                return;
            }
            const { container } = space.internals();
            if (!container || !container.contains(event.target)) {
                return;
            }
            this.handleSketchPointerDown(event);
        });

        space.mouse.onHover((int, event, ints) => {
            if (!int && int !== null) {
                return this.getInteractiveObjects();
            }
            this.handleHover(int, event, ints);
            if (this.isSketchEditing()) {
                this.handleSketchHover(event, ints);
            }
        }, () => {
            this.handleHover();
        });

        space.mouse.onDrag((delta, offset, isDone, intersections) => {
            if (delta === undefined) {
                if (this.draggedHandle) {
                    return [];
                }
                if (this.isSketchEditing()) {
                    return [];
                }
                return null;
            }

            if (this.isSketchEditing()) {
                this.handleSketchDrag(delta, offset, isDone, intersections);
                if (isDone) {
                    this.sketchPointerDown = null;
                }
                return;
            }

            if (isDone && this.draggedHandle) {
                this.wasHandleDrag = true;
                this.draggedHandle = null;
                this.draggedPlane = null;
                this.dragHandleName = null;
                this.dragAnchorPos = null;
                this.dragStartSizes.clear();
                this.dragStartCenters.clear();
                return;
            }

            if (isDone && !this.draggedHandle && offset) {
                const offsetMag = Math.sqrt(offset.x * offset.x + offset.y * offset.y);
                if (offsetMag < 5) {
                    if (intersections && intersections.length > 0) {
                        this.handleMouseUp(intersections[0], { ctrlKey: false, metaKey: false }, intersections);
                    }
                }
                return;
            }

            this.handleDrag(delta, offset, isDone, intersections);
        });

        this.setupHandleScaleHooks();
        this.updateHandleScreenScales();
    }
};

Object.assign(interact, pointOps);
Object.assign(interact, selectionOps);
Object.assign(interact, planeOps);
Object.assign(interact, targetOps);
Object.assign(interact, sketchOps);

export { interact };
