/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { THREE } from '../ext/three.js';
import { space } from '../moto/space.js';
import { datum } from './datum.js';

/**
 * Interaction manager for void:form primitives
 * Handles selection, hover, and dragging behaviors
 */
const interact = {
    selectedPlane: null,
    hoveredPlane: null,
    draggedHandle: null,
    dragStartSize: 0,
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

        space.mouse.downSelect((int, event, ints) => {
            console.log({ downSelect: int, event });
            let selected = this.getSelected();
            if (!int && selected) {
                return this.deselectAll();
            } else if (!int) {
                return this.getInteractiveObjects();
            }
            // Handle mouse down (including null intersection = clicked empty space)
            this.handleMouseDown(int, event, ints);
        });

        space.mouse.onHover((int, event, ints) => {
            if (!event) {
                return this.getInteractiveObjects();
            }
            // Handle hover (including null intersection = mouse left all objects)
            this.handleHover(int, event, ints);
        }, () => {
            this.handleHover();
        });

        space.mouse.onDrag((delta) => {
            this.handleDrag(delta);
        });

        // space.mouse.up((int, event) => {
        //     console.log({ up: int });
        //     this.handleMouseUp(int, event);
        // });

        // space.mouse.upSelect((int, event) => {
        //     console.log({ upSelect: int });
        //     this.handleMouseUp(int, event);
        // });

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
            if (plane.isSelected()) {
                // objects.push(...plane.handles);
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
        if (this.selectedPlane === plane) {
            this.selectedPlane = null;
        }
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

        console.log({
            hover: plane?.label || 'no-plane',
            object: intersection.object?.name || intersection.object?.type,
            hasUserData: !!intersection.object?.userData,
            userData: intersection.object?.userData
        });

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
     * Handle mouse down
     */
    handleMouseDown(intersection, event, allIntersections) {
        if (!intersection) {
            // Clicked empty space - deselect
            this.deselectAll();
            return;
        }

        const obj = intersection.object;
        const handleType = obj.userData?.handleType;

        if (handleType === 'plane-resize') {
            // Clicked a handle - start drag resize
            this.startHandleDrag(obj, intersection, event);
            return;
        }

        // Use first intersection (closest) - just like kiri/mesh
        const plane = intersection.object?.userData?.plane;

        console.log({
            click: plane?.label || 'no-plane',
            object: intersection.object?.name || intersection.object?.type,
            hasUserData: !!intersection.object?.userData,
            userData: intersection.object?.userData
        });

        if (plane) {
            // Clicked a plane - select it
            this.selectPlane(plane);
        } else {
            // Clicked something else - deselect
            this.deselectAll();
        }
    },

    /**
     * Start handle drag operation
     */
    startHandleDrag(handle, intersection, event) {
        const plane = handle.userData.plane;
        if (!plane) return;

        this.draggedHandle = handle;
        this.dragStartSize = plane.size;

        // Create a drag plane for raycasting
        // Use the plane's world normal
        const normal = new THREE.Vector3(0, 0, 1);
        normal.applyQuaternion(plane.group.quaternion);

        this.dragPlane = new THREE.Plane();
        this.dragPlane.setFromNormalAndCoplanarPoint(normal, intersection.point);

        this.dragStartMouse = intersection.point.clone();

        // Get internals to access raycaster
        const internals = space.internals();
        this.raycaster = internals.raycaster;

        console.log({ handle_drag_start: handle.userData.handleName, size: this.dragStartSize });
    },

    /**
     * Handle drag movement
     */
    handleDrag(delta) {
        if (!this.draggedHandle || !this.raycaster) return;

        const plane = this.draggedHandle.userData.plane;
        if (!plane) return;

        // Get current mouse position by raycasting to drag plane
        const mousePos = new THREE.Vector3();

        if (this.raycaster.ray.intersectPlane(this.dragPlane, mousePos)) {
            // Calculate distance moved from start
            const dragDelta = mousePos.distanceTo(this.dragStartMouse);

            // Determine if drag is outward or inward based on handle position
            const handleWorldPos = new THREE.Vector3();
            this.draggedHandle.getWorldPosition(handleWorldPos);
            const centerWorldPos = new THREE.Vector3();
            plane.group.getWorldPosition(centerWorldPos);

            const toHandle = new THREE.Vector3().subVectors(handleWorldPos, centerWorldPos).normalize();
            const toMouse = new THREE.Vector3().subVectors(mousePos, centerWorldPos).normalize();
            const dot = toHandle.dot(toMouse);

            let sizeChange = dragDelta * 2;  // Scale factor for resize
            if (dot < 0) {
                sizeChange = -sizeChange;  // Dragging inward
            }

            const newSize = Math.max(10, this.dragStartSize + sizeChange);
            plane.setSize(newSize);
        }
    },

    /**
     * Handle mouse up
     */
    handleMouseUp(intersection, event) {
        if (this.draggedHandle) {
            console.log({ handle_drag_end: this.draggedHandle.userData.handleName });
            this.draggedHandle = null;
            this.dragStartSize = 0;
            this.dragStartMouse = null;
            this.dragPlane = null;
            this.raycaster = null;
        }
    },

    /**
     * Select a plane
     */
    selectPlane(plane) {
        // Deselect previous
        if (this.selectedPlane && this.selectedPlane !== plane) {
            this.selectedPlane.setSelected(false);
        }

        // Select new
        plane.setSelected(true);
        plane.setHovered(false);  // Clear hover when selected
        this.selectedPlane = plane;

        console.log({ plane_selected: plane.id, label: plane.label });
    },

    /**
     * Deselect all planes
     */
    deselectAll() {
        if (this.selectedPlane) {
            this.selectedPlane.setSelected(false);
            this.selectedPlane = null;
        }
        if (this.hoveredPlane) {
            this.hoveredPlane.setHovered(false);
            this.hoveredPlane = null;
        }
    },

    /**
     * Get currently selected plane
     */
    getSelected() {
        return this.selectedPlane;
    }
};

export { interact };
