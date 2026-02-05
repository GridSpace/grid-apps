/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { THREE } from '../ext/three.js';

const { Group, PlaneGeometry, MeshBasicMaterial, Mesh, DoubleSide, EdgesGeometry, LineSegments, LineBasicMaterial, SphereGeometry } = THREE;

/**
 * Plane primitive - a fundamental void:form feature
 * Used for datum planes, sketch planes, and construction geometry
 */
class Plane {
    constructor(options = {}) {
        this.id = options.id || `plane-${Date.now()}`;
        this.name = options.name || 'Plane';
        this.label = options.label || null;  // Optional label text
        this.size = options.size || 200;

        // Base colors
        this.color = options.color || 0x404040;        // Plane fill color
        this.outlineColor = options.outlineColor || 0x808080;  // Outline color
        this.opacity = options.opacity !== undefined ? options.opacity : 0.15;
        this.outlineOpacity = options.outlineOpacity !== undefined ? options.outlineOpacity : 0.5;

        // State colors (like Onshape)
        this.selectedColor = 0xff9933;        // Orange tint when selected
        this.selectedOutlineColor = 0xff9933; // Orange outline when selected
        this.hoverOutlineColor = 0xff9933;    // Orange outline when hovered

        this.showHandles = options.showHandles !== undefined ? options.showHandles : true;

        // State tracking
        this.selected = false;
        this.hovered = false;
        this.changeHandlers = new Set();

        // Create the 3D group
        this.group = new Group();
        this.group.name = this.name;
        this.group.userData.featureType = 'plane';
        this.group.userData.featureId = this.id;
        this.group.userData.plane = this;  // Back reference for event handling

        // Corner handles
        this.handles = [];

        // Build geometry
        this.build();
    }

    /**
     * Build or rebuild the plane geometry
     */
    build() {
        // Clear existing geometry
        while (this.group.children.length > 0) {
            const child = this.group.children[0];
            this.group.remove(child);
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        }
        this.handles = [];

        // Create the plane mesh (translucent)
        const width = this.size;
        const height = this.height !== undefined ? this.height : this.size;
        const geometry = new PlaneGeometry(width, height);
        const material = new MeshBasicMaterial({
            color: this.color,
            transparent: true,
            opacity: this.opacity,
            side: DoubleSide,
            depthWrite: false
        });

        this.mesh = new Mesh(geometry, material);
        this.mesh.renderOrder = 1;
        this.mesh.userData.plane = this;  // Back reference for interaction

        // Create the outline
        const edges = new EdgesGeometry(geometry);
        const lineMaterial = new LineBasicMaterial({
            color: this.outlineColor,
            transparent: true,
            opacity: this.outlineOpacity,
            depthWrite: false
        });

        this.outline = new LineSegments(edges, lineMaterial);
        this.outline.renderOrder = 2; // Render outline on top of plane
        this.outline.userData.plane = this;  // Back reference for interaction

        // Add to group
        this.group.add(this.mesh);
        this.group.add(this.outline);

        // Create corner handles
        if (this.showHandles) {
            this.createHandles();
        }
    }

