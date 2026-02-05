/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { THREE } from '../ext/three.js';
import { space } from '../moto/space.js';
import { datum } from './datum.js';

/**
 * Interaction manager for void:form primitives
 * Handles selection, hover, and dragging behaviors
 */
const interact = {
    selectedPlanes: new Set(),  // Set of selected planes (multi-select)
    hoveredPlane: null,
    draggedHandle: null,
    dragStartSizes: new Map(),  // Map of plane -> initial size for multi-plane drag
    dragStartMouse: null,
    dragPlane: null,  // THREE.Plane for raycasting during drag
    planes: [],       // List of all interactive planes

    /**
     * Initialize interaction system
     */
    init() {
        // Register datum planes for interaction
        this.planes = datum.getPlanes();

        // Set up mouse handlers using space API
        // Pattern: callback receives (int, event, ints)
        // - If !event, return objects for raycasting
        // - If event, handle the intersection

        // space.mouse.down((event, int) => {
        //     console.log({ down: int, event });
        //     return this.getInteractiveObjects();
        // });

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
            }
            if (handled) {
                event.preventDefault();
            }
        });

        space.mouse.downSelect((int, event, ints) => {
            console.log({ downSelect: int, event });
            if (!int) {
                // First call - return objects for raycasting
                return this.getInteractiveObjects();
            }
            // Second call - handle mouse down (for drag operations)
            const obj = int?.object;
            const handleType = obj?.userData?.handleType;

            if (handleType === 'plane-resize') {
                // Clicked a handle - start drag resize
                this.startHandleDrag(obj, int, event);
            }
        });

        space.mouse.upSelect((int, event, ints) => {
            console.log({ downSelect: int, event });
            if (!int) {
                // First call - return objects for raycasting
                return this.getInteractiveObjects();
            }
            // Second call - handle the selection on mouse UP
            this.handleMouseUp(int, event, ints);
        });

        space.mouse.onHover((int, event, ints) => {
            if (!int) {
                return this.getInteractiveObjects();
            }
            // Handle hover (including null intersection = mouse left all objects)
            this.handleHover(int, event, ints);
        }, () => {
            this.handleHover();
        });

        space.mouse.onDrag((delta) => {
            console.log({ drag: delta });
            this.handleDrag(delta);
        });

        console.log({ interact_initialized: true, planes: this.planes.length });
    },

    /**
     * Get all interactive objects for raycasting
     */
    getInteractiveObjects() {
        const objects = [];
        for (const plane of this.planes) {
            // Add plane mesh and outline
            objects.push(plane.mesh);
            // objects.push(plane.outline);
            // Add handles if plane is selected
            if (this.selectedPlanes.has(plane)) {
                objects.push(...plane.handles);
            }
        }
        return objects;
    },

    /**
     * Register a plane for interaction
     */
    registerPlane(plane) {
        if (!this.planes.includes(plane)) {
            this.planes.push(plane);
        }
    },

    /**
     * Unregister a plane from interaction
     */
    unregisterPlane(plane) {
        const index = this.planes.indexOf(plane);
        if (index >= 0) {
            this.planes.splice(index, 1);
        }
        this.selectedPlanes.delete(plane);
        if (this.hoveredPlane === plane) {
            this.hoveredPlane = null;
        }
    },

    /**
     * Handle mouse hover
     */
    handleHover(intersection, event, allIntersections) {
        // No intersection means mouse left all objects
        if (!intersection) {
            if (this.hoveredPlane && !this.hoveredPlane.isSelected()) {
                this.hoveredPlane.setHovered(false);
                this.hoveredPlane = null;
            }
            return;
        }

        // Use first intersection (closest) - just like kiri/mesh
        const plane = intersection.object?.userData?.plane;

        if (plane && !plane.isSelected()) {
            // Found a plane that's not selected
            if (this.hoveredPlane !== plane) {
                // Clear previous hover
                if (this.hoveredPlane && !this.hoveredPlane.isSelected()) {
                    this.hoveredPlane.setHovered(false);
                }
                // Set new hover
                plane.setHovered(true);
                this.hoveredPlane = plane;
            }
        } else if (!plane || plane.isSelected()) {
            // No plane found or plane is already selected, clear hover
            if (this.hoveredPlane && !this.hoveredPlane.isSelected()) {
                this.hoveredPlane.setHovered(false);
                this.hoveredPlane = null;
            }
        }
    },

    /**
     * Get plane from intersection, checking userData
     * If multiple planes are hit, pick the one most facing the camera
     */
    getPlaneFromIntersection(intersection) {
        if (!intersection || !intersection.object) return null;
        return intersection.object.userData?.plane || null;
    },

    /**
     * Get best plane from all intersections (most facing camera)
     */
    getBestPlaneFromIntersections(allIntersections) {
        if (!allIntersections || allIntersections.length === 0) return null;

        const internals = space.internals();
        const camera = internals.camera;
        const cameraDir = new THREE.Vector3();
        camera.getWorldDirection(cameraDir);

        let bestPlane = null;
        let bestDot = -Infinity;

        for (const int of allIntersections) {
            const plane = int.object?.userData?.plane;
            if (!plane) continue;

            // Get face normal from intersection
            if (int.face && int.face.normal) {
                const normal = int.face.normal.clone();
                normal.transformDirection(int.object.matrixWorld);

                // Dot product: how much is this face pointing at camera?
                // Negative dot = facing camera
                const dot = normal.dot(cameraDir);

                console.log({
                    plane: plane.label,
                    dot: dot.toFixed(3),
                    distance: int.distance.toFixed(2)
                });

                if (dot < bestDot) {
                    bestDot = dot;
                    bestPlane = plane;
                }
            }
        }

        console.log({ selected_best_plane: bestPlane?.label, bestDot: bestDot.toFixed(3) });
        return bestPlane;
    },

    /**
     * Handle mouse up (selection happens here)
     */
    handleMouseUp(intersection, event, allIntersections) {
        // Ignore if we were dragging a handle
        if (this.draggedHandle) {
            console.log({ handle_drag_end: this.draggedHandle.userData.handleName });
            this.draggedHandle = null;
            this.dragStartSizes.clear();
            this.dragStartMouse = null;
            this.dragPlane = null;
            this.raycaster = null;
            return;
        }

        if (!intersection) {
            // Clicked empty space - deselect all (unless Ctrl/Cmd held)
            if (!event.ctrlKey && !event.metaKey) {
                this.deselectAll();
            }
            return;
        }

        // Use first intersection (closest) - just like kiri/mesh
        const plane = intersection.object?.userData?.plane;

        if (plane) {
            // Clicked a plane - select it
            this.selectPlane(plane, event);
        } else {
            // Clicked something else - deselect all (unless Ctrl/Cmd held)
            if (!event.ctrlKey && !event.metaKey) {
                this.deselectAll();
            }
        }
    },

    /**
     * Start handle drag operation
     * Resizes ALL selected planes together
     */
    startHandleDrag(handle, intersection, event) {
        const plane = handle.userData.plane;
        if (!plane) return;

        this.draggedHandle = handle;

        // Store initial sizes for ALL selected planes
        this.dragStartSizes.clear();
        for (const selectedPlane of this.selectedPlanes) {
            this.dragStartSizes.set(selectedPlane, selectedPlane.size);
        }

        // Create a drag plane for raycasting
        // Use the handle's plane world normal
        const normal = new THREE.Vector3(0, 0, 1);
        normal.applyQuaternion(plane.group.quaternion);

        this.dragPlane = new THREE.Plane();
        this.dragPlane.setFromNormalAndCoplanarPoint(normal, intersection.point);

        this.dragStartMouse = intersection.point.clone();

        // Get internals to access raycaster
        const internals = space.internals();
        this.raycaster = internals.raycaster;

        console.log({
            handle_drag_start: handle.userData.handleName,
            plane: plane.label,
            selected_count: this.selectedPlanes.size
        });
    },

    /**
     * Handle drag movement
     * Resizes ALL selected planes proportionally
     */
    handleDrag(delta) {
        if (!this.draggedHandle || !this.raycaster) return;

        const handlePlane = this.draggedHandle.userData.plane;
        if (!handlePlane) return;

        // Get current mouse position by raycasting to drag plane
        const mousePos = new THREE.Vector3();

        if (this.raycaster.ray.intersectPlane(this.dragPlane, mousePos)) {
            // Calculate distance moved from start
            const dragDelta = mousePos.distanceTo(this.dragStartMouse);

            // Determine if drag is outward or inward based on handle position
            const handleWorldPos = new THREE.Vector3();
            this.draggedHandle.getWorldPosition(handleWorldPos);
            const centerWorldPos = new THREE.Vector3();
            handlePlane.group.getWorldPosition(centerWorldPos);

            const toHandle = new THREE.Vector3().subVectors(handleWorldPos, centerWorldPos).normalize();
            const toMouse = new THREE.Vector3().subVectors(mousePos, centerWorldPos).normalize();
            const dot = toHandle.dot(toMouse);

            let sizeChange = dragDelta * 2;  // Scale factor for resize
            if (dot < 0) {
                sizeChange = -sizeChange;  // Dragging inward
            }

            // Apply size change to ALL selected planes
            for (const [plane, startSize] of this.dragStartSizes) {
                const newSize = Math.max(10, startSize + sizeChange);
                plane.setSize(newSize);
            }

            // Request refresh to show changes
            space.update();
        }
    },

    /**
     * Select a plane (supports multi-select with Ctrl/Cmd key)
     */
    selectPlane(plane, event) {
        const multiSelect = event && (event.ctrlKey || event.metaKey);

        if (multiSelect) {
            // Toggle selection with Ctrl/Cmd
            if (this.selectedPlanes.has(plane)) {
                // Already selected - deselect it
                plane.setSelected(false);
                this.selectedPlanes.delete(plane);
            } else {
                // Not selected - add to selection
                plane.setSelected(true);
                plane.setHovered(false);
                this.selectedPlanes.add(plane);
            }
        } else {
            // Single select - deselect all others
            for (const selectedPlane of this.selectedPlanes) {
                if (selectedPlane !== plane) {
                    selectedPlane.setSelected(false);
                }
            }
            this.selectedPlanes.clear();

            // Select the new plane
            plane.setSelected(true);
            plane.setHovered(false);
            this.selectedPlanes.add(plane);
        }
    },

    /**
     * Deselect all planes
     */
    deselectAll() {
        for (const plane of this.selectedPlanes) {
            plane.setSelected(false);
        }
        this.selectedPlanes.clear();

        if (this.hoveredPlane) {
            this.hoveredPlane.setHovered(false);
            this.hoveredPlane = null;
        }
    },

    /**
     * Get currently selected planes
     * @returns {Set} Set of selected planes
     */
    getSelected() {
        return this.selectedPlanes;
    },

    /**
     * Check if a plane is selected
     */
    isSelected(plane) {
        return this.selectedPlanes.has(plane);
    }
};

export { interact };
