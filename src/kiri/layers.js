/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

/*
 * provides the `output` abstraction for turning poly lines (open and closed)
 * into primordial geometries (faces, lines, color ranges). used inside of
 * workers as part of slicing and preview output.
 */

// dep: geo.base
// dep: geo.paths
// dep: geo.polygon
// dep: geo.polygons
gapp.register("kiri.layers", [], (root, exports) => {

const { base, kiri } = root;
const { polygons, newPolygon } = base;

const POLY = base.polygons;

class Layers {
    constructor() {
        this.init();
    }

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

    getLayer(layer) {
        return this.layers[layer];
    }

    // in radians
    setRotation(x = 0, y = 0, z = 0) {
        this.rotation = { x, y, z };
        return this;
    }

    setPosition(x = 0, y = 0, z = 0) {
        this.position = { x, y, z };
        return this;
    }

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

    // add a line segment (two points)
    addLine(p1, p2) {
        this.current.lines.push(p1, p2);
        return this;
    }

    // add an array of line segments
    addLines(lines, options) {
        if (options) {
            // the open option encodes lines as open polygons
            options.open = true;
            const polys = [];
            for (let i=0; i<lines.length-1; i += 2) {
                polys.push(new base.Polygon()
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

    // an open or closed polygon
    addPoly(poly, options) {
        return this.addPolys([poly], options);
    }

    // a polygon rendered as a webgl line
    addPolys(polys, options) {
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

    // add an enclosed 3D polygon earcut into faces
    // used for FDM solids, bridges, flats debug & SLA slice visualization
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

    // add a 2D polyline path (usually FDM extrusion paths)
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
                this.addPolys(p1);
                this.addPolys(p2);
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

    // add 3D polyline path (FDM extrusion paths)
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

function flat(polys) {
    if (Array.isArray(polys)) {
        return POLY.flatten(polys.clone(true), [], true);
    } else {
        return POLY.flatten([polys.clone(true)], [], true);
    }
}

kiri.Layers = Layers;

});