    /**
     * Create corner handles for resizing
     */
    createHandles() {
        const halfWidth = this.size / 2;
        const halfHeight = (this.height !== undefined ? this.height : this.size) / 2;
        const handleRadius = 3;
        const handleGeometry = new SphereGeometry(handleRadius, 8, 8);
        const handleMaterial = new MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.8,
            depthWrite: false
        });

        const corners = [
            { x: -halfWidth, y: -halfHeight, z: 0, name: 'bottom-left' },
            { x: halfWidth, y: -halfHeight, z: 0, name: 'bottom-right' },
            { x: halfWidth, y: halfHeight, z: 0, name: 'top-right' },
            { x: -halfWidth, y: halfHeight, z: 0, name: 'top-left' }
        ];

        for (const corner of corners) {
            const handle = new Mesh(handleGeometry.clone(), handleMaterial.clone());
            handle.position.set(corner.x, corner.y, corner.z);
            handle.renderOrder = 3;
            handle.userData.handleType = 'plane-resize';
            handle.userData.handleName = corner.name;
            handle.userData.plane = this;

            // Handles start hidden (only visible when selected)
            handle.visible = false;

            this.handles.push(handle);
            this.group.add(handle);
        }
    }

    /**
     * Set plane size and update in place (no rebuild)
     */
    setSize(size, height) {
        this.size = size;
        this.height = height !== undefined ? height : size;

        const newWidth = this.size;
        const newHeight = this.height !== undefined ? this.height : this.size;

        // Update mesh geometry scale
        if (this.mesh && this.mesh.geometry) {
            this.mesh.geometry.dispose();
            this.mesh.geometry = new PlaneGeometry(newWidth, newHeight);
        }

        // Update outline geometry
        if (this.outline && this.mesh) {
            this.outline.geometry.dispose();
            this.outline.geometry = new EdgesGeometry(this.mesh.geometry);
        }

        // Update handle positions
        if (this.handles && this.handles.length > 0) {
            const halfWidth = newWidth / 2;
            const halfHeight = newHeight / 2;
            const positions = [
                { x: -halfWidth, y: -halfHeight },  // bottom-left
                { x: halfWidth, y: -halfHeight },   // bottom-right
                { x: halfWidth, y: halfHeight },    // top-right
                { x: -halfWidth, y: halfHeight }    // top-left
            ];

            for (let i = 0; i < this.handles.length && i < positions.length; i++) {
                this.handles[i].position.set(positions[i].x, positions[i].y, 0);
            }
        }

        this.notifyChange();
    }

    /**
     * Set plane color
     */
    setColor(color) {
        this.color = color;
        if (this.mesh) {
            this.mesh.material.color.setHex(color);
        }
    }

    /**
     * Set outline color
     */
    setOutlineColor(color) {
        this.outlineColor = color;
        if (this.outline) {
            this.outline.material.color.setHex(color);
        }
    }

    /**
     * Set opacity
     */
    setOpacity(opacity) {
        this.opacity = opacity;
        if (this.mesh) {
            this.mesh.material.opacity = opacity;
        }
    }

    /**
     * Set outline opacity
     */
    setOutlineOpacity(opacity) {
        this.outlineOpacity = opacity;
        if (this.outline) {
            this.outline.material.opacity = opacity;
        }
    }

    /**
     * Set position
     */
    setPosition(x, y, z) {
        this.group.position.set(x, y, z);
        this.notifyChange();
    }

    /**
     * Set rotation (in radians)
     */
    setRotation(x, y, z) {
        this.group.rotation.set(x, y, z);
        this.notifyChange();
    }

    /**
     * Set visibility
     */
    setVisible(visible) {
        this.group.visible = visible;
    }

    /**
     * Set label text
     */
    setLabel(text) {
        this.label = text;
        this.notifyChange();
    }

    /**
     * Get label text
     */
    getLabel() {
        return this.label;
    }

    /**
     * Get top-left corner position in world coordinates
     */
    getTopLeftCorner() {
        const halfWidth = this.size / 2;
        const halfHeight = (this.height !== undefined ? this.height : this.size) / 2;
        const localPos = new THREE.Vector3(-halfWidth, halfHeight, 0);
        this.group.updateMatrixWorld(true);
        const worldPos = localPos.applyMatrix4(this.group.matrixWorld);
        return worldPos;
    }

    /**
     * Register callback for geometry/transform/label changes
     */
    onChange(handler) {
        if (typeof handler === 'function') {
            this.changeHandlers.add(handler);
        }
        return this;
    }

    /**
     * Remove registered change callback
     */
    offChange(handler) {
        this.changeHandlers.delete(handler);
        return this;
    }

    /**
     * Notify listeners plane changed
     */
    notifyChange() {
        for (const handler of this.changeHandlers) {
            handler(this);
        }
    }

    /**
     * Show/hide handles
     */
    setHandlesVisible(visible) {
        this.showHandles = visible;
        for (const handle of this.handles) {
            handle.visible = visible;
        }
    }

    /**
     * Set selected state
     */
    setSelected(selected) {
        this.selected = selected;
        this.updateAppearance();
    }

    /**
     * Get selected state
     */
    isSelected() {
        return this.selected;
    }

    /**
     * Set hovered state
     */
    setHovered(hovered) {
        this.hovered = hovered;
        this.updateAppearance();
    }

    /**
     * Get hovered state
     */
    isHovered() {
        return this.hovered;
    }

    /**
     * Update appearance based on state
     */
    updateAppearance() {
        if (!this.mesh || !this.outline) return;

        if (this.selected) {
            // Selected: orange tint and outline, handles visible
            this.mesh.material.color.setHex(this.selectedColor);
            this.outline.material.color.setHex(this.selectedOutlineColor);
            this.setHandlesVisible(true);
        } else if (this.hovered) {
            // Hovered: base color, orange outline, no handles
            this.mesh.material.color.setHex(this.color);
            this.outline.material.color.setHex(this.hoverOutlineColor);
            this.setHandlesVisible(false);
        } else {
            // Default: base colors, no handles
            this.mesh.material.color.setHex(this.color);
            this.outline.material.color.setHex(this.outlineColor);
            this.setHandlesVisible(false);
        }
    }

    /**
     * Get the THREE.Group for adding to scene
     */
    getGroup() {
        return this.group;
    }

    /**
     * Serialize plane to JSON
     */
    toJSON() {
        return {
            id: this.id,
            name: this.name,
            label: this.label,
            type: 'plane',
            size: this.size,
            color: this.color,
            outlineColor: this.outlineColor,
            opacity: this.opacity,
            outlineOpacity: this.outlineOpacity,
            showHandles: this.showHandles,
            position: {
                x: this.group.position.x,
                y: this.group.position.y,
                z: this.group.position.z
            },
            rotation: {
                x: this.group.rotation.x,
                y: this.group.rotation.y,
                z: this.group.rotation.z
            }
        };
    }

    /**
     * Create plane from JSON
     */
    static fromJSON(data) {
        const plane = new Plane({
            id: data.id,
            name: data.name,
            label: data.label,
            size: data.size,
            color: data.color,
            outlineColor: data.outlineColor,
            opacity: data.opacity,
            outlineOpacity: data.outlineOpacity,
            showHandles: data.showHandles
        });

        if (data.position) {
            plane.setPosition(data.position.x, data.position.y, data.position.z);
        }

        if (data.rotation) {
            plane.setRotation(data.rotation.x, data.rotation.y, data.rotation.z);
        }

        return plane;
    }

    /**
     * Dispose of all resources
     */
    dispose() {
        if (this.mesh) {
            this.mesh.geometry.dispose();
            this.mesh.material.dispose();
        }
        if (this.outline) {
            this.outline.geometry.dispose();
            this.outline.material.dispose();
        }
        while (this.group.children.length > 0) {
            this.group.remove(this.group.children[0]);
        }
    }
}

export { Plane };
