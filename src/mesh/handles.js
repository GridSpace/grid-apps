/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { THREE } from '../ext/three.js';
import { broker } from '../moto/broker.js';
import { space as motoSpace } from '../moto/space.js';
import { api as meshApi } from './api.js';
import { util as meshUtil } from './util.js';

const { 
    BoxGeometry, 
    EdgesGeometry, 
    LineSegments, 
    MeshBasicMaterial, 
    LineBasicMaterial,
    Group,
    Vector3,
    Quaternion,
    Mesh
} = THREE;

class TransformTool {
    constructor() {
        this.group = new Group();
        this.handles = [];
        this.lines = []; // Add array to track connecting lines
        this.mode = '2d'; // or '3d'
        this.bounds = null;
        this.handleSize = 2;
        this.handleColor = 0x0088ff;
        this.handleOpacity = 0.5;
        this.enabled = true; // persisted state
        this.visible = false; // selection state

        // Create materials
        this.handleMaterial = new MeshBasicMaterial({
            color: this.handleColor,
            transparent: true,
            opacity: this.handleOpacity
        });

        this.edgeMaterial = new LineBasicMaterial({
            color: this.handleColor,
            transparent: true,
            opacity: 0.8
        });

        // Add to scene
        motoSpace.world.add(this.group);
        this.group.visible = false;

        // Listen for selection changes
        broker.listeners({
            selection_update: () => this.update(),
            sketch_selections: () => this.update(),
            selection_drag: () => this.update(),
            selection_move: () => this.update(),
            selection_scale: () => this.update(),
            selection_rotate: () => this.update(),
            selection_qrotate: () => this.update(),
            sketch_render: () => this.update(),
            history_undo: () => this.update(),
            history_redo: () => this.update(),
            move: () => this.update(),
            rotate: () => this.update(),
            qrotate: () => this.update(),
            scale: () => this.update(),
        });
    }

    setEnabled(enabled) {
        this.enabled = enabled;
        if (meshApi && meshApi.prefs) {
            meshApi.prefs.map.space.bounds = enabled;
            meshApi.prefs.save();
        }
        this.updateVisibility();
    }

    setVisible(visible) {
        this.visible = visible;
        this.updateVisibility();
    }

    show() {
        this.setVisible(true);
    }

    hide() {
        this.setVisible(false);
    }

    toggleBounds() {
        this.setEnabled(!this.enabled);
    }

    updateVisibility() {
        this.group.visible = this.enabled && this.visible;
    }

    update() {
        // Get current selection
        const selection = meshApi.selection;
        const sketch = selection.sketch();
        const models = selection.models();

        // Hide if no selection
        if (!sketch && !models.length) {
            this.hide();
            return;
        }

        // Show transform tool
        this.show();

        // Get bounds based on selection type
        let bounds;
        if (sketch) {
            // For sketches, use 2D mode
            this.mode = '2d';
            bounds = sketch.bounds;
        } else {
            // For models/groups, use 3D mode
            this.mode = '3d';
            const objects = models;
            bounds = meshUtil.bounds(objects);
        }

        this.setBounds(bounds);
    }

    setBounds(bounds, mode = '3d') {
        this.mode = mode;
        this.bounds = bounds;
        this.updateHandles();
    }

