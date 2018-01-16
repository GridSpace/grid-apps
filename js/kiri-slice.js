/** Copyright 2014-2017 Stewart Allen -- All Rights Reserved */

"use strict";

var gs_kiri_slice = exports;

(function() {

    if (!self.kiri) self.kiri = {};
    if (self.kiri.Slice) return;

    var KIRI = self.kiri,
        BASE = self.base,
        UTIL = BASE.util,
        POLY = BASE.polygons,
        PRO = Slice.prototype,
        fillArea = POLY.fillArea,
        newPoint = BASE.newPoint,
        ROUND = UTIL.round,
        MIN = Math.min,
        MAX = Math.max,
        DEG2RAD = Math.PI / 180,
        NOKEY = BASE.key.NONE,
        outline_colors = [0xffff00, 0x00ffff, 0xff00ff, 0xff0000, 0x00ff00, 0x0000ff, 0xffffff, 0x000000],
        trace_color = 0x000000,
        sparse_fill_color = 0x333366,
        fill_offset_color = 0xeeeeee,
        fill_color = 0x333333,
        flat_color = 0xff00aa,
        bridge_color = 0x00aaff,
        solid_outline_color = 0x00dd00;

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
        var traces = this.traces,
            array = [];
        if (traces) traces.forEach(function(p) {
            if (p.inner) array.appendAll(p.inner);
        });
        return array;
    };

    Top.prototype.clone = function(deep) {
        var top = new Top(this.poly.clone(deep));
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
        var from = this,
            slice = newSlice(from.z, from.view);
        from.tops.forEach(function(top) {
            slice.addTop(top.poly.clone(deep));
        });
        return slice;
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
        var scope = this,
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
        var top = new Top(poly);
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
        var solids = this.solids;
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
     * render raw slices in various formats to help debugging
     *
     * @param {number} renderMode
     */
    PRO.renderOutline = function(renderMode) {
        if (!this.view) return;

        var process = KIRI.driver.CAM.process,
            slice = this,
            layers = slice.layers,
            layer = layers.outline,
            colors = outline_colors,
            groups = slice.groups ? slice.groups.sort(function(a,b) { return b.area() - a.area() }) : null,
            tops = slice.tops,
            pbuf = [],
            coloridx = 0,
            open = (slice.camMode === process.FINISH_X || slice.camMode === process.FINISH_Y);

        layer.clear();

        switch (renderMode % 5) {
            // un-processed lines
            case 0:
                if (!slice.lines) return;
                slice.lines.forEach(function(line) {
                    var pa = [line.p1, line.p2];
                    layer.lines(pa, colors[coloridx++ % colors.length]);
                    layer.points(pa, 0x0, 0.1);
                });
                break;
            // lines grouped as polygons (shown open)
            case 1:
                if (!groups) return;
                groups.forEach(function(group) {
                    renderPolygon(layer, group, colors, coloridx++, false, true);
                });
                break;
            // lines grouped as polygons
            case 2:
                if (!groups) return;
                groups.forEach(function(group) {
                    renderPolygon(layer, group, colors, coloridx++, false, false);
                });
                break;
            // polygons with color representing outer / inner
            case 3:
                tops.forEach(function(top) {
                    renderPolygon(layer, top.poly, colors, 0, true, false);
                });
                break;
            // all polygons in yellow
            case 4:
                tops.forEach(function(top) {
                    layer.poly(top.poly, colors[0], true, open);
                    if (top.inner) layer.poly(top.inner, 0x999999, true, null);
                    // if (top.thinner) layer.poly(top.thinner, 0x559999, true, null);
                });
                break;
        }

        layer.render();
    };

    /**
     * given two arrays of points (lines), eliminate intersections of the second
     * to the first, then return a unified array.
     *
     * @param {Point[]} r1
     * @param {Point[]} r2
     * @returns {Point[]}
     */
    function cullIntersections(r1, r2) {
        if (!(r1 && r2 && r1.length && r2.length)) return;
        var valid = r2.slice();
        outer: for (var i=0; i<r1.length; i += 2) {
            for (var j=0; j<r2.length; j += 2) {
                if (UTIL.intersect(r1[i], r1[i+1], r2[j], r2[j+1], BASE.key.SEGINT)) continue outer;
            }
            valid.push(r1[i]);
            valid.push(r1[i+1]);
        }
        return valid.length > 2 ? valid : [];
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
        var slice = this,
            opt = options || {};

        slice.tops.forEach(function(top) {
            if (opt.vase) top.poly = top.poly.clone(false);
            // top.thinner = [];
            top.traces = [];
            top.inner = [];
            var last = [],
                z = top.poly.getZ();

            if (opt.thin) {
                top.thin_fill = [];
            }

            if (count) {
                // permit offset of 0 for laser
                if (offset1 === 0) {
                    last = [top.poly].clone(true);
                    top.traces = last;
                } else {
                    if (opt.thin) {
                        var on1s2 = offset1 * 2,
                            on2s2 = offsetN * 2;
                        POLY.expand2(
                            [top.poly],
                            -offset1,
                            -offsetN,
                            top.traces,
                            count,
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
                            },
                            // thin wall probe
                            function(p1, p2, diff, dist) {
                                if (p2) {
                                    // nth offset
                                    var pall = POLY.nest(POLY.flatten([].appendAll(p1).appendAll(p2)).clone()),
                                        pnew1 = POLY.expand(pall, -dist, z, null, 1),
                                        r1 = fillArea(pnew1, 45, offsetN, [], dist / 2, on2s2),
                                        r2 = fillArea(pnew1, 135, offsetN, [], dist / 2, on2s2),
                                        rall = top.thin_fill.appendAll(cullIntersections(r1, r2));
                                } else {
                                    // first offset
                                    var pall = POLY.nest(POLY.flatten([].appendAll(p1).appendAll(p2)).clone()),
                                        pnew1 = POLY.expand(pall, -dist, z, null, 1),
                                        r1 = fillArea(pnew1, 45, offsetN, [], 0, on1s2),
                                        r2 = fillArea(pnew1, 135, offsetN, [], 0, on1s2),
                                        rall = top.thin_fill.appendAll(cullIntersections(r1, r2));
                                }
                                // top.thinner.appendAll(pnew1).appendAll(pnew2);
                            },
                            z);
                    } else {
                        POLY.expand(
                            [top.poly],
                            -offset1,
                            z,
                            top.traces,
                            count,
                            -offsetN,
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
            }

            // generate fill offset poly set from last offset to top.inner
            if (fillOffset && last.length > 0) {
                last.forEach(function(inner) {
                    POLY.trace2count(inner, top.inner, fillOffset, 1, 0);
                });
            }
        });
    };

    /**
     * Runs in client. Generate shell lines in the correct view layer.
     *
     * @param {number} renderMode
     */
    PRO.renderShells = function(renderMode) {
        var scope = this,
            layers = scope.layers,
            layer = layers.trace,
            process = KIRI.driver.CAM.process;

        layer.clear();
        if (scope.camMode) {
            layers.solid.clear(); // finish
            layers.bridge.clear(); // finish x
            layers.flat.clear(); // finish y
        }

        scope.tops.forEach(function(top) {
            switch (scope.camMode) {
                case process.FINISH:
                    layer = layers.solid;
                    break;
                case process.FINISH_X:
                    layer = layers.bridge;
                    break;
                case process.FINISH_Y:
                    layer = layers.flat;
                    break;
                default:
                    layer = layers.trace;
                    break;
            }
            if (top.traces) layer.poly(top.traces, trace_color, true, null);
        });

        layer.render();
        if (scope.camMode) {
            layers.solid.render();
            layers.bridge.render();
            layers.flat.render();
        }
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
     * Runs in client. Generate solid lines in the correct view layer.
     */
    PRO.renderSolidFill = function() {
        var layer = this.layers.fill,
            render;

        layer.clear();

        this.tops.forEach(function(top) {
            if (top.fill_lines) layer.lines(top.fill_lines, fill_color);
        });

        layer.render();
    };

    /**
     * Take output from pluggable sparse infill algorithm and clip to
     * the bounds of the top polygons and their inner solid areas.
     *
     * @param {number} spacing space between fill lines
     * @param {number} percent infill 0.0 - 1.0
     * @param {Object} bounds -- TODO calc w/out mesh so it can run in a worker
     */
    PRO.doSparseLayerFill = function(spacing, percent, bounds) {
        this.isSparseFill = false;
        if (this.tops.length === 0 || percent === 0.0 || this.isSolidFill) return;

        var scope = this,
            tops = scope.tops,
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
            // callback passed to pluggable infill algorithm
            target = {
                bounds: function() { return bounds },
                zIndex: function() { return scope.index },
                zValue: function() { return scope.z },
                density: function() { return percent },
                offset: function() { return spacing },
                emit: function(x,y) { line.push(newPoint(x,y,scope.z)) },
                newline: function() {
                    if (line.length > 0) {
                        lines.push(line);
                        line = [];
                    }
                }
            };

        scope.isSparseFill = true;
        // this is pluggable
        sparseFillHex(target, true);
        // force emit of last line
        target.newline();

        tops.forEach(function(top) {
            top.fill_sparse = [];
            polys.appendAll(top.inner);
            polys.appendAll(top.solids);
        });

        clip.AddPaths(lines, ptyp.ptSubject, false);
        clip.AddPaths(POLY.toClipper(polys), ptyp.ptClip, true);

        if (clip.Execute(ctyp.ctIntersection, ctre, cfil.pftNonZero, cfil.pftEvenOdd)) {
            ctre.m_AllPolys.forEach(function(node) {
                poly = POLY.fromClipperNode(node, scope.z);
                tops.forEach(function(top) {
                    // use only polygons inside the top
                    if (poly.isInside(top.poly)) {
                        top.fill_sparse.push(poly);
                    }
                });
            });
        }

    };

    /**
     * Runs in client. Generate sparse lines in the correct view layer.
     */
    PRO.renderSparseFill = function() {
        var layer = this.layers.sparse;

        layer.clear();

        this.tops.forEach(function(top) {
            if (top.fill_sparse) {
                top.fill_sparse.forEach(function(poly) {
                    // todo cull polys with single point before this
                    if (poly.length > 1) poly.render(layer, sparse_fill_color, false, true);
                });
            }
        });

        layer.render();
    };

    /**
     * Find difference between fill inset poly on two adjacent layers.
     * Used to calculate bridges, flats and then solid projections.
     */
    PRO.doDiff = function(minArea) {
        if (!this.down) return;

        var top = this,
            bottom = this.down;

        top.bridges = null;
        bottom.flats = null;

        var topInner = top.gatherInner([]),
            bottomInner = bottom.gatherInner([]),
            bridges = [],
            flats = [];

        POLY.subtract(topInner, bottomInner, bridges, flats, this.z, minArea);

        top.bridges = bridges;
        bottom.flats = flats;
    };

    /**
    * Runs in client. Generate polygon lines in the correct view layer.
     */
    PRO.renderDiff = function() {
        var scope = this,
            layers = scope.layers,
            bridgeLayer = layers.bridge,
            flatLayer = layers.flat,
            bridges = scope.bridges,
            flats = scope.flats;

        bridgeLayer.clear();
        flatLayer.clear();

        if (bridges) bridges.forEach(function (t) {
            t.setZ(scope.z);
            t.render(bridgeLayer, bridge_color, true);
        });

        if (flats) flats.forEach(function (t) {
            t.setZ(scope.z);
            t.render(flatLayer, flat_color, true);
        });

        bridgeLayer.render();
        flatLayer.render();
    };

    /**
     *
     *
     * @param {Polygon[]} polys
     */
    PRO.addSolidFills = function(polys) {
        this.solids.poly.appendAll(polys);
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

        var minarea = minArea || 1,
            scope = this,
            tops = scope.tops,
            solids = scope.solids,
            unioned = POLY.union(solids.poly);

        if (solids.length === 0) return false;
        if (unioned.length === 0) return false;

        var masks,
            trims = [],
            inner = scope.gatherInner([]);

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
                            // console.log({cull_solid:solid,area:solid.areaDeep()});
                            return;
                        }
                        solid.parent = top.poly;
                        top.solids.push(solid);
                    }
                }
            });
        });

        // create empty filled line array for each top
        tops.forEach(function(top) {
            top.fill_lines = top.thin_fill || [];
            var tofill = [],
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
     * fill thin areas, if present
     * @return {boolean} true if filled, false if not
     */
    PRO.doThinFill = function(spacing, angle) {
        this.tops.forEach(function(top) {
            if (top.thin_fill && top.thin_fill.length > 0) {
                if (top.fill_lines) {
                    top.fill_lines.appendAll(top.thin_fill)
                } else {
                    top.fill_lines = top.thin_fill;
                }
            }
        });

        return true;
    };

    PRO.renderSolidOutlines = function() {
        var layer = this.layers.solid,
            trimmed = this.solids.trimmed;

        layer.clear();

        if (trimmed) trimmed.forEach(function(poly) {
            poly.render(layer, solid_outline_color, true);
        });

        layer.render();
    };

    /**
     * calculate external overhangs requiring support
     * this is done bottom-up
     *
     * @param {number} minOffset trigger for unsupported distance
     * @param {number} maxBridge max length before mid supports added
     * @param {number} expand outer support clip
     * @param {number} offset inner support clip
     */
    PRO.doSupport = function(minOffset, maxBridge, expand, minArea, pillarSize, offset) {
        var min = minArea || 0.1,
            size = (pillarSize || 2),
            mergeDist = size * 3, // pillar merge dist
            top = this,
            tops = top.gatherTopPolys([]),
            trimTo = tops;

        // creates outer clip offset from tops
        if (expand) POLY.expand(tops, expand, top.z, trimTo = []);

        // create inner clip offset from tops
        POLY.expand(tops, offset, top.z, top.offsets = []);

        // skip support detection for bottom layer
        if (!top.down) return;

        var traces = POLY.flatten(top.gatherTraces([])),
            fill = top.gatherFillLines([]),
            points = [],
            down = top.down,
            down_tops = down.gatherTopPolys([]),
            down_traces = POLY.flatten(down.gatherTraces([]));

        // check if point is supported by layer below
        function checkSupported(point) {
            // skip points close to other support points
            for (var i=0; i<points.length; i++) {
                if (point.distTo2D(points[i]) < size/4) return;
            }
            var supported = point.isInPolygonOnly(down_tops);
            if (!supported) down_traces.forEach(function(trace) {
                trace.forEachSegment(function(p1, p2) {
                    if (point.distToLine(p1, p2) <= minOffset) return supported = true;
                });
                return supported;
            });
            if (!supported) points.push(point);
        }

        // todo support entire line if both endpoints unsupported
        // segment line and check if midpoints are supported
        function checkLine(p1, p2, poly) {
            var dist, i = 1;
            if ((dist = p1.distTo2D(p2)) >= maxBridge) {
                var slope = p1.slopeTo(p2).factor(1/dist),
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

        var supports = [];

        // add offset solids to supports (or fill depending)
        fill.forEachPair(function(p1,p2) { checkLine(p1, p2, false) });
        // if (top.bridges) POLY.expand(top.bridges, -maxBridge/2, top.z, supports, 1);

        // skip the rest if no points or supports
        if (!(points.length || supports.length)) return;

        var pillars = [];

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

        var depth = 0;
        while (down && supports.length > 0) {
            down.supports = down.supports || [];

            var trimmed = [],
                culled = [];

            // clip supports to shell offsets
            POLY.subtract(supports, down.gatherTopPolys([]), trimmed, null, top.z, min);

            // set depth hint on support polys for infill density
            trimmed.forEach(function(trim) {
                if (trim.area() < 0.1) return;
                culled.push(trim.setZ(down.z));
            });

            // exit when no more support polys exist
            if (culled.length === 0) break;

            // new bridge polys for next pass (skip first layer below)
            if (depth > 0) down.supports.appendAll(culled);

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
        var slice = this,
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
            var angle = (poly.bounds.width() / poly.bounds.height() > 1) ? 90 : 0,
                // calculate fill density
                spacing = linewidth * (1 / density),
                offsets = [];
            // offset support poly for fill lines
            POLY.trace2count(poly, offsets, linewidth/4, 1, 0);
            // do the fill
            if (offsets.length > 0) fillArea(offsets, angle, spacing, poly.fills = []);
            return true;
        });

        // re-assign new supports back to slice
        slice.supports = supports;
    };

    /**
     *
     */
    PRO.renderSupport = function() {
        var slice = this,
            layer = slice.layers.support,
            supports = slice.supports;

        layer.clear();

        if (supports) supports.forEach(function(poly) {
            layer.poly(poly, 0xff0000, true);
            layer.lines(poly.fills, 0xff0000);
        });

        layer.render();
    };

    /**
     * for printing output optimization
     * calls down to the outermost shell in this slice
     *
     * @param {Point} target
     * @return {Object}
     */
    PRO.findClosestPointTo = function(target) {
        var min, find;

        this.tops.forEach(function(top) {
            find = top.poly.findClosestPointTo(target);
            if (!min || find.distance < min.distance) {
                min = find;
            }
        });

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
        var ip;
        if (Array.isArray(poly)) {
            for (var i=0; i<poly.length; i++) {
                if (ip = lineCrossesPoly(p1, p2, poly[i], minDist2)) return ip;
            }
            return null;
        }
        if (minDist2 && p1.distToSq2D(p2) < minDist2) return null;
        var pp = poly.points, j = 0;
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
        var ints = [];
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
        var i, j, ip;
        if (Array.isArray(polys)) {
            for (i=0; i<polys.length; i++) {
                findIntersections(p1, p2, polys[i], out);
            }
            return out;
        }
        var pp = polys.points,
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

        var clones = polys.clone(true);
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

    /**
     * emitter creates a hex infill pattern and sends to target
     *
     * @param {Object} target
     * @param {boolean} full continuous walls
     */
    function sparseFillHex(target, full) {
        // compute segment lengths (vert/horiz and 45)
        var spacing = target.offset() / 2,
            vhlen = (1 - target.density()) * 4 + spacing,
            anxlen = ROUND(Math.cos(30 * DEG2RAD) * vhlen, 7),
            anylen = ROUND(Math.sin(30 * DEG2RAD) * vhlen, 7),
            bounds = target.bounds(),
            even = true,
            evenZ = target.zIndex() % 2 === 0,
            maxy = bounds.max.y + (vhlen + anylen * 2),
            x, y;

        if (full || evenZ) {
            x = bounds.min.x;
            for (;;) {
                if (even && x > bounds.max.x) break;
                if (!even && x > bounds.max.x + anxlen + spacing) break;
                y = bounds.min.y;
                target.newline();
                while (y <= maxy) {
                    target.emit(x,y);
                    y += vhlen;
                    target.emit(x,y);
                    if (even) x += anxlen; else x -= anxlen;
                    y += anylen;
                    target.emit(x,y);
                    y += vhlen;
                    target.emit(x,y);
                    if (even) x -= anxlen; else x += anxlen;
                    y += anylen;
                }
                x += spacing;
                if (even) x += (anxlen * 2);
                even = !even;
                target.newline();
            }
        } else {
            y = bounds.min.y + vhlen;
            for (;;) {
                if (even && y > bounds.max.y) break;
                if (!even && y > bounds.max.y + anylen) break;
                x = bounds.min.x;
                target.newline();
                while (x < bounds.max.x) {
                    target.emit(x,y);
                    if (even) y += anylen; else y -= anylen;
                    x += anxlen;
                    target.emit(x,y);
                    x += spacing;
                    target.emit(x,y);
                    if (even) y -= anylen; else y += anylen;
                    x += anxlen;
                    target.emit(x,y);
                    x += spacing;
                }
                y += vhlen;
                if (even) y += (anylen * 2);
                even = !even;
                target.newline();
            }
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
