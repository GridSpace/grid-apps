/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

    if (!self.base) self.base = {};
    if (self.base.polygons) return;

    const BASE = self.base,
        UTIL = BASE.util,
        CONF = BASE.config,
        DEG2RAD = Math.PI / 180,
        ABS = Math.abs,
        SQRT = Math.sqrt,
        SQR = UTIL.sqr,
        NOKEY = BASE.key.NONE,
        newPoint = BASE.newPoint;

    BASE.polygons = {
        rayIntersect : rayIntersect,
        alignWindings : alignWindings,
        setWinding : setWinding,
        fillArea : fillArea,
        subtract : subtract,
        flatten : flatten,
        offset : offset,
        trimTo : trimTo,
        expand : expand,
        expand_lines: expand_lines,
        union : union,
        nest : nest,
        diff : doDiff,
        filter : filter,
        toClipper : toClipper,
        fromClipperNode : fromClipperNode,
        fromClipperTree : fromClipperTree,
        fromClipperTreeUnion: fromClipperTreeUnion,
        cleanClipperTree : cleanClipperTree,
        fingerprintCompare: fingerprintCompare,
        fingerprint: fingerprint
    };

    /** ******************************************************************
     * Polygon array utility functions
     ******************************************************************* */

    function numOrDefault(num, def) {
        return num !== undefined ? num : def;
    }

    function toClipper(polys,debug) {
        let out = [];
        polys.forEach(function(poly) { poly.toClipper(out,debug) });
        return out;
    }

    function fromClipperNode(tnode, z) {
        let poly = BASE.newPolygon();
        tnode.m_polygon.forEach(function(p) {
            poly.push(newPoint(null, null, z, null, p));
        });
        poly.open = tnode.IsOpen;
        return poly;
    };

    function fromClipperTree(tnode, z, tops, parent, minarea) {
        let poly,
            polys = tops || [],
            min = numOrDefault(minarea, 0.1);

        tnode.m_Childs.forEach(function(child) {
            poly = fromClipperNode(child, z);
            // throw out all tiny polygons
            if (poly.area() < min) {
                return;
            }
            if (parent) {
                parent.addInner(poly);
            } else {
                polys.push(poly);
            }
            if (child.m_Childs) {
                fromClipperTree(child, z, polys, parent ? null : poly, minarea);
            }
        });

        return polys;
    };

    function fromClipperTreeUnion(tnode, z, minarea, tops, parent) {
        let polys = tops || [], poly;

        tnode.m_Childs.forEach(function(child) {
            poly = fromClipperNode(child, z);
            if (minarea && poly.area() < minarea) {
                return;
            }
            if (parent) {
                parent.addInner(poly);
            } else {
                polys.push(poly);
            }
            if (child.m_Childs) {
                fromClipperTreeUnion(child, z, minarea, polys, parent ? null : poly);
            }
        });

        return polys;
    };

    function cleanClipperTree(tree) {
        let clib = self.ClipperLib,
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
        if (!polygons) {
            return polygons;
        }
        // sort groups by size
        polygons.sort(function (a, b) {
            return a.area() - b.area();
        });
        let i, poly;
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
            for (let j = i + 1; j < polygons.length; j++) {
                let parent = polygons[j];
                // prevent open polys from having inners
                if (opentop && parent.isOpen()) {
                    continue;
                }
                if (poly.isNested(parent)) {
                    parent.addInner(poly);
                    break;
                }
            }
        }
        // tops have an even # depth
        let tops = [],
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
        let poly, i = 0;
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
        let len = polys.length,
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
        for (let i=0; i<setA.length; i++) {
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
        let clib = self.ClipperLib,
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
                filter(fromClipperTree(ctre, z, null, null, min), outA);
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
                filter(fromClipperTree(ctre, z, null, null, min), outB);
            }
        }

        return out;
    }

    /**
     * Slice.doProjectedFills()
     * Print.init w/ brims
     *
     * @param {Polygon[]} polys
     * @returns {Polygon[]}
     */
     function union(polys, minarea) {
         if (polys.length < 2) return polys;

         let out = polys.slice(), i, j, union, uset = [];

         outer: for (i=0; i<out.length; i++) {
             if (!out[i]) continue;
             for (j=i+1; j<out.length; j++) {
                 if (!out[j]) continue;
                 union = out[i].union(out[j], minarea);
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
        let clib = self.ClipperLib,
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

        let out = [], tmp;
        UTIL.doCombinations(setA, setB, {}, function(a, b) {
            if (tmp = a.mask(b)) {
                out.appendAll(tmp);
            }
        });

        return out;
    }

    function sumCirc(polys) {
        let sum = 0.0;
        polys.forEach(function(poly) {
            sum += poly.circularityDeep();
        });
        return sum;
    }

    /**
     * @param {Polygon[]} polys
     * @param {number} distance offset
     * @param {number} [z] defaults to 0
     */
    function expand_lines(poly, distance, z) {
        let fact = CONF.clipper,
            clib = self.ClipperLib,
            cjnt = clib.JoinType,
            cety = clib.EndType,
            coff = new clib.ClipperOffset(),
            ctre = new clib.PolyTree();

        coff.AddPaths(poly.toClipper(), cjnt.jtMiter, cety.etOpenSquare);
        coff.Execute(ctre, distance * fact);

        return fromClipperTree(ctre, z, null, null, 0);
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
    function expand(polys, distance, z, out, count, distance2, collector, min) {
        return offset(polys, [distance, distance2 || distance], {
            z, outs: out, call: collector, minArea: min, count, flat: true
        });

        // prepare alignments for clipper lib
        alignWindings(polys);
        polys.forEach(function(poly) {
            if (poly.inner) setWinding(poly.inner, !poly.isClockwise());
        });

        let fact = CONF.clipper,
            clib = self.ClipperLib,
            clip = clib.Clipper,
            cpft = clib.PolyFillType,
            cjnt = clib.JoinType,
            cety = clib.EndType,
            coff = new clib.ClipperOffset(),
            ctre = new clib.PolyTree(),
            circ = sumCirc(polys);

        polys.forEach(function(poly) {
            let clean = clip.CleanPolygons(poly.toClipper(), CONF.clipperClean);
            let simple = clip.SimplifyPolygons(clean, cpft.pftNonZero);
            coff.AddPaths(simple, cjnt.jtMiter, cety.etClosedPolygon);
        });

        coff.Execute(ctre, distance * fact);
        polys = fromClipperTree(ctre, z, null, null, min);

        if (out) out.appendAll(polys);
        if (collector) collector(polys, count);
        if ((count === 0 || count > 1) && polys.length > 0) {
            expand(polys, distance2 || distance, z, out, count > 0 ? count-1 : 0, distance2, collector);
        }

        return polys;
    }

    /**
     * offset an array of polygons by distance with options to recurse
     * and return resulting gaps from offsets for thin wall detection in
     * in FDM mode and uncleared areas in CAM mode.
     */
    function offset(polys, dist, opt) {
        // cause inner / outer polys to be reversed from each other
        alignWindings(polys);
        polys.forEach(function(poly) {
            if (poly.inner) {
                setWinding(poly.inner, !poly.isClockwise());
            }
        });

        let orig = polys,
            opts = opt || {},
            count = numOrDefault(opt.count, 1),
            depth = numOrDefault(opt.depth, 0),
            clean = opts.clean !== false,
            simple = opts.simple !== false,
            fill = opts.fill || ClipperLib.PolyFillType.pftNonZero,
            join = opts.join || ClipperLib.JoinType.jtMiter,
            type = opts.type || ClipperLib.EndType.etClosedPolygon,
            coff = new ClipperLib.ClipperOffset(),
            ctre = new ClipperLib.PolyTree(),
            // if dist is array with values, shift out next offset
            offs = Array.isArray(dist) ? (dist.length > 1 ? dist.shift() : dist[0]) : dist,
            mina = numOrDefault(opts.minArea, 0.1),
            zed = opt.z || 0;

        // setup offset
        polys.forEach(function(poly) {
            // convert to clipper format
            poly = poly.toClipper();
            if (clean) poly = ClipperLib.Clipper.CleanPolygons(poly, CONF.clipperClean);
            if (simple) poly = ClipperLib.Clipper.SimplifyPolygons(poly, fill);
            coff.AddPaths(poly, join, type);
        });
        // perform offset
        coff.Execute(ctre, offs * CONF.clipper);
        // convert back from clipper output format
        polys = fromClipperTree(ctre, zed, null, null, mina);

        // if specified, perform offset gap analysis
        if (opt.gaps && polys.length) {
            let oneg = offset(polys, -offs, {
                fill: opt.fill, join: opt.join, type: opt.type, z: opt.z, minArea: mina
            });
            let suba = [];
            let diff = subtract(orig, oneg, suba, null, zed);
            opt.gaps.append(suba, opt.flat);
        }

        // if offset fails, consider last polygons as gap areas
        if (opt.gaps && !polys.length) {
            opt.gaps.append(orig, opt.flat);
        }

        // if specified, perform up to *count* successive offsets
        if (polys.length) {
            // ensure opts has offset accumulator array
            opt.outs = opt.outs || [];
            // store polys in accumulator
            opt.outs.append(polys, opt.flat);
            // callback for expand() compatibility
            if (opt.call) {
                opt.call(polys, count, depth);
            }
            // check for more offsets
            if (count > 1) {
                // decrement count, increment depth
                opt.count = count - 1;
                opt.depth = depth + 1;
                // call next offset
                offset(polys, dist, opt);
            // } else if (count === 0) {
            //     // depth = 0 means offset until failure
            //     opt.depth = depth + 1;
            //     offset(polys, dist, opt);
            }
        }

        return opt.flat ? opt.outs : polys;
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

        let i = 1,
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
        let rayint = output || [],
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
            let p1 = newPoint(start.x - raySlope.dx * 1000, start.y - raySlope.dy * 1000, zpos, NOKEY),
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
                    let plen = clib.JS.PerimeterOfPath(poly.m_polygon, false, 1);
                    if (minlen && plen < minlen) return;
                    if (maxlen && plen > maxlen) return;
                }
                let p1 = newPoint(null,null,zpos,null,poly.m_polygon[0]);
                let p2 = newPoint(null,null,zpos,null,poly.m_polygon[1]);
                let od = rayint.origin.distToLineNew(p1,p2) / spacing;
                lines.push([p1, p2, od]);
            });
        }

        lines.sort(function(a,b) {
            return a[2] - b[2];
        })

        lines.forEach(function(line) {
            let dist = Math.round(line[2]);
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
        let i = 0,
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
            let polygon = polygons[i++],
                pp = polygon.points,
                pl = pp.length,
                dbug = BASE.debug,
                debug = false;
            for (let j = 0; j < pl; j++) {
                let j2 = (j + 1) % pl,
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
            let del = false;
            // sort on distance from ray origin
            points.sort(function (p1, p2) {
                // handle passing through line-common end points
                if (!(p1.del || p2.del) && p1.isNear(p2, merge_dist)) {
                    let line = [];
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
                let p1, p2;
                i = 0;
                pl = points.length;
                while (i < pl) {
                    p1 = points[i++];
                    while (p1 && p1.del && i < pl) p1 = points[i++];
                    p2 = points[i++];
                    while (p2 && p2.del && i < pl) p2 = points[i++];
                    if (p1 && p2 && p1.group && p1.group) {
                        let p1g = p1.group,
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
                                let diff = ABS(p1.pos - p2.pos);
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
                let np = [];
                for (i = 0; i < points.length; i++) {
                    let p = points[i];
                    if (!p.del) {
                        np.push(p);
                    }
                }
                points = np;
            }
        }
        return points;
    }

    function fingerprint(polys) {
        let finger = [];
        flatten(polys).sort((a,b) => {
            return a.area() > b.area();
        }).forEach(p => {
            finger.push(p.area());
            finger.push(p.perimeter());
            finger.push(p.bounds);
        });
        return finger;
    }

    function fingerprintCompare(a, b) {
        if (a === b) {
            return true;
        }
        if (!a || !b) {
            return false;
        }
        if (a.length !== b.length) {
            return false;
        }
        for (let i=0; i<a.length; i += 3) {
            if (Math.abs(a[i] - b[i]) > 0.001) {
                return false;
            }
            if (Math.abs(a[i+1] - b[i+1]) > 0.0001) {
                return false;
            }
            if (Math.abs(a[i+2].centerx() - b[i+2].centerx()) > 0.0001) {
                return false;
            }
            if (Math.abs(a[i+2].centery() - b[i+2].centery()) > 0.0001) {
                return false;
            }
        }
        return true;
    }

})();
