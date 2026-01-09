/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { Widget as WidgetCore } from '../core/widget.js';
import { util } from '../../geo/base.js';
import { avgc } from '../core/utils.js';
import { colorSchemeRegistry } from './color/schemes.js';
import { VisualStateManager } from './state/visual.js';

const solid_opacity = 1.0;

function catalog() { return self.kiri_catalog };
function index() { return self.kiri_catalog.index }

/**
 * UI-enhanced Widget subclass for main thread
 * Adds rendering, persistence, and visual state management
 */
class Widget extends WidgetCore {
    constructor(id, group) {
        super(id, group);
        // Visual state manager will be initialized when api is available
        this.visualStateManager = null;
    }

    /**
     * Initialize visual state manager (called when api is available)
     * @private
     */
    _initVisualStateManager() {
        if (this.visualStateManager || !this.api) {
            return;
        }

        const mode = this.api.mode.get_id();
        const theme = this.api.space.is_dark() ? 'dark' : 'light';
        const scheme = colorSchemeRegistry.getScheme(mode, theme);

        this.visualStateManager = new VisualStateManager(this, scheme, this.api);
        this.visualStateManager.loadPreferences();
    }

    /**
     * Get current color scheme
     * @private
     */
    _getScheme() {
        if (!this.api) return null;
        const mode = this.api.mode.get_id();
        const theme = this.api.space.is_dark() ? 'dark' : 'light';
        return colorSchemeRegistry.getScheme(mode, theme);
    }

    /**
     * Push a temporary visual state (for operations like paint)
     */
    pushVisualState(context, state) {
        this._initVisualStateManager();
        if (this.visualStateManager) {
            return this.visualStateManager.pushState(context, state);
        }
    }

    /**
     * Pop a temporary visual state
     */
    popVisualState(context) {
        if (this.visualStateManager) {
            this.visualStateManager.popState(context);
        }
    }

    /**
     * Save widget geometry to catalog
     */
    saveToCatalog(filename, overwrite) {
        if (!filename) {
            filename = this.meta.file;
        }
        if (this.grouped && !overwrite) {
            return this;
        }
        const widget = this;
        const mark = Date.now();
        const vertices = widget.getGeoVertices({ unroll: true }).slice();
        widget.meta.file = filename;
        widget.meta.save = mark;
        catalog().putFile(filename, vertices, () => {
            console.log("saved mesh ["+(vertices.length/3)+"] time ["+(Date.now()-mark)+"]");
        });
        return this;
    }

    /**
     * Save widget state to index
     */
    saveState(ondone) {
        if (!ondone) {
            clearTimeout(this._save_timer);
            this._save_timer = setTimeout(() => {
                this._save_timer = undefined;
                this.saveState(() => {});
            }, 1500);
            return;
        }
        const widget = this;
        index().put('ws-save-'+this.id, {
            anno: this.annotations(),
            geo: widget.getGeoVertices({ unroll: false }).slice(),
            group: this.group.id,
            meta: this.meta,
            track: widget.track
        }, result => {
            widget.meta.saved = Date.now();
            if (ondone) ondone();
        });
    }

    /**
     * Set mesh material color
     */
    setColor(color, settings, save = true) {
        if (settings) {
            console.trace('legacy call with settings');
        }
        if (Array.isArray(color)) {
            color = color[this.getExtruder() % color.length];
        }
        if (save) {
            this.color = color;
        }
        let material = this.getMaterial();
        material.color.set(this.meta.disabled ? avgc(0x888888, color, 3) : color);
    }

    /**
     * Get current visual state
     */
    getVisualState() {
        return {
            edges: this.outline ? true : false,
            wires: this.wire ? true : false,
            opacity: this.getMaterial().opacity
        };
    }

    /**
     * Set visual state
     */
    setVisualState({ edges, wires, opacity}) {
        this.cache.vizstate = this.getVisualState();
        this._setEdges(edges ?? false);
        this._setWireframe(wires ?? false);
        // Only set opacity if explicitly provided (don't default to 1)
        if (opacity !== undefined) {
            this.setOpacity(opacity);
        }
    }

    /**
     * Refresh visual state
     */
    refreshVisualState() {
        this.setVisualState(this.getVisualState());
    }

    /**
     * Restore previous visual state
     */
    restoreVisualState() {
        if (this.cache.vizstate) {
            this.setVisualState(this.cache.vizstate);
        }
    }

    /**
     * Apply global visual state from localStorage to this widget.
     * Reads opacity, edges, and wireframe settings from global config.
     * This is the primary method for syncing widget appearance with global preferences.
     */
    applyGlobalVisualState() {
        if (!this.api) {
            return;
        }

        const material = this.getMaterial();

        // Apply global opacity
        const opacity = this.api.local.getFloat('model.opacity') ?? 1.0;
        material.opacity = opacity;
        material.transparent = opacity < 1.0;
        material.visible = opacity > 0.0;

        // Apply global edges
        const edges = this.api.local.getBoolean('model.edges', false);
        this._setEdges(edges);

        // Apply global wireframe
        const wireframe = this.api.local.getBoolean('model.wireframe', false);
        if (wireframe) {
            const color = this.api.local.getInt('model.wireframe.color') || 0;
            const wfOpacity = this.api.local.getFloat('model.wireframe.opacity') ?? 0.5;
            this._setWireframe(true, color, wfOpacity);
        } else {
            this._setWireframe(false);
        }
    }

