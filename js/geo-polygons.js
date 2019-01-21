/** Copyright 2014-2019 Stewart Allen -- All Rights Reserved */

"use strict";

var gs_base_polygons = exports;

(function() {

    if (!self.base) self.base = {};
    if (self.base.polygons) return;

    var BASE = self.base,
        UTIL = BASE.util,
        CONF = BASE.config,
        DEG2RAD = Math.PI / 180,
        ABS = Math.abs,
        SQRT = Math.sqrt,
        SQR = UTIL.sqr,
        NOKEY = BASE.key.NONE,
        newPoint = BASE.newPoint;

    BASE.polygons = {
        trace2count : trace2count,
        rayIntersect : rayIntersect,
        alignWindings : alignWindings,
        setWinding : setWinding,
        fillArea : fillArea,
        subtract : subtract,
        flatten : flatten,
        trimTo : trimTo,
        expand2 : expand2,
        expand : expand,
        union : union,
        nest : nest,
        dump : dump,
        diff : doDiff,
        filter : filter,
        toClipper : toClipper,
        fromClipperNode : fromClipperNode,
        fromClipperTree : fromClipperTree,
        cleanClipperTree : cleanClipperTree
    };

    /** ******************************************************************
     * Polygon array utility functions
     ******************************************************************* */

    function toClipper(polys,debug) {
        var out = [];
        polys.forEach(function(poly) { poly.toClipper(out,debug) });
        return out;
    }

    function fromClipperNode(tnode, z) {
        var poly = BASE.newPolygon();
        tnode.m_polygon.forEach(function(p) {
            poly.push(newPoint(null, null, z, null, p));
        });
        poly.open = tnode.IsOpen;
        return poly;
    };

    function fromClipperTree(tnode, z, tops, parent) {
        var polys = tops || [],
            poly;

        tnode.m_Childs.forEach(function(child) {
            poly = fromClipperNode(child, z);
            // throw out all tiny polygons
            if (poly.area() < 0.1) return;
            if (parent) {
                parent.addInner(poly);
            } else {
                polys.push(poly);
            }
            if (child.m_Childs) {
                fromClipperTree(child, z, polys, parent ? null : poly);
            }
        });

        return polys;
    };

    function cleanClipperTree(tree) {
        var clib = self.ClipperLib,
            clip = clib.Clipper;

        if (tree.m_Childs) tree.m_Childs.forEach(function(child) {
            child.m_polygon = clip.CleanPolygon(child.m_polygon, CONF.clipperClean);
            cleanClipperTree(child.m_Childs);
        });

        return tree;
    };

    function filter(array, output, fn) {
        array.forEach(function(poly) {
            poly = fn(poly);
            if (poly) {
                if (Array.isArray(poly)) {
                    output.appendAll(poly);
                } else {
                    output.push(poly);
                }
            }
        });
        return output;
    }

    function dump(poly) {
        if (Array.isArray(poly)) {
            poly.forEach(function(p) { dump(p) });
        } else {
            console.group({id:poly.id, area:poly.area(), depth:poly.depth, inner:(poly.inner ? poly.inner.length : null)});
            if (poly.inner) dump(poly.inner);
            console.groupEnd();
        };
    }

    /**
     * todo use clipper polytree?
     *
     * use bounding boxes and sliceIntersection
     * to determine parent/child nesting. returns a
     * array of trees.
     *
     * @param {Polygon[]} polygon soup
     * @param {boolean} deep allow nesting beyond 2 levels
     * @param {boolean} opentop prevent open polygons from having inners
     * @returns {Polygon[]} top level parent polygons
     */
    function nest(polygons, deep, opentop) {
        if (!polygons) return polygons;
        // sort groups by size
        polygons.sort(function (a, b) {
            return a.area() - b.area();
        });
        var i, poly;
        // clear parent/child links if they exist
        for (i = 0; i < polygons.length; i++) {
            poly = polygons[i];
            poly.parent = null;
            poly.inner = null;
        }
        // nest groups if fully contained by a parent
        for (i = 0; i < polygons.length - 1; i++) {
            poly = polygons[i];
            // find the smallest suitable parent
            for (var j = i + 1; j < polygons.length; j++) {
                var parent = polygons[j];
                // prevent open polys from having inners
                if (opentop && parent.isOpen()) continue;
                if (poly.isNested(parent)) {
                    parent.addInner(poly);
                    break;
                }
            }
        }
        // tops have an even # depth
        var tops = [],
            p;
        // assign a depth level to each group
        for (i = 0; i < polygons.length; i++) {
            p = polygons[i];
            poly = p;
            poly.depth = 0;
            while (p.parent) {
                poly.depth++;
                p = p.parent;
            }
            if (deep) {
                if (poly.depth === 0) tops.push(poly);
            } else {
                if (poly.depth % 2 === 0) {
                    tops.push(poly);
                } else {
                    poly.inner = null;
                }
            }
        }
        return tops;
    }

    /**
     * sets windings for parents one way
     * and children in opposition
     *
     * @param {Polygon[]} array
     * @param {boolean} CW
     * @param {boolean} [recurse]
     */
    function setWinding(array, CW, recurse) {
        if (!array) return;
        var poly, i = 0;
        while (i < array.length) {
            poly = array[i++];
            if (poly.isClockwise() !== CW) poly.reverse();
            if (recurse && poly.inner) setWinding(poly.inner, !CW, false);
        }
    }

    /**
     * ensure all polygons have the same winding direction.
     * try to use reversals that touch the fewest nodes.
     *
     * @param {Polygon[]} polys
     * @return {boolean} true if aligned clockwise
     */
    function alignWindings(polys) {
        var len = polys.length,
            fwd = 0,
            pts = 0,
            i = 0,
            setCW,
            poly;
        while (i < len) {
            poly = polys[i++];
            pts += poly.length;
            if (poly.isClockwise()) fwd += poly.length;
        }
        i = 0;
        setCW = fwd > (pts/2);
        while (i < len) {
            poly = polys[i++];
            if (poly.isClockwise() != setCW) poly.reverse();
        }
        return setCW;
    }

    function setContains(setA, poly) {
        for (var i=0; i<setA.length; i++) {
            if (setA[i].contains(poly)) return true;
        }
        return false;
    }

    function flatten(polys, to, crush) {
        if (!to) to = [];
        polys.forEach(function(poly) {
            poly.flattenTo(to);
            if (crush) poly.inner = null;
        });
        return to;
    }

    /**
     * Diff two sets of polygons and return A-B, B-A.
     * no polygons in a given set can overlap ... only between sets
     *
     * @param {Polygon[]} setA
     * @param {Polygon[]} setB
     * @param {Polygon[]} outA
     * @param {Polygon[]} outB
     * @param {number} [z]
     * @param {number} [minArea]
     * @returns {Polygon[]} out
     */
    function subtract(setA, setB, outA, outB, z, minArea) {
        var clib = self.ClipperLib,
            ctyp = clib.ClipType,
            ptyp = clib.PolyType,
            cfil = clib.PolyFillType,
            clip = new clib.Clipper(),
            ctre = new clib.PolyTree(),
            sp1 = toClipper(setA),
            sp2 = toClipper(setB),
            min = minArea || 0.1,
            out = [];

        function filter(from, to) {
            from.forEach(function(poly) {
                if (poly.area() >= min) {
                    to.push(poly);
                    out.push(poly);
                }
            });
        }

        // expensive but worth it?
        clip.StrictlySimple = true;

        if (outA) {
            clip.AddPaths(sp1, ptyp.ptSubject, true);
            clip.AddPaths(sp2, ptyp.ptClip, true);

            if (clip.Execute(ctyp.ctDifference, ctre, cfil.pftEvenOdd, cfil.pftEvenOdd)) {
                cleanClipperTree(ctre);
                filter(fromClipperTree(ctre, z), outA);
            }
        }

        if (outB) {
            if (outA) {
                ctre.Clear();
                clip.Clear();
            }

            clip.AddPaths(sp2, ptyp.ptSubject, true);
            clip.AddPaths(sp1, ptyp.ptClip, true);

            if (clip.Execute(ctyp.ctDifference, ctre, cfil.pftEvenOdd, cfil.pftEvenOdd)) {
                cleanClipperTree(ctre);
                filter(fromClipperTree(ctre, z), outB);
            }
        }

        return out;
    }

    /**
     * Slice.doProjectedFills()
     * Print.init w/ brims
     *
     * @param {Polygon[]} polys
     * @param {number} [z]
     * @returns {Polygon[]}
     */
     function union(polys) {
         if (polys.length < 2) return polys;

         var out = polys.slice(), i, j, union, uset = [];

         outer: for (i=0; i<out.length; i++) {
             if (!out[i]) continue;
             for (j=i+1; j<out.length; j++) {
                 if (!out[j]) continue;
                 union = out[i].union(out[j]);
                 if (union) {
                     out[i] = null;
                     out[j] = null;
                     out.push(union);
                     continue outer;
                 }
             }
         }

         for (i=0; i<out.length; i++) {
             if (out[i]) uset.push(out[i]);
         }

         return uset;
     }

    /**
     * @param {Polygon} poly clipping mask
     * @returns {?Polygon[]}
     */
    function doDiff(setA, setB, z) {
        var clib = self.ClipperLib,
            ctyp = clib.ClipType,
            ptyp = clib.PolyType,
            cfil = clib.PolyFillType,
            clip = new clib.Clipper(),
            ctre = new clib.PolyTree(),
            sp1 = toClipper(setA),
            sp2 = toClipper(setB);

        clip.AddPaths(sp1, ptyp.ptSubject, true);
        clip.AddPaths(sp2, ptyp.ptClip, true);

        if (clip.Execute(ctyp.ctDifference, ctre, cfil.pftEvenOdd, cfil.pftEvenOdd)) {
            return fromClipperTree(ctre, z);
        } else {
            return null;
        }
    };

    /**
     * Slice.doProjectedFills()
     *
     * @param {Polygon[]} setA source set
     * @param {Polygon[]} setB mask set
     * @returns {Polygon[]}
     */
    function trimTo(setA, setB) {
        // handle null/empty slices
        if (setA === setB || setA === null || setB === null) return null;

        var out = [], tmp;
        UTIL.doCombinations(setA, setB, {}, function(a, b) {
            if (tmp = a.mask(b)) {
                out.appendAll(tmp);
            }
        });

        return out;
    }

    function sumCirc(polys) {
        var sum = 0.0;
        polys.forEach(function(poly) {
            sum += poly.circularityDeep();
        });
        return sum;
    }

    /**
     * @param {Polygon[]} polys
     * @param {number} distance offset
     * @param {number} [z] defaults to 0
     * @param {Polygon[]} [out] optional collector
     * @param {number} [count] offset passes (0 == until no space left)
     * @param {number} [distance2] after first offset pass
     * @param {Function} [collector] receives output of each pass
     * @returns {Polygon[]} last offset
     */
    function expand(polys, distance, z, out, count, distance2, collector) {
        // prepare alignments for clipper lib
        alignWindings(polys);
        polys.forEach(function(poly) {
            if (poly.inner) setWinding(poly.inner, !poly.isClockwise());
        });

        var fact = CONF.clipper,
            clib = self.ClipperLib,
            clip = clib.Clipper,
            cpft = clib.PolyFillType,
            cjnt = clib.JoinType,
            cety = clib.EndType,
            coff = new clib.ClipperOffset(),
            ctre = new clib.PolyTree(),
            circ = sumCirc(polys);

        polys.forEach(function(poly) {
            var clean = clip.CleanPolygons(poly.toClipper(), CONF.clipperClean);
            var simple = clip.SimplifyPolygons(clean, cpft.pftNonZero);
            coff.AddPaths(simple, cjnt.jtMiter, cety.etClosedPolygon);
        });

        coff.Execute(ctre, distance * fact);
        polys = fromClipperTree(ctre, z);

        if (out) out.appendAll(polys);
        if (collector) collector(polys, count);
        if ((count === 0 || count > 1) && polys.length > 0) {
            expand(polys, distance2 || distance, z, out, count > 0 ? count-1 : 0, distance2, collector);
        }

        return polys;
    }

    /**
     * by "over" expanding then contracting, this causes shells that are too
     * close together to merge and cancel out.  it's a more expensive operation
     * but prevents shells that are too close together to extrude properly.
     *
     * @param {Polygon[]} polys
     * @param {number} dist1 first offset distance
     * @param {number} dist2 2nd thru last offset distance
     * @param {Polygon[]} out optional collector
     * @param {number} count offset passes (0 == until no space left)
     * @param {Function} collector receives output of each pass
     * @param {Function} thins receives output of each pass
     * @param {number} [z] defaults to 0
     * @returns {Polygon[]} last offset
     */
    function expand2(polys, dist1, dist2, out, count, collector, thins, z) {
        // prepare alignments for clipper lib
        alignWindings(polys);
        polys.forEach(function(poly) {
            if (poly.inner) setWinding(poly.inner, !poly.isClockwise());
        });

        var fact = CONF.clipper,
            clib = self.ClipperLib,
            clip = clib.Clipper,
            cpft = clib.PolyFillType,
            cjnt = clib.JoinType,
            cety = clib.EndType,
            coff = new clib.ClipperOffset(),
            ctre = new clib.PolyTree(),
            orig = polys,
            over = dist1 * 0.45;

        // inset
        polys.forEach(function(poly) {
            var clean = clip.CleanPolygons(poly.toClipper(), CONF.clipperClean);
            var simple = clip.SimplifyPolygons(clean, cpft.pftNonZero);
            coff.AddPaths(simple, cjnt.jtMiter, cety.etClosedPolygon);
        });
        coff.Execute(ctre, (dist1 + over) * fact);
        polys = fromClipperTree(ctre, z);

        // outset
        coff = new clib.ClipperOffset();
        ctre = new clib.PolyTree();
        polys.forEach(function(poly) {
            var clean = clip.CleanPolygons(poly.toClipper(), CONF.clipperClean);
            var simple = clip.SimplifyPolygons(clean, cpft.pftNonZero);
            coff.AddPaths(simple, cjnt.jtMiter, cety.etClosedPolygon);
        });
        coff.Execute(ctre, -over * fact);
        polys = fromClipperTree(ctre, z);

        // detect possible thin walls
        if (thins) {
            var circ1 = sumCirc(orig),
                circ2 = sumCirc(polys),
                diff = Math.abs(1 - (circ1 / circ2));

            if (diff > 0.2) {
                thins(orig, out.length ? polys : null, diff, -over);
            }
        }

        // process
        if (out) out.appendAll(polys);
        if (collector) collector(polys, count);
        if ((count === 0 || count > 1) && polys.length > 0) {
            expand2(polys, dist2 || dist1, dist2, out, count > 0 ? count-1 : 0, collector, thins, z);
        }

        return polys;
    }

    /**
     * @param {Polygon} poly input
     * @param {Polygon[]} traces output
     * @param {number} offset distance to offset
     * @param {number} count number of offsets
     * @param {number} depth current depth (count) into offsets
     * @param {Polygon[]} [last]
     * @param {Polygon[]} [first]
     */
    function trace2count(poly, traces, offset, count, depth, last, first) {
        if (count === 0) {
            if (last) last.append(poly);
            return;
        }

        // offset polygon to outer traces array
        var calcoff = depth === 0 && last ? offset / 2 : offset,
            outer = poly.offset(calcoff, []),
            inner = [],
            j;

        // outer offset failed
        if (outer.length === 0) {
            if (last) last.append(poly);
            return;
        }

        // offset poly children to inner traces array
        if (poly.inner) {
            poly.inner.forEach(function(ic) {
                ic.offset(-calcoff, inner);
            });
        }

        var newouter = [], newinner = [];
        subtract(outer, inner, newouter, newinner, poly.getZ());

        if (newouter.length > 0) {
            traces.appendAll(newouter);
            if (depth === 0 && first) {
                first.appendAll(newouter);
            }
            // recurse for multiple shells
            if (count > 0) {
                for (j=0; j<newouter.length; j++) {
                    trace2count(newouter[j], traces, offset, count - 1, depth + 1, last);
                }
            }
        } else if (last) {
            last.append(poly);
        }
    }

    /**
     * todo use clipper opne poly clipping?
     *
     * @param {Polygon[]} polys
     * @param {number} angle (-90 to 90)
     * @param {number} spacing
     * @param {Polygon[]} [output]
     * @param {number} [minLen]
     * @param {number} [maxLen]
     * @returns {Point[]} supplied output or new array
     */
    function fillArea(polys, angle, spacing, output, minLen, maxLen) {
        if (polys.length === 0) return;

        var i = 1,
            p0 = polys[0],
            zpos = p0.getZ(),
            bounds = p0.bounds.clone(),
            raySlope;

        // ensure angle is in the -90:90 range
        angle = angle % 180;
        while (angle > 90) angle -= 180;

        // X,Y ray slope derived from angle
        raySlope = BASE.newSlope(0,0,
            Math.cos(angle * DEG2RAD) * spacing,
            Math.sin(angle * DEG2RAD) * spacing
        );

        // compute union of top boundaries
        while (i < polys.length) bounds.merge(polys[i++].bounds);

        // ray stepping is an axis from the line perpendicular to the ray
        var rayint = output || [],
            stepX = -raySlope.dy,
            stepY = raySlope.dx,
            iterX = ABS(ABS(stepX) > 0 ? bounds.width() / stepX : 0),
            iterY = ABS(ABS(stepY) > 0 ? bounds.height() / stepY : 0),
            dist = SQRT(SQR(iterX * stepX) + SQR(iterY * stepY)),
            step = SQRT(SQR(stepX) + SQR(stepY)),
            steps = dist / step,
            start = angle < 0 ? { x:bounds.minx, y:bounds.miny, z:zpos } : { x:bounds.maxx, y:bounds.miny, z:zpos },
            clib = self.ClipperLib,
            ctyp = clib.ClipType,
            ptyp = clib.PolyType,
            cfil = clib.PolyFillType,
            clip = new clib.Clipper(),
            ctre = new clib.PolyTree(),
            minlen = BASE.config.clipper * (minLen || 0),
            maxlen = BASE.config.clipper * (maxLen || 0),
            lines = [];

        // store origin as start/affinity point for fill
        rayint.origin = newPoint(start.x, start.y, start.z);

        for (i = 0; i < steps; i++) {
            var p1 = newPoint(start.x - raySlope.dx * 1000, start.y - raySlope.dy * 1000, zpos, NOKEY),
                p2 = newPoint(start.x + raySlope.dx * 1000, start.y + raySlope.dy * 1000, zpos, NOKEY);

            lines.push([p1,p2]);
            start.x += stepX;
            start.y += stepY;
        }

        clip.AddPaths(lines, ptyp.ptSubject, false);
        clip.AddPaths(toClipper(polys), ptyp.ptClip, true);

        lines = [];

        if (clip.Execute(ctyp.ctIntersection, ctre, cfil.pftNonZero, cfil.pftEvenOdd)) {
            ctre.m_AllPolys.forEach(function(poly) {
                if (minlen || maxlen) {
                    var plen = clib.JS.PerimeterOfPath(poly.m_polygon, false, 1);
                    if (minlen && plen < minlen) return;
                    if (maxlen && plen > maxlen) return;
                }
                var p1 = newPoint(null,null,zpos,null,poly.m_polygon[0]);
                var p2 = newPoint(null,null,zpos,null,poly.m_polygon[1]);
                var od = rayint.origin.distToLineNew(p1,p2) / spacing;
                lines.push([p1, p2, od]);
            });
        }

        lines.sort(function(a,b) {
            return a[2] - b[2];
        })

        lines.forEach(function(line) {
            var dist = Math.round(line[2]);
            line[0].index = dist;
            line[1].index = dist;
            rayint.push(line[0]);
            rayint.push(line[1]);
        })

        return rayint;
    }

    /**
     * tracing a ray through a slice's polygons, find and return
     * a sorted list of all intersecting points.
     *
     * @param {Point} start
     * @param {Slope} slope
     * @param {Polygon[]} polygons
     * @param {boolean} [for_fill]
     * @returns {Point[]}
     */
    function rayIntersect(start, slope, polygons, for_fill) {
        var i = 0,
            flat = [],
            points = [],
            conf = BASE.config,
            merge_dist = for_fill ? conf.precision_fill_merge : conf.precision_merge;
        // todo use new flatten() function above
        polygons.forEach(function(p) {
            p.flattenTo(flat);
        });
        polygons = flat;
        while (i < polygons.length) {
            var polygon = polygons[i++],
                pp = polygon.points,
                pl = pp.length,
                dbug = BASE.debug,
                debug = false;
            for (var j = 0; j < pl; j++) {
                var j2 = (j + 1) % pl,
                    ip = UTIL.intersectRayLine(start, slope, pp[j], pp[j2]);
                if (ip) {
                    // add group object to point for cull detection
                    ip.group = polygon;
                    // add point to point list
                    points.push(ip);
                    // if point is near a group endpoint, add position marker for culling
                    if (ip.isNear(pp[j], merge_dist)) {
                        ip.pos = j;
                        ip.mod = pl;
                        if (debug) dbug.points([ip], 0x0000ff, 0.5, 1.0);
                    } else if (ip.isNear(pp[j2], merge_dist)) {
                        ip.pos = j2;
                        ip.mod = pl;
                        if (debug) dbug.points([ip], 0x00ffff, 0.5, 0.85);
                    } else {
                        if (debug) dbug.points([ip], 0xff00ff, 0.5, 0.5);
                    }
                }
            }
        }
        if (points.length > 0) {
            var del = false;
            // sort on distance from ray origin
            points.sort(function (p1, p2) {
                // handle passing through line-common end points
                if (!(p1.del || p2.del) && p1.isNear(p2, merge_dist)) {
                    var line = [];
                    if (!p1.isNear(p1.p1, merge_dist)) line.push(p1.p1);
                    if (!p1.isNear(p1.p2, merge_dist)) line.push(p1.p2);
                    if (!p2.isNear(p2.p1, merge_dist)) line.push(p2.p1);
                    if (!p2.isNear(p2.p2, merge_dist)) line.push(p2.p2);
                    /**
                     * when true, points are coincident on collinear lines but
                     * not passing through endpoints on each. kill them. this case
                     * was added later. see below for what else can happen.
                     */
                    if (line.length < 2) {
                        dbug.log("sliceInt: line common ep fail: "+line.length);
                    } else
                    if (line.length > 2) {
                        p1.del = true;
                        p2.del = true;
                    } else
                    /**
                     * when a ray intersects two equal points, they are either inside or outside.
                     * to determine which, we create a line from the two points connected to them
                     * and test intersect the ray with that line. if it intersects, the points are
                     * inside and we keep one of them. otherwise, they are outside and we drop both.
                     */
                    if (!UTIL.intersectRayLine(start, slope, line[0], line[1])) {
                        del = true;
                        p1.del = true;
                        p2.del = true;
                        if (debug) dbug.points([p1, p2], 0xffffff, 0.2, 1);
                    } else {
                        del = true;
                        p1.del = true;
                        if (debug) dbug.points([p1], 0xffff00, 0.2, 0.85);
                    }
                }
                return p1.dist - p2.dist; // sort on 'a' dist from ray origin
            });
            /**
             * cull invalid lines between groups on same/different levels depending
             * ok = same level (even), same group
             * ok = same level (odd), diff group
             * ok = diff level (even-odd)
             */
            if (for_fill) {
                var p1, p2;
                i = 0;
                pl = points.length;
                while (i < pl) {
                    p1 = points[i++];
                    while (p1 && p1.del && i < pl) p1 = points[i++];
                    p2 = points[i++];
                    while (p2 && p2.del && i < pl) p2 = points[i++];
                    if (p1 && p2 && p1.group && p1.group) {
                        var p1g = p1.group,
                            p2g = p2.group,
                            even = (p1g.depth % 2 === 0), // point is on an even depth group
                            same = (p1g === p2g); // points intersect same group
                        if (p1g.depth === p2g.depth) {
                            // TODO this works sometimes and not others
                            //if ((even && !same) || (same && !even)) {
                            //    p1.del = true;
                            //    p2.del = true;
                            //    del = true;
                            //    if (debug) dbug.points([p1, p2], 0xfff000, 0.2, 2);
                            //}
                            // check cull co-linear with group edge
                            if (same && p1.mod && p2.mod) {
                                var diff = ABS(p1.pos - p2.pos);
                                if (diff === 1 || diff === p1.mod - 1) {
                                    p1.del = true;
                                    p2.del = true;
                                    del = true;
                                    if (debug) dbug.points([p1, p2], 0xffffff, 0.2, 1.85);
                                }
                            }
                        }
                    }
                }
            }
            // handle deletions, if found
            if (del) {
                var np = [];
                for (i = 0; i < points.length; i++) {
                    var p = points[i];
                    if (!p.del) {
                        np.push(p);
                    }
                }
                points = np;
            }
        }
        return points;
    }

})();
