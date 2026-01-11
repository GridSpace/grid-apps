/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { newPolygon, Polygon } from '../../geo/polygon.js';
import { polygons as POLY } from '../../geo/polygons.js';

/**
 * Layer management system for 3D visualization.
 * Organizes geometry (lines, polygons, faces, paths) by layer with color/opacity.
 * Supports multiple rendering styles: basic lines, webgl lines, filled areas, 3D extrusion paths.
 */
export class Layers {
    constructor() {
        this.init();
    }

    /**
     * Initialize or reset layers, profiles, and statistics.
     */
    init() {
        this.layers = {};
        this.profiles = {};
        this.stats = {
            contour: 0,
            flat_line: 0,
            flat_poly: 0,
            line_poly: 0,
            line: 0
        };
    }

    /**
     * Get layer data by layer index.
     * @param {number} layer - Layer index
     * @returns {object} Layer data or undefined
     */
    getLayer(layer) {
        return this.layers[layer];
    }

    /**
     * Set rotation for subsequent layers.
     * @param {number} [x=0] - X rotation in radians
     * @param {number} [y=0] - Y rotation in radians
     * @param {number} [z=0] - Z rotation in radians
     * @returns {Layers} This instance for chaining
     */
    setRotation(x = 0, y = 0, z = 0) {
        this.rotation = { x, y, z };
        return this;
    }

    /**
     * Set position offset for subsequent layers.
     * @param {number} [x=0] - X position
     * @param {number} [y=0] - Y position
     * @param {number} [z=0] - Z position
     * @returns {Layers} This instance for chaining
     */
    setPosition(x = 0, y = 0, z = 0) {
        this.position = { x, y, z };
        return this;
    }

    /**
     * Set current layer for subsequent geometry additions.
     * Creates layer if it doesn't exist.
     * @param {number} layer - Layer index
     * @param {number|object} colors - Single color number or {line, face, opacity}
     * @param {boolean} [off] - If true, marks layer as off/hidden
     * @returns {Layers} This instance for chaining
     */
    setLayer(layer, colors, off) {
        let layers = this.layers;
        if (typeof(colors) === 'number') {
            colors = {
                line: colors,
                face: colors,
                opacity: 1
            };
        }
        this.current = layers[layer] = layers[layer] || {
            rotation: this.rotation,
            position: this.position,
            off: off === true,
            lines: [], // basic line segments
            polys: [], // colors are an attribute on polygons
            faces: [], // triangles for areas and flats
            norms: undefined, // flats vertex normals
            cface: undefined, // flats face color indices
            paths: undefined, // 3d extrusion / tube paths (used to be an array, now merged - FIX)
            cpath: undefined, // path colors indices
            color: colors || {
                fat: 0, // render polys & lines with thickness
                line: 0,
                face: 0,
                opacity: 1
            },
        };
        return this;
    }

    /**
     * Add a single line segment to current layer.
     * @param {object} p1 - First point {x, y, z}
     * @param {object} p2 - Second point {x, y, z}
     * @returns {Layers} This instance for chaining
     */
    addLine(p1, p2) {
        this.current.lines.push(p1, p2);
        return this;
    }

    /**
     * Add multiple line segments to current layer.
     * If options provided, converts to open polygons via addPolys.
     * @param {Array} lines - Array of points (alternating pairs for line segments)
     * @param {object} [options] - If provided, creates open polygons instead
     * @returns {Layers} This instance for chaining
     */
    addLines(lines, options) {
        if (options) {
            // the open option encodes lines as open polygons
            options.open = true;
            const polys = [];
            for (let i=0; i<lines.length-1; i += 2) {
                polys.push(new Polygon()
                    .append(lines[i])
                    .append(lines[i+1])
                    .setOpen());
            }
            return this.addPolys(polys, options);
        }
        for (let i=0; i<lines.length-1; i += 2) {
            this.addLine(lines[i], lines[i+1]);
            this.stats.line++;
        }
        return this;
    }

    /**
     * Add a single polygon to current layer.
     * @param {Polygon} poly - Polygon to add
     * @param {object} [options] - Rendering options
     * @returns {Layers} This instance for chaining
     */
    addPoly(poly, options) {
        return this.addPolys([ poly ], options);
    }

    /**
     * Add polygons rendered as WebGL lines.
     * Dispatches to addFlats or addPaths based on options.
     * @param {Array<Polygon>} polys - Array of polygons
     * @param {object} [options] - Options: {clean, flat, thin, z, color}
     * @returns {Layers} This instance for chaining
     */
    addPolys(polys, options) {
        if (!polys) {
            return this;
        }
        if (!Array.isArray(polys)) {
            throw "polys must be an array";
        }
        if (polys.length === 0) {
            return this;
        }
        if (options && options.clean) {
            polys = polys.map(p => p.clean(true));
        }
        if (options && options.flat) {
            return this.addFlats(polys, options);
        }
        if (options && !options.thin) {
            return this.addPaths(polys, options);
        }
        polys = flat(polys);
        if (options) {
            for (let p of polys) {
                if (options.z !== undefined) {
                    p.setZ(options.z);
                }
                switch (typeof(options.color)) {
                    case 'number': p.color = options.color; break;
                    case 'object': p.color = options.color.line; break;
                }
            }
        }
        this.current.polys.appendAll(polys);
        this.stats.line_poly += polys.length;
        return this;
    }

