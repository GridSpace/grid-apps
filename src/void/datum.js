/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { THREE } from '../ext/three.js';

const { Group, PlaneGeometry, MeshBasicMaterial, Mesh, DoubleSide, EdgesGeometry, LineSegments, LineBasicMaterial } = THREE;

/**
 * Create a plane primitive with outline
 * @param {number} size - Plane dimensions
 * @param {string} name - Plane name
 * @returns {THREE.Group} Group containing plane mesh and outline
 */
function createPlanePrimitive(size, name) {
    const group = new Group();
    group.name = name;

    // Create the plane mesh (translucent gray)
    const geometry = new PlaneGeometry(size, size);
    const material = new MeshBasicMaterial({
        color: 0x404040,      // Dark gray
        transparent: true,
        opacity: 0.15,
        side: DoubleSide,
        depthWrite: false
    });

    const mesh = new Mesh(geometry, material);
    mesh.renderOrder = 1;

    // Create the outline (lighter gray)
    const edges = new EdgesGeometry(geometry);
    const lineMaterial = new LineBasicMaterial({
        color: 0x808080,      // Lighter gray
        transparent: true,
        opacity: 0.5,
        depthWrite: false
    });

    const outline = new LineSegments(edges, lineMaterial);
    outline.renderOrder = 2; // Render outline on top of plane

    // Add both to group
    group.add(mesh);
    group.add(outline);

    // Store references for later access
    group.userData.mesh = mesh;
    group.userData.outline = outline;

    return group;
}

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

        // Create three orthogonal planes (all gray with outlines)
        this.planes.xy = createPlanePrimitive(this.size, 'datum-xy');
        this.planes.xz = createPlanePrimitive(this.size, 'datum-xz');
        this.planes.yz = createPlanePrimitive(this.size, 'datum-yz');

        // Position XZ plane (vertical, front-back)
        this.planes.xz.rotation.x = Math.PI / 2;

        // Position YZ plane (vertical, left-right)
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
     * Set plane size
     */
    setSize(size) {
        this.size = size;

        // Recreate planes with new size
        if (this.group) {
            const wasVisible = this.visible;

            // Remove old planes and dispose
            this.disposePlane(this.planes.xy);
            this.disposePlane(this.planes.xz);
            this.disposePlane(this.planes.yz);

            this.group.remove(this.planes.xy);
            this.group.remove(this.planes.xz);
            this.group.remove(this.planes.yz);

            // Create new planes
            this.planes.xy = createPlanePrimitive(this.size, 'datum-xy');
            this.planes.xz = createPlanePrimitive(this.size, 'datum-xz');
            this.planes.yz = createPlanePrimitive(this.size, 'datum-yz');

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
     * Dispose a plane primitive (mesh + outline)
     */
    disposePlane(planeGroup) {
        if (!planeGroup) return;

        const mesh = planeGroup.userData.mesh;
        const outline = planeGroup.userData.outline;

        if (mesh) {
            mesh.geometry.dispose();
            mesh.material.dispose();
        }

        if (outline) {
            outline.geometry.dispose();
            outline.material.dispose();
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
        for (const planeGroup of Object.values(this.planes)) {
            const mesh = planeGroup.userData.mesh;
            if (mesh) {
                mesh.material.opacity = opacity;
            }
        }
    },

    /**
     * Set color of specific plane
     */
    setColor(planeName, color) {
        if (this.planes[planeName]) {
            const mesh = this.planes[planeName].userData.mesh;
            if (mesh) {
                mesh.material.color.setHex(color);
            }
        } else {
            console.warn(`datum: unknown plane ${planeName}`);
        }
    },

    /**
     * Set outline color of specific plane
     */
    setOutlineColor(planeName, color) {
        if (this.planes[planeName]) {
            const outline = this.planes[planeName].userData.outline;
            if (outline) {
                outline.material.color.setHex(color);
            }
        } else {
            console.warn(`datum: unknown plane ${planeName}`);
        }
    },

    /**
     * Get plane group by name
     */
    getPlane(planeName) {
        return this.planes[planeName] || null;
    },

    /**
     * Dispose of all resources
     */
    dispose() {
        if (this.group) {
            for (const planeGroup of Object.values(this.planes)) {
                this.disposePlane(planeGroup);
                this.group.remove(planeGroup);
            }
            this.planes = {};
            this.group = null;
        }
    }
};

export { datum, createPlanePrimitive };
