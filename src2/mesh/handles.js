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
        this.mode = '2d'; // or '3d'
        this.bounds = null;
        this.handleSize = 2; // Fixed size in world units
        this.handleColor = 0x0088ff;
        this.handleOpacity = 0.5;
        this.visible = false;
        
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
            history_undo: () => this.update(),
            history_redo: () => this.update(),
            move: () => this.update(),
            rotate: () => this.update(),
            qrotate: () => this.update(),
            scale: () => this.update(),
        });
    }

    show() {
        this.visible = true;
        this.group.visible = true;
    }

    hide() {
        this.visible = false;
        this.group.visible = false;
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
            bounds = {
                min: new Vector3(
                    sketch.center.x - sketch.scale.x/2,
                    sketch.center.y - sketch.scale.y/2,
                    0
                ),
                max: new Vector3(
                    sketch.center.x + sketch.scale.x/2,
                    sketch.center.y + sketch.scale.y/2,
                    0
                )
            };
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
        // Clear existing handles
        this.handles.forEach(handle => this.group.remove(handle));
        this.handles = [];

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
    }

    getCorners(min, max) {
        if (this.mode === '2d') {
            // 2D mode - 4 corners in XY plane
            return [
                new Vector3(min.x, min.y, 0),
                new Vector3(max.x, min.y, 0),
                new Vector3(max.x, max.y, 0),
                new Vector3(min.x, max.y, 0)
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
}

// Create singleton instance
const handles = new TransformTool();

export { handles }; 