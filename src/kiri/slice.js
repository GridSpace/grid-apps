/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

    if (self.kiri.Slice) return;

    const KIRI = self.kiri,
        FILL = KIRI.fill,
        FILLFIXED = KIRI.fill_fixed,
        PRO = Slice.prototype,
        BASE = self.base,
        UTIL = BASE.util,
        POLY = BASE.polygons,
        NOKEY = BASE.key.NONE,
        fillArea = POLY.fillArea,
        newPoint = BASE.newPoint;

    KIRI.Top = Top;
    KIRI.newTop = newTop;
    KIRI.Slice = Slice;
    KIRI.newSlice = newSlice;

    /**
     * Object encapsulates a z-slice from an object.  This code is shared by the
     * client and the worker thread.  As such, the view layers are ignored in the
     * worker code paths.
     *
     * @param {number} z offset from ground
     * @param {THREE.Group} [view] optional view parent object for layers
     * @constructor
     */
    function Slice(z, view) {
        this.z = z; // z-index
        this.index = 0; // slice index
        this.lines = null; // slice raw (for rendermode/debug only)
        this.groups = null; // grouped lines (for rendermode/debug only)
        this.up = null; // slice above (linked list)
        this.down = null; // slice below (linked list)
        this.tops = []; // array of Top objects
        this.view = view; // for rendering this slice
        // bridge area polygons
        this.bridges = null;
        // flat area polygons
        this.flats = null;
        // areas requiring solid fill (from bridge/flats)
        this.solids = {
            poly: null,
            trimmed: null
        };
        this.offsets = null; // support clipping offsets
        this.supports = null; // external support areas
        this.isSolidFill = false;
        this.isSparseFill = false;
        this.camMode = null; // CAM mode
        this.layers = null;
        this.finger = null; // cached fingerprint

        if (view) this.addLayers(view);
    }

    /**
     * Represents a top-level (outer) polygon in a slice.  Slices may contain
     * multiple tops each with nested structures.  Top objects contain cached
     * and computed objects for quick access for rendering and dependent computations.
     *
     * @param {Polygon} polygon
     * @constructor
     */
    function Top(polygon) {
        this.poly = polygon; // outline poly
        this.traces = null; // array of offset/inset trace polygons (ordered outer to inner)
        this.inner = null; // array of inner fillable areas (inset from last trace)
        this.fill_lines = null; // solid fill lines (array of points)
        this.fill_sparse = null; // sparse fill area open polygons (poly lines)
        this.solids = null; // solid fill regions in otherwise sparse fill (from solids.trimmed)
    }

    /**
     * return innermost traces under a given top. for FDM, this represents
     * the outline shell that the fill touches.
     */
    Top.prototype.innerTraces = function() {
        let traces = this.traces,
            array = [];
        if (traces) traces.forEach(function(p) {
            if (p.inner) array.appendAll(p.inner);
        });
        return array;
    };

    Top.prototype.clone = function(deep) {
        let top = new Top(this.poly.clone(deep));
        return top;
    };

    /**
     * Appends all outermost trace polygons into a given array and returns it
     *
     * @param {Polygon[]} out array to populate
     * @returns {Polygon[]} array of top polygons
     */
    Top.prototype.gatherOuter = function(out) {
        this.traces.forEach(function(trace) {
            if (trace.depth === 0) out.append(trace);
        });
        return out;
    };

    /** ******************************************************************
     * Slice Prototype Functions
     ******************************************************************* */

    /**
     * returns a cloned slice the option of a deep clone on the top polys
     */
    PRO.clone = function(deep) {
        let from = this,
            slice = newSlice(from.z, from.view);
        from.tops.forEach(function(top) {
            slice.addTop(top.poly.clone(deep));
        });
        return slice;
    };

    /**
     * produces a fingerprint for a slice that should be the same for
     * layers that are identical. this happens in parts with unchanging
     * vertical wall regions. this allows us to eliminate expensive diffs
     * and infill computation when we detect the layers are the same.
     */
    PRO.fingerprint = function() {
        if (this.finger) {
            return this.finger;
        }
        return this.finger = POLY.fingerprint(this.gatherTopPolys([]));
    };

    /**
     * returns true if the layers' fingerprints are the same
     */
    PRO.fingerprintSame = function(slice) {
        if (!slice) {
            return false;
        }
        return POLY.fingerprintCompare(this.fingerprint(), slice.fingerprint());
    };

    /**
     * create layer objects for client-side rendering
     *
     * @param {THREE.Group} view
     */
    PRO.addLayers = function(view) {
        if (this.layers) return;

        // create views client side only
        function nl() { return KIRI.newLayer(view) }

        // if to support creation in worker space
        this.layers = {
            outline: nl(),
            trace: nl(), // also cam roughing
            bridge: nl(), // also cam finishx
            flat: nl(), // also cam finishy
            solid: nl(), // also cam finish
            fill: nl(), // also cam facing
            sparse: nl(),
            support: nl()
        };
    };

    /**
     * Add a polygon to a slice creating a new top when necessary.
     *
     * @param {Polygon} poly to merge into a top
     */
    PRO.mergeTop = function(poly) {
        let scope = this,
            tops = scope.tops,
            union, i;
        for (i=0; i<tops.length; i++) {
            if (union = poly.union(tops[i].poly)) {
                tops[i].poly = union;
                return tops[i];
            }
        }
        return scope.addTop(poly);
    };

    /**
     * Create a new top object given a polygon
     *
     * @param {Polygon} poly to add
     */
    PRO.addTop = function(poly) {
        let top = new Top(poly);
        this.tops.push(top);
        return top;
    };

    /**
     * Returns all top polygons as an array
     *
     * @param {Polygon[]} out array to populate
     * @returns {Polygon[]} array of top polygons
     */
    PRO.gatherTopPolys = function(out) {
        this.tops.forEach(function(top) {
            out.push(top.poly);
        });
        return out;
    };

    /**
     * Appends all inner trace inner polygons (holes)
     * into a given array and returns it
     *
     * @param {Polygon[]} out array to populate
     * @returns {Polygon[]} array of top polygons
     */
    PRO.gatherTopPolyInners = function(out) {
        this.tops.forEach(function(top) {
            if (top.poly.inner) out.appendAll(top.poly.inner);
        });
        return out;
    };

    /**
     * Appends all trace polygons into a given array and returns it
     *
     * @param {Polygon[]} out array to populate
     * @returns {Polygon[]} array of top polygons
     */
    PRO.gatherTraces = function(out) {
        this.tops.forEach(function(top) {
            out.appendAll(top.traces);
        });
        return out;
    };

    /**
     * Appends all innermost trace polygons into a given array and returns it
     *
     * @param {Polygon[]} out array to populate
     * @returns {Polygon[]} array of top polygons
     */
    PRO.gatherInner = function(out) {
        this.tops.forEach(function(top) {
            out.appendAll(top.inner);
        });
        return out;
    };

    /**
     * Appends all solid area polygons into a given array and returns it
     *
     * @param {Polygon[]} out array to populate
     * @returns {Polygon[]} array of top polygons
     */
    PRO.gatherSolids = function(out) {
        this.tops.forEach(function(top) {
            out.appendAll(top.solids);
        });
        return out;
    };

    /**
     * return all fill lines. includes points for solid layers,
     * solid polygon regions and support line polygons.
     *
     * @param {Point[]} [lines] array to append to
     */
    PRO.gatherFillLines = function(lines) {
        this.tops.forEach(function(top) {
            if (top.fill_lines) lines.appendAll(top.fill_lines);
        });
        return lines;
    };

    /**
     * Clear solid area cache in preparation for a new slicing action
     */
    PRO.invalidateSolids = function() {
        let solids = this.solids;
        solids.poly = [];
        solids.trimmed = null;
    };

    /**
     * Clear support cache in preparation for a new slicing calculation
     */
    PRO.invalidateSupports = function() {
        this.supports = null;
    };

    /**
     * given an array of arrays of points (lines), eliminate intersections
     * between groups, then return a unified array of shortest non-intersects.
     *
     * @returns {Point[]}
     */
    function cullIntersections() {
        function toLines(pts) {
            let lns = [];
            for (let i=0, il=pts.length; i<il; i += 2) {
                lns.push({a: pts[i], b: pts[i+1], l: pts[i].distTo2D(pts[i+1])});
            }
            return lns;
        }
        let aOa = [...arguments].filter(t => t);
        if (aOa.length < 1) return;
        let aa = toLines(aOa.shift());
        while (aOa.length) {
            let bb = toLines(aOa.shift());
            loop: for (let i=0, il=aa.length; i<il; i++) {
                let al = aa[i];
                if (al.del) {
                    continue;
                }
                for (let j=0, jl=bb.length; j<jl; j++) {
                    let bl = bb[j];
                    if (bl.del) {
                        continue;
                    }
                    if (UTIL.intersect(al.a, al.b, bl.a, bl.b, BASE.key.SEGINT)) {
                        if (al.l < bl.l) {
                            bl.del = true;
                        } else {
                            al.del = true;
                        }
                        continue;
                    }
                }
            }
            aa = aa.filter(l => !l.del).concat(bb.filter(l => !l.del));
        }
        let good = [];
        for (let i=0, il=aa.length; i<il; i++) {
            let al = aa[i];
            good.push(al.a);
            good.push(al.b);
        }
        return good.length > 2 ? good : [];
    }

    /**
     * Compute offset shell polygons. For FDM, the first offset is usually half
     * of the nozzle width.  Each subsequent offset is a full nozzle width.  User
     * parameters control tweaks to these numbers to allow for better shell bonding.
     * The last shell generated is a "fillOffset" shell.  Fill lines are clipped to
     * this polygon.  Adjusting fillOffset controls bonding of infill to the shells.
     *
     * @param {number} count
     * @param {number} offset1 first offset
     * @param {number} offsetN all subsequent offsets
     * @param {number} fillOffset
     * @param {Obejct} options
     */
    PRO.doShells = function(count, offset1, offsetN, fillOffset, options) {
        let slice = this,
            opt = options || {};

        slice.tops.forEach(function(top) {
            let top_poly = [ top.poly ];

            if (slice.index === 0) {
                // console.log({slice_top_0: top_poly, count});
                // segment polygon
            }

            if (opt.vase) {
                top.poly = top.poly.clone(false);
            }
            // top.thinner = [];
            top.traces = [];
            top.inner = [];
            let last = [],
                gaps = [],
                z = top.poly.getZ();

            if (count) {
                // permit offset of 0 for laser and drag knife
                if (offset1 === 0 && count === 1) {
                    last = top_poly.clone(true);
                    top.traces = last;
                } else {
                    if (opt.thin) {
                        top.thin_fill = [];
                        let oso = {z, count, gaps: [], outs: [], minArea: 0.05};
                        POLY.offset(top_poly, [-offset1, -offsetN], oso);

                        oso.outs.forEach((polys, i) => {
                            polys.forEach(p => {
                                p.depth = i;
                                if (p.inner) {
                                    p.inner.forEach(pi => pi.depth = i);
                                }
                                top.traces.push(p);
                            });
                            last = polys;
                        });

                        // slice.solids.trimmed = slice.solids.trimmed || [];
                        oso.gaps.forEach((polys, i) => {
                            let off = (i == 0 ? offset1 : offsetN);
                            polys = POLY.offset(polys, -off * 0.8, {z, minArea: 0});
                            // polys.forEach(p => { slice.solids.trimmed.push(p); });
                            top.thin_fill.appendAll(cullIntersections(
                                fillArea(polys, 45, off/2, [], 0.01, off*2),
                                fillArea(polys, 135, off/2, [], 0.01, off*2),
                                // fillArea(polys, 90, off, [], 0.05, off*4),
                                // fillArea(polys, 180, off, [], 0.05, off*4),
                            ));
                            gaps = polys;
                        });
                    } else {
                        // standard wall offsetting strategy
                        POLY.expand(
                            top_poly,   // reference polygon(s)
                            -offset1,   // first inset distance
                            z,          // set new polys to this z
                            top.traces, // accumulator array
                            count,      // number of insets to perform
                            -offsetN,   // subsequent inset distance
                            // on each new offset trace ...
                            function(polys, countNow) {
                                last = polys;
                                // mark each poly with depth (offset #) starting at 0
                                polys.forEach(function(p) {
                                    p.depth = count - countNow;
                                    if (p.inner) p.inner.forEach(function(pi) {
                                        // use negative offset for inners
                                        pi.depth = -(count - countNow);
                                    });
                                });
                            });
                    }
                }
            } else {
                // no shells, just infill, is permitted
                last = [top.poly];
            }

            // generate fill offset poly set from last offset to top.inner
            if (fillOffset && last.length > 0) {
                // if gaps present, remove that area from fill inset
                if (gaps.length) {
                    let nulast = [];
                    POLY.subtract(last, gaps, nulast, null, slice.z);
                    last = nulast;
                }
                last.forEach(function(inner) {
                    POLY.offset([inner], -fillOffset, {outs: top.inner, flat: true, z: slice.z});
                });
            }
        });
    };

    /**
     * Clear fill cache in preparation for a slice or re-slice of a widget
     */
    PRO.invalidateFill = function() {
        this.tops.forEach(function(top) {
            top.fill_lines = null;
            top.fill_sparse = null;
        });
    };

    /**
     * Calculate thin-wall sections and fill appropriately
     *
     * @param {number} minDist
     */
    PRO.doThinWallDetection = function(mindist) {
        this.tops.forEach(function(top) {
            if (top.inner && top.inner.length > 0) {
                // using next line2line algo from print lib
            }
        });
    };

    /**
     * Create an entirely solid layer by filling all top polygons
     * with an alternating pattern.
     *
     * @param {number} linewidth
     * @param {number} angle
     * @param {number} density
     */
    PRO.doSolidLayerFill = function(spacing, angle) {
        this.isSolidFill = false;

        if (this.tops.length === 0) return;
        if (typeof(angle) != 'number') return;

        this.tops.forEach(function(top) {
            if (top.inner && top.inner.length > 0) {
                top.fill_lines = fillArea(top.inner, angle, spacing, null);
            } else {
                top.fill_lines = null;
            }
        });

        this.isSolidFill = true;
    };

    /**
     * Take output from pluggable sparse infill algorithm and clip to
     * the bounds of the top polygons and their inner solid areas.
     */
    PRO.doSparseLayerFill = function(options) {
        let process = options.process,
            spacing = options.spacing,  // spacing space between fill lines
            density = options.density,  // density of infill 0.0 - 1.0
            bounds = options.bounds,    // bounding box of widget
            height = options.height,    // z layer height
            type = options.type || 'hex';

        this.isSparseFill = false;
        if (this.tops.length === 0 || density === 0.0 || this.isSolidFill) {
            return;
        }

        let scope = this,
            tops = scope.tops,
            down = scope.down,
            clib = self.ClipperLib,
            ctyp = clib.ClipType,
            ptyp = clib.PolyType,
            cfil = clib.PolyFillType,
            clip = new clib.Clipper(),
            ctre = new clib.PolyTree(),
            poly,
            polys = [],
            lines = [],
            line = [],
            solids = [],
            // callback passed to pluggable infill algorithm
            target = {
                // slice and slice property access
                slice: function() { return scope },
                zIndex: function() { return scope.index },
                zValue: function() { return scope.z },
                // various option map access
                options: function() { return options },
                lineWidth: function() { return options.lineWidth },
                bounds: function() { return bounds },
                zHeight: function() { return height },
                offset: function() { return spacing },
                density: function() { return density },
                // output functions
                emit: function(x,y) {
                    if (isNaN(x)) {
                        solids.push(x);
                    } else {
                        line.push(newPoint(x,y,scope.z));
                        scope.isSparseFill = true;
                    }
                },
                newline: function() {
                    if (line.length > 0) {
                        lines.push(line);
                        line = [];
                    }
                }
            };

        // use specified fill type
        if (type && FILL[type]) {
            FILL[type](target);
        } else {
            console.log({missing_infill: type});
            return;
        }

        // force emit of last line
        target.newline();

        // prepare top infill structure
        tops.forEach(function(top) {
            top.fill_sparse = [];
            polys.appendAll(top.inner);
            polys.appendAll(top.solids);
        });

        // update fill fingerprint for this slice
        scope._fill_finger = POLY.fingerprint(polys);

        let skippable = FILLFIXED[type] ? true : false;
        let miss = false;
        // if the layer below has the same fingerprint,
        // we may be able to clone the infill instead of regenerating it
        if (skippable && scope.fingerprintSame(down)) {
            // the fill fingerprint can slightly different because of solid projections
            if (down._fill_finger && POLY.fingerprintCompare(scope._fill_finger, down._fill_finger)) {
                for (let i=0; i<tops.length; i++) {
                    // the layer below may not have infill computed if it's solid
                    if (down.tops[i].fill_sparse) {
                        tops[i].fill_sparse = down.tops[i].fill_sparse.map(poly => {
                            return poly.clone().setZ(scope.z);
                        });
                    } else {
                        miss = true;
                    }
                }
                // if any of the fills as missing from below, re-compute
                if (!miss) {
                    return;
                }
            }
        }

        let sparse_clip = scope.isSparseFill;

        // solid fill areas
        if (solids.length) {
            tops.forEach(top => {
                if (!top.inner) return;
                let masks = top.inner.slice();
                if (top.solids) {
                    masks = POLY.subtract(masks, top.solids, [], null, scope.z);
                }
                let angl = process.sliceFillAngle * ((scope.index % 2) + 1);
                solids.forEach(solid => {
                    let inter = [],
                        fillable = [];
                    masks.forEach(mask => {
                        let p = solid.mask(mask);
                        if (p && p.length) inter.appendAll(p);
                    });
                    // offset fill area to accommodate trace
                    if (inter.length) {
                        POLY.expand(inter, -options.lineWidth/2, scope.z, fillable);
                    }
                    // fill intersected areas
                    if (inter.length) {
                        scope.isSparseFill = true;
                        if (!top.fill_lines) {
                            top.fill_lines = [];
                        }
                        inter.forEach(p => {
                            p.forEachSegment((p1, p2) => {
                                top.fill_lines.push(p1, p2);
                            });
                        });
                    }
                    if (fillable.length) {
                        let lines = POLY.fillArea(fillable, angl, options.lineWidth);
                        top.fill_lines.appendAll(lines);
                    }
                });
            });
        }

        // if only solids were added and no lines to clip
        if (!sparse_clip) {
            return;
        }

        clip.AddPaths(lines, ptyp.ptSubject, false);
        clip.AddPaths(POLY.toClipper(polys), ptyp.ptClip, true);

        if (clip.Execute(ctyp.ctIntersection, ctre, cfil.pftNonZero, cfil.pftEvenOdd)) {
            ctre.m_AllPolys.forEach(function(node) {
                poly = POLY.fromClipperNode(node, scope.z);
                tops.forEach(function(top) {
                    // use only polygons inside this top
                    if (poly.isInside(top.poly)) {
                        top.fill_sparse.push(poly);
                    }
                });
            });
        }
    };

    /**
     * Find difference between fill inset poly on two adjacent layers.
     * Used to calculate bridges, flats and then solid projections.
     * 'expand' is used for top offsets in SLA mode
     */
    PRO.doDiff = function(minArea, expand, fakedown) {
        let down = this.down;

        if (!down) {
            if (fakedown) {
                down = newSlice(-1);
            } else {
                return;
            }
        }

        let top = this,
            bottom = down;

        top.bridges = null;
        bottom.flats = null;

        let topInner = expand ? top.gatherTopPolys([]) : top.gatherInner([]),
            bottomInner = expand ? bottom.gatherTopPolys([]) : bottom.gatherInner([]),
            bridges = [],
            flats = [];

        // skip diffing layers that are identical
        if (this.fingerprintSame(bottom)) {
            top.bridges = bridges;
            bottom.flats = flats;
            return;
        }

        POLY.subtract(topInner, bottomInner, bridges, flats, this.z, minArea);

        if (expand) {
            top.bridges = [];
            bottom.flats = [];
            POLY.expand(bridges, expand, top.z, top.bridges, 1, null, null, 0.0001);
            POLY.expand(flats, expand, top.z, bottom.flats, 1, null, null, 0.0001);
        } else {
            top.bridges = bridges;
            bottom.flats = flats;
        }
    };

    /**
     *
     *
     * @param {Polygon[]} polys
     */
    PRO.addSolidFills = function(polys) {
        if (this.solids.poly) this.solids.poly.appendAll(polys);
    };

    /**
     * project bottom flats down
     */
    PRO.projectFlats = function(count) {
        if (this.isSolidFill || !this.down || !this.flats) return;
        projectSolid(this, this.flats, count, false, true);
    };

    /**
     * project top bridges up
     */
    PRO.projectBridges = function(count) {
        if (this.isSolidFill || !this.up || !this.bridges) return;
        projectSolid(this, this.bridges, count, true, true);
    };

    /**
     * fill projected areas and store line data
     * @return {boolean} true if filled, false if not
     */
    PRO.doSolidsFill = function(spacing, angle, minArea) {

        let minarea = minArea || 1,
            scope = this,
            tops = scope.tops,
            solids = scope.solids,
            unioned = POLY.union(solids.poly),
            isSLA = (spacing === undefined && angle === undefined);

        if (solids.length === 0) return false;
        if (unioned.length === 0) return false;

        let masks,
            trims = [],
            inner = isSLA ? scope.gatherTopPolys([]) : scope.gatherInner([]);

        // trim each solid to the inner bounds
        unioned.forEach(function(p) {
            p.setZ(scope.z);
            inner.forEach(function(i) {
                if (p.del) return;
                masks = p.mask(i);
                if (masks && masks.length > 0) {
                    p.del = true;
                    trims.appendAll(masks);
                }
            });
        });

        // then merge the resulting solids
        solids.unioned = unioned;
        solids.trimmed = trims;

        // clear old solids and make array for new
        tops.forEach(function(top) { top.solids = [] });

        // parent each solid polygon inside the smallest bounding top
        trims.forEach(function(solid) {
            tops.forEach(function(top) {
                if (top.poly.overlaps(solid)) {
                    if (!solid.parent || solid.parent.area() > top.poly.area()) {
                        if (solid.areaDeep() < minarea) {
                            // console.log({i:scope.index,cull_solid:solid,area:solid.areaDeep()});
                            return;
                        }
                        solid.parent = top.poly;
                        top.solids.push(solid);
                    }
                }
            });
        });

        // for SLA to bypass line infill
        if (isSLA) {
            return true;
        }

        // create empty filled line array for each top
        tops.forEach(function(top) {
            top.fill_lines = [];
            let tofill = [],
                angfill = [];
            trims.forEach(function(solid) {
                if (solid.parent === top.poly) {
                    if (solid.fillang) {
                        angfill.push(solid);
                    } else {
                        tofill.push(solid);
                    }
                }
            });
            if (tofill.length > 0) {
                fillArea(tofill, angle, spacing, top.fill_lines);
                top.fill_lines_norm = {angle:angle,spacing:spacing};
            }
            if (angfill.length > 0) {
                top.fill_lines_ang = {spacing:spacing,list:[],poly:[]};
                angfill.forEach(function(af) {
                    fillArea([af], af.fillang.angle + 45, spacing, top.fill_lines);
                    top.fill_lines_ang.list.push(af.fillang.angle + 45);
                    top.fill_lines_ang.poly.push(af.clone());
                });
            }

        });
        return true;
    };

    /**
     * calculate external overhangs requiring support
     * this is done bottom-up
     *
     * @param {number} minOffset trigger for unsupported distance
     * @param {number} maxBridge max length before mid supports added
     * @param {number} expand outer support clip
     * @param {number} offset inner support clip
     * @param {number} gap layers between supports and part
     */
    PRO.doSupport = function(minOffset, maxBridge, expand, minArea, pillarSize, offset, gap) {
        let min = minArea || 0.01,
            size = (pillarSize || 1),
            slice = this,
            mergeDist = size * 3, // pillar merge dist
            tops = slice.gatherTopPolys([]),
            trimTo = tops;

        // creates outer clip offset from tops
        if (expand) POLY.expand(tops, expand, slice.z, trimTo = []);

        // create inner clip offset from tops
        POLY.expand(tops, offset, slice.z, slice.offsets = []);

        // skip support detection for bottom layer
        if (!slice.down) return;

        let traces = POLY.flatten(slice.gatherTraces([])),
            fill = slice.gatherFillLines([]),
            points = [],
            down = slice.down,
            down_tops = down.gatherTopPolys([]),
            down_traces = POLY.flatten(down.gatherTraces([]));

        // check if point is supported by layer below
        function checkSupported(point) {
            // skip points close to other support points
            for (let i=0; i<points.length; i++) {
                if (point.distTo2D(points[i]) < size/4) return;
            }
            let supported = point.isInPolygonOnly(down_tops);
            if (!supported) down_traces.forEach(function(trace) {
                trace.forEachSegment(function(p1, p2) {
                    if (point.distToLine(p1, p2) <= minOffset) {
                        return supported = true;
                    }
                });
                return supported;
            });
            if (!supported) points.push(point);
        }

        // todo support entire line if both endpoints unsupported
        // segment line and check if midpoints are supported
        function checkLine(p1, p2, poly) {
            let dist, i = 1;
            if ((dist = p1.distTo2D(p2)) >= maxBridge) {
                let slope = p1.slopeTo(p2).factor(1/dist),
                    segs = Math.floor(dist / maxBridge) + 1,
                    seglen = dist / segs;
                while (i < segs) {
                    checkSupported(p1.projectOnSlope(slope, i++ * seglen));
                }
            }
            if (poly) checkSupported(p2);
        }

        // check trace line support needs
        traces.forEach(function(trace) {
            trace.forEachSegment(function(p1, p2) { checkLine(p1, p2, true) });
        });

        let supports = [];

        // add offset solids to supports (or fill depending)
        fill.forEachPair(function(p1,p2) { checkLine(p1, p2, false) });
        // if (top.bridges) POLY.expand(top.bridges, -maxBridge/2, top.z, supports, 1);

        // skip the rest if no points or supports
        if (!(points.length || supports.length)) return;

        let pillars = [];

        // TODO project points down instead of unioned pillars
        // TODO merge point/rect into hull of next nearest (up to maxBridge/2 away)
        // TODO eliminate unions in favor of progress hulling (using previous w/nearness)
        // TODO align pillar diamond along line (when doing line checks)

        // for each point, create a bounding rectangle
        points.forEach(function(point) {
            pillars.push(BASE.newPolygon().centerRectangle(point, size/2, size/2));
        });

        // merge pillars and replace with convex hull of outer points (aka smoothing)
        pillars = POLY.union(pillars).forEach(function(pillar) {
            supports.push(BASE.newPolygon().createConvexHull(pillar.points));
        });

        // return top.supports = supports;
        // then union supports
        supports = POLY.union(supports);

        // constrain support poly to top polys
        supports = POLY.trimTo(supports, trimTo);

        let depth = 0;
        while (down && supports.length > 0) {
            down.supports = down.supports || [];

            let trimmed = [],
                culled = [];

            // clip supports to shell offsets
            POLY.subtract(supports, down.gatherTopPolys([]), trimmed, null, slice.z, min);

            // set depth hint on support polys for infill density
            trimmed.forEach(function(trim) {
                if (trim.area() < 0.1) return;
                culled.push(trim.setZ(down.z));
            });

            // exit when no more support polys exist
            if (culled.length === 0) break;

            // new bridge polys for next pass (skip first layer below)
            if (depth >= gap) down.supports.appendAll(culled);

            supports = culled;
            down = down.down;
            depth++;
        }

    };

    /**
     * @param {number} linewidth
     * @param {number} angle
     * @param {number} density
     * @param {number} offset
     */
    PRO.doSupportFill = function(linewidth, density, minArea) {
        // return;
        let slice = this,
            supports = slice.supports,
            nsB = [],
            nsC = [],
            min = minArea || 0.1;

        // create support clip offset
        // POLY.expand(slice.gatherTopPolys([]), offset, slice.z, slice.offsets = []);

        if (!supports) return;

        // union supports
        supports = POLY.union(supports);

        // trim to clip offsets
        POLY.subtract(supports, slice.offsets, nsB, null, slice.z, min);
        supports = nsB;

        // also trim to lower offsets, if they exist
        if (slice.down) {
            POLY.subtract(nsB, slice.down.offsets, nsC, null, slice.z, min);
            supports = nsC;
        }

        if (supports) supports.forEach(function (poly) {
            // angle based on width/height ratio
            let angle = (poly.bounds.width() / poly.bounds.height() > 1) ? 90 : 0;
            // calculate fill density
            let spacing = linewidth * (1 / density);
            // inset support poly for fill lines 33% of nozzle width
            let inset = POLY.offset([poly], -linewidth/3, {flat: true, z: slice.z});
            // do the fill
            if (inset.length > 0) {
                fillArea(inset, angle, spacing, poly.fills = []);
            }
            return true;
        });

        // re-assign new supports back to slice
        slice.supports = supports;
    };

    /**
     * for printing output optimization
     * calls down to the outermost shell in this slice
     *
     * @param {Point} target
     * @return {Object}
     */
    PRO.findClosestPointTo = function(target) {
        let min, find;

        if (this.tops.length) {
            this.tops.forEach(function(top) {
                find = top.poly.findClosestPointTo(target);
                if (!min || find.distance < min.distance) {
                    min = find;
                }
            });
        } else if (this.supports) {
            this.supports.forEach(function(poly) {
                find = poly.findClosestPointTo(target);
                if (!min || find.distance < min.distance) {
                    min = find;
                }
            });
        }

        return min;
    };

    /** ******************************************************************
     * Connect to kiri and Helpers
     ******************************************************************* */

    /**
     *
     * @param {Point} p1
     * @param {Point} p2
     * @param {Polygon | Polygon[]} poly
     * @param {number} [minDist2] square of min distance
     * @returns {?Point}
     */
    function lineCrossesPoly(p1, p2, poly, minDist2) {
        let ip;
        if (Array.isArray(poly)) {
            for (let i=0; i<poly.length; i++) {
                if (ip = lineCrossesPoly(p1, p2, poly[i], minDist2)) return ip;
            }
            return null;
        }
        if (minDist2 && p1.distToSq2D(p2) < minDist2) return null;
        let pp = poly.points, j = 0;
        if (pp.length < 2) return false;
        // todo may cross multiple times ... find the closest ip to p1
        while (j < pp.length) {
            ip = UTIL.intersect(p1, p2, pp[j], pp[(++j)%pp.length],BASE.key.SEGINT);
            if (ip && !ip.isEqual2D(p1)) return ip;
        }
        if (poly.inner) {
            return lineCrossesPoly(p1, p2, poly.inner, minDist2);
        }
        return null;
    }

    /**
     * @param {Object[]} out
     * @returns {Point[]}
     */
    function sortIntersections(out) {
        let ints = [];
        out.sort(function(a,b) {
            return a.dist2 - b.dist2;
        });
        out.forEach(function(x) { ints.push(x.ip) });
        return ints;
    }

    /**
     * @param {Point} p1
     * @param {Point} p2
     * @param {Polygon | Polygon[]} polys
     * @returns {?Point}
     */
    function findIntersections(p1, p2, polys, out) {
        let i, j, ip;
        if (Array.isArray(polys)) {
            for (i=0; i<polys.length; i++) {
                findIntersections(p1, p2, polys[i], out);
            }
            return out;
        }
        let pp = polys.points,
            pl = pp.length;
        if (pp.length < 2) return out;
        for (i=0; i < pl; i++) {
            if (ip = UTIL.intersect(p1, p2, pp[i], pp[(i+1) % pl], BASE.key.SEGINT)) {
                out.push({ip:ip, dist2:p1.distToSq2D(ip)});
            }
        }
        if (polys.inner) {
            return findIntersections(p1, p2, polys.inner, out);
        }
        return out;
    }

    /**
     *
     * @param {Slice} slice
     * @param {Polygon[]} polys
     * @param {number} count
     * @param {boolean} up
     * @param {boolean} first
     * @returns {*}
     */
    function projectSolid(slice, polys, count, up, first) {
        if (!slice || slice.isSolidFill || count <= 0) return;
        let clones = polys.clone(true);
        if (first) {
            clones.forEach(function(p) {
                p.hintFillAngle();
            });
        }
        slice.addSolidFills(clones);
        if (count > 0) {
            if (up) projectSolid(slice.up, polys, count-1, true, false);
            else projectSolid(slice.down, polys, count-1, false, false);
        }
    }

    /**
     *
     * @param layer
     * @param poly
     * @param colors
     * @param idx
     * @param {boolean} [recurse]
     * @param {boolean} [open]
     * @returns {THREE.Line}
     */
    function renderPolygon(layer, poly, colors, idx, recurse, open) {
        layer.poly(poly, colors[idx % colors.length], recurse, open);
        if (recurse && poly.inner) {
            poly.inner.forEach(function(inner) {
                renderPolygon(layer, inner, colors, idx + 1, false, open);
            });
        }
    }

    function newTop(poly) {
        return new Top(poly);
    }

    /**
     * @param {number} z
     * @param {THREE.Group} view
     * @returns {Slice}
     */
    function newSlice(z, view) {
        return new Slice(z, view);
    }

})();
