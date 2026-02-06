/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { THREE } from '../ext/three.js';
import { space } from '../moto/space.js';
import { datum } from './datum.js';
import * as targetOps from './interact/targets.js';
import * as pointOps from './interact/points.js';
import * as selectionOps from './interact/selection.js';
import * as planeOps from './interact/planes.js';

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

    init() {
        this.planes = datum.getPlanes();

        window.addEventListener('keypress', event => {
            let handled = false;
            if (space.isFocused()) {
                return false;
            }
            switch (event.code) {
                case 'Space':
                    this.deselectAll();
                    handled = true;
                    break;
                case 'KeyN':
                    handled = this.viewNormalToHover();
                    break;
            }
            if (handled) {
                event.preventDefault();
            }
        });

        space.mouse.downSelect((int, event, ints) => {
            if (event && event.button !== 0) {
                return;
            }
            if (!int) {
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
            if (!this.upSelectCalled && !this.draggedHandle && !this.wasHandleDrag && ints && ints.length > 0) {
                this.handleMouseUp(ints[0], event, ints);
            }
            this.upSelectCalled = false;
        });

        space.mouse.onHover((int, event, ints) => {
            if (!int && int !== null) {
                return this.getInteractiveObjects();
            }
            this.handleHover(int, event, ints);
        }, () => {
            this.handleHover();
        });

        space.mouse.onDrag((delta, offset, isDone, intersections) => {
            if (delta === undefined) {
                if (this.draggedHandle) {
                    return [];
                }
                return null;
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

export { interact };