    /**
     * Add enclosed 3D polygon earcut into triangular faces.
     * Used for FDM solids, bridges, flats debug, CAM hole generation, SLA slice visualization.
     * @param {Polygon|Array<Polygon>} polys - Polygon(s) to tessellate
     * @param {object} [options] - Options: {outline} to also draw polygon outline
     * @returns {Layers} This instance for chaining
     */
    addAreas(polys, options) {
        const faces = this.current.faces;
        polys = Array.isArray(polys) ? polys : [ polys ];
        for (let poly of polys) {
            for (let ep of poly.earcut()) {
                for (let p of ep.points) {
                    faces.push(p.x, p.y, p.z);
                }
            }
        }
        if (options && options.outline) {
            this.addPolys(polys.clone(true));
        }
    }

    /**
     * Add 2D polyline paths with width (usually FDM extrusion paths).
     * Creates flat ribbons with vertex normals for lighting.
     * @param {Array<Polygon>} polys - Polygons to render as flat ribbons
     * @param {object} [options] - Options: {offset, outline, color}
     * @returns {Layers} This instance for chaining
     */
    addFlats(polys, options) {
        const opts = options || {};
        const offset = opts.offset || 1;
        polys = flat(polys);
        if (!polys.length) {
            return;
        }
        const cur = this.current, faces = cur.faces;
        const norms = [];
        for (let poly of polys) {
            const faceidx = faces.length / 3;
            const path = poly.toPath2D(offset * 0.95);
            const { left, right, normals } = path;
            for (let p of path.faces) {
                faces.push(p.x, p.y, p.z);
            }
            norms.push(normals);
            if (opts.outline) {
                let p1 = newPolygon().addPoints(left).setOpenValue(poly.open);
                let p2 = newPolygon().addPoints(right).setOpenValue(poly.open);
                if (poly.z) {
                    p1.setZ(poly.z);
                    p2.setZ(poly.z);
                }
                this.addPolys([ p1, p2 ]);
            }
            const color = opts.color ?
                (typeof(opts.color) === 'number' ? { line: opts.color, face: opts.color } : opts.color) :
                cur.color;
            if (!cur.cface) {
                cur.cface = [ Object.assign({ start: faceidx, count: Infinity }, color) ];
            } else {
                // rewrite last color count if color or opacity have changed
                const pc = cur.cface[cur.cface.length - 1];
                if (pc.face !== color.face || pc.opacity !== color.opacity) {
                    pc.count = faceidx;
                    cur.cface.push(Object.assign({ start: faceidx, count: Infinity }, color));
                }
            }
        }
        if (cur.norms) {
            cur.norms.appendAll(norms.flat());
        } else {
            cur.norms = norms.flat();
        }
        return this;
    }

    /**
     * Add 3D polyline paths with extrusion (FDM extrusion paths).
     * Creates 3D tubes with vertex normals for lighting.
     * Supports incremental merging and per-segment color changes.
     * @param {Array<Polygon>} polys - Polygons to render as 3D tubes
     * @param {object} [options] - Options: {height, offset, z, color}
     * @returns {Layers} This instance for chaining
     */
    addPaths(polys, options) {
        const opts = options || {};
        const height = opts.height || 1;
        const offset = opts.offset || 1;

        polys = flat(polys);
        if (!polys.length) {
            return;
        }

        for (let poly of polys) {
            if (poly.length < (poly.open ? 2 : 3)) {
                continue;
            }
            const z = opts.z || poly.getZ();
            const { faces, normals } = poly.toPath3D(offset, height, 0);
            const cur = this.current;
            const one = cur.paths;
            // happens with very short lines being omitted
            if (!(faces && normals)) {
                continue;
            }
            if (one) {
                // for some reason, incremental merge is faster than all at the end
                const add = one.faces.length / 3;
                const feces = new Float32Array(one.faces.length + faces.length);
                const indln = one.faces.length / 3;
                feces.set(one.faces);
                feces.set(faces, one.faces.length);
                one.faces = feces;
                // allow changing colors
                if (opts.color) {
                    if (!cur.cpath) {
                        cur.cpath = [ Object.assign({ start: 0, count: indln - 1 }, cur.color) ];
                    }
                    // rewrite last color count if color or opacity have changed
                    const pc = cur.cpath[cur.cpath.length - 1];
                    if (pc.face !== opts.color.face || pc.opacity !== opts.color.opacity) {
                        pc.count = indln;
                        cur.cpath.push(Object.assign({ start: indln, count: Infinity }, opts.color));
                    }
                }
                if (normals) {
                    one.norms.appendAll(normals);
                }
            } else {
                cur.paths = { faces, z, norms: normals };
                if (opts.color) {
                    cur.cpath = [ Object.assign({ start: 0, count: Infinity }, opts.color) ];
                }
            }
            this.stats.contour++;
        }

        return this;
    }
}

/**
 * Flatten polygon array or single polygon for rendering.
 * Clones and flattens nested polygon structures.
 * @param {Polygon|Array<Polygon>} polys - Polygon(s) to flatten
 * @returns {Array<Polygon>} Flattened polygon array
 */
function flat(polys) {
    if (Array.isArray(polys)) {
        return POLY.flatten(polys.clone(true), [], true);
    } else {
        return POLY.flatten([polys.clone(true)], [], true);
    }
}
