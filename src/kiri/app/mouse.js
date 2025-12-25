/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

/**
 * Interaction Controller (Singleton)
 * Manages mouse hover, click, and drag interactions with 3D objects
 */

class InteractionControl {
    #api;
    #space;
    #platform;
    #selection;
    #ui;
    #settings;
    #VIEWS;
    #initialized = false;

    // Callbacks to replace event emissions
    #onHover;
    #onHoverDown;
    #onHoverUp;
    #onDragDone;
    #onSelectionDrag;

    /**
     * Initialize the interaction controller with dependencies
     * @param {Object} config
     * @param {Object} config.api - API object
     * @param {Object} config.space - Space object (3D scene)
     * @param {Object} config.platform - Platform object
     * @param {Object} config.selection - Selection object
     * @param {Object} config.ui - UI element references
     * @param {Function} config.settings - Settings getter function
     * @param {Object} config.VIEWS - View constants
     * @param {Function} config.onHover - Called when hovering over objects
     * @param {Function} config.onHoverDown - Called on mouse down over object
     * @param {Function} config.onHoverUp - Called on mouse up over object
     * @param {Function} config.onDragDone - Called when drag is complete
     * @param {Function} config.onSelectionDrag - Called during selection drag
     */
    init({ api, space, platform, selection, ui, settings, VIEWS, onHover, onHoverDown, onHoverUp, onDragDone, onSelectionDrag }) {
        if (this.#initialized) {
            throw new Error('Interactions already initialized');
        }

        this.#api = api;
        this.#space = space;
        this.#platform = platform;
        this.#selection = selection;
        this.#ui = ui;
        this.#settings = settings;
        this.#VIEWS = VIEWS;
        this.#onHover = onHover;
        this.#onHoverDown = onHoverDown;
        this.#onHoverUp = onHoverUp;
        this.#onDragDone = onDragDone;
        this.#onSelectionDrag = onSelectionDrag;

        this.#bindHoverHandlers();
        this.#bindMouseHandlers();
        this.#initialized = true;
    }

    /**
     * Bind hover event handlers for mouse and platform interactions.
     * Listens to "feature.hover" event to enable/disable hover functionality.
     * @private
     */
    #bindHoverHandlers() {
        // Set up hover handlers
        this.#api.event.on("feature.hover", enable => {
            this.#space.mouse.onHover(enable ? this.#mouseOnHover.bind(this) : undefined);
            this.#space.platform.onHover(enable ? this.#platformOnHover.bind(this) : undefined);
        });
    }

    /**
     * Handle mouse hover over widgets.
     * Returns widget meshes if no intersection, otherwise triggers hover callback.
     * @private
     * @param {object} int - Intersection data
     * @param {Event} event - Mouse event
     * @param {Array} ints - All intersections
     */
    #mouseOnHover(int, event, ints) {
        if (!this.#api.feature.hover) return;
        if (!int) return this.#api.feature.hovers || this.#api.widgets.meshes();
        this.#onHover?.({int, ints, event, point: int.point, type: 'widget'});
    }

    /**
     * Handle mouse hover over platform.
     * Triggers hover callback with platform intersection point.
     * @private
     * @param {object} int - Intersection point
     * @param {Event} event - Mouse event
     */
    #platformOnHover(int, event) {
        if (!this.#api.feature.hover) return;
        if (int) this.#onHover?.({point: int, event, type: 'platform'});
    }

    /**
     * Bind mouse click and drag handlers.
     * Handles:
     * - Mouse down: lay-flat (Ctrl/Cmd+click), custom hooks, hover mode
     * - Mouse up: widget selection/deselection, custom hooks
     * - Drag: move selected widgets with boundary checking
     * @private
     */
    #bindMouseHandlers() {
        // Mouse down handler
        this.#space.mouse.downSelect((int, event) => {
            // Feature hook for custom mouse down handling
            if (this.#api.feature.on_mouse_down) {
                if (int) {
                    this.#api.feature.on_mouse_down(int, event);
                    return;
                }
            }

            // Hover mode handling
            if (this.#api.feature.hover) {
                if (int) {
                    this.#onHoverDown?.({int, point: int.point});
                    return;
                } else {
                    return this.#selection.meshes();
                }
            }

            // Lay flat with meta or ctrl clicking a selected face
            if (int && (event.ctrlKey || event.metaKey || this.#api.feature.on_face_select)) {
                let q = new THREE.Quaternion();
                // find intersecting point, look "up" on Z and rotate to face that
                q.setFromUnitVectors(int.face.normal, new THREE.Vector3(0,0,-1));
                this.#selection.rotate(q);
            }

            if (this.#api.view.get() !== this.#VIEWS.ARRANGE) {
                // return no selection in modes other than arrange
                return null;
            } else {
                // return selected meshes for further mouse processing
                return this.#api.feature.hovers || this.#selection.meshes();
            }
        });

        // Mouse up handler
        this.#space.mouse.upSelect((object, event) => {
            // Feature hook for custom mouse up handling
            if (this.#api.feature.on_mouse_up) {
                if (event && object) {
                    return this.#api.feature.on_mouse_up(object, event);
                } else {
                    return this.#api.widgets.meshes();
                }
            }

            // Hover mode handling
            if (event && this.#api.feature.hover) {
                this.#onHoverUp?.({ object, event });
                return;
            }

            // Regular selection handling
            if (event && event.target.nodeName === "CANVAS") {
                if (object && object.object) {
                    if (object.object.widget) {
                        this.#platform.select(object.object.widget, event.shiftKey, false);
                    }
                } else {
                    this.#platform.deselect();
                }
            } else {
                return this.#api.feature.hovers || this.#api.widgets.meshes();
            }
        });

        // Drag handler
        this.#space.mouse.onDrag((delta, offset, up = false) => {
            if (this.#api.feature.hover) {
                return;
            }

            if (up) {
                this.#onDragDone?.(offset);
            }

            if (delta && this.#ui.freeLayout.checked) {
                let set = this.#settings();
                let dev = set.device;
                let bound = set.bounds_sel;
                let width = dev.bedWidth/2;
                let depth = dev.bedDepth/2;
                let isout = (
                    bound.min.x <= -width ||
                    bound.min.y <= -depth ||
                    bound.max.x >= width ||
                    bound.max.y >= depth
                );

                if (!isout) {
                    if (bound.min.x + delta.x <= -width) return;
                    if (bound.min.y + delta.y <= -depth) return;
                    if (bound.max.x + delta.x >= width) return;
                    if (bound.max.y + delta.y >= depth) return;
                }

                this.#selection.move(delta.x, delta.y, 0);
                this.#onSelectionDrag?.(delta);
            } else {
                return this.#selection.meshes().length > 0;
            }
        });
    }
}

// Export singleton instance
export const interact = new InteractionControl();
