/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { THREE } from '../ext/three.js';
import { space } from '../moto/space.js';
import { VOID_PALETTE } from './palette.js';

const {
    Group, BoxGeometry, MeshBasicMaterial, Mesh,
    EdgesGeometry, LineSegments, LineBasicMaterial,
    Scene, PerspectiveCamera, Vector3, Raycaster, Vector2
} = THREE;

/**
 * ViewCube - Interactive 3D navigation widget
 * Renders in top-right corner using separate scene/camera to avoid z-fighting
 */
class ViewCube {
    constructor(options = {}) {
        this.size = options.size || 60;           // Size of cube in pixels
        this.padding = options.padding || 20;     // Padding from corner
        this.cubeSize = options.cubeSize || 1.5;  // 3D cube size

        // Create separate scene and camera for viewcube
        this.scene = new Scene();
        this.camera = new PerspectiveCamera(45, 1, 0.1, 100);
        this.camera.position.set(0, 0, 5);

        // Raycaster for mouse interaction
        this.raycaster = new Raycaster();
        this.mouse = new Vector2();

        // State
        this.hoveredFace = null;
        this.viewport = { x: 0, y: 0, width: this.size, height: this.size }; // CSS pixels, top-left origin
        this.enabled = true;

        // Face colors
        this.faceColors = { ...VOID_PALETTE.viewcube.faces };

        this.hoverColor = VOID_PALETTE.viewcube.hover;
        this.edgeColor = VOID_PALETTE.viewcube.edge;

        // Build the cube
        this.build();

        // Setup event listeners
        this.setupEvents();
    }

    /**
     * Build the viewcube geometry
     */
    build() {
        this.group = new Group();

        // Create cube with individual face materials
        const geometry = new BoxGeometry(this.cubeSize, this.cubeSize, this.cubeSize);

        // Materials for each face [right, left, top, bottom, front, back]
        const materials = [
            new MeshBasicMaterial({ color: this.faceColors.right }),  // +X right
            new MeshBasicMaterial({ color: this.faceColors.left }),   // -X left
            new MeshBasicMaterial({ color: this.faceColors.top }),    // +Y top
            new MeshBasicMaterial({ color: this.faceColors.bottom }), // -Y bottom
            new MeshBasicMaterial({ color: this.faceColors.front }),  // +Z front
            new MeshBasicMaterial({ color: this.faceColors.back })    // -Z back
        ];

        this.cube = new Mesh(geometry, materials);
        this.cube.userData.isViewCube = true;

        // Store original colors for hover restore
        this.originalColors = materials.map(m => m.color.getHex());

        // Create edges
        const edges = new EdgesGeometry(geometry);
        const lineMaterial = new LineBasicMaterial({
            color: this.edgeColor,
            linewidth: 2
        });
        this.edges = new LineSegments(edges, lineMaterial);

        this.group.add(this.cube);
        this.group.add(this.edges);
        this.scene.add(this.group);

    }

    /**
     * Setup mouse event listeners
     */
    setupEvents() {
        const { container } = space.internals();

        // Mouse move for hover
        container.addEventListener('mousemove', (event) => {
            if (!this.enabled) return;
            this.onMouseMove(event);
        });

        // Mouse click for view change
        container.addEventListener('click', (event) => {
            if (!this.enabled) return;
            this.onClick(event);
        });
    }

    /**
     * Handle mouse move (hover detection)
     */
    onMouseMove(event) {
        // Convert mouse to viewcube viewport coordinates
        if (!this.isMouseInViewport(event)) {
            // Mouse outside viewcube, clear hover
            if (this.hoveredFace !== null) {
                this.clearHover();
            }
            return;
        }

        // Get intersection
        this.updateMousePosition(event);
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObject(this.cube);

        if (intersects.length > 0) {
            const faceIndex = Math.floor(intersects[0].faceIndex / 2);

            if (this.hoveredFace !== faceIndex) {
                this.clearHover();
                this.hoveredFace = faceIndex;
                this.cube.material[faceIndex].color.setHex(this.hoverColor);
                space.update();
            }
        } else if (this.hoveredFace !== null) {
            this.clearHover();
        }
    }

    /**
     * Clear hover state
     */
    clearHover() {
        if (this.hoveredFace !== null) {
            this.cube.material[this.hoveredFace].color.setHex(this.originalColors[this.hoveredFace]);
            this.hoveredFace = null;
            space.update();
        }
    }

