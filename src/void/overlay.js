/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { $ } from '../moto/webui.js';
import { space } from '../moto/space.js';

// SVG namespace
const SVG_NS = 'http://www.w3.org/2000/svg';

// 2D overlay system for tracking 3D points
const overlay = {
    container: null,      // Reference to #sketch-overlay div
    svg: null,            // SVG element
    elements: new Map(),  // Map<id, {el, pos3d, type, opts}>
    enabled: true,
    camera: null,
    renderer: null,

    /**
     * Initialize overlay system
     */
    init() {
        this.container = $('sketch-overlay');
        if (!this.container) {
            console.error('overlay: sketch-overlay element not found');
            return;
        }

        // Get camera and renderer from space
        const internals = space.internals();
        this.camera = internals.camera;
        this.renderer = internals.renderer;

        // External update callback (for datum labels, etc.)
        this.onUpdate = null;

        // Create SVG element
        this.svg = document.createElementNS(SVG_NS, 'svg');
        this.svg.style.width = '100%';
        this.svg.style.height = '100%';
        this.svg.style.position = 'absolute';
        this.svg.style.top = '0';
        this.svg.style.left = '0';
        this.svg.style.pointerEvents = 'none';
        // Don't set viewBox - let it use default user coordinates

        this.container.appendChild(this.svg);

        // Hook into camera movement for updates
        this.setupCameraHook();

        // Handle window resize
        window.addEventListener('resize', () => {
            this.updateAll();
        });

        console.log({ overlay_initialized: true });
    },

    /**
     * Setup camera movement hook with debouncing
     */
    setupCameraHook() {
        // Rebind when projection/control object changes.
        if (this.viewCtrl && this.onViewChange) {
            this.viewCtrl.removeEventListener('change', this.onViewChange);
        }

        const viewCtrl = this.viewCtrl = space.view.ctrl;
        if (viewCtrl && viewCtrl.addEventListener) {
            let updateQueued = false;
            this.onViewChange = () => {
                if (this.enabled && !updateQueued) {
                    updateQueued = true;
                    requestAnimationFrame(() => {
                        this.updateAll();
                        updateQueued = false;
                    });
                }
            };
            viewCtrl.addEventListener('change', this.onViewChange);
        }
    },

    /**
     * Called when camera/control internals are recreated (e.g. projection toggle).
     */
    onProjectionChanged() {
        const internals = space.internals();
        this.camera = internals.camera;
        this.renderer = internals.renderer;
        this.setupCameraHook();
        this.updateAll();
    },

    /**
     * Project 3D world position to 2D screen coordinates
     */
    project3Dto2D(worldPos) {
        if (!this.camera || !this.renderer) return null;

        const vector = worldPos.clone();
        vector.project(this.camera);

        // Use canvas client dimensions for accurate projection
        const canvas = this.renderer.domElement;
        const x = (vector.x + 1) / 2 * canvas.clientWidth;
        const y = -(vector.y - 1) / 2 * canvas.clientHeight;
        const z = vector.z; // For depth testing (z > 1 = behind camera)

        return { x, y, z, visible: z < 1 };
    },

    /**
     * Add overlay element
     * @param {string} id - Unique identifier
     * @param {string} type - Element type: 'point', 'text', 'line', 'path'
     * @param {object} opts - Options specific to type
     * @returns {SVGElement} Created element
     */
    add(id, type, opts = {}) {
        if (this.elements.has(id)) {
            console.warn(`overlay: element ${id} already exists`);
            return this.elements.get(id).el;
        }

        let el;
        switch (type) {
            case 'point':
                el = this.createPoint(opts);
                break;
            case 'text':
                el = this.createText(opts);
                break;
            case 'line':
                el = this.createLine(opts);
                break;
            case 'path':
                el = this.createPath(opts);
                break;
            default:
                console.error(`overlay: unknown type ${type}`);
                return null;
        }

        el.setAttribute('data-overlay-id', id);
        this.svg.appendChild(el);

        this.elements.set(id, {
            el,
            type,
            pos3d: opts.pos3d || null,
            pos3d2: opts.pos3d2 || null, // For lines
            opts
        });

        // Initial projection
        this.updateElement(id);

        return el;
    },

    /**
     * Create point element (circle)
     */
    createPoint(opts) {
        const circle = document.createElementNS(SVG_NS, 'circle');
        circle.setAttribute('r', opts.radius || 4);
        circle.setAttribute('fill', opts.color || '#5a9fd4');
        circle.setAttribute('stroke', opts.stroke || 'none');
        circle.setAttribute('stroke-width', opts.strokeWidth || 1);
        if (opts.className) {
            circle.setAttribute('class', opts.className);
        }
        return circle;
    },

    /**
     * Create text element
     */
    createText(opts) {
        const text = document.createElementNS(SVG_NS, 'text');
        text.textContent = opts.text || '';
        text.setAttribute('fill', opts.color || '#e0e0e0');
        text.setAttribute('font-size', opts.fontSize || 12);
        text.setAttribute('font-family', opts.fontFamily || 'sans-serif');
        text.setAttribute('text-anchor', opts.anchor || 'middle');
        text.setAttribute('dominant-baseline', 'middle');
        if (opts.className) {
            text.setAttribute('class', opts.className);
        }
        return text;
    },

    /**
     * Create line element
     */
    createLine(opts) {
        const line = document.createElementNS(SVG_NS, 'line');
        line.setAttribute('stroke', opts.color || '#5a9fd4');
        line.setAttribute('stroke-width', opts.width || 1);
        if (opts.dashed) {
            line.setAttribute('stroke-dasharray', '4,4');
        }
        if (opts.className) {
            line.setAttribute('class', opts.className);
        }
        return line;
    },

    /**
     * Create path element
     */
    createPath(opts) {
        const path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('d', opts.d || '');
        path.setAttribute('fill', opts.fill || 'none');
        path.setAttribute('stroke', opts.stroke || '#5a9fd4');
        path.setAttribute('stroke-width', opts.strokeWidth || 1);
        if (opts.className) {
            path.setAttribute('class', opts.className);
        }
        return path;
    },

    /**
     * Remove overlay element
     */
    remove(id) {
        const item = this.elements.get(id);
        if (item) {
            this.svg.removeChild(item.el);
            this.elements.delete(id);
        }
    },

    /**
     * Update element properties
     */
    update(id, opts) {
        const item = this.elements.get(id);
        if (!item) {
            console.warn(`overlay: element ${id} not found`);
            return;
        }

        item.opts = item.opts || {};

        // Update stored position if provided
        if (opts.pos3d) {
            item.pos3d = opts.pos3d;
        }
        if (opts.pos3d2) {
            item.pos3d2 = opts.pos3d2;
        }
        if (opts.hidden !== undefined) {
            item.opts.hidden = !!opts.hidden;
        }

        // Update text content
        if (opts.text && item.type === 'text') {
            item.el.textContent = opts.text;
        }

        // Update color
        if (opts.color) {
            if (item.type === 'point') {
                item.el.setAttribute('fill', opts.color);
            } else if (item.type === 'text') {
                item.el.setAttribute('fill', opts.color);
            } else if (item.type === 'line') {
                item.el.setAttribute('stroke', opts.color);
            }
        }

        // Re-project
        this.updateElement(id);
    },

    /**
     * Update single element projection
     */
    updateElement(id) {
        const item = this.elements.get(id);
        if (!item || !item.pos3d) return;

        // Respect caller-controlled visibility flags (e.g. tree eye toggles).
        if (item.opts?.hidden) {
            item.el.style.display = 'none';
            return;
        }

        const proj = this.project3Dto2D(item.pos3d);
        if (!proj) return;

        // Hide if behind camera
        if (!proj.visible) {
            item.el.style.display = 'none';
            return;
        } else {
            item.el.style.display = '';
        }

        // Update position based on type
        if (item.type === 'point') {
            item.el.setAttribute('cx', proj.x);
            item.el.setAttribute('cy', proj.y);
        } else if (item.type === 'text') {
            item.el.setAttribute('x', proj.x);
            item.el.setAttribute('y', proj.y);
        } else if (item.type === 'line' && item.pos3d2) {
            // Lines need two points
            const proj2 = this.project3Dto2D(item.pos3d2);
            if (!proj2 || !proj2.visible) {
                item.el.style.display = 'none';
                return;
            }
            item.el.setAttribute('x1', proj.x);
            item.el.setAttribute('y1', proj.y);
            item.el.setAttribute('x2', proj2.x);
            item.el.setAttribute('y2', proj2.y);
        }

        // Optional: adjust opacity based on depth
        if (item.opts.depthFade) {
            const opacity = Math.max(0.2, 1 - (proj.z + 1) / 2);
            item.el.style.opacity = opacity;
        }
    },

    /**
     * Update all overlay elements
     */
    updateAll() {
        if (!this.enabled) return;

        for (const id of this.elements.keys()) {
            this.updateElement(id);
        }

        // Trigger external update callbacks (e.g., for datum labels)
        if (this.onUpdate) {
            this.onUpdate();
        }
    },

    /**
     * Clear all elements
     */
    clear() {
        for (const item of this.elements.values()) {
            this.svg.removeChild(item.el);
        }
        this.elements.clear();
    },

    /**
     * Show overlay
     */
    show() {
        if (this.container) {
            this.container.classList.remove('hidden');
            this.updateAll();
        }
    },

    /**
     * Hide overlay
     */
    hide() {
        if (this.container) {
            this.container.classList.add('hidden');
        }
    },

    /**
     * Enable/disable overlay updates
     */
    setEnabled(enabled) {
        this.enabled = enabled;
        if (enabled) {
            this.updateAll();
        }
    }
};

export { overlay };
