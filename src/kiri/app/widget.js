/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { Widget as WidgetCore } from '../core/widget.js';
import { util } from '../../geo/base.js';
import { avgc } from '../core/utils.js';

const solid_opacity = 1.0;

function catalog() { return self.kiri_catalog };
function index() { return self.kiri_catalog.index }

/**
 * UI-enhanced Widget subclass for main thread
 * Adds rendering, persistence, and visual state management
 */
class Widget extends WidgetCore {
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
        this.setEdges(edges ?? false);
        this.setWireframe(wires ?? false);
        this.setOpacity(opacity ?? 1);
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

    setEdges(set) {
        clearTimeout(this._setimer);
        if (set === true && this.outline) {
            this._setimer = setTimeout(() => this._setEdges(set), 10);
        } else {
            this._setEdges(set);
        }
    }

    _setEdges(set) {
        if (!(this.api && this.api.conf)) {
            // missing api features in engine mode
            return;
        }
        let mesh = this.mesh;
        if (set && set.toggle) {
            set = this.outline ? false : true;
        }
        if (this.outline) {
            mesh.remove(this.outline);
            this.outline = null;
        }
        if (set) {
            let dark = this.api.space.is_dark();
            let cam = this.api.mode.is_cam();
            let color = dark ? 0x444444 : 0x888888;
            let angle = this.api.conf.get().controller.edgeangle || 20;
            let edges = new THREE.EdgesGeometry(mesh.geometry, angle);
            let material = new THREE.LineBasicMaterial({ color });
            this.outline = new THREE.LineSegments(edges, material);
            this.outline.renderOrder = -20;
            mesh.add(this.outline);
        }
    }

    /**
     * Set wireframe rendering
     */
    setWireframe(set, color, opacity) {
        if (!(this.api && this.api.conf)) {
            // missing api features in engine mode
            return;
        }
        let mesh = this.mesh,
            widget = this;
        if (this.wire) {
            this.setOpacity(solid_opacity);
            mesh.remove(this.wire);
            this.wire = null;
        }
        if (set) {
            let dark = this.api.space.is_dark();
            let mat = new THREE.MeshBasicMaterial({
                wireframe: true,
                color: dark ? 0xaaaaaa : 0,
                opacity: 0.5,
                transparent: true
            })
            let wire = widget.wire = new THREE.Mesh(mesh.geometry.shallowClone(), mat);
            mesh.add(wire);
        }
        if (this.api.view.is_arrange()) {
            this.setColor(this.color);
        } else {
            this.setColor(0x888888,undefined,false);
        }
        if (opacity !== undefined) {
            widget.setOpacity(opacity);
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