    updateHandles() {
        // Clear existing handles and lines
        this.handles.forEach(handle => this.group.remove(handle));
        this.lines.forEach(line => this.group.remove(line));
        this.handles = [];
        this.lines = [];

        if (!this.bounds) return;

        const { min, max } = this.bounds;
        const corners = this.getCorners(min, max);

        // Create handles for each corner
        corners.forEach(corner => {
            const handle = this.createHandle();
            handle.position.copy(corner);
            this.handles.push(handle);
            this.group.add(handle);
        });

        // Add connecting lines between handles
        if (this.mode === '2d') {
            // For 2D mode, connect handles with horizontal and vertical lines
            const lineGeometry = new THREE.BufferGeometry();
            const linePositions = [];

            // Horizontal lines
            linePositions.push(
                corners[0].x, corners[0].y, corners[0].z,  // 0 to 1
                corners[1].x, corners[1].y, corners[1].z,
                corners[2].x, corners[2].y, corners[2].z,  // 2 to 3
                corners[3].x, corners[3].y, corners[3].z
            );

            // Vertical lines
            linePositions.push(
                corners[0].x, corners[0].y, corners[0].z,  // 0 to 3
                corners[3].x, corners[3].y, corners[3].z,
                corners[1].x, corners[1].y, corners[1].z,  // 1 to 2
                corners[2].x, corners[2].y, corners[2].z
            );

            lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
            const line = new THREE.LineSegments(lineGeometry, this.edgeMaterial);
            this.lines.push(line);
            this.group.add(line);
        } else {
            // For 3D mode, connect handles with axis-aligned lines
            const lineGeometry = new THREE.BufferGeometry();
            const linePositions = [];

            // Bottom face (horizontal lines)
            for (let i = 0; i < 4; i++) {
                linePositions.push(
                    corners[i].x, corners[i].y, corners[i].z,
                    corners[(i + 1) % 4].x, corners[(i + 1) % 4].y, corners[(i + 1) % 4].z
                );
            }

            // Top face (horizontal lines)
            for (let i = 4; i < 8; i++) {
                linePositions.push(
                    corners[i].x, corners[i].y, corners[i].z,
                    corners[4 + ((i - 3) % 4)].x, corners[4 + ((i - 3) % 4)].y, corners[4 + ((i - 3) % 4)].z
                );
            }

            // Vertical edges
            for (let i = 0; i < 4; i++) {
                linePositions.push(
                    corners[i].x, corners[i].y, corners[i].z,
                    corners[i + 4].x, corners[i + 4].y, corners[i + 4].z
                );
            }

            lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
            const line = new THREE.LineSegments(lineGeometry, this.edgeMaterial);
            this.lines.push(line);
            this.group.add(line);
        }
    }

    getCorners(min, max) {
        if (this.mode === '2d') {
            // 2D mode - 4 corners in XY plane at z midline
            const zMid = (min.z + max.z) / 2;
            return [
                new Vector3(min.x, min.y, zMid),
                new Vector3(max.x, min.y, zMid),
                new Vector3(max.x, max.y, zMid),
                new Vector3(min.x, max.y, zMid)
            ];
        } else {
            // 3D mode - 8 corners of bounding box
            return [
                new Vector3(min.x, min.y, min.z),
                new Vector3(max.x, min.y, min.z),
                new Vector3(max.x, max.y, min.z),
                new Vector3(min.x, max.y, min.z),
                new Vector3(min.x, min.y, max.z),
                new Vector3(max.x, min.y, max.z),
                new Vector3(max.x, max.y, max.z),
                new Vector3(min.x, max.y, max.z)
            ];
        }
    }

    createHandle() {
        // Create a small box for the handle
        const geometry = new BoxGeometry(
            this.handleSize,
            this.handleSize,
            this.handleSize
        );

        // Create the handle mesh
        const handle = new Mesh(geometry, this.handleMaterial);

        // Add wireframe edges
        const edges = new EdgesGeometry(geometry);
        const line = new LineSegments(edges, this.edgeMaterial);
        handle.add(line);

        return handle;
    }

    get object() {
        return this.group;
    }

    activeHandles() {
        if (!this.enabled) return [];
        // Return an array of objects wrapping each handle
        // Each object: { mesh, index, position }
        return this.handles.map((mesh, index) => ({
            mesh,
            index,
            position: mesh.position.clone(),
        }));
    }

    /**
     * Given a handle (from activeHandles) and a drag {delta, offset},
     * compute the new center and size for the bounding box.
     * Returns: { center: Vector3, size: Vector3 }
     */
    computeDelta(handleObj, { delta, offset }) {
        // Get current bounds
        if (!this.bounds) return null;
        const { min, max } = this.bounds;
        const center = min.clone().add(max).multiplyScalar(0.5);
        const size = max.clone().sub(min);

        // Which handle is being dragged?
        const handleIndex = handleObj.index;
        // Get all corners
        const corners = this.getCorners(min, max);
        // Copy corners so we can mutate
        const newCorners = corners.map(c => c.clone());
        // Move the dragged corner by delta
        newCorners[handleIndex].add(delta);

        // Compute new min/max from moved corners
        let newMin = newCorners[0].clone();
        let newMax = newCorners[0].clone();
        for (let c of newCorners) {
            newMin.min(c);
            newMax.max(c);
        }
        const newCenter = newMin.clone().add(newMax).multiplyScalar(0.5);
        const newSize = newMax.clone().sub(newMin);
        return { center: newCenter, size: newSize };
    }
}

// Create singleton instance
const handles = new TransformTool();

export { handles }; 