    /**
     * Handle click (view change)
     */
    onClick(event) {
        if (!this.isMouseInViewport(event)) return;

        this.updateMousePosition(event);
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObject(this.cube);

        if (intersects.length > 0) {
            const faceIndex = Math.floor(intersects[0].faceIndex / 2);
            this.onFaceClick(faceIndex);
        }
    }

    /**
     * Handle face click - change view
     */
    onFaceClick(faceIndex) {
        // Map face index to view direction
        // [right, left, top, bottom, front, back]
        const views = ['right', 'left', 'top', 'bottom', 'front', 'back'];
        const view = views[faceIndex];

        // Call space.view preset methods
        switch(view) {
            case 'front':
                space.view.front();
                break;
            case 'back':
                space.view.back();
                break;
            case 'right':
                space.view.right();
                break;
            case 'left':
                space.view.left();
                break;
            case 'top':
                space.view.top();
                break;
            case 'bottom':
                space.view.bottom();
                break;
        }
    }

    /**
     * Check if mouse is in viewcube viewport
     */
    isMouseInViewport(event) {
        const { container } = space.internals();
        const rect = container.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        return x >= this.viewport.x &&
               x <= this.viewport.x + this.viewport.width &&
               y >= this.viewport.y &&
               y <= this.viewport.y + this.viewport.height;
    }

    /**
     * Update mouse position in viewcube coordinates
     */
    updateMousePosition(event) {
        const { container } = space.internals();
        const rect = container.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        // Convert to normalized device coordinates for viewcube viewport
        this.mouse.x = ((x - this.viewport.x) / this.viewport.width) * 2 - 1;
        this.mouse.y = -((y - this.viewport.y) / this.viewport.height) * 2 + 1;
    }

    /**
     * Update viewcube rotation to match main camera
     */
    update() {
        if (!this.enabled) return;

        // Get main camera orientation
        const mainCamera = space.internals().camera;

        // Copy inverse rotation - viewcube rotates opposite to scene
        this.group.quaternion.copy(mainCamera.quaternion);
        this.group.quaternion.invert();
    }

    /**
     * Render the viewcube
     */
    render(renderer) {
        if (!this.enabled) return;

        // Update rotation first
        this.update();

        // Save current state
        const currentViewport = new Vector4();
        renderer.getViewport(currentViewport);
        const currentAutoClear = renderer.autoClear;

        // Calculate viewport position using CSS pixels for hit-testing
        const canvas = renderer.domElement;
        const cssW = canvas.clientWidth || this.size;
        const cssH = canvas.clientHeight || this.size;
        const cssX = cssW - this.size - this.padding;
        const cssY = this.padding;
        this.viewport = { x: cssX, y: cssY, width: this.size, height: this.size };

        // Convert CSS pixels to renderer drawing-buffer pixels (bottom-left origin)
        const dpr = canvas.width / Math.max(1, cssW);
        const vpX = Math.round(cssX * dpr);
        const vpY = Math.round((cssH - cssY - this.size) * dpr);
        const vpS = Math.round(this.size * dpr);

        // Set viewcube viewport
        renderer.setViewport(vpX, vpY, vpS, vpS);
        renderer.setScissor(vpX, vpY, vpS, vpS);
        renderer.setScissorTest(true);
        renderer.autoClear = false;
        // Ensure the cube is never occluded by main-scene depth.
        renderer.clearDepth();

        // Render viewcube scene
        renderer.render(this.scene, this.camera);

        // Restore state
        renderer.setViewport(currentViewport);
        renderer.setScissorTest(false);
        renderer.autoClear = currentAutoClear;
    }

    /**
     * Set visibility
     */
    setEnabled(enabled) {
        this.enabled = enabled;
        if (!enabled) {
            this.clearHover();
        }
    }

    /**
     * Dispose resources
     */
    dispose() {
        if (this.cube) {
            this.cube.geometry.dispose();
            this.cube.material.forEach(m => m.dispose());
        }
        if (this.edges) {
            this.edges.geometry.dispose();
            this.edges.material.dispose();
        }
    }
}

// Import Vector4 for viewport save/restore
const { Vector4 } = THREE;

export { ViewCube };