    /**
     * Set material opacity
     */
    setOpacity(value) {
        const mat = this.getMaterial();
        if (value <= 0.0) {
            mat.transparent = solid_opacity < 1.0;
            mat.opacity = solid_opacity;
            mat.visible = false;
        } else if (util.inRange(value, 0.0, solid_opacity)) {
            mat.transparent = value < 1.0;
            mat.opacity = value;
            mat.visible = true;
        }
    }

    /**
     * Set edge rendering - public interface for core widget rotation/scale
     * Delegates to internal _setEdges method
     */
    setEdges(set) {
        this._setEdges(set);
    }

    /**
     * Set edge rendering (internal method - use api.view.set_edges for global control)
     * @private
     */
    _setEdges(set) {
        this.__setEdges(set);
    }

    __setEdges(set) {
        if (!(this.api && this.api.conf)) {
            // missing api features in engine mode
            return;
        }
        const mesh = this.mesh;

        // Handle toggle
        if (set && set.toggle) {
            set = this.outline ? false : true;
        }

        // Remove outline (but keep cache)
        if (this.outline) {
            mesh.remove(this.outline);
            this.outline = null;
        }

        if (!set) {
            return; // Just hide, keep cache
        }

        // Resolve current angle and color
        const scheme = this._getScheme();
        const angle = scheme?.edges?.angle ?? this.api.conf.get().controller.edgeangle ?? 20;
        const color = scheme?.edges?.color ?? 0x888888;

        // Initialize cache if needed
        if (!this.cache.edges) {
            this.cache.edges = { geometry: null, angle: null, version: 0 };
        }

        const cache = this.cache.edges;
        let edgesGeometry;

        // Check if we can reuse cached geometry
        if (cache.geometry &&
            cache.angle === angle &&
            cache.version === this.geomVersion) {
            // Reuse cached geometry
            edgesGeometry = cache.geometry;
        } else {
            // Regenerate edges
            edgesGeometry = new THREE.EdgesGeometry(mesh.geometry, angle);

            // Update cache
            cache.geometry = edgesGeometry;
            cache.angle = angle;
            cache.version = this.geomVersion;
        }

        // Create outline with cached/new geometry
        const material = new THREE.LineBasicMaterial({ color });
        this.outline = new THREE.LineSegments(edgesGeometry, material);
        this.outline.renderOrder = -20;
        mesh.add(this.outline);
    }

    /**
     * Set wireframe rendering - public interface for core widget rotation/scale
     * Delegates to internal _setWireframe method
     */
    setWireframe(set, color, opacity) {
        this._setWireframe(set, color, opacity);
    }

    /**
     * Set wireframe rendering (internal method - use api.view.set_wireframe for global control)
     * @private
     */
    _setWireframe(set, color, opacity) {
        if (!(this.api && this.api.conf)) {
            // missing api features in engine mode
            return;
        }
        let mesh = this.mesh,
            widget = this;
        // Save current opacity before removing wire
        const currentOpacity = this.getMaterial().opacity;
        if (this.wire) {
            this.setOpacity(solid_opacity);
            mesh.remove(this.wire);
            this.wire = null;
        }
        if (set) {
            const scheme = this._getScheme();
            const wireColor = scheme?.wireframe?.color ?? 0xaaaaaa;
            const wireOpacity = scheme?.wireframe?.opacity ?? 0.5;
            const mat = new THREE.MeshBasicMaterial({
                wireframe: true,
                color: wireColor,
                opacity: wireOpacity,
                transparent: true
            });
            const wire = widget.wire = new THREE.Mesh(mesh.geometry.shallowClone(), mat);
            mesh.add(wire);
        }
        if (this.api.view.is_arrange()) {
            this.setColor(this.color);
        } else {
            this.setColor(0x888888,undefined,false);
        }
        if (opacity !== undefined) {
            widget.setOpacity(opacity);
        } else if (!set && this.wire === null) {
            // Restore original opacity when removing wireframe without explicit opacity
            widget.setOpacity(currentOpacity);
        }
    }

    /**
     * Load widget from catalog
     */
    static loadFromCatalog(filename, ondone) {
        catalog().getFile(filename, function(data) {
            let widget = new Widget().loadVertices(data);
            widget.meta.file = filename;
            ondone(widget);
        });
    }

    /**
     * Load widget from saved state
     */
    static loadFromState(id, ondone, move) {
        const Group = Widget.Groups;
        index().get('ws-save-'+id, function(data) {
            if (data) {
                let vertices = data.geo || data,
                    track = data.track || undefined,
                    group = data.group || id,
                    anno = data.anno || undefined,
                    widget = new Widget(id, Group.forid(group)),
                    meta = data.meta || widget.meta,
                    ptr = widget.loadVertices(vertices);
                widget.meta = meta;
                widget.anno = anno || widget.anno;
                // restore widget position if specified
                if (move && track && track.pos) {
                    widget.track = track;
                    widget.move(track.pos.x, track.pos.y, track.pos.z, true);
                }
                ondone(ptr);
            } else {
                ondone(null);
            }
        });
    }

    /**
     * Delete widget from saved state
     */
    static deleteFromState(id,ondone) {
        index().remove('ws-save-'+id, ondone);
    }
}

/**
 * Factory function to create UI-enhanced widgets
 */
function newWidget(id, group) {
    return new Widget(id, group);
}

export { Widget, newWidget };
