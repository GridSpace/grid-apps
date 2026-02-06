/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { THREE } from '../ext/three.js';
import { Plane } from './plane.js';

const { Group } = THREE;

/**
 * Datum - composed of three orthogonal plane primitives
 * Provides the default coordinate system reference for modeling
 */
const datum = {
    group: null,          // THREE.Group containing all planes
    planes: {},           // { xy, xz, yz } - Plane instances
    size: 200,            // Plane dimensions
    visible: true,
    overlay: null,        // Overlay reference for label updates
    labelHandlers: new Map(),
    changeHandlers: new Set(),

    /**
     * Initialize datum with three orthogonal planes
     */
    init(options = {}) {
        this.size = options.size || 200;
        this.group = new Group();
        this.group.name = 'datum';

        // Create three plane primitives with labels (like Onshape)
        this.planes.xy = new Plane({
            id: 'datum-xy',
            name: 'XY Plane',
            label: 'Top',
            size: this.size
        });

        this.planes.xz = new Plane({
            id: 'datum-xz',
            name: 'XZ Plane',
            label: 'Front',
            size: this.size
        });

        this.planes.yz = new Plane({
            id: 'datum-yz',
            name: 'YZ Plane',
            label: 'Right',
            size: this.size
        });

        // Position XZ plane (vertical, front-back)
        this.planes.xz.setRotation(Math.PI / 2, 0, 0);

        // Position YZ plane (vertical, left-right)
        this.planes.yz.setRotation(0, Math.PI / 2, 0);

        // Add all plane groups to datum group
        this.group.add(this.planes.xy.getGroup());
        this.group.add(this.planes.xz.getGroup());
        this.group.add(this.planes.yz.getGroup());

        // Keep labels in sync with plane transform/size updates
        for (const [key, plane] of Object.entries(this.planes)) {
            const handler = () => {
                if (this.overlay) {
                    this.updateLabel(this.overlay, key, plane);
                }
            };
            this.labelHandlers.set(key, handler);
            plane.onChange(handler);
        }

        // Set initial visibility
        this.setVisible(options.visible !== undefined ? options.visible : true);

        console.log({ datum_initialized: true, size: this.size, planes: 3 });

        return this.group;
    },

    /**
     * Get all plane primitives
     */
    getPlanes() {
        return Object.values(this.planes);
    },

    /**
     * Update all plane labels in overlay (should be called by main init)
     */
    updateLabels(overlay) {
        if (!overlay) return;
        this.overlay = overlay;

        // Add or update labels for each plane
        for (const [key, plane] of Object.entries(this.planes)) {
            this.updateLabel(overlay, key, plane);
        }
    },

    /**
     * Update a single plane label in the overlay
     */
    updateLabel(overlay, key, plane) {
        const label = plane.getLabel();
        if (!label) return;

        const labelId = `datum-label-${key}`;
        const corner = plane.getTopLeftCorner();
        const hidden = !this.visible || !plane.getGroup()?.visible;

        if (overlay.elements.has(labelId)) {
            overlay.update(labelId, { pos3d: corner, text: label, hidden });
        } else {
            overlay.add(labelId, 'text', {
                pos3d: corner,
                text: label,
                color: '#b0b0b0',
                fontSize: 13,
                anchor: 'start',
                hidden,
                className: 'datum-label'
            });
        }
    },

    /**
     * Set size of all planes
     */
    setSize(size) {
        this.size = size;
        for (const plane of Object.values(this.planes)) {
            plane.setSize(size);
        }
        this.notifyChange();
    },

    /**
     * Set visibility of all planes
     */
    setVisible(visible) {
        this.visible = visible;
        if (this.group) {
            this.group.visible = visible;
        }
        this.notifyChange();
    },

    /**
     * Show specific plane
     */
    show(planeName) {
        if (this.planes[planeName]) {
            this.planes[planeName].setVisible(true);
        } else {
            console.warn(`datum: unknown plane ${planeName}`);
        }
    },

    /**
     * Hide specific plane
     */
    hide(planeName) {
        if (this.planes[planeName]) {
            this.planes[planeName].setVisible(false);
        } else {
            console.warn(`datum: unknown plane ${planeName}`);
        }
    },

    /**
     * Set opacity of all planes
     */
    setOpacity(opacity) {
        for (const plane of Object.values(this.planes)) {
            plane.setOpacity(opacity);
        }
    },

    /**
     * Set color of specific plane
     */
    setColor(planeName, color) {
        if (this.planes[planeName]) {
            this.planes[planeName].setColor(color);
        } else {
            console.warn(`datum: unknown plane ${planeName}`);
        }
    },

    /**
     * Set outline color of specific plane
     */
    setOutlineColor(planeName, color) {
        if (this.planes[planeName]) {
            this.planes[planeName].setOutlineColor(color);
        } else {
            console.warn(`datum: unknown plane ${planeName}`);
        }
    },

    /**
     * Get plane primitive by name
     */
    getPlane(planeName) {
        return this.planes[planeName] || null;
    },

    /**
     * Serialize datum to JSON
     */
    toJSON() {
        return {
            type: 'datum',
            size: this.size,
            visible: this.visible,
            planes: {
                xy: this.planes.xy.toJSON(),
                xz: this.planes.xz.toJSON(),
                yz: this.planes.yz.toJSON()
            }
        };
    },

    /**
     * Canonical default datum state for new documents.
     */
    defaultState(size = 200) {
        return {
            type: 'datum',
            size,
            visible: true,
            planes: {
                xy: {
                    id: 'datum-xy',
                    name: 'XY Plane',
                    label: 'Top',
                    type: 'plane',
                    size: { width: size, height: size },
                    visible: true,
                    frame: {
                        origin: { x: 0, y: 0, z: 0 },
                        normal: { x: 0, y: 0, z: 1 },
                        x_axis: { x: 1, y: 0, z: 0 },
                        size: { width: size, height: size }
                    }
                },
                xz: {
                    id: 'datum-xz',
                    name: 'XZ Plane',
                    label: 'Front',
                    type: 'plane',
                    size: { width: size, height: size },
                    visible: true,
                    frame: {
                        origin: { x: 0, y: 0, z: 0 },
                        normal: { x: 0, y: -1, z: 0 },
                        x_axis: { x: 1, y: 0, z: 0 },
                        size: { width: size, height: size }
                    }
                },
                yz: {
                    id: 'datum-yz',
                    name: 'YZ Plane',
                    label: 'Right',
                    type: 'plane',
                    size: { width: size, height: size },
                    visible: true,
                    frame: {
                        origin: { x: 0, y: 0, z: 0 },
                        normal: { x: 1, y: 0, z: 0 },
                        x_axis: { x: 0, y: 1, z: 0 },
                        size: { width: size, height: size }
                    }
                }
            }
        };
    },

    /**
     * Apply serialized datum state onto existing runtime planes.
     */
    applyJSON(data) {
        if (!data || !this.planes) return;

        if (typeof data.size === 'number') {
            this.size = data.size;
        }
        if (typeof data.visible === 'boolean') {
            this.setVisible(data.visible);
        }

        const planeData = data.planes || {};
        for (const [key, plane] of Object.entries(this.planes)) {
            const src = planeData[key];
            if (!src) continue;

            if (src.name !== undefined) plane.name = src.name;
            if (src.label !== undefined) plane.setLabel(src.label);
            if (src.color !== undefined) plane.setColor(src.color);
            if (src.outlineColor !== undefined) plane.setOutlineColor(src.outlineColor);
            if (src.opacity !== undefined) plane.setOpacity(src.opacity);
            if (src.outlineOpacity !== undefined) plane.setOutlineOpacity(src.outlineOpacity);
            if (src.showHandles !== undefined) plane.showHandles = src.showHandles;
            if (src.visible !== undefined) plane.setVisible(src.visible);

            if (src.frame) {
                plane.setFrame(src.frame);
            } else {
                // Legacy fallback for older document data.
                const width = src?.size?.width !== undefined ? src.size.width : (src.size !== undefined ? src.size : plane.size);
                const height = src?.size?.height !== undefined ? src.size.height : (src.height !== undefined ? src.height : undefined);
                plane.setSize(width, height);

                if (src.position) {
                    plane.setPosition(
                        src.position.x || 0,
                        src.position.y || 0,
                        src.position.z || 0
                    );
                }
                if (src.rotation) {
                    plane.setRotation(
                        src.rotation.x || 0,
                        src.rotation.y || 0,
                        src.rotation.z || 0
                    );
                }
            }
        }
        this.notifyChange();
    },

    /**
     * Register callback for datum-level changes.
     */
    onChange(handler) {
        if (typeof handler === 'function') {
            this.changeHandlers.add(handler);
        }
        return this;
    },

    /**
     * Remove registered datum-level callback.
     */
    offChange(handler) {
        this.changeHandlers.delete(handler);
        return this;
    },

    /**
     * Notify listeners datum changed.
     */
    notifyChange() {
        for (const handler of this.changeHandlers) {
            handler(this);
        }
    },

    /**
     * Dispose of all resources
     */
    dispose() {
        if (this.group) {
            for (const [key, plane] of Object.entries(this.planes)) {
                const handler = this.labelHandlers.get(key);
                if (handler) {
                    plane.offChange(handler);
                }
                plane.dispose();
                this.group.remove(plane.getGroup());
            }
            this.planes = {};
            this.labelHandlers.clear();
            this.overlay = null;
            this.group = null;
        }
    }
};

export { datum };
