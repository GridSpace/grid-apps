/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { THREE } from '../ext/three.js';

const { Group, PlaneGeometry, MeshBasicMaterial, Mesh, DoubleSide } = THREE;

// Datum plane system
const datum = {
    group: null,          // THREE.Group containing all planes
    planes: {},           // { xy, xz, yz }
    size: 200,            // Plane dimensions
    visible: true,

    /**
     * Initialize datum planes
     */
    init(options = {}) {
        this.size = options.size || 200;
        this.group = new Group();
        this.group.name = 'datum-planes';

        // Create three orthogonal planes
        this.planes.xy = this.createPlane('xy', 0x6666ff, 0); // Blue - horizontal
        this.planes.xz = this.createPlane('xz', 0x66ff66, Math.PI / 2); // Green - front-back
        this.planes.yz = this.createPlane('yz', 0xff6666, Math.PI / 2); // Red - left-right

        // Position XZ plane
        this.planes.xz.rotation.x = Math.PI / 2;

        // Position YZ plane
        this.planes.yz.rotation.y = Math.PI / 2;

        // Add all to group
        this.group.add(this.planes.xy);
        this.group.add(this.planes.xz);
        this.group.add(this.planes.yz);

        // Set initial visibility
        this.setVisible(options.visible !== undefined ? options.visible : true);

        console.log({ datum_initialized: true, size: this.size });

        return this.group;
    },

    /**
     * Create a single plane
     */
    createPlane(name, color, rotation) {
        const geometry = new PlaneGeometry(this.size, this.size);
        const material = new MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.15,
            side: DoubleSide,
            depthWrite: false
        });

        const mesh = new Mesh(geometry, material);
        mesh.name = `datum-${name}`;
        mesh.renderOrder = 1; // Render after most objects

        return mesh;
    },

    /**
     * Set plane size
     */
    setSize(size) {
        this.size = size;

        // Recreate planes with new size
        if (this.group) {
            const wasVisible = this.visible;

            // Remove old planes
            this.group.remove(this.planes.xy);
            this.group.remove(this.planes.xz);
            this.group.remove(this.planes.yz);

            // Dispose old geometries
            this.planes.xy.geometry.dispose();
            this.planes.xz.geometry.dispose();
            this.planes.yz.geometry.dispose();

            // Create new planes
            this.planes.xy = this.createPlane('xy', 0x6666ff, 0);
            this.planes.xz = this.createPlane('xz', 0x66ff66, Math.PI / 2);
            this.planes.yz = this.createPlane('yz', 0xff6666, Math.PI / 2);

            // Position planes
            this.planes.xz.rotation.x = Math.PI / 2;
            this.planes.yz.rotation.y = Math.PI / 2;

            // Add back to group
            this.group.add(this.planes.xy);
            this.group.add(this.planes.xz);
            this.group.add(this.planes.yz);

            this.setVisible(wasVisible);
        }
    },

    /**
     * Set visibility of all planes
     */
    setVisible(visible) {
        this.visible = visible;
        if (this.group) {
            this.group.visible = visible;
        }
    },

    /**
     * Show specific plane
     */
    show(planeName) {
        if (this.planes[planeName]) {
            this.planes[planeName].visible = true;
        } else {
            console.warn(`datum: unknown plane ${planeName}`);
        }
    },

    /**
     * Hide specific plane
     */
    hide(planeName) {
        if (this.planes[planeName]) {
            this.planes[planeName].visible = false;
        } else {
            console.warn(`datum: unknown plane ${planeName}`);
        }
    },

    /**
     * Set opacity of all planes
     */
    setOpacity(opacity) {
        for (const plane of Object.values(this.planes)) {
            plane.material.opacity = opacity;
        }
    },

    /**
     * Set color of specific plane
     */
    setColor(planeName, color) {
        if (this.planes[planeName]) {
            this.planes[planeName].material.color.setHex(color);
        } else {
            console.warn(`datum: unknown plane ${planeName}`);
        }
    },

    /**
     * Get plane mesh by name
     */
    getPlane(planeName) {
        return this.planes[planeName] || null;
    },

    /**
     * Dispose of all resources
     */
    dispose() {
        if (this.group) {
            for (const plane of Object.values(this.planes)) {
                plane.geometry.dispose();
                plane.material.dispose();
                this.group.remove(plane);
            }
            this.planes = {};
            this.group = null;
        }
    }
};

export { datum };
