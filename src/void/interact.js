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
    draggedPlane: null,  // The plane being dragged
    dragHandleName: null,  // Which handle (corner) is being dragged
    dragAnchorPos: null,  // Position of opposite corner (stays pinned during drag)
    dragStartSizes: new Map(),  // Map of plane -> initial size for multi-plane drag
    dragStartCenters: new Map(),  // Map of plane -> initial center for multi-plane drag
    planes: [],       // List of all interactive planes
    upSelectCalled: false,  // Track if upSelect was called for this click
    wasHandleDrag: false,  // Track if we just finished a handle drag

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
            // Filter for left-click only (button 0)
            if (event && event.button !== 0) {
                return;
            }
            if (!int) {
                // First call - return objects for raycasting (includes tracking plane)
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
            // Filter for left-click only (button 0)
            if (event && event.button !== 0) {
                return;
            }
            if (!int && int !== null) {
                // First call (no args) - return objects for raycasting
                this.upSelectCalled = false;  // Reset flag
                this.wasHandleDrag = false;   // Reset handle drag flag
                return this.getInteractiveObjects();
            }
            // Second call - handle the selection on mouse UP
            this.upSelectCalled = true;  // Mark that upSelect was called

            // Don't handle selection if we just finished a handle drag
            if (!this.wasHandleDrag) {
                this.handleMouseUp(int, event, ints);
            }
            this.wasHandleDrag = false;  // Reset for next interaction
        });

        // Fallback: use regular mouseUp to catch clicks that space.js misses
        space.mouse.up((event, ints) => {
            // Filter for left-click only (button 0)
            if (event && event.button !== 0) {
                return;
            }
            // Only handle if upSelect didn't fire and we're not in a handle drag
            // This catches the case where mouse moved slightly so upSelect was skipped
            if (!this.upSelectCalled && !this.draggedHandle && !this.wasHandleDrag && ints && ints.length > 0) {
                this.handleMouseUp(ints[0], event, ints);
            }
        });

        space.mouse.onHover((int, event, ints) => {
            if (!int && int !== null) {
                // First call (no args) - return objects for raycasting
                return this.getInteractiveObjects();
            }
            // Handle hover (including null intersection = mouse left all objects)
            this.handleHover(int, event, ints);
        }, () => {
            this.handleHover();
        });

        space.mouse.onDrag((delta, offset, isDone, intersections) => {
            // Called with no args: return objects to track for dragging
            if (delta === undefined) {
                if (this.draggedHandle) {
                    // Return empty array to use default tracking plane
                    return [];
                }
                return null;
            }

            // If isDone and we have a handle, it was a drag - clean up
            if (isDone && this.draggedHandle) {
                this.wasHandleDrag = true;  // Mark that we just finished a handle drag
                this.draggedHandle = null;
                this.draggedPlane = null;
                this.dragHandleName = null;
                this.dragAnchorPos = null;
                this.dragStartSizes.clear();
                this.dragStartCenters.clear();
                return;
            }

            // If isDone but NO handle and offset is tiny, treat as click
            if (isDone && !this.draggedHandle && offset) {
                const offsetMag = Math.sqrt(offset.x * offset.x + offset.y * offset.y);
                if (offsetMag < 5) {  // Less than 5 pixels = click
                    // Trigger selection on the last intersection
                    if (intersections && intersections.length > 0) {
                        this.handleMouseUp(intersections[0], { ctrlKey: false, metaKey: false }, intersections);
                    }
                }
                return;
            }

            // Called with args: handle the drag
            this.handleDrag(delta, offset, isDone, intersections);
        });
    },

    /**
     * Get all interactive objects for raycasting
     * DON'T include tracking plane - space.js adds it separately
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

        // DON'T add trackPlane here - space.js adds it as trackTo separately
        // This ensures it's detected as trackInt, not selectInt

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
            this.draggedHandle = null;
            this.draggedPlane = null;
            this.dragHandleName = null;
            this.dragAnchorPos = null;
            this.dragStartSizes.clear();
            this.dragStartCenters.clear();
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
        this.draggedPlane = plane;

        // Store which handle this is (corner name)
        this.dragHandleName = handle.userData.handleName;

        // Find the opposite corner handle (the one that should stay pinned)
        const oppositeCornerName = this.getOppositeCorner(this.dragHandleName);
        const oppositeHandle = plane.handles.find(h => h.userData.handleName === oppositeCornerName);

        if (oppositeHandle) {
            // Store opposite corner's world position (this will be the anchor)
            this.dragAnchorPos = new THREE.Vector3();
            oppositeHandle.getWorldPosition(this.dragAnchorPos);
        }

        // Store initial sizes and centers for ALL selected planes
        this.dragStartSizes.clear();
        this.dragStartCenters = new Map();
        for (const selectedPlane of this.selectedPlanes) {
            this.dragStartSizes.set(selectedPlane, selectedPlane.size);
            const center = new THREE.Vector3();
            selectedPlane.group.getWorldPosition(center);
            this.dragStartCenters.set(selectedPlane, center);
        }
    },

    /**
     * Get opposite corner name
     */
    getOppositeCorner(cornerName) {
        const opposites = {
            'top-right': 'bottom-left',
            'top-left': 'bottom-right',
            'bottom-right': 'top-left',
            'bottom-left': 'top-right'
        };
        return opposites[cornerName];
    },

    /**
     * Handle drag movement
     * Resizes ALL selected planes proportionally
     * @param {Object} delta - {x, y, z} movement since last drag event
     * @param {Object} offset - {x, y, z} total movement since drag start
     * @param {boolean} isDone - true if drag is complete
     * @param {Array} intersections - raycaster intersections
     */
    handleDrag(delta, offset, isDone, intersections) {
        if (!this.draggedHandle || !this.draggedPlane) return;
        if (isDone) return;  // Ignore drag end event

        // Get mouse event from delta object
        const event = delta.event;
        if (!event) return;

        // Get space internals for raycasting
        const internals = space.internals();
        const camera = internals.camera;
        const container = internals.container;

        // Convert mouse position to NDC and setup raycaster
        const rect = container.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        const mouseNDC = new THREE.Vector2(
            (x / rect.width) * 2 - 1,
            -(y / rect.height) * 2 + 1
        );

        // Create ray from camera through mouse position
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouseNDC, camera);

        // Update world matrices to ensure they're current
        this.draggedPlane.group.updateMatrixWorld(true);

        // Get plane's world normal - extract Z-axis from world matrix
        // The Z-axis of the mesh's orientation is the plane normal
        const planeNormal = new THREE.Vector3();
        this.draggedPlane.mesh.matrixWorld.extractBasis(
            new THREE.Vector3(), // X-axis (discard)
            new THREE.Vector3(), // Y-axis (discard)
            planeNormal          // Z-axis (this is the normal)
        );

        const planeCenter = new THREE.Vector3();
        this.draggedPlane.group.getWorldPosition(planeCenter);

        // Create THREE.Plane for ray intersection
        const intersectPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, planeCenter);

        // Intersect ray with plane - this is where the dragged handle should be
        const newHandlePos = new THREE.Vector3();
        raycaster.ray.intersectPlane(intersectPlane, newHandlePos);

        if (!newHandlePos || !this.dragAnchorPos) return;

        // Get the plane's X and Y axes in world space
        const xAxis = new THREE.Vector3();
        const yAxis = new THREE.Vector3();
        const zAxis = new THREE.Vector3();
        this.draggedPlane.mesh.matrixWorld.extractBasis(xAxis, yAxis, zAxis);

        // Vector from anchor to handle
        const diagonal = new THREE.Vector3().subVectors(newHandlePos, this.dragAnchorPos);

        // Project onto plane's axes to get width and height
        const newWidth = Math.max(10, Math.abs(diagonal.dot(xAxis)));
        const newHeight = Math.max(10, Math.abs(diagonal.dot(yAxis)));

        // Center is midpoint between anchor and handle
        const newCenterWorld = new THREE.Vector3().addVectors(this.dragAnchorPos, newHandlePos).multiplyScalar(0.5);

        // Set the plane to the new width/height and center position
        this.draggedPlane.setSize(newWidth, newHeight);

        // Convert world position to local position relative to parent
        if (this.draggedPlane.group.parent) {
            const newCenterLocal = this.draggedPlane.group.parent.worldToLocal(newCenterWorld.clone());
            this.draggedPlane.group.position.copy(newCenterLocal);

            // Verify: get the world position back after setting
            const verifyWorld = new THREE.Vector3();
            this.draggedPlane.group.getWorldPosition(verifyWorld);
        } else {
            this.draggedPlane.group.position.copy(newCenterWorld);
        }

        // Request refresh to show changes
        space.update();
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
