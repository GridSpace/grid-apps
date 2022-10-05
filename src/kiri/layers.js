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
const newPath = true;

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
            off: off === true,
            lines: [],
            polys: [], // colors are an attribute on polygons
            faces: [],
            cface: undefined, // face color indices
            paths: [],
            cpath: undefined, // path colors indices
            color: colors || {
                check: 0,
                line: 0,
                face: 0,
                opacity: 1
            },
        };
        return this;
    }

    addLine(p1, p2) {
        this.current.lines.push(p1, p2);
        return this;
    }

    addLines(lines, options) {
        if (options) {
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

    addPoly(poly, options) {
        return this.addPolys([poly], options);
    }

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
            polys.forEach(p => {
                if (options.z !== undefined) {
                    p.setZ(options.z);
                }
                switch (typeof(options.color)) {
                    case 'number': p.color = options.color; break;
                    case 'object': p.color = options.color.line; break;
                }
            });
        }
        this.current.polys.appendAll(polys);
        this.stats.line_poly += polys.length;
        return this;
    }

    // z planar closed polygonal areas
    addAreas(polys, options) {
        const faces = this.current.faces;
        polys = Array.isArray(polys) ? polys : [ polys ];
        polys.forEach(poly => {
            poly.earcut().forEach(ep => {
                ep.forEachPoint(p => { faces.push(p.x, p.y, p.z) });
            });
        });
        if (options && options.outline) {
            this.addPolys(polys.clone(true));
        }
    }

    // misleading name. these are flat offset paths (old style rendering)
    addFlats(polys, options) {
        const opts = options || {};
        const offset = opts.offset || 1;
        polys = flat(polys);
        if (!polys.length) {
            return;
        }
        const z = polys[0].getZ(), faces = this.current.faces;
        const off_opt = { z, flat: true };
        polys.forEach(poly => {
            const faceidx = faces.length / 3;
            if (newPath) {
                const path = poly.toPath2D(offset * 0.95);
                for (let p of path.faces) {
                    faces.push(p.x, p.y, p.z);
                }
                if (opts.outline) {
                    this.addPolys(newPolygon().addPoints(path.left).setOpen());
                    this.addPolys(newPolygon().addPoints(path.right).setOpen());
                }
            } else {
                let exp = off_opt.outs = [];
                if (poly.isOpen()) {
                    // shorten line by offset
                    const pp = poly.points, pl = pp.length;
                    pp[0] = pp[0].offsetPointTo(pp[1], offset);
                    pp[pl-1] = pp[pl-1].offsetPointTo(pp[pl-2], offset);
                    exp.appendAll(POLY.expand_lines(poly, offset * 0.9, z));
                    // force re-nest if offsets cause ends to join
                    exp = POLY.flatten(exp,[],true);
                    this.stats.flat_line = 0;
                } else if (offset) {
                    POLY.offset([poly],  offset * 0.9, off_opt);
                    POLY.offset([poly], -offset * 0.9, off_opt);
                    this.stats.flat_poly = 0;
                }
                if (opts.outline) {
                    this.addPolys(exp.clone());
                }
                POLY.nest(exp).forEach((poly,i) => {
                    poly.earcut().forEach(ep => {
                        ep.forEachPoint(p => { faces.push(p.x, p.y, p.z) });
                    });
                });
            }
            const cur = this.current;
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
        });
        return this;
    }

    addPaths(polys, options) {
        const opts = options || {};
        const height = opts.height || 1;
        const offset = opts.offset || 1;

        polys = flat(polys);
        if (!polys.length) {
            return;
        }

        if (newPath) {
            for (let poly of polys) {
                if (poly.length < (poly.open ? 2 : 3)) {
                    continue;
                }
                const z = opts.z || poly.getZ();
                const faces = poly.toPath3D(offset, height, 0);
                const cur = this.current;
                const one = cur.paths[0];
                if (one) {
                    // merge all contour geometry for massive speed gain
                    // todo: recode to concat all geometries at once, and not incrementally
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
                } else {
                    cur.paths.push({ index: [], faces, z });
                    if (opts.color) {
                        cur.cpath = [ Object.assign({ start: 0, count: Infinity }, opts.color) ];
                    }
                }
                this.stats.contour++;
            }
        } else {
            const profiles = this.profiles;
            const prokey = `${offset}x${height}`;
            if (!profiles[prokey]) {
                const profile = new THREE.Shape();
                profile.moveTo(-offset, -height);
                profile.lineTo(-offset,  height);
                profile.lineTo( offset,  height);
                profile.lineTo( offset, -height);
                profiles[prokey] = profile;
            }
            const profile = profiles[prokey].clone();

            polys.forEach(poly => {
                const contour = [];
                poly = poly.debur(0.05);
                if (!poly) return;
                poly = poly.miter();
                poly.points.forEach(p => {
                    contour.push(new THREE.Vector2(p.x, p.y));
                });
                const {index, faces} = base.paths.shapeToPath(profile, contour, poly.isClosed());
                const cur = this.current;
                const one = cur.paths[0];
                if (one) {
                    // merge all contour geometry for massive speed gain
                    // todo: recode to concat all geometries at once, and not incrementally
                    const add = one.faces.length / 3;
                    for (let i=0; i<index.length; i++) {
                        index[i] += add;
                    }
                    const feces = new Float32Array(one.faces.length + faces.length);
                    const indln = one.index.length || one.faces.length / 3;
                    feces.set(one.faces);
                    feces.set(faces, one.faces.length);
                    one.faces = feces;
                    one.index.appendAll(index);
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
                } else {
                    cur.paths.push({ index, faces, z: opts.z || poly.getZ() });
                    if (opts.color) {
                        cur.cpath = [ Object.assign({ start: 0, count: Infinity }, opts.color) ];
                    }
                }
                this.stats.contour++;
            });
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